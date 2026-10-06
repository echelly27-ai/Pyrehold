// Lifetime objectives. Progress is derived from game.stats so it survives reloads
// without per-frame bookkeeping. Rewards grant once.

export const QUESTS = [
  {
    id: "wood100",
    title: "Stock the Yard",
    desc: "Collect 100 wood.",
    type: "wood",
    count: 100,
    reward: { gold: 100 },
  },
  {
    id: "stone40",
    title: "Break the Shelf",
    desc: "Collect 40 stone.",
    type: "stone",
    count: 40,
    reward: { gold: 150, stone: 10 },
  },
  {
    id: "metal15",
    title: "Rust and Rivets",
    desc: "Collect 15 metal.",
    type: "metal",
    count: 15,
    reward: { gold: 200 },
  },
  {
    id: "kills25",
    title: "First Quiet",
    desc: "Kill 25 zombies.",
    type: "kills",
    count: 25,
    reward: { gold: 250 },
  },
  {
    id: "wave5",
    title: "Hold the Fifth",
    desc: "Survive wave 5.",
    type: "wave",
    count: 5,
    reward: { gold: 500, parts: 4 },
  },
  {
    id: "tank",
    title: "Crack the Tank",
    desc: "Defeat a Tank Zombie.",
    type: "kill:tank",
    count: 1,
    reward: { gold: 1000 },
  },
  {
    id: "walls",
    title: "Close the Ring",
    desc: "Build 8 wooden walls.",
    type: "build:wood_wall",
    count: 8,
    reward: { gold: 80, wood: 20 },
  },
  {
    id: "tower",
    title: "Eyes Up",
    desc: "Build a watchtower.",
    type: "build:watchtower",
    count: 1,
    reward: { gold: 150 },
  },
  {
    id: "stonefort",
    title: "Build a Stone Fortress",
    desc: "Upgrade the base to Stone Fort.",
    type: "tier",
    count: 2,
    reward: { weapon: "shotgun", gold: 200 },
    rewardLabel: "Shotgun",
  },
  {
    id: "turret",
    title: "Powered Teeth",
    desc: "Build a machine gun turret.",
    type: "build:mg_turret",
    count: 1,
    reward: { gold: 400, ammo: { rifle: 60 } },
  },
  {
    id: "boss",
    title: "Name the Dark",
    desc: "Defeat a boss zombie.",
    type: "bosses",
    count: 1,
    reward: { gold: 2000, metal: 15, parts: 8 },
  },
  {
    id: "wave10",
    title: "The Tenth Night",
    desc: "Survive wave 10.",
    type: "wave",
    count: 10,
    reward: { gold: 1500, parts: 6 },
  },
  {
    id: "level5",
    title: "Warden's Pace",
    desc: "Reach level 5.",
    type: "level",
    count: 5,
    reward: { gold: 250 },
  },
  {
    id: "gold2000",
    title: "Heavy Pockets",
    desc: "Earn 2000 gold in total.",
    type: "gold",
    count: 2000,
    reward: { wood: 40, stone: 30, metal: 10 },
  },
];

export function questProgress(quest, stats, level, tier) {
  switch (quest.type) {
    case "wood": return stats.wood || 0;
    case "stone": return stats.stone || 0;
    case "metal": return stats.metal || 0;
    case "gold": return stats.goldEarned || 0;
    case "kills": return stats.kills || 0;
    case "wave": return stats.wavesCleared || 0;
    case "bosses": return stats.bosses || 0;
    case "level": return level || 1;
    case "tier": return tier || 0;
    default:
      if (quest.type.startsWith("kill:")) {
        const id = quest.type.slice(5);
        return (stats.killsByType && stats.killsByType[id]) || 0;
      }
      if (quest.type.startsWith("build:")) {
        const id = quest.type.slice(6);
        return (stats.built && stats.built[id]) || 0;
      }
      return 0;
  }
}

export function rewardText(quest) {
  const r = quest.reward;
  const bits = [];
  if (r.gold) bits.push(r.gold + " gold");
  if (r.wood) bits.push(r.wood + " wood");
  if (r.stone) bits.push(r.stone + " stone");
  if (r.metal) bits.push(r.metal + " metal");
  if (r.parts) bits.push(r.parts + " parts");
  if (r.weapon) bits.push(quest.rewardLabel || r.weapon);
  if (r.xp) bits.push(r.xp + " xp");
  return bits.join(" · ");
}
