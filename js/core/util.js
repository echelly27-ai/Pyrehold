// Shared math, grid, and collision helpers.
// Tuning lives in config/; these functions stay generic so systems can share them.

export const CELL = 2;

export function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function rand(min, max) {
  return min + Math.random() * (max - min);
}

export function randInt(min, max) {
  return Math.floor(rand(min, max + 1));
}

export function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function dist2(ax, az, bx, bz) {
  const dx = ax - bx;
  const dz = az - bz;
  return dx * dx + dz * dz;
}

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function rng() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function cellKey(gx, gz) {
  return gx + "," + gz;
}

export function worldToCell(x, z) {
  return { gx: Math.floor(x / CELL), gz: Math.floor(z / CELL) };
}

export function footprint(def, gx, gz, rot) {
  let w = def.size[0];
  let h = def.size[1];
  if ((rot & 1) === 1) {
    const t = w;
    w = h;
    h = t;
  }
  const cells = [];
  for (let x = 0; x < w; x++) {
    for (let z = 0; z < h; z++) cells.push([gx + x, gz + z]);
  }
  return cells;
}

export function footprintCenter(def, gx, gz, rot) {
  const cells = footprint(def, gx, gz, rot);
  let sx = 0;
  let sz = 0;
  for (const [x, z] of cells) {
    sx += x;
    sz += z;
  }
  sx /= cells.length;
  sz /= cells.length;
  return { x: (sx + 0.5) * CELL, z: (sz + 0.5) * CELL, cells };
}

export function aabbFromFootprint(def, gx, gz, rot, pad = 0) {
  const cells = footprint(def, gx, gz, rot);
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const [x, z] of cells) {
    minX = Math.min(minX, x * CELL);
    maxX = Math.max(maxX, (x + 1) * CELL);
    minZ = Math.min(minZ, z * CELL);
    maxZ = Math.max(maxZ, (z + 1) * CELL);
  }
  return { minX: minX + pad, maxX: maxX - pad, minZ: minZ + pad, maxZ: maxZ - pad };
}

// Push a circle out of a list of AABBs. Returns the resolved position.
export function collideCircle(x, z, radius, boxes, filter) {
  for (let iter = 0; iter < 3; iter++) {
    for (const b of boxes) {
      if (filter && !filter(b)) continue;
      const cx = clamp(x, b.minX, b.maxX);
      const cz = clamp(z, b.minZ, b.maxZ);
      let dx = x - cx;
      let dz = z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 >= radius * radius) continue;
      if (d2 < 1e-8) {
        dx = x - (b.minX + b.maxX) * 0.5;
        dz = z - (b.minZ + b.maxZ) * 0.5;
        if (Math.abs(dx) < 1e-6 && Math.abs(dz) < 1e-6) dx = 1;
      }
      const d = Math.hypot(dx, dz) || 1;
      const push = radius - d + 0.001;
      x += (dx / d) * push;
      z += (dz / d) * push;
    }
  }
  return { x, z };
}

export function circleHitsBox(x, z, radius, b) {
  const cx = clamp(x, b.minX, b.maxX);
  const cz = clamp(z, b.minZ, b.maxZ);
  const dx = x - cx;
  const dz = z - cz;
  return dx * dx + dz * dz < radius * radius;
}

// First blocking building along a segment. Sampling is stable on our coarse grid.
export function firstBlocker(x0, z0, x1, z1, occupancy, accepts) {
  const dx = x1 - x0;
  const dz = z1 - z0;
  const samples = 22;
  for (let i = 1; i <= samples; i++) {
    const t = i / samples;
    const gx = Math.floor((x0 + dx * t) / CELL);
    const gz = Math.floor((z0 + dz * t) / CELL);
    const b = occupancy.get(cellKey(gx, gz));
    if (b && (!accepts || accepts(b))) return b;
  }
  return null;
}

export function formatNum(n) {
  const v = Math.floor(n);
  if (v >= 1000000) return (v / 1000000).toFixed(1) + "m";
  if (v >= 10000) return (v / 1000).toFixed(1) + "k";
  return String(v);
}

export function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}
