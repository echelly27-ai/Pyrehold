// Authored early waves, then a deterministic generator so difficulty never plateaus.
import { mulberry32 } from "../core/util.js";

const SCRIPTED = {
  // Opening daylight is long enough to chop, quarry, and haul scrap before night.
  1: { prep: 180, groups: { normal: 10 }, lanes: 1 },
  2: { groups: { normal: 15, runner: 3 }, lanes: 2 },
  3: { groups: { normal: 20, runner: 5, spitter: 1 }, lanes: 2 },
  4: { groups: { normal: 16, runner: 6, crawler: 4, spitter: 2 }, lanes: 2 },
  5: { groups: { normal: 14, runner: 4, spitter: 2, tank: 1 }, lanes: 2 },
  6: { groups: { normal: 18, runner: 8, spitter: 2, exploder: 2 }, lanes: 3 },
  7: { groups: { normal: 12, armored: 6, crawler: 5, tank: 1 }, lanes: 3 },
  8: { groups: { normal: 16, runner: 6, spitter: 2, screamer: 2 }, lanes: 3 },
  9: { groups: { runner: 8, armored: 6, exploder: 3, tank: 1 }, lanes: 3 },
  10: { groups: { normal: 12, armored: 4, spitter: 2 }, lanes: 3, boss: "brute" },
  12: { groups: { screamer: 2, armored: 8, crawler: 6, spitter: 3, tank: 1 }, lanes: 4 },
  15: { groups: { runner: 10, armored: 6, exploder: 3, mutant: 2 }, lanes: 4, boss: "necromancer" },
  20: { groups: { mutant: 3, tank: 2, spitter: 4, armored: 8 }, lanes: 4, boss: "abomination" },
};

const POOL = [
  { id: "normal", w: 1, min: 1 },
  { id: "runner", w: 1.3, min: 2 },
  { id: "spitter", w: 2.5, min: 3 },
  { id: "crawler", w: 1.1, min: 4 },
  { id: "tank", w: 6.5, min: 5 },
  { id: "exploder", w: 3.1, min: 6 },
  { id: "armored", w: 2.3, min: 7 },
  { id: "screamer", w: 4.2, min: 8 },
  { id: "mutant", w: 8.5, min: 11 },
];

const BOSSES = ["brute", "necromancer", "abomination"];

function procedural(n) {
  let budget = Math.floor(12 + n * 5.2 + n * n * 0.2);
  const rng = mulberry32(9000 + n * 97);
  const groups = {};
  let guard = 0;
  while (budget >= 1 && guard++ < 200) {
    const options = POOL.filter((p) => p.w <= budget + 0.01 && n >= p.min);
    if (!options.length) break;
    const pick = options[Math.floor(rng() * options.length)];
    groups[pick.id] = (groups[pick.id] || 0) + 1;
    budget -= pick.w;
  }
  if (!groups.normal && n < 8) groups.normal = 8;
  return {
    groups,
    lanes: Math.min(4, 1 + Math.floor(n / 3)),
  };
}

export function getWave(n) {
  const base = SCRIPTED[n] ? structuredClone(SCRIPTED[n]) : procedural(n);
  if (n >= 10 && n % 5 === 0 && !base.boss) {
    base.boss = BOSSES[Math.floor(n / 5 - 2) % BOSSES.length];
  }
  base.number = n;
  base.prep = base.prep ?? Math.max(18, 34 - Math.floor(n * 0.7));
  return base;
}

export function waveCount(wave) {
  let n = 0;
  for (const k of Object.keys(wave.groups || {})) n += wave.groups[k];
  if (wave.boss) n += 1;
  return n;
}
