// Global tuning knobs. Change these to rebalance without hunting through systems.
// Content-specific numbers (weapon damage, wall HP, zombie stats) live beside
// their definitions in config/weapons.js, buildings.js, and zombies.js.

export const SAVE_KEY = "pyrehold-save-v1";
export const SAVE_VERSION = 1;

export const WORLD = {
  half: 118,
  cell: 2,
};

// Plot grows with the base tier. Values are inclusive cell coordinates.
export const PLOT_REACH = [5, 7, 9, 12, 14, 17];

export function plotOf(tier) {
  const reach = PLOT_REACH[Math.max(0, Math.min(PLOT_REACH.length - 1, tier))];
  return { minX: -reach, maxX: reach, minZ: -reach, maxZ: reach };
}

export const PLAYER = {
  hp: 100,
  speed: 7.2,
  sprint: 11.2,
  radius: 0.46,
  jump: 8.6,
  gravity: 26,
  respawnDelay: 4,
  downGoldLoss: 0.05,
  invuln: 1.4,
};

export const STARTING = {
  wood: 60,
  stone: 0,
  metal: 0,
  gold: 200,
  storageLevel: 1,
};

// Inventory caps by storage level. Levels past the table continue the last step.
export const STORAGE_TABLE = [
  { wood: 100, stone: 50, metal: 25 },
  { wood: 250, stone: 150, metal: 75 },
  { wood: 500, stone: 300, metal: 150 },
  { wood: 800, stone: 500, metal: 280 },
  { wood: 1200, stone: 800, metal: 450 },
  { wood: 1800, stone: 1200, metal: 700 },
  { wood: 2600, stone: 1800, metal: 1000 },
  { wood: 4000, stone: 2800, metal: 1600 },
];

export function storageCaps(level) {
  const idx = Math.max(0, level - 1);
  if (idx < STORAGE_TABLE.length) return STORAGE_TABLE[idx];
  const extra = idx - (STORAGE_TABLE.length - 1);
  const last = STORAGE_TABLE[STORAGE_TABLE.length - 1];
  const m = Math.pow(1.35, extra);
  return {
    wood: Math.round(last.wood * m),
    stone: Math.round(last.stone * m),
    metal: Math.round(last.metal * m),
  };
}

export function storageUpgradeCost(level) {
  return {
    wood: 40 * level,
    stone: 25 * level,
    metal: Math.max(0, 10 * (level - 1)),
    gold: 120 * level * level,
  };
}

// Sell is a slow gold source. Buy prices are a sink so gold still matters.
export const MARKET = {
  sell: { wood: 2, stone: 4, metal: 12 },
  buy: { wood: 8, stone: 16, metal: 42 },
  workshopSellBonus: 0.25,
  armoryDiscount: 0.1,
};

export const AMMO_PACKS = {
  pistol: { name: "Pistol Rounds", rounds: 36, price: 40 },
  shell: { name: "Shells", rounds: 16, price: 75 },
  rifle: { name: "Rifle Rounds", rounds: 60, price: 120 },
  heavy: { name: "Rockets", rounds: 4, price: 220 },
  energy: { name: "Energy Cells", rounds: 40, price: 260 },
};

export const GATHER = {
  wood: { chunk: 8, time: 0.48 },
  stone: { chunk: 5, time: 0.7 },
  metal: { chunk: 3, time: 0.85 },
  gold: { chunk: 40, time: 0.4 },
  crate: { chunk: 1, time: 0.6 },
};

export const ZONES = [
  { id: "camp", name: "Starting Camp", minTier: 0, x: -22, z: -22, w: 44, h: 44 },
  { id: "forest", name: "Ashpine Forest", minTier: 0, x: -46, z: -112, w: 92, h: 62 },
  { id: "quarry", name: "Cinder Quarry", minTier: 0, x: 42, z: -36, w: 70, h: 78 },
  { id: "city", name: "Rust City", minTier: 1, x: -116, z: -40, w: 62, h: 86 },
  { id: "military", name: "Fort Halden", minTier: 3, x: -34, z: 48, w: 74, h: 64 },
  { id: "lab", name: "Blackglass Lab", minTier: 4, x: 48, z: -112, w: 64, h: 52 },
];

export const TIER_ORDER = ["camp", "wood", "stone", "military", "fortress", "bunker"];

export const TIERS = [
  {
    id: "camp",
    name: "Starter Camp",
    blurb: "A cold pyre and a ring of pine walls.",
    coreHp: 1200,
  },
  {
    id: "wood",
    name: "Wooden Fort",
    blurb: "Sharpened timber, a workshop, and room to grow.",
    cost: { wood: 80, gold: 250 },
    needWave: 2,
    coreHp: 1800,
  },
  {
    id: "stone",
    name: "Stone Fort",
    blurb: "Quarry stone turns the camp into a real fort.",
    cost: { stone: 110, wood: 50, gold: 1000 },
    needWave: 4,
    coreHp: 2600,
  },
  {
    id: "military",
    name: "Military Base",
    blurb: "Generators, rifles, and powered turrets.",
    cost: { metal: 70, stone: 90, gold: 3200 },
    needWave: 7,
    coreHp: 3800,
  },
  {
    id: "fortress",
    name: "Fortress",
    blurb: "Steel gates, rocket pits, and a hard perimeter.",
    cost: { metal: 150, stone: 120, gold: 10000 },
    needWave: 10,
    coreHp: 5600,
  },
  {
    id: "bunker",
    name: "High-Tech Bunker",
    blurb: "The lab comes online. The blight gets worse.",
    cost: { metal: 240, gold: 24000 },
    needWave: 15,
    coreHp: 8000,
  },
];

export const XP = {
  gather: 1,
  waveBase: 30,
  wavePer: 12,
  // xp to reach the next level from `level`
  toNext(level) {
    return 40 + level * 28;
  },
};

export const COMBAT = {
  maxZombies: 56,
  wildCap: 18,
  separation: 0.85,
  // Player rockets chip friendly structures. Zombie acid does not use this.
  rocketSelfDamage: 0.22,
  headshotBonus: 1.85,
  meleeArc: 0.15,
};

export const DAY = {
  // Preparation is daytime. The wave itself is night.
  duskSeconds: 8,
  dawnSeconds: 6,
  // Blood moon stretches the night tint and the wave budget.
  bloodCount: 1.55,
  bloodHp: 1.4,
  bloodGold: 1.75,
};

export const WAVE = {
  clearGoldBase: 30,
  clearGoldPer: 18,
  perfectBonus: 0.5,
  coreFailGoldLoss: 0.15,
  coreFailHp: 0.4,
};

export const LANES = [
  { id: "north", name: "NORTH", x: 0, z: -1 },
  { id: "south", name: "SOUTH", x: 0, z: 1 },
  { id: "east", name: "EAST", x: 1, z: 0 },
  { id: "west", name: "WEST", x: -1, z: 0 },
  { id: "ne", name: "NORTHEAST", x: 0.75, z: -0.75 },
  { id: "nw", name: "NORTHWEST", x: -0.75, z: -0.75 },
  { id: "se", name: "SOUTHEAST", x: 0.75, z: 0.75 },
  { id: "sw", name: "SOUTHWEST", x: -0.75, z: 0.75 },
];
