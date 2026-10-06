// Drops are world orbs. They vacuum into the warden after a short beat
// so a kill still reads as a pickup.
import * as THREE from "three";
import { randInt } from "../core/util.js";

const RARITY_COLOR = {
  common: 0xf4efe4,
  uncommon: 0x7dcc6a,
  rare: 0x4aa3ff,
  epic: 0xc07bff,
  legendary: 0xffb13a,
};

export class Loot {
  constructor(game) {
    this.game = game;
    this.orbs = [];
    this.geo = new THREE.SphereGeometry(0.16, 8, 6);
  }

  dropFrom(z) {
    const mods = this.game.progression.mods().drops;
    const bonus = z.lootBonus ? 2.4 : 1;
    const gold = Math.max(1, Math.round(randInt(z.def.gold[0], z.def.gold[1]) * z.goldMul * bonus));
    const rarity = z.def.boss ? "legendary" : z.def.big ? "epic" : "common";
    this.spawn(z.x, z.z, { kind: "gold", amount: gold, rarity });
    const roll = Math.random;
    if (roll() < 0.22 * mods) this.spawn(z.x + 0.3, z.z, { kind: "wood", amount: randInt(1, 3), rarity: "common" });
    if (roll() < 0.14 * mods) this.spawn(z.x - 0.3, z.z, { kind: "stone", amount: 1, rarity: "common" });
    if (roll() < 0.07 * mods) this.spawn(z.x, z.z + 0.3, { kind: "metal", amount: 1, rarity: "uncommon" });
    if (roll() < 0.08 * mods) this.spawn(z.x, z.z - 0.25, { kind: "heal", amount: z.def.boss ? 60 : 28, rarity: "uncommon" });
    if (roll() < (z.def.boss ? 1 : 0.09) * mods) {
      this.spawn(z.x + 0.2, z.z + 0.2, {
        kind: "parts",
        amount: z.def.boss ? randInt(4, 7) : 1,
        rarity: z.def.boss ? "epic" : "rare",
      });
    }
    if (roll() < 0.18 * mods) {
      const pool = ["pistol", "shell", "rifle"];
      const ammo = pool[Math.floor(Math.random() * pool.length)];
      this.spawn(z.x - 0.2, z.z - 0.2, { kind: "ammo", ammo, amount: randInt(3, 8), rarity: "common" });
    }
  }

  spawn(x, z, drop) {
    const color = RARITY_COLOR[drop.rarity] || RARITY_COLOR.common;
    const mat = new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: 0.55,
      roughness: 0.4,
    });
    const mesh = new THREE.Mesh(this.geo, mat);
    mesh.position.set(x, 0.35, z);
    this.game.scene.add(mesh);
    this.orbs.push({
      mesh,
      x,
      z,
      y: 0.35,
      age: 0,
      drop,
      color,
    });
  }

  update(dt) {
    const p = this.game.player;
    for (let i = this.orbs.length - 1; i >= 0; i--) {
      const o = this.orbs[i];
      o.age += dt;
      o.y = 0.35 + Math.sin(o.age * 4 + o.x) * 0.08;
      o.mesh.position.set(o.x, o.y, o.z);
      if (o.age > 28) {
        this.remove(i);
        continue;
      }
      if (o.age < 0.35 || p.downed > 0) continue;
      const d = Math.hypot(p.pos.x - o.x, p.pos.z - o.z);
      if (d < 7) {
        o.x += (p.pos.x - o.x) * Math.min(1, dt * 8);
        o.z += (p.pos.z - o.z) * Math.min(1, dt * 8);
      }
      if (d < 1.1 && this.collect(o)) this.remove(i);
    }
  }

  collect(o) {
    const d = o.drop;
    if (d.kind === "gold") {
      this.game.inventory.add("gold", d.amount);
      this.game.audio.play("gold");
      if (d.rarity === "legendary" || d.rarity === "epic") this.game.notify("+" + d.amount + " gold", "good");
      return true;
    }
    if (d.kind === "heal") {
      this.game.player.heal(d.amount);
      this.game.audio.play("pickup");
      this.game.notify("+" + d.amount + " health", "good");
      return true;
    }
    if (d.kind === "parts") {
      this.game.armory.addParts(d.amount);
      this.game.audio.play("pickup");
      this.game.notify("+" + d.amount + " weapon parts", "good");
      return true;
    }
    if (d.kind === "ammo") {
      this.game.armory.addAmmo(d.ammo, d.amount);
      this.game.audio.play("pickup");
      return true;
    }
    const added = this.game.inventory.add(d.kind, d.amount);
    if (added <= 0) return false;
    this.game.audio.play("gather");
    return true;
  }

  remove(i) {
    const o = this.orbs[i];
    this.game.scene.remove(o.mesh);
    o.mesh.material.dispose();
    this.orbs.splice(i, 1);
  }
}

export { RARITY_COLOR };
