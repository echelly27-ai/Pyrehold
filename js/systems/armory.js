// Owned weapons, magazines, reserve ammo, and upgrade ranks.
import { WEAPONS, WEAPON_ORDER, computeWeaponStats, upgradeCost, MAX_WEAPON_LEVEL } from "../config/weapons.js";
import { MARKET } from "../config/balance.js";

export class Armory {
  constructor(game) {
    this.game = game;
    this.owned = ["bat"];
    this.levels = { bat: 1 };
    this.equipped = "bat";
    this.mag = { bat: Infinity };
    this.ammo = { pistol: 0, shell: 0, rifle: 0, heavy: 0, energy: 0 };
    this.parts = 0;
    this.cooldown = 0;
    this.reload = 0;
  }

  def(id = this.equipped) {
    return WEAPONS[id];
  }

  stats(id = this.equipped) {
    const def = WEAPONS[id];
    if (!def) return null;
    return computeWeaponStats(def, this.levels[id] || 1, this.game.progression.mods());
  }

  costOf(id) {
    const def = WEAPONS[id];
    const base = def.materials || { gold: def.price || 0 };
    const cost = {
      wood: base.wood || 0,
      stone: base.stone || 0,
      gold: base.gold || 0,
    };
    let mul = 1;
    if (id === "pistol" && this.game.tutorial && !this.game.tutorial.done && !this.owned.includes(id)) {
      // The quartermaster cuts the first sidearm so the opening lesson can finish.
      mul *= 0.65;
    }
    if (this.game.buildings && this.game.buildings.hasTag("armory")) mul *= 1 - MARKET.armoryDiscount;
    if (mul !== 1) {
      for (const key of Object.keys(cost)) {
        if (cost[key] > 0) cost[key] = Math.max(1, Math.round(cost[key] * mul));
      }
    }
    return cost;
  }

  costText(id) {
    const cost = this.costOf(id);
    const parts = Object.entries(cost)
      .filter(([, n]) => n > 0)
      .map(([key, n]) => n + " " + key);
    return parts.length ? parts.join(" · ") : "free";
  }

  canBuy(id) {
    const def = WEAPONS[id];
    if (!def) return { ok: false, reason: "Unknown weapon" };
    if (this.owned.includes(id)) return { ok: false, reason: "Already owned" };
    if (def.tier > this.game.progression.tier) {
      return { ok: false, reason: "Base tier too low" };
    }
    if (def.requires && !this.game.buildings.hasTag(def.requires)) {
      return { ok: false, reason: "Requires a " + def.requires };
    }
    const cost = this.costOf(id);
    const short = [];
    for (const [key, n] of Object.entries(cost)) {
      if (n > 0 && this.game.inventory.amount(key) < n) short.push(n + " " + key);
    }
    if (short.length) return { ok: false, reason: "Need " + short.join(", ") };
    return { ok: true, cost };
  }

  buy(id) {
    const check = this.canBuy(id);
    if (!check.ok) {
      this.game.notify(check.reason, "bad");
      this.game.audio.play("error");
      return false;
    }
    const def = WEAPONS[id];
    this.game.inventory.spend(check.cost);
    this.owned.push(id);
    this.levels[id] = 1;
    const st = this.stats(id);
    this.mag[id] = st.mag === Infinity ? Infinity : Math.min(st.mag, def.starterAmmo || st.mag);
    if (def.ammo && def.starterAmmo) {
      const spare = Math.max(0, def.starterAmmo - (st.mag === Infinity ? 0 : this.mag[id]));
      this.ammo[def.ammo] += spare;
    }
    this.equip(id);
    this.game.notify(def.name + " purchased", "good");
    this.game.audio.play("gold");
    return true;
  }

  equip(id) {
    if (!this.owned.includes(id)) return;
    this.equipped = id;
    this.reload = 0;
    this.cooldown = 0;
    if (this.game.player) this.game.player.attachWeapon(id);
    this.game.audio.play("ui");
  }

