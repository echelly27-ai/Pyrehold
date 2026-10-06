// Roblox-style yard: a dropper spits gold, and each pad buys one structure.
// Pad cells are where the player stands. Build cells are where the part appears.
import { CELL } from "../core/util.js";

export function cellCenter(gx, gz) {
  return { x: (gx + 0.5) * CELL, z: (gz + 0.5) * CELL };
}

export const DROPPER = {
  gx: 0,
  gz: -2,
  dirX: 1,
  dirZ: 0,
  interval: 1.15,
  amount: 12,
  maxLoose: 18,
  first: 0.4,
};

// Stand still briefly so sprinting across a pad does not spend gold.
export const PAD_DWELL = 0.34;

export const PADS = [
  { id: "floor-w1", name: "Wood Floor", price: 25, building: "wood_floor", gx: -2, gz: -1, padGx: -3, padGz: -1 },
  { id: "floor-w2", name: "Wood Floor", price: 25, building: "wood_floor", gx: -2, gz: 0, padGx: -3, padGz: 0 },
  { id: "floor-w3", name: "Wood Floor", price: 25, building: "wood_floor", gx: -2, gz: 1, padGx: -3, padGz: 1 },
  { id: "floor-e1", name: "Wood Floor", price: 25, building: "wood_floor", gx: 1, gz: 1, padGx: 2, padGz: 1 },
  { id: "floor-e2", name: "Wood Floor", price: 25, building: "wood_floor", gx: 1, gz: 2, padGx: 2, padGz: 2 },
  { id: "wall-nw", name: "Wood Wall", price: 70, building: "wood_wall", gx: -3, gz: -3, padGx: -3, padGz: -2 },
  { id: "wall-ne", name: "Wood Wall", price: 70, building: "wood_wall", gx: 3, gz: -3, padGx: 3, padGz: -2 },
  { id: "wall-sw", name: "Wood Wall", price: 70, building: "wood_wall", gx: -3, gz: 3, padGx: -2, padGz: 3 },
  { id: "wall-se", name: "Wood Wall", price: 70, building: "wood_wall", gx: 3, gz: 3, padGx: 2, padGz: 3 },
  { id: "tower", name: "Watchtower", price: 160, building: "watchtower", gx: 3, gz: -1, padGx: 2, padGz: -1 },
  { id: "barricade", name: "Barricade", price: 55, building: "barricade", gx: 3, gz: 2, padGx: 3, padGz: 1 },
  { id: "fire", name: "Campfire", price: 90, building: "campfire", gx: -2, gz: -2, padGx: -1, padGz: -2 },
];
