// Zombie simulation. Each type keeps its own target rule, but movement,
// separation, and "hit the thing in front of you" are shared.
import * as THREE from "three";
import { ZOMBIES, scaledStats } from "../config/zombies.js";
import { COMBAT, ZONES, plotOf } from "../config/balance.js";
import { buildZombie, stepLimbs } from "../world/figures.js";
import { CELL, collideCircle, dist2, firstBlocker } from "../core/util.js";

const WILD = [
  { zone: "forest", types: ["normal", "normal", "runner"], cap: 4, tier: 0 },
  { zone: "quarry", types: ["normal", "crawler", "armored"], cap: 3, tier: 0 },
  { zone: "city", types: ["spitter", "exploder", "armored", "runner"], cap: 4, tier: 1 },
  { zone: "military", types: ["armored", "runner", "armored"], cap: 3, tier: 3 },
  { zone: "lab", types: ["mutant", "spitter"], cap: 2, tier: 4 },
];

export class Zombies {
  constructor(game) {
    this.game = game;
    this.list = [];
    this.byId = new Map();
    this.nextId = 1;
    this.wildTimer = 1.5;
  }

  aliveCount() {
    let n = 0;
    for (const z of this.list) if (z.alive) n++;
    return n;
  }

  spawn(type, x, pz, opts = {}) {
    const def = ZOMBIES[type];
    if (!def) return null;
    if (!opts.force && this.aliveCount() >= COMBAT.maxZombies) return null;
    const waveN = opts.waveNumber || (this.game.waves ? this.game.waves.number : 1);
    const scaled = scaledStats(def, opts.wave ? waveN : Math.max(1, waveN - 2), {
      blood: !!opts.blood,
    });
    const mesh = buildZombie(def);
    mesh.position.set(x, 0, pz);
    const bar = new THREE.Mesh(
      new THREE.PlaneGeometry(0.8, 0.08),
      new THREE.MeshBasicMaterial({ color: 0xc6e07a })
    );
    bar.position.y = (def.height || 1.7) + 0.35;
    bar.name = "hpbar";
    bar.raycast = () => {};
    mesh.add(bar);
    const z = {
      id: this.nextId++,
      type,
      def,
      mesh,
      bar,
      x,
      z: pz,
      hp: opts.hp || scaled.hp,
      maxHp: opts.hp || scaled.hp,
      damage: scaled.damage,
      structureDamage: scaled.structureDamage,
      goldMul: scaled.goldMul,
      xp: scaled.xp,
      alive: true,
      wild: !!opts.wild,
      aggro: opts.aggro != null ? opts.aggro : !opts.wild,
      homeX: opts.homeX != null ? opts.homeX : x,
      homeZ: opts.homeZ != null ? opts.homeZ : pz,
      cooldown: 0.4 + Math.random() * 0.6,
      summonT: def.summon ? 2 + Math.random() * 2 : 0,
      slamT: 1.2,
      chargeT: 3,
      charging: 0,
      chargeDir: new THREE.Vector3(0, 0, 1),
      hitFlash: 0,
      wave: !!opts.wave,
      invasion: !!opts.invasion,
      lootBonus: !!opts.lootBonus,
      buff: 1,
      stuck: 0,
      dead: 0,
      radius: def.radius,
      _exploded: false,
    };
    mesh.traverse((o) => {
      o.userData.zid = z.id;
    });
    this.game.scene.add(mesh);
    this.game.raycastables.push(mesh);
    this.list.push(z);
    this.byId.set(z.id, z);
    return z;
  }

  kill(z) {
    if (!z || !z.alive) return;
    z.alive = false;
    z.dead = 0.85;
    if (z.def.explode) this.detonate(z, z.def.explode.selfOnDeath || 0.65);
    this.game.stats.kills += 1;
    this.game.stats.killsByType[z.type] = (this.game.stats.killsByType[z.type] || 0) + 1;
    if (z.def.boss) {
      this.game.stats.bosses += 1;
      this.game.notify(z.def.name + " has fallen", "good");
      this.game.audio.play("boss");
      this.game.fx.addShake(0.22);
    }
    this.game.progression.addXp(z.xp);
    if (this.game.loot) this.game.loot.dropFrom(z);
    this.game.audio.play("die");
    if (z.invasion && !this.list.some((o) => o.invasion && o.alive)) {
      this.game.flags.forceNight = false;
    }
  }