  cycle(dir) {
    const list = WEAPON_ORDER.filter((id) => this.owned.includes(id));
    const i = Math.max(0, list.indexOf(this.equipped));
    const next = list[(i + dir + list.length) % list.length];
    this.equip(next);
  }

  equipNth(n) {
    const list = WEAPON_ORDER.filter((id) => this.owned.includes(id));
    if (list[n - 1]) this.equip(list[n - 1]);
  }

  tryUpgrade(id) {
    if (!this.owned.includes(id)) return false;
    const level = this.levels[id] || 1;
    if (level >= MAX_WEAPON_LEVEL) {
      this.game.notify("Weapon is fully upgraded", "bad");
      return false;
    }
    if (level >= 2 && !this.game.buildings.hasTag("workshop")) {
      this.game.notify("Build a workshop to upgrade past level 2", "bad");
      this.game.audio.play("error");
      return false;
    }
    const cost = upgradeCost(WEAPONS[id], level + 1);
    if (this.parts < cost.parts || this.game.inventory.gold < cost.gold) {
      this.game.notify("Need " + cost.gold + " gold and " + cost.parts + " parts", "bad");
      this.game.audio.play("error");
      return false;
    }
    this.game.inventory.gold -= cost.gold;
    this.parts -= cost.parts;
    this.levels[id] = level + 1;
    this.game.notify(WEAPONS[id].name + " level " + this.levels[id], "good");
    this.game.audio.play("level");
    return true;
  }

  currentMag() {
    return this.mag[this.equipped] ?? 0;
  }

  reserve() {
    const ammo = this.def().ammo;
    if (!ammo) return Infinity;
    return this.ammo[ammo] || 0;
  }

  startReload() {
    const st = this.stats();
    if (!st || st.melee || st.mag === Infinity) return;
    if (this.reload > 0) return;
    if (this.currentMag() >= st.mag) return;
    if (this.reserve() <= 0) {
      this.game.notify("No ammo — buy a pack in the shop", "bad");
      this.game.audio.play("error");
      return;
    }
    this.reload = st.reload;
    this.game.audio.play("reload");
  }

  tick(dt) {
    this.cooldown = Math.max(0, this.cooldown - dt);
    if (this.reload > 0) {
      this.reload -= dt;
      if (this.reload <= 0) {
        const st = this.stats();
        const ammo = this.def().ammo;
        const need = st.mag - (this.mag[this.equipped] || 0);
        const take = Math.min(need, this.ammo[ammo] || 0);
        this.ammo[ammo] -= take;
        this.mag[this.equipped] = (this.mag[this.equipped] || 0) + take;
      }
    }
  }

  consumeShot() {
    const st = this.stats();
    if (this.cooldown > 0) return false;
    if (st.melee || st.mag === Infinity) {
      this.cooldown = 1 / (st.fireRate || 1);
      return true;
    }
    if (this.reload > 0) return false;
    if ((this.mag[this.equipped] || 0) <= 0) {
      this.startReload();
      return false;
    }
    if (this.cooldown > 0) return false;
    this.mag[this.equipped] -= 1;
    this.cooldown = 1 / st.fireRate;
    if (this.mag[this.equipped] <= 0) this.startReload();
    return true;
  }

  addAmmo(type, n) {
    if (!this.ammo[type] && this.ammo[type] !== 0) return;
    this.ammo[type] += n;
  }

  addParts(n) {
    this.parts += n;
  }

  serialize() {
    return {
      owned: this.owned,
      levels: this.levels,
      equipped: this.equipped,
      mag: this.mag,
      ammo: this.ammo,
      parts: this.parts,
    };
  }

  hydrate(data) {
    if (!data) return;
    this.owned = data.owned || ["bat"];
    this.levels = data.levels || { bat: 1 };
    this.equipped = data.equipped || "bat";
    this.mag = data.mag || { bat: Infinity };
    this.ammo = data.ammo || this.ammo;
    this.parts = data.parts || 0;
    if (this.game.player) this.game.player.attachWeapon(this.equipped);
  }
}
