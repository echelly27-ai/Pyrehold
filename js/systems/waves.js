// Day is preparation. Night is the raid. The clock lives here so the
// day/night lighting and the zombie spawner stay in agreement.
import { LANES, WAVE } from "../config/balance.js";
import { getWave } from "../config/waves.js";
import { mulberry32 } from "../core/util.js";

export class Waves {
  constructor(game) {
    this.game = game;
    this.number = 1;
    this.cleared = 0;
    this.phase = "wait";
    this.timer = 0;
    this.queue = [];
    this.bossPending = null;
    this.lanes = [];
    this.spawnTimer = 0;
    this.coreDamage = 0;
    this.active = null;
    this.failLock = false;
    this.laneText = "";
  }

  allows() {
    return this.game.tutorial && this.game.tutorial.allowsWaves();
  }

  noteCoreDamage(amount) {
    if (this.phase === "wave") this.coreDamage += amount;
  }

  beginPrep() {
    const spec = getWave(this.number);
    this.phase = "prep";
    this.timer = spec.prep;
    this.active = spec;
    this.coreDamage = 0;
    this.queue = [];
    this.bossPending = null;
    this.lanes = this.pickLanes(spec);
    this.laneText = this.lanes.map((l) => l.name).join(" & ");
    if (this.game.hud) {
      if (this.number === 1) {
        this.game.hud.announce(
          "DAYLIGHT",
          "Farm wood, stone, and metal. Night falls in three minutes — press T when you are ready."
        );
      } else {
        this.game.hud.announce(
          "WAVE " + this.number + " INCOMING",
          "They come from the " + this.laneText + ". Prepare your defenses!"
        );
      }
    }
    this.game.audio.play("wave");
  }

  pickLanes(spec) {
    const rng = mulberry32(4000 + this.number * 19);
    const bag = [...LANES];
    const out = [];
    const n = Math.max(1, spec.lanes || 1);
    while (out.length < n && bag.length) {
      const i = Math.floor(rng() * bag.length);
      out.push(bag.splice(i, 1)[0]);
    }
    return out;
  }

  callEarly() {
    if (!this.allows()) {
      this.game.notify("Finish the opening lessons first", "bad");
      return;
    }
    if (this.phase !== "prep") return;
    this.timer = Math.min(this.timer, 1);
    this.game.notify("You called the night early", "bad");
  }

  beginWave() {
    const spec = getWave(this.number);
    const groups = { ...spec.groups };
    if (this.game.flags.horde) {
      this.game.flags.horde = false;
      for (const k of Object.keys(groups)) groups[k] = Math.ceil(groups[k] * 1.45);
    }
    if (this.game.flags.bloodMoon) {
      this.game.flags.blood = true;
      this.game.flags.bloodMoon = false;
    }
    this.active = { ...spec, groups };
    this.phase = "wave";
    this.timer = 0;
    this.coreDamage = 0;
    this.queue = [];
    const lanes = this.lanes.length ? this.lanes : this.pickLanes(spec);
    this.lanes = lanes;
    let laneI = 0;
    for (const [type, count] of Object.entries(groups)) {
      for (let i = 0; i < count; i++) {
        this.queue.push({ type, lane: lanes[laneI % lanes.length] });
        laneI++;
      }
    }
    this.bossPending = spec.boss || null;
    this.spawnTimer = 0.3;
    this.failLock = false;
    this.game.hud.announce("WAVE " + this.number, this.game.flags.blood ? "Blood moon. Hold the pyre." : "The dead are at the ring.");
    this.game.audio.play(spec.boss ? "boss" : "wave");
  }

  spawnPos(lane) {
    const len = Math.hypot(lane.x, lane.z) || 1;
    const fx = lane.x / len;
    const fz = lane.z / len;
    const sideX = -fz;
    const sideZ = fx;
    const dist = 32 + Math.random() * 5;
    const side = (Math.random() - 0.5) * 10;
    return { x: fx * dist + sideX * side, z: fz * dist + sideZ * side };
  }

