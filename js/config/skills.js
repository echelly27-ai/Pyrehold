// Four short trees. Each rank costs 1 skill point and caps at 5.
// Effects are read from Progression.mods() so combat and building stay data-driven.

export const SKILL_TREES = [
  {
    id: "combat",
    name: "Combat",
    skills: [
      { id: "damage", name: "Heavy Hands", desc: "+8% weapon damage per rank" },
      { id: "reload", name: "Quick Mag", desc: "Reload 7% faster per rank" },
      { id: "crit", name: "Keen Eye", desc: "+3% critical chance per rank" },
      { id: "hp", name: "Thick Coat", desc: "+12 max health per rank" },
    ],
  },
  {
    id: "builder",
    name: "Builder",
    skills: [
      { id: "cost", name: "Frugal Plans", desc: "Buildings cost 6% less per rank" },
      { id: "walls", name: "True Joints", desc: "+10% structure health per rank" },
      { id: "repair", name: "Field Patches", desc: "Repairs are cheaper and faster" },
      { id: "speed", name: "Practiced Hands", desc: "Place structures faster" },
    ],
  },
  {
    id: "resource",
    name: "Resource",
    skills: [
      { id: "gather", name: "Keen Edge", desc: "Gather 15% faster per rank" },
      { id: "yield", name: "Full Bundles", desc: "+10% resources per gather" },
      { id: "capacity", name: "Deep Stores", desc: "+18% inventory cap per rank" },
      { id: "drops", name: "Scavenger", desc: "Better zombie drops" },
    ],
  },
  {
    id: "survival",
    name: "Survival",
    skills: [
      { id: "hp", name: "Second Wind", desc: "+12 max health per rank" },
      { id: "speed", name: "Long Stride", desc: "+6% move speed per rank" },
      { id: "regen", name: "Slow Mend", desc: "Regenerate health over time" },
      { id: "resist", name: "Scar Tissue", desc: "Take 6% less damage per rank" },
    ],
  },
];

export const MAX_SKILL_RANK = 5;

export function emptyRanks() {
  const ranks = {};
  for (const tree of SKILL_TREES) {
    ranks[tree.id] = {};
    for (const skill of tree.skills) ranks[tree.id][skill.id] = 0;
  }
  return ranks;
}

export function computeMods(ranks) {
  const c = ranks.combat || {};
  const b = ranks.builder || {};
  const r = ranks.resource || {};
  const s = ranks.survival || {};
  return {
    damage: 1 + 0.08 * (c.damage || 0),
    reload: 1 - 0.07 * (c.reload || 0),
    crit: 0.03 * (c.crit || 0),
    fireRate: 1,
    spread: 1,
    maxHp: 100 + 12 * (c.hp || 0) + 12 * (s.hp || 0),
    buildCost: Math.max(0.55, 1 - 0.06 * (b.cost || 0)),
    buildHp: 1 + 0.1 * (b.walls || 0),
    repairCost: Math.max(0.45, 1 - 0.1 * (b.repair || 0)),
    repairSpeed: 1 + 0.18 * (b.repair || 0),
    buildSpeed: 1 + 0.12 * (b.speed || 0),
    gatherSpeed: 1 + 0.15 * (r.gather || 0),
    gatherYield: 1 + 0.1 * (r.yield || 0),
    capacity: 1 + 0.18 * (r.capacity || 0),
    drops: 1 + 0.1 * (r.drops || 0),
    speed: 1 + 0.06 * (s.speed || 0),
    regen: 0.35 * (s.regen || 0),
    resist: Math.max(0.55, 1 - 0.06 * (s.resist || 0)),
  };
}
