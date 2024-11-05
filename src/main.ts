import leaflet from "leaflet";

// Style sheets
import "leaflet/dist/leaflet.css";
import "./style.css";

// Fix missing marker images
import "./leafletWorkaround.ts";

// Deterministic random number generator
import luck from "./luck.ts";

const APP_NAME = "GeoCoin";
//const app = document.querySelector<HTMLDivElement>("#app")!;
document.title = APP_NAME;

let playerCoins = 0;
const status = document.querySelector<HTMLDivElement>("#statusPanel")!;
status.innerHTML = `You have ${playerCoins} coin(s)`;

// map variables -------------------------------------------------------
const playerLocation = [36.989498, -122.062777];
const zoomAmount = 19;
const tileSize = 1e-4;
const neighborhoodSize = 8;
const cacheChance = 0.1;

// create map
const map = leaflet.map("map", {
  center: playerLocation,
  zoom: zoomAmount,
  scrollWheelZoom: false,
});

leaflet.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: zoomAmount,
  attribution:
    '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
}).addTo(map);

// Player marker
const playerMarker = leaflet.marker(playerLocation).addTo(map);
playerMarker.bindTooltip("This is you!");

// functions -------------------------------------------------------

function placeCache(y: number, x: number) {
  // create cache area
  const bounds = leaflet.latLngBounds(
    [y, x],
    [y + tileSize, x + tileSize],
  );

  const rect = leaflet.rectangle(bounds);
  rect.addTo(map);

  // cache popup
  rect.bindPopup(() => {
    let coinAmount = Math.floor(luck([y, x].toString()) * 100);

    const popup = document.createElement("div");
    popup.innerHTML = `
          <div>There are <span id="coin">${coinAmount}</span> coin(s) here!</div>
          <button id="poke">Poke</button>
    `;
    popup.querySelector<HTMLButtonElement>("#poke")!.addEventListener(
      "click",
      () => {
        if (coinAmount > 0) {
          coinAmount--;
          playerCoins++;
          popup.querySelector<HTMLSpanElement>("#coin")!.innerHTML =
            `${coinAmount}`;
          status.innerHTML = `You have ${playerCoins} coin(s)`;
        }
      },
    );

    return popup;
  });
}

function populateNeighborhood() {
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

// call functions ---------------------------------------------------
populateNeighborhood();
