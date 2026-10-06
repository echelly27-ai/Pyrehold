// Hitscan, melee, projectiles, and the only place hit points become damage.
// Turrets, the player, and zombie spitters all enter through this module.
import * as THREE from "three";
import { COMBAT } from "../config/balance.js";

function ud(obj, key) {
  let o = obj;
  while (o) {
    if (o.userData && o.userData[key] != null) return o.userData[key];
    o = o.parent;
  }
  return null;
}

function shotSound(id) {
  if (id === "bat") return "bat";
  if (id === "shotgun") return "shotgun";
  if (id === "sniper") return "sniper";
  if (id === "rocket") return "rocket";
  if (id === "energy" || id === "plasma") return "energy";
  if (id === "pistol") return "pistol";
  return "auto";
}

export class Combat {
  constructor(game) {
    this.game = game;
    this.raycaster = new THREE.Raycaster();
    this.ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    this.projectiles = [];
    this._aim = new THREE.Vector2();
    this._hit = new THREE.Vector3();
  }

  aimRay() {
    const ndc = this.game.input.aimNdc();
    this._aim.set(ndc.x, ndc.y);
    this.raycaster.setFromCamera(this._aim, this.game.camera);
    return this.raycaster;
  }

  groundAim() {
    const ray = this.aimRay();
    const hit = this._hit.clone();
    if (ray.ray.intersectPlane(this.ground, hit)) return hit;
    return null;
  }

  aimPoint(range = 80) {
    const ray = this.aimRay();
    const hits = ray.intersectObjects(this.game.raycastables, true);
    if (hits[0] && hits[0].distance < range) return hits[0].point.clone();
    return this.groundAim();
  }

  // Bullets leave along the crosshair, from just in front of the warden,
  // so a pistol aimed at a zombie hits that zombie.
  shotLine(range) {
    const player = this.game.player;
    player.faceVectors();
    const ray = this.aimRay().ray;
    const dir = ray.direction.clone();
    const chest = player.pos.clone();
    chest.y = 1.15;
    const along = Math.max(0.3, chest.sub(ray.origin).dot(dir));
    const origin = ray.origin.clone().addScaledVector(dir, along + 0.45);
    return { origin, dir, range };
  }

  blocksShots(bid) {
    const b = this.game.buildings.byId.get(bid);
    if (!b || b.destroyed || b.hp <= 0 || b.open) return false;
    const style = b.def.style;
    return style !== "floor" && style !== "campfire";
  }

  firePlayer() {
    const armory = this.game.armory;
    const stats = armory.stats();
    if (!stats) return;
    if (!armory.consumeShot()) {
      if (!stats.melee && armory.reload > 0) this.game.notify("Reloading");
      return;
    }
    const id = armory.equipped;
    this.game.audio.play(shotSound(id));
    this.game.player.swing = 1;
    const shot = this.shotLine(stats.range);
    const origin = shot.origin;
    const dir = shot.dir;
    this.game.fx.muzzleFlash(origin);
    if (stats.melee) {
      this.melee(stats);
      this.game.fx.addShake(0.02);
      return;
    }
    if (stats.projectile) {
      this.launch({
        origin,
        dir,
        speed: 28,
        damage: stats.damage,
        splash: stats.splash,
        range: stats.range,
        owner: "player",
        pierce: stats.armorPierce,
        color: id === "plasma" ? 0x7dffc4 : 0xff7a32,
      });
      this.game.fx.addShake(0.1);
      return;
    }
    const pellets = stats.pellets || 1;
    for (let i = 0; i < pellets; i++) {
      const d = this.spread(dir, stats.spread);
      this.hitscan(origin, d, stats.range, {
        damage: stats.damage,
        pierce: stats.armorPierce,
        crit: Math.random() < stats.crit,
        headMul: stats.headshot,
        owner: "player",
        color: id === "energy" ? 0x7dfff0 : 0xffe08a,
      });
    }
    this.game.fx.addShake(id === "shotgun" ? 0.07 : id === "sniper" ? 0.05 : 0.025);
  }

  spread(dir, amount) {
    const d = dir.clone();
    if (!amount) return d;
    d.x += (Math.random() - 0.5) * amount;
    d.y += (Math.random() - 0.5) * amount * 0.45;
    d.z += (Math.random() - 0.5) * amount;
    return d.normalize();
  }

