// Levels, skill points, and the base-tier tycoon track.
import { XP, TIERS } from "../config/balance.js";
import { emptyRanks, computeMods, MAX_SKILL_RANK } from "../config/skills.js";

export class Progression {
  constructor(game) {
    this.game = game;
    this.level = 1;
    this.xp = 0;
    this.points = 0;
    this.ranks = emptyRanks();
    this.tier = 0;
    this._mods = computeMods(this.ranks);
  }

  mods() {
    return this._mods;
  }

  refreshMods() {
    this._mods = computeMods(this.ranks);
    if (this.game.player) this.game.player.maxHp = this._mods.maxHp;
  }

  addXp(amount) {
    if (amount <= 0) return;
    this.xp += amount;
    let leveled = false;
    while (this.xp >= XP.toNext(this.level)) {
      this.xp -= XP.toNext(this.level);
      this.level += 1;
      this.points += 1;
      leveled = true;
    }
    if (leveled) {
      this.game.notify("Level " + this.level + " — skill point earned", "good");
      this.game.audio.play("level");
      this.game.fx.flash = 0.35;
    }
  }

  spend(tree, skill) {
    if (this.points <= 0) {
      this.game.notify("No skill points", "bad");
      return false;
    }
    const row = this.ranks[tree];
    if (!row || row[skill] == null) return false;
    if (row[skill] >= MAX_SKILL_RANK) {
      this.game.notify("That skill is maxed", "bad");
      return false;
    }
    row[skill] += 1;
    this.points -= 1;
    this.refreshMods();
    if (this.game.buildings) this.game.buildings.recomputeAll();
    this.game.audio.play("ui");
    this.game.notify("Skill improved", "good");
    return true;
  }

  tierDef() {
    return TIERS[this.tier];
  }

  nextTier() {
    return TIERS[this.tier + 1] || null;
  }

  canUpgradeTier() {
    const next = this.nextTier();
    if (!next) return { ok: false, reason: "The bunker is as deep as it goes." };
    if ((this.game.waves.cleared || 0) < (next.needWave || 0)) {
      return { ok: false, reason: "Survive wave " + next.needWave + " first." };
    }
    if (!this.game.inventory.canAfford(next.cost || {})) {
      const missing = [];
      let capped = false;
      for (const [k, v] of Object.entries(next.cost || {})) {
        const have = this.game.inventory.amount(k);
        if (have < v) missing.push(have + "/" + v + " " + k);
        if (k !== "gold" && this.game.inventory.cap(k) < v) capped = true;
      }
      const extra = capped ? " Expand storage first." : "";
      return { ok: false, reason: "Need " + missing.join(", ") + "." + extra };
    }
    return { ok: true, next };
  }

  upgradeTier() {
    const check = this.canUpgradeTier();
    if (!check.ok) {
      this.game.notify(check.reason, "bad");
      this.game.audio.play("error");
      return false;
    }
    this.game.inventory.spend(check.next.cost || {});
    const prevHp = this.game.buildings.coreMaxHp();
    this.tier += 1;
    this.game.buildings.onTierChanged(prevHp);
    this.game.notify(check.next.name + " unlocked", "good");
    this.game.audio.play("level");
    this.addXp(40 + this.tier * 20);
    return true;
  }

  serialize() {
    return { level: this.level, xp: this.xp, points: this.points, ranks: this.ranks, tier: this.tier };
  }

  hydrate(data) {
    if (!data) return;
    this.level = data.level ?? 1;
    this.xp = data.xp ?? 0;
    this.points = data.points ?? 0;
    this.ranks = data.ranks || emptyRanks();
    this.tier = data.tier ?? 0;
    this.refreshMods();
  }
}