  detonate(z, mul = 1) {
    if (z._exploded || !z.def.explode) return;
    z._exploded = true;
    const ex = z.def.explode;
    const r = ex.radius;
    for (const b of [...this.game.buildings.list]) {
      if (b.destroyed) continue;
      const d = Math.hypot(b.mesh.position.x - z.x, b.mesh.position.z - z.z);
      if (d > r + 1.2) continue;
      const fall = 1 - d / (r + 1.2);
      this.game.combat.damageBuilding(b, ex.structure * mul * Math.max(0.25, fall), {});
    }
    for (const o of this.list) {
      if (!o.alive || o === z) continue;
      const d = Math.hypot(o.x - z.x, o.z - z.z);
      if (d < r) this.game.combat.damageZombie(o, 40 * mul * (1 - d / r), { pierce: true, source: "explode" });
    }
    const p = this.game.player;
    const pd = Math.hypot(p.pos.x - z.x, p.pos.z - z.z);
    if (pd < r) this.game.combat.damagePlayer(ex.player * mul * (1 - pd / r));
    this.game.fx.burst(new THREE.Vector3(z.x, 1, z.z), 0xff6a2a, 18, 7);
    this.game.fx.addShake(0.18 * mul);
    this.game.audio.play("explode");
  }

  clearWave() {
    for (const z of [...this.list]) if (z.wave) this.despawn(z);
  }

  clearAll() {
    for (const z of [...this.list]) this.despawn(z);
  }

  // The yard is the player's plot. A death sends every raider away and
  // drops anyone already standing inside the walls.
  inBase(x, z) {
    const plot = plotOf(this.game.progression.tier);
    const minX = plot.minX * CELL;
    const maxX = (plot.maxX + 1) * CELL;
    const minZ = plot.minZ * CELL;
    const maxZ = (plot.maxZ + 1) * CELL;
    return x >= minX && x <= maxX && z >= minZ && z <= maxZ;
  }

  purgeFromBase() {
    for (const z of [...this.list]) {
      if (z.wave || z.invasion || this.inBase(z.x, z.z)) this.despawn(z);
    }
  }

  despawn(z) {
    this.game.scene.remove(z.mesh);
    const idx = this.game.raycastables.indexOf(z.mesh);
    if (idx >= 0) this.game.raycastables.splice(idx, 1);
    this.byId.delete(z.id);
    this.list = this.list.filter((o) => o !== z);
  }

  update(dt) {
    this.maintainWild(dt);
    this.applyAuras();
    const alive = this.list.filter((z) => z.alive);
    for (let i = 0; i < alive.length; i++) {
      for (let j = i + 1; j < alive.length; j++) {
        const a = alive[i];
        const b = alive[j];
        const dx = a.x - b.x;
        const dz = a.z - b.z;
        const min = (a.radius + b.radius) * COMBAT.separation;
        const d = Math.hypot(dx, dz) || 0.0001;
        if (d < min) {
          const p = (min - d) * 0.35;
          a.x += (dx / d) * p;
          a.z += (dz / d) * p;
          b.x -= (dx / d) * p;
          b.z -= (dz / d) * p;
        }
      }
    }
    for (const z of [...this.list]) {
      if (!z.alive) this.tickDead(z, dt);
      else {
        this.think(z, dt);
        if (z.alive && this.game.buildings.zombieInPyre(z.x, z.z)) this.game.gameOver();
      }
    }
  }

  tickDead(z, dt) {
    z.dead -= dt;
    z.mesh.rotation.x = Math.min(1.35, z.mesh.rotation.x + dt * 3.5);
    z.mesh.position.y = Math.max(-0.3, z.mesh.position.y - dt * 0.4);
    if (z.dead <= 0) this.despawn(z);
  }

  applyAuras() {
    for (const z of this.list) z.buff = 1;
    for (const z of this.list) {
      if (!z.alive || !z.def.aura) continue;
      const r = z.def.aura.radius;
      for (const o of this.list) {
        if (!o.alive || o === z) continue;
        if (dist2(o.x, o.z, z.x, z.z) <= r * r) o.buff = Math.max(o.buff, z.def.aura.speed);
      }
    }
  }

  acquire(z) {
    const player = this.game.player;
    const core = this.game.buildings.core;
    const pdist = Math.hypot(z.x - player.pos.x, z.z - player.pos.z);
    if (z.wild && !z.invasion) {
      if (player.downed > 0) z.aggro = false;
      else if (pdist < 13) z.aggro = true;
      if (z.aggro && Math.hypot(z.x - z.homeX, z.z - z.homeZ) > 30) z.aggro = false;
      if (!z.aggro) return { kind: "home" };
      return { kind: "player" };
    }
    if (player.downed <= 0 && (z.def.ai === "player" || z.def.ai === "runner") && pdist < 18) {
      return { kind: "player" };
    }
    const kind = z.def.crawler ? "crawler" : "zombie";
    const accepts = (b) => b.blocks(kind);
    if (z.def.ai === "tank" || z.def.ai === "boss-brute" || z.def.ai === "boss-abom") {
      let best = null;
      let bestHp = -1;
      for (const b of this.game.buildings.list) {
        if (!accepts(b)) continue;
        const d = Math.hypot(b.mesh.position.x - z.x, b.mesh.position.z - z.z);
        if (d < 14 && b.maxHp > bestHp) {
          best = b;
          bestHp = b.maxHp;
        }
      }
      if (best) return { kind: "building", building: best };
    }
    if (core) {
      const blocker = firstBlocker(
        z.x,
        z.z,
        core.mesh.position.x,
        core.mesh.position.z,
        this.game.buildings.solid,
        accepts
      );
      if (blocker) return { kind: "building", building: blocker };
      return { kind: "building", building: core };
    }
    return { kind: "player" };
  }