  update(dt) {
    if (this.game.state !== "play") return;
    if (!this.allows()) {
      this.phase = "wait";
      return;
    }
    if (this.phase === "wait") {
      this.beginPrep();
      return;
    }
    if (this.phase === "prep" || this.phase === "dawn") {
      this.timer -= dt;
      if (this.timer <= 0) {
        if (this.phase === "dawn") this.beginPrep();
        else this.beginWave();
      }
      return;
    }
    if (this.phase !== "wave") return;
    this.spawnTimer -= dt;
    const cap = 28;
    const aliveWave = this.listWave().length;
    if (this.spawnTimer <= 0 && this.queue.length && aliveWave < cap) {
      const job = this.queue.shift();
      const pos = this.spawnPos(job.lane);
      this.game.zombies.spawn(job.type, pos.x, pos.z, {
        wave: true,
        blood: !!this.game.flags.blood,
        waveNumber: this.number,
        force: true,
      });
      this.spawnTimer = Math.max(0.28, 0.62 - this.number * 0.015);
    } else if (!this.queue.length && this.bossPending && aliveWave < cap) {
      const boss = this.bossPending;
      this.bossPending = null;
      const pos = this.spawnPos(this.lanes[0] || LANES[0]);
      this.game.zombies.spawn(boss, pos.x, pos.z, {
        wave: true,
        blood: !!this.game.flags.blood,
        waveNumber: this.number,
        force: true,
      });
      const name = this.game.zombies.list[this.game.zombies.list.length - 1];
      this.game.hud.announce(name && name.def ? name.def.name.toUpperCase() : "A BOSS", "Kill it before it reaches the pyre.");
      this.game.audio.play("boss");
    }
    if (!this.queue.length && !this.bossPending && this.listWave().length === 0) this.win();
  }

  listWave() {
    return this.game.zombies.list.filter((z) => z.alive && z.wave);
  }

  remaining() {
    if (this.phase !== "wave") return 0;
    return this.listWave().length + this.queue.length + (this.bossPending ? 1 : 0);
  }

  win() {
    const perfect = this.coreDamage < 12;
    let gold = WAVE.clearGoldBase + WAVE.clearGoldPer * this.number;
    if (perfect) gold = Math.round(gold * (1 + WAVE.perfectBonus));
    if (this.game.flags.blood) gold = Math.round(gold * 1.35);
    this.game.inventory.add("gold", gold);
    this.game.progression.addXp(30 + this.number * 12);
    this.cleared = Math.max(this.cleared, this.number);
    this.game.stats.wavesCleared = this.cleared;
    this.game.flags.blood = false;
    this.game.notify(
      "Wave " + this.number + " held. +" + gold + " gold" + (perfect ? " (pyre untouched)" : ""),
      "good"
    );
    this.number += 1;
    this.phase = "dawn";
    this.timer = 6;
    this.game.audio.play("level");
  }

  // Death ends the night. The same wave waits in daylight, and the yard is empty.
  resetAfterDeath() {
    this.game.flags.blood = false;
    this.game.flags.bloodMoon = false;
    this.game.flags.forceNight = false;
    this.game.flags.horde = false;
    this.queue = [];
    this.bossPending = null;
    this.coreDamage = 0;
    this.failLock = false;
    if (this.game.zombies) this.game.zombies.purgeFromBase();
    if (this.phase === "wave" || this.phase === "dawn") {
      const spec = getWave(this.number);
      this.phase = "prep";
      this.timer = spec.prep;
      this.active = spec;
      this.lanes = this.pickLanes(spec);
      this.laneText = this.lanes.map((l) => l.name).join(" & ");
      if (this.game.hud) {
        this.game.hud.announce("DAWN", "The dead leave the yard. Shore up the walls before they return.");
      }
    }
    if (this.game.dayNight) {
      this.game.dayNight.factor = 0;
      this.game.dayNight.update(0);
    }
  }

  failRaid() {
    if (this.failLock) return;
    this.failLock = true;
    this.game.zombies.clearWave();
    const loss = Math.floor(this.game.inventory.gold * WAVE.coreFailGoldLoss);
    this.game.inventory.gold = Math.max(0, this.game.inventory.gold - loss);
    const core = this.game.buildings.core;
    if (core) {
      core.destroyed = false;
      core.hp = Math.max(1, core.maxHp * WAVE.coreFailHp);
    }
    this.queue = [];
    this.bossPending = null;
    this.game.flags.blood = false;
    this.phase = "prep";
    this.timer = 28;
    this.game.hud.announce("THE HEARTH WENT DARK", "The raid broke. You lost " + loss + " gold. Rebuild before they return.");
    this.game.audio.play("explode");
    this.game.fx.addShake(0.3);
    setTimeout(() => {
      this.failLock = false;
    }, 1500);
  }

  serialize() {
    return { number: this.number, cleared: this.cleared, phase: this.phase === "wave" ? "prep" : this.phase };
  }

  hydrate(data) {
    if (!data) return;
    this.number = data.number || 1;
    this.cleared = data.cleared || 0;
    this.game.stats.wavesCleared = this.cleared;
    this.phase = "wait";
  }
}
