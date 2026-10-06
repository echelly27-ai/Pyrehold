// Lifetime quests. Completion is checked against stats so progress is
// never lost just because a counter was forgotten in a system.
import { QUESTS, questProgress, rewardText } from "../config/quests.js";
import { WEAPONS } from "../config/weapons.js";

export class Quests {
  constructor(game) {
    this.game = game;
    this.claimed = new Set();
    this.timer = 0;
  }

  update(dt) {
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = 0.4;
    const stats = this.game.stats;
    const level = this.game.progression.level;
    const tier = this.game.progression.tier;
    for (const quest of QUESTS) {
      if (this.claimed.has(quest.id)) continue;
      const value = questProgress(quest, stats, level, tier);
      if (value < quest.count) continue;
      this.claimed.add(quest.id);
      this.grant(quest);
    }
  }

  grant(quest) {
    const r = quest.reward;
    if (r.gold) this.game.inventory.add("gold", r.gold);
    if (r.wood) this.game.inventory.add("wood", r.wood);
    if (r.stone) this.game.inventory.add("stone", r.stone);
    if (r.metal) this.game.inventory.add("metal", r.metal);
    if (r.parts) this.game.armory.addParts(r.parts);
    if (r.xp) this.game.progression.addXp(r.xp);
    if (r.ammo) {
      for (const [k, v] of Object.entries(r.ammo)) this.game.armory.addAmmo(k, v);
    }
    if (r.weapon) {
      if (!this.game.armory.owned.includes(r.weapon)) {
        this.game.armory.owned.push(r.weapon);
        this.game.armory.levels[r.weapon] = 1;
        const def = WEAPONS[r.weapon];
        const st = this.game.armory.stats(r.weapon);
        this.game.armory.mag[r.weapon] = st.mag === Infinity ? Infinity : Math.min(st.mag, def.starterAmmo || st.mag);
        if (def.ammo && def.starterAmmo) this.game.armory.ammo[def.ammo] += def.starterAmmo;
        this.game.armory.equip(r.weapon);
      } else this.game.inventory.add("gold", 400);
    }
    this.game.notify("Quest complete: " + quest.title, "good");
    this.game.audio.play("gold");
  }

  tracker() {
    const stats = this.game.stats;
    const rows = [];
    for (const quest of QUESTS) {
      if (this.claimed.has(quest.id)) continue;
      const value = questProgress(quest, stats, this.game.progression.level, this.game.progression.tier);
      rows.push({ quest, value, text: rewardText(quest) });
      if (rows.length >= 3) break;
    }
    return rows;
  }

  all() {
    return QUESTS.map((quest) => {
      const value = questProgress(quest, this.game.stats, this.game.progression.level, this.game.progression.tier);
      return {
        quest,
        value,
        done: this.claimed.has(quest.id),
        text: rewardText(quest),
      };
    });
  }

  serialize() {
    return { claimed: [...this.claimed] };
  }

  hydrate(data) {
    if (!data) return;
    this.claimed = new Set(data.claimed || []);
  }
}