  think(z, dt) {
    const target = this.acquire(z);
    const player = this.game.player;
    let tx = z.homeX;
    let tz = z.homeZ;
    if (target.kind === "player") {
      tx = player.pos.x;
      tz = player.pos.z;
    } else if (target.kind === "building") {
      tx = target.building.mesh.position.x;
      tz = target.building.mesh.position.z;
    }
    let dx = tx - z.x;
    let dz = tz - z.z;
    let dist = Math.hypot(dx, dz) || 0.001;
    const ai = z.def.ai;
    let speed = z.def.speed * (z.buff || 1);
    let hold = false;
    const ranged = ai === "ranged" || ai === "boss-necro" || (ai === "boss-abom" && z.def.projectile);
    if (ranged && dist < (z.def.minRange || 7)) {
      dx = -dx;
      dz = -dz;
    } else if (ai === "screamer" && target.kind !== "home" && dist < 8) {
      dx = -dx;
      dz = -dz;
    } else if (ranged && dist < z.def.range * 0.92) {
      hold = true;
    }
    if (z.def.charge) {
      z.chargeT -= dt;
      if (z.charging <= 0 && z.chargeT <= 0 && dist < 16 && dist > 3.5) {
        z.charging = z.def.charge.duration;
        z.chargeDir.set(dx / dist, 0, dz / dist);
        z.chargeT = z.def.charge.every;
      }
    }
    if (z.charging > 0) {
      z.charging -= dt;
      dx = z.chargeDir.x;
      dz = z.chargeDir.z;
      dist = 1;
      speed = z.def.charge.speed;
      hold = false;
    }
    const ox = z.x;
    const oz = z.z;
    if (!hold && dist > 0.15) {
      z.x += (dx / dist) * speed * dt;
      z.z += (dz / dist) * speed * dt;
    }
    const kind = z.def.crawler ? "crawler" : "zombie";
    const boxes = this.game.buildings.collisionBoxes().concat(this.game.world.blockers);
    const resolved = collideCircle(z.x, z.z, z.radius, boxes, (box) => {
      if (box.prop) return true;
      if (box.building && box.building.def.core) return false;
      return !!(box.building && box.building.blocks(kind));
    });
    const blocked = Math.hypot(resolved.x - z.x, resolved.z - z.z) > 0.02;
    z.x = resolved.x;
    z.z = resolved.z;
    const moved = Math.hypot(z.x - ox, z.z - oz);
    z.stuck = moved < 0.02 ? z.stuck + dt : 0;
    z.cooldown -= dt;

    if (z.def.explode && target.kind !== "home" && dist < 1.7) {
      this.detonate(z, 1);
      this.kill(z);
      return;
    }

    if (z.stuck > 0.5 || (blocked && target.kind !== "home")) {
      const b = this.nearestBlocker(z, kind);
      if (b && z.cooldown <= 0) {
        this.game.combat.damageBuilding(b, z.structureDamage, {});
        z.cooldown = z.def.cooldown;
        if (Math.random() < 0.25) this.game.audio.play("zombie");
      }
    } else if (target.kind === "player" && dist < z.def.range + 0.2 && !ranged && z.cooldown <= 0) {
      this.game.combat.damagePlayer(z.damage);
      z.cooldown = z.def.cooldown;
      if (Math.random() < 0.4) this.game.audio.play("zombie");
    } else if (target.kind === "building" && dist < z.def.range + 0.8 && !ranged && z.cooldown <= 0) {
      this.game.combat.damageBuilding(target.building, z.structureDamage, {});
      z.cooldown = z.def.cooldown;
      if (Math.random() < 0.2) this.game.audio.play("zombie");
    } else if (ranged && dist < z.def.range && z.cooldown <= 0 && z.def.projectile) {
      const point = new THREE.Vector3(tx, 1.2, tz);
      this.game.combat.zombieShot(z, point);
      z.cooldown = z.def.cooldown;
    }

    if (z.def.slam) {
      z.slamT -= dt;
      if (z.slamT <= 0 && dist < z.def.slam.radius) {
        z.slamT = z.def.slam.every;
        this.slam(z);
      }
    }
    if (z.def.summon && (z.wave || z.def.boss || z.invasion)) {
      z.summonT -= dt;
      if (z.summonT <= 0) {
        z.summonT = z.def.summon.every;
        this.summon(z);
      }
    }

    z.hitFlash = Math.max(0, z.hitFlash - dt);
    if (moved > 0.002) {
      z.stride = (z.stride || 0) + Math.min(moved * 4.2, dt * 11);
      z.gait = Math.min(1, (z.gait || 0) + dt * 10);
    } else {
      z.gait = Math.max(0, (z.gait || 0) - dt * 7);
    }
    stepLimbs(z.mesh, z.stride || 0, z.gait || 0, 0);
    z.mesh.position.set(z.x, Math.abs(Math.sin(z.stride || 0)) * 0.08 * (z.gait || 0), z.z);
    if (Math.hypot(tx - z.x, tz - z.z) > 0.08) z.mesh.lookAt(tx, 0, tz);
    z.mesh.rotation.z += Math.sin(z.stride || 0) * 0.08 * (z.gait || 0);
    const body = z.mesh.getObjectByName("body");
    if (body && body.material) {
      body.material.emissive.setHex(z.hitFlash > 0 ? 0xff4422 : 0x000000);
      body.material.emissiveIntensity = z.hitFlash > 0 ? 0.7 : 0;
    }
    if (z.bar) {
      z.bar.scale.x = Math.max(0.05, z.hp / z.maxHp);
      z.bar.lookAt(this.game.camera.position);
    }
    const sac = z.mesh.getObjectByName("sac");
    if (sac) {
      const s = 1 + Math.sin(this.game.time * (z.def.core ? 10 : 3) + z.id) * 0.08;
      sac.scale.setScalar(s);
    }
  }

