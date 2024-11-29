import leaflet from "leaflet";

// Style sheets
import "leaflet/dist/leaflet.css";
import "./style.css";

// Fix missing marker images
import "./leafletWorkaround.ts";

// Deterministic random number generator
import luck from "./luck.ts";

// Storage
class Storage {
  static save<T>(key: string, value: T) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (error) {
      console.error(`Error saving key "${key}"`, error);
    }
  }

  static load<T>(key: string): T | null {
    try {
      const data = localStorage.getItem(key);
      return data ? (JSON.parse(data) as T) : null;
    } catch (error) {
      console.error(`Error loading key "${key}" from storage:`, error);
      return null;
    }
  }

  static clear() {
    localStorage.clear();
  }

  // Type-Specific Methods ----------------
  // Player coins
  static loadPlayerCoins(): Array<Coin> {
    return this.load<Array<Coin>>("playerCoin") ?? [];
  }
  static savePlayerCoins(coins: Array<Coin>) {
    this.save("playerCoin", coins);
  }

  // Player Location
  static loadPlayerLocation(): number[] {
    return this.load<number[]>("playerLocation") ?? [36.989498, -122.062777]; // Default to your "origin" location
  }

  static savePlayerLocation(location: number[]) {
    this.save("playerLocation", location);
  }

  // Player Path
  static loadSavedPath(): Array<number[]> {
    return this.load<Array<number[]>>("savedPath") ?? [];
  }

  static saveSavedPath(path: Array<number[]>) {
    this.save("savedPath", path);
  }
}

const APP_NAME = "GeoCoin";
document.title = APP_NAME;

let playerCoins = Storage.loadPlayerCoins();

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

function restoreCache(key: string) {
  const momento = Storage.load<string>(key);
  if (momento) {
    const cache = new Cache([]);
    cache.fromMomento(momento);
    coinCache.set(key, cache);
  }
}

// map variables -------------------------------------------------------
const origin = [36.989498, -122.062777];
let playerLocation = Storage.loadPlayerLocation();
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

leaflet
  .tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: zoomAmount,
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  })
  .addTo(map);

// Player marker
const playerMarker = leaflet.marker(playerLocation).addTo(map);
playerMarker.bindTooltip("This is you!");
let path: leaflet.latlng = Storage.loadSavedPath();
let polyline = leaflet.polyline(path, { color: "red" }).addTo(map);

// player movement
function playerMovement(dir: string, lat: number, lon: number) {
  const button = document.querySelector<HTMLDivElement>(dir)!;
  button.addEventListener("click", () => {
    for (const [key, cache] of coinCache.entries()) {
      Storage.save(key, cache.toMomento());
    }
    playerLocation[0] += lat;
    playerLocation[1] += lon;
    Storage.savePlayerLocation(playerLocation);
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
  Storage.saveSavedPath(path);
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
    Storage.savePlayerCoins(playerCoins);
  }
}

function placeCache(y: number, x: number) {
  // create cache area
  const bounds = leaflet.latLngBounds([y, x], [y + tileSize, x + tileSize]);

  const rect = leaflet.rectangle(bounds);
  rect.addTo(cacheLayer);

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
    popup
      .querySelector<HTMLButtonElement>("#collect")!
      .addEventListener("click", () => {
        updateCache(playerCoins, coinAmount);
        Storage.save(getKey(y, x), getCell(y, x).toMomento());
        popup.querySelector<HTMLSpanElement>("#coin")!.innerHTML =
          `${coinAmount.length}`;
      });
    popup
      .querySelector<HTMLButtonElement>("#deposit")!
      .addEventListener("click", () => {
        updateCache(coinAmount, playerCoins);
        Storage.save(getKey(y, x), getCell(y, x).toMomento());
        popup.querySelector<HTMLSpanElement>("#coin")!.innerHTML =
          `${coinAmount.length}`;
      });

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
  const confirm = prompt(
    "Are you sure you want to reset? You'll lose all progress (Y/N)",
  );
  if (confirm == "Y") {
    playerCoins = [];
    status.innerHTML = `You have 0 coin(s)`;
    playerLocation = [...origin];
    resetMap();
    if (polyline) {
      polyline.removeFrom(map);
    }
    path = [[...origin]];
    polyline = leaflet.polyline(path, { color: "red" }).addTo(map);
    Storage.clear();
  }
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
