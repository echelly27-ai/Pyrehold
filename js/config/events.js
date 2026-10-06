// Random events roll during the daytime preparation window.
// Each event is a small state flag the other systems already understand.

export const EVENTS = [
  {
    id: "horde",
    name: "Zombie Horde",
    desc: "Scouts report a thicker night. The next wave is larger.",
    weight: 3,
  },
  {
    id: "supply",
    name: "Supply Drop",
    desc: "A crate of rare scrap just hit the ground outside the ring.",
    weight: 3,
  },
  {
    id: "merchant",
    name: "Traveling Merchant",
    desc: "A broker is buying dear and selling cheap for a short while.",
    weight: 3,
  },
  {
    id: "convoy",
    name: "Military Convoy",
    desc: "Fort Halden's dead are walking again. Drop them for a weapon crate.",
    weight: 2,
  },
  {
    id: "blood",
    name: "Blood Moon",
    desc: "The next night will be cruel, loud, and rich.",
    weight: 2,
  },
  {
    id: "rush",
    name: "Resource Rush",
    desc: "The pines and shelves are loose. Gathering yields more for a minute.",
    weight: 3,
  },
  {
    id: "invasion",
    name: "Boss Invasion",
    desc: "Something huge is already crossing the field.",
    weight: 1,
  },
];

export function rollEvent(rng) {
  const total = EVENTS.reduce((s, e) => s + e.weight, 0);
  let t = rng() * total;
  for (const e of EVENTS) {
    t -= e.weight;
    if (t <= 0) return e;
  }
  return EVENTS[0];
}
