// Resources and storage caps. Gold is uncapped. Wood, stone, and metal
// stop at the storage level, which skills can stretch.
import { STARTING, storageCaps, storageUpgradeCost } from "../config/balance.js";

export class Inventory {
  constructor(game) {
    this.game = game;
    this.wood = STARTING.wood;
    this.stone = STARTING.stone;
    this.metal = STARTING.metal;
    this.gold = STARTING.gold;
    this.storageLevel = STARTING.storageLevel;
  }

  caps() {
    const base = storageCaps(this.storageLevel);
    const mul = this.game.progression ? this.game.progression.mods().capacity : 1;
    return {
      wood: Math.round(base.wood * mul),
      stone: Math.round(base.stone * mul),
      metal: Math.round(base.metal * mul),
    };
  }

  cap(res) {
    if (res === "gold") return Infinity;
    return this.caps()[res] ?? 0;
  }

  amount(res) {
    return this[res] || 0;
  }

  // Returns how much was actually stored.
  add(res, amount, opts = {}) {
    const n = Math.max(0, Math.floor(amount));
    if (!n) return 0;
    if (res === "gold") {
      this.gold += n;
      if (!opts.silent) this.game.stats.goldEarned += n;
      return n;
    }
    if (!["wood", "stone", "metal"].includes(res)) return 0;
    const room = this.cap(res) - this[res];
    const added = Math.max(0, Math.min(room, n));
    this[res] += added;
    if (added > 0) this.game.stats[res] = (this.game.stats[res] || 0) + added;
    if (added < n) this.game.notify("Storage full", "bad");
    return added;
  }

  canAfford(cost) {
    for (const [k, v] of Object.entries(cost || {})) {
      if (this.amount(k) < v) return false;
    }
    return true;
  }

  spend(cost) {
    if (!this.canAfford(cost)) return false;
    for (const [k, v] of Object.entries(cost)) this[k] -= v;
    return true;
  }

  upgradeStorage() {
    const cost = storageUpgradeCost(this.storageLevel);
    if (this.storageLevel >= 12) {
      this.game.notify("Storage is fully expanded", "bad");
      return false;
    }
    if (!this.spend(cost)) {
      this.game.notify("Not enough resources to expand storage", "bad");
      this.game.audio.play("error");
      return false;
    }
    this.storageLevel += 1;
    this.game.notify("Storage level " + this.storageLevel, "good");
    this.game.audio.play("build");
    this.game.progression.addXp(20);
    return true;
  }

  serialize() {
    return {
      wood: this.wood,
      stone: this.stone,
      metal: this.metal,
      gold: this.gold,
      storageLevel: this.storageLevel,
    };
  }

  hydrate(data) {
    if (!data) return;
    this.wood = data.wood ?? this.wood;
    this.stone = data.stone ?? this.stone;
    this.metal = data.metal ?? this.metal;
    this.gold = data.gold ?? this.gold;
    this.storageLevel = data.storageLevel ?? 1;
  }
}
