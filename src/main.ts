import leaflet from "leaflet";

// Style sheets
import "leaflet/dist/leaflet.css";
import "./style.css";

// Fix missing marker images
import "./leafletWorkaround.ts";

// Deterministic random number generator
import luck from "./luck.ts";

const APP_NAME = "GeoCoin";
document.title = APP_NAME;

const localPlayerData = localStorage.getItem("playerCoin");
let playerCoins: Array<Coin> = localPlayerData
  ? JSON.parse(localPlayerData)
  : [];
const status = document.querySelector<HTMLDivElement>("#statusPanel")!;
status.innerHTML = `You have ${playerCoins.length} coin(s)`;

// Cache classes -------------------------------------------------------
interface Coin {
  serial: string;
}

interface Momento<T> {
  toMomento(): T;
  fromMomento(momento: T): void;
}

class Cache implements Momento<string> {
  coins: Array<Coin>;

  constructor(coins: Array<Coin>) {
    this.coins = coins;
  }

  toMomento() {
    return JSON.stringify({ coins: this.coins });
  }

  fromMomento(momento: string) {
    const state = JSON.parse(momento);
    this.coins = state.coins;
  }
}

function saveCache(key: string, cache: Cache) {
  localStorage.setItem(key, cache.toMomento());
}

function restoreCache(key: string) {
  const momento = localStorage.getItem(key);
  if (momento) {
    const cache = new Cache([]);
    cache.fromMomento(momento);
    coinCache.set(key, cache);
  }
}

// map variables -------------------------------------------------------
const origin = [36.989498, -122.062777];
let playerLocation = [origin[0], origin[1]];
const savedLocation = localStorage.getItem("playerLocation");
if (savedLocation) {
  playerLocation = JSON.parse(savedLocation);
}
const zoomAmount = 19;
const tileSize = 1e-4;
const neighborhoodSize = 8;
const cacheChance = 0.1;
const coinCache = new Map<string, Cache>();

// create map
const map = leaflet.map("map", {
  center: playerLocation,
  zoom: zoomAmount,
  scrollWheelZoom: false,
});
let cacheLayer = leaflet.layerGroup().addTo(map);

leaflet.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: zoomAmount,
  attribution:
    '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
}).addTo(map);

// Player marker
const playerMarker = leaflet.marker(playerLocation).addTo(map);
playerMarker.bindTooltip("This is you!");
let path: leaflet.latlng = [[...playerLocation]];
const savedPath = localStorage.getItem("savedPath");
if (savedPath) {
  path = JSON.parse(savedPath);
}
let polyline = leaflet.polyline(path, { color: "red" }).addTo(map);

// player movement
function playerMovement(dir: string, lat: number, lon: number) {
  const button = document.querySelector<HTMLDivElement>(dir)!;
  button.addEventListener("click", () => {
    for (const [key, cache] of coinCache.entries()) {
      saveCache(key, cache);
    }
    playerLocation[0] += lat;
    playerLocation[1] += lon;
    localStorage.setItem("playerLocation", JSON.stringify(playerLocation));
    resetMap();
  });
}
playerMovement("#north", tileSize, 0);
playerMovement("#east", 0, tileSize);
playerMovement("#south", -tileSize, 0);
playerMovement("#west", 0, -tileSize);

// functions -------------------------------------------------------
function resetMap() {
  path.push([...playerLocation]);
  localStorage.setItem("savedPath", JSON.stringify(path));
  polyline.setLatLngs(path);
  map.panTo(playerLocation);
  playerMarker.setLatLng(playerLocation);
  map.removeLayer(cacheLayer);
  coinCache.clear();
  populateNeighborhood();
}

function getCell(lat: number, lon: number): Cache {
  const key = getKey(lat, lon);

  let cache = coinCache.get(key);
  if (cache == undefined) {
    // generate coins
    const coins = Array<Coin>();
    for (let i = 0; i < Math.floor(luck([lat, lon].toString()) * 100); i++) {
      coins.push({ serial: `${key}#${i}` });
    }
    cache = new Cache(coins);
    coinCache.set(key, cache);
  }

  return cache;
}

function getKey(lat: number, lon: number) {
  const i = Math.floor(lat * 100000);
  const j = Math.floor(lon * 100000);
  return `${i}:${j}`;
}

function updateCache(add: Array<Coin>, remove: Array<Coin>) {
  if (remove.length > 0) {
    const coin = remove.pop()!;
    console.log(coin.serial);
    add.push(coin);
    status.innerHTML = `You have ${playerCoins.length} coin(s)`;
    localStorage.setItem("playerCoin", JSON.stringify(playerCoins));
  }
}

function placeCache(y: number, x: number) {
  // create cache area
  const bounds = leaflet.latLngBounds(
    [y, x],
    [y + tileSize, x + tileSize],
  );

  const rect = leaflet.rectangle(bounds);
  rect.addTo(cacheLayer);
  //console.log("cache");
  // cache popup
  rect.bindPopup(() => {
    restoreCache(getKey(y, x));
    const coinAmount = getCell(y, x).coins;

    const popup = document.createElement("div");
    popup.innerHTML = `
          <div>There are <span id="coin">${coinAmount.length}</span> coin(s) here!</div>
          <button id="collect">Collect</button>
          <button id="deposit">Deposit</button>
    `;
    popup.querySelector<HTMLButtonElement>("#collect")!
      .addEventListener(
        "click",
        () => {
          updateCache(playerCoins, coinAmount);
          saveCache(getKey(y, x), getCell(y, x));
          popup.querySelector<HTMLSpanElement>("#coin")!.innerHTML =
            `${coinAmount.length}`;
        },
      );
    popup.querySelector<HTMLButtonElement>("#deposit")!
      .addEventListener(
        "click",
        () => {
          updateCache(coinAmount, playerCoins);
          saveCache(getKey(y, x), getCell(y, x));
          popup.querySelector<HTMLSpanElement>("#coin")!.innerHTML =
            `${coinAmount.length}`;
        },
      );

    return popup;
  });
}

function populateNeighborhood() {
  cacheLayer = leaflet.layerGroup().addTo(map);
  for (
    let y = playerLocation[0] - tileSize * neighborhoodSize;
    y < playerLocation[0] + tileSize * neighborhoodSize;
    y += tileSize
  ) {
    for (
      let x = playerLocation[1] - tileSize * neighborhoodSize;
      x < playerLocation[1] + tileSize * neighborhoodSize;
      x += tileSize
    ) {
      if (luck([y, x].toString()) <= cacheChance) {
        placeCache(y, x);
      }
    }
  }
}

// Buttons ---------------------------------------------------
const reset = document.querySelector<HTMLDivElement>("#reset")!;
reset.addEventListener("click", () => {
  localStorage.clear();
  playerCoins = [];
  status.innerHTML = `You have 0 coin(s)`;
  playerLocation = [origin[0], origin[1]];
  resetMap();
  polyline.removeFrom(map);
  path = [[...playerLocation]];
  polyline = leaflet.polyline(path, { color: "red" }).addTo(map);
});

const sensor = document.querySelector<HTMLDivElement>("#sensor")!;
sensor.addEventListener("click", () => {
  if (sensor.classList.contains("locating")) {
    sensor.classList.remove("locating");
    map.stopLocate();
  } else {
    sensor.classList.add("locating");
    map.locate({ watch: true });
  }
});
map.on("locationfound", function (e: { latlng: { lat: number; lng: number } }) {
  playerLocation = [e.latlng.lat, e.latlng.lng];
  resetMap();
});

// call functions ---------------------------------------------------
populateNeighborhood();