  melee(stats) {
    const p = this.game.player;
    p.faceVectors();
    const fwd = p.flatForward;
    let hits = 0;
    for (const z of this.game.zombies.list) {
      if (!z.alive) continue;
      const dx = z.x - p.pos.x;
      const dz = z.z - p.pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist > stats.range + z.radius) continue;
      if (dist < 0.001) continue;
      const dot = (dx / dist) * fwd.x + (dz / dist) * fwd.z;
      if (dot < COMBAT.meleeArc) continue;
      this.damageZombie(z, stats.damage, {
        pierce: false,
        crit: Math.random() < stats.crit,
        headshot: false,
        source: "player",
      });
      hits++;
    }
    if (!hits) this.game.fx.burst(p.muzzleWorld().clone(), 0xe7c08a, 3, 1);
  }

  hitscan(origin, dir, range, opts) {
    const ray = new THREE.Raycaster(origin, dir, 0, range);
    const hits = ray.intersectObjects(this.game.raycastables, true);
    let end = origin.clone().addScaledVector(dir, Math.min(range, 28));
    let blocked = range;
    let struck = false;
    for (const hit of hits) {
      if (hit.distance > range) break;
      const zid = ud(hit.object, "zid");
      const bid = ud(hit.object, "bid");
      if (opts.ignoreZid && zid === opts.ignoreZid) continue;
      if (opts.ignoreBid && bid === opts.ignoreBid) continue;
      if (bid != null && !this.blocksShots(bid) && !opts.hurtBuildings) continue;
      end = hit.point.clone();
      blocked = hit.distance;
      if (zid != null) {
        const z = this.game.zombies.byId.get(zid);
        if (z && z.alive) {
          const headLine = z.def.crawler ? 0.38 : (z.def.height || 1.7) * 0.68;
          const headshot = hit.point.y >= headLine;
          this.damageZombie(z, opts.damage, {
            pierce: opts.pierce,
            crit: !!opts.crit,
            headshot,
            headMul: opts.headMul,
            source: opts.owner,
          });
          struck = true;
        }
      } else if (bid != null && opts.hurtBuildings) {
        const b = this.game.buildings.byId.get(bid);
        this.damageBuilding(b, opts.damage, opts);
      }
      this.game.fx.burst(end, opts.color || 0xffe08a, 4, 2);
      break;
    }
    if (!struck && opts.owner === "player") {
      const near = this.zombieNearRay(origin, dir, blocked, 1.15);
      if (near) {
        this.damageZombie(near.z, opts.damage, {
          pierce: opts.pierce,
          crit: !!opts.crit,
          headshot: false,
          source: opts.owner,
        });
        end = near.point;
        this.game.fx.burst(end, opts.color || 0xffe08a, 4, 2);
      }
    }
    this.game.fx.tracer(origin, end, opts.color || 0xffe08a);
  }

  zombieNearRay(origin, dir, limit, radius) {
    let best = null;
    let bestT = limit;
    for (const z of this.game.zombies.list) {
      if (!z.alive) continue;
      const height = z.def.crawler ? 0.35 : (z.def.height || 1.7) * 0.55;
      const body = new THREE.Vector3(z.x, height, z.z);
      const rel = body.clone().sub(origin);
      const t = rel.dot(dir);
      if (t < 0.3 || t > limit) continue;
      const miss = rel.clone().addScaledVector(dir, -t).length();
      if (miss > radius + (z.radius || 0.4) * 0.3) continue;
      if (t < bestT) {
        best = { z, point: origin.clone().addScaledVector(dir, t) };
        bestT = t;
      }
    }
    return best;
  }

  fireTurret(building, stats, muzzle, target) {
    const origin = muzzle.clone();
    const aimY = (target.def.height || 1.5) * 0.55;
    const dir = new THREE.Vector3(target.x - origin.x, aimY - origin.y, target.z - origin.z);
    if (dir.lengthSq() < 0.01) return;
    dir.normalize();
    const d = this.spread(dir, stats.kind === "sniper" ? 0.004 : 0.02);
    if (stats.kind === "rocket") {
      this.launch({
        origin,
        dir: d,
        speed: 22,
        damage: stats.damage,
        splash: stats.splash || 3,
        range: stats.range,
        owner: "turret",
        pierce: true,
        color: 0xff7a32,
        selfSplash: 0.12,
      });
      this.game.audio.play("rocket");
    } else {
      this.hitscan(origin, d, stats.range, {
        damage: stats.damage,
        pierce: stats.kind === "sniper" || stats.kind === "laser",
        crit: false,
        headMul: stats.kind === "sniper" ? 1.6 : 1.2,
        owner: "turret",
        ignoreBid: building.id,
        color: stats.kind === "laser" ? 0xff6a3a : stats.kind === "sniper" ? 0xfff2c4 : 0xffe08a,
      });
      this.game.audio.play(stats.kind === "laser" ? "energy" : stats.kind === "sniper" ? "sniper" : "auto");
    }
    this.game.fx.muzzleFlash(origin);
  }

  launch(spec) {
    const vel = spec.dir.clone().multiplyScalar(spec.speed);
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(spec.splash ? 0.18 : 0.12, 8, 6),
      new THREE.MeshBasicMaterial({ color: spec.color || 0xb6e05a })
    );
    mesh.position.copy(spec.origin);
    this.game.scene.add(mesh);
    this.projectiles.push({
      mesh,
      pos: spec.origin.clone(),
      vel,
      damage: spec.damage,
      splash: spec.splash || 0,
      acid: spec.acid || 0,
      owner: spec.owner || "zombie",
      pierce: !!spec.pierce,
      color: spec.color || 0xb6e05a,
      life: (spec.range || 30) / spec.speed,
      radius: spec.splash ? 0.35 : 0.2,
      selfSplash: spec.selfSplash,
      ignoreZid: spec.ignoreZid,
    });
  }

  zombieShot(z, targetPoint) {
    const spec = z.def.projectile;
    if (!spec) return;
    const origin = new THREE.Vector3(z.x, (z.def.height || 1.6) * 0.62, z.z);
    const dir = targetPoint.clone().sub(origin);
    if (dir.lengthSq() < 0.01) return;
    dir.normalize();
    this.launch({
      origin,
      dir,
      speed: spec.speed,
      damage: z.damage,
      splash: spec.splash || 0,
      acid: spec.acid || 0,
      range: z.def.range + 4,
      owner: "zombie",
      color: spec.color,
      ignoreZid: z.id,
    });
    this.game.audio.play("zombie");
  }

  update(dt) {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.life -= dt;
      p.pos.addScaledVector(p.vel, dt);
      p.mesh.position.copy(p.pos);
      if (p.life <= 0 || this.projectileHit(p)) {
        this.impact(p);
        this.game.scene.remove(p.mesh);
        p.mesh.geometry.dispose();
        p.mesh.material.dispose();
        this.projectiles.splice(i, 1);
      }
    }
  }

  projectileHit(p) {
    if (p.owner === "zombie") {
      const pl = this.game.player;
      if (pl.downed <= 0 && Math.hypot(p.pos.x - pl.pos.x, p.pos.z - pl.pos.z) < p.radius + 0.6 && Math.abs(p.pos.y - 1) < 1.4) {
        return true;
      }
    }
    for (const z of this.game.zombies.list) {
      if (!z.alive || z.id === p.ignoreZid) continue;
      if (p.owner === "zombie") continue;
      const d = Math.hypot(p.pos.x - z.x, p.pos.z - z.z);
      if (d < p.radius + z.radius && Math.abs(p.pos.y - (z.def.height || 1) * 0.5) < 1.6) return true;
    }
    for (const b of this.game.buildings.list) {
      if (b.destroyed || b.hp <= 0) continue;
      if (!b.def.blocksZombies && !b.def.core) continue;
      const dx = Math.abs(p.pos.x - b.mesh.position.x);
      const dz = Math.abs(p.pos.z - b.mesh.position.z);
      if (dx < 1.2 && dz < 1.2 && p.pos.y < 2.4) return true;
    }
    if (p.pos.y <= 0.05) return true;
    return false;
  }

  impact(p) {
    const selfMul = p.owner === "player" ? COMBAT.rocketSelfDamage : p.selfSplash != null ? p.selfSplash : 1;
    if (p.splash > 0) {
      for (const z of this.game.zombies.list) {
        if (!z.alive) continue;
        const d = Math.hypot(p.pos.x - z.x, p.pos.z - z.z);
        if (d > p.splash + z.radius) continue;
        const fall = 1 - d / (p.splash + z.radius);
        this.damageZombie(z, p.damage * Math.max(0.25, fall), { pierce: p.pierce, source: p.owner });
      }
      if (p.owner !== "zombie" || true) {
        for (const b of [...this.game.buildings.list]) {
          if (b.destroyed) continue;
          const d = Math.hypot(p.pos.x - b.mesh.position.x, p.pos.z - b.mesh.position.z);
          if (d > p.splash + 1) continue;
          const fall = 1 - d / (p.splash + 1);
          const mul = p.owner === "zombie" ? 1 : selfMul;
          this.damageBuilding(b, p.damage * mul * Math.max(0.2, fall), {});
          if (p.acid) b.acid = Math.min(50, (b.acid || 0) + p.acid);
        }
      }
      const pl = this.game.player;
      const pd = Math.hypot(p.pos.x - pl.pos.x, p.pos.z - pl.pos.z);
      if (pd < p.splash && p.owner === "zombie") this.damagePlayer(p.damage * 0.45);
      this.game.fx.burst(p.pos.clone(), p.color, 16, 6);
      this.game.fx.addShake(p.owner === "zombie" ? 0.08 : 0.14);
      this.game.audio.play("explode");
      return;
    }
    if (p.owner === "zombie") {
      const pl = this.game.player;
      if (Math.hypot(p.pos.x - pl.pos.x, p.pos.z - pl.pos.z) < 1.4) this.damagePlayer(p.damage);
      let best = null;
      let bestD = 1.6;
      for (const b of this.game.buildings.list) {
        if (b.destroyed) continue;
        const d = Math.hypot(p.pos.x - b.mesh.position.x, p.pos.z - b.mesh.position.z);
        if (d < bestD) {
          best = b;
          bestD = d;
        }
      }
      if (best) {
        this.damageBuilding(best, p.damage, {});
        if (p.acid) best.acid = Math.min(50, (best.acid || 0) + p.acid);
      }
      this.game.fx.burst(p.pos.clone(), p.color, 6, 2);
      return;
    }
    let best = null;
    let bestD = 1.2;
    for (const z of this.game.zombies.list) {
      if (!z.alive) continue;
      const d = Math.hypot(p.pos.x - z.x, p.pos.z - z.z);
      if (d < bestD) {
        best = z;
        bestD = d;
      }
    }
    if (best) this.damageZombie(best, p.damage, { pierce: p.pierce, source: p.owner });
    this.game.fx.burst(p.pos.clone(), p.color, 6, 2);
  }

  damageZombie(z, amount, info = {}) {
    if (!z || !z.alive || amount <= 0) return 0;
    let dmg = amount;
    if (z.def.armor != null && !info.pierce) dmg *= info.headshot ? 0.8 : z.def.armor;
    if (info.crit) dmg *= 1.7;
    if (info.headshot) dmg *= info.headMul || COMBAT.headshotBonus;
    z.hp -= dmg;
    z.hitFlash = 0.12;
    z.aggro = true;
    const label = Math.max(1, Math.round(dmg)) + (info.headshot ? " HEAD" : info.crit ? " CRIT" : "");
    const color = info.headshot ? "#ffb13a" : info.crit ? "#ffd27a" : "#f4efe4";
    this.game.fx.floatText(new THREE.Vector3(z.x, (z.def.height || 1.6) + 0.3, z.z), label, color);
    if (info.source === "player") this.game.audio.play(info.headshot ? "head" : "hit");
    if (z.hp <= 0) this.game.zombies.kill(z);
    return dmg;
  }

  damageBuilding(b, amount, info = {}) {
    if (!b || b.destroyed || amount <= 0) return;
    b.hp -= amount;
    if (b.def.core && this.game.waves) this.game.waves.noteCoreDamage(amount);
    if (b.hp <= 0) {
      b.hp = 0;
      if (b.def.core) this.game.gameOver();
      else this.game.buildings.destroy(b);
    }
    void info;
  }

  damagePlayer(amount) {
    const p = this.game.player;
    if (!p || p.downed > 0 || p.invuln > 0 || amount <= 0) return;
    const dmg = amount * this.game.progression.mods().resist;
    p.hp -= dmg;
    this.game.fx.addShake(Math.min(0.2, 0.04 + dmg * 0.004));
    this.game.fx.floatText(new THREE.Vector3(p.pos.x, 2.1, p.pos.z), Math.max(1, Math.round(dmg)).toString(), "#ff5a3c");
    this.game.audio.play("hit");
    if (p.hp <= 0) p.down();
  }
}