  nearestBlocker(z, kind) {
    let best = null;
    let bestD = 2.3;
    for (const b of this.game.buildings.list) {
      if (!b.blocks(kind)) continue;
      const d = Math.hypot(b.mesh.position.x - z.x, b.mesh.position.z - z.z);
      if (d < bestD) {
        best = b;
        bestD = d;
      }
    }
    return best;
  }

  slam(z) {
    const r = z.def.slam.radius;
    for (const b of [...this.game.buildings.list]) {
      if (b.destroyed) continue;
      const d = Math.hypot(b.mesh.position.x - z.x, b.mesh.position.z - z.z);
      if (d <= r) this.game.combat.damageBuilding(b, z.def.slam.structure * (1 - d / r), {});
    }
    const p = this.game.player;
    const pd = Math.hypot(p.pos.x - z.x, p.pos.z - z.z);
    if (pd <= r) this.game.combat.damagePlayer(z.def.slam.player * (1 - pd / r));
    this.game.fx.burst(new THREE.Vector3(z.x, 0.4, z.z), 0xc4a36a, 10, 4);
    this.game.fx.addShake(0.12);
    this.game.audio.play("explode");
  }

  summon(z) {
    const n = z.def.summon.count;
    for (let i = 0; i < n; i++) {
      const ang = Math.random() * Math.PI * 2;
      this.spawn(z.def.summon.type, z.x + Math.cos(ang) * 1.8, z.z + Math.sin(ang) * 1.8, {
        wave: z.wave,
        wild: z.wild && !z.wave,
        invasion: z.invasion,
        blood: !!(this.game.flags && this.game.flags.blood),
        waveNumber: this.game.waves ? this.game.waves.number : 1,
        force: true,
        aggro: true,
      });
    }
    this.game.audio.play("scream");
    if (z.def.boss) this.game.notify(z.def.name + " calls more dead", "bad");
  }

  maintainWild(dt) {
    if (this.game.state !== "play") return;
    this.wildTimer -= dt;
    if (this.wildTimer > 0) return;
    this.wildTimer = 3.5;
    const wildAlive = this.list.filter((z) => z.alive && z.wild).length;
    if (wildAlive >= COMBAT.wildCap) return;
    const tier = this.game.progression.tier;
    for (const spec of WILD) {
      if (tier < spec.tier) continue;
      const zone = ZONES.find((z) => z.id === spec.zone);
      if (!zone) continue;
      const have = this.list.filter((z) => z.alive && z.wild && z.x >= zone.x && z.x <= zone.x + zone.w && z.z >= zone.z && z.z <= zone.z + zone.h).length;
      if (have >= spec.cap) continue;
      const x = zone.x + 6 + Math.random() * (zone.w - 12);
      const z = zone.z + 6 + Math.random() * (zone.h - 12);
      const p = this.game.player;
      if (Math.hypot(x - p.pos.x, z - p.pos.z) < 16) continue;
      const type = spec.types[Math.floor(Math.random() * spec.types.length)];
      this.spawn(type, x, z, { wild: true, homeX: x, homeZ: z, aggro: false });
      return;
    }
  }

  anyInvasion() {
    return this.list.some((z) => z.alive && z.invasion);
  }
}
