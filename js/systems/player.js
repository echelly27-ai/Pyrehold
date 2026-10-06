// Third-person warden. Movement is camera-relative. The body always faces
// the aim yaw so shooting and building share one facing direction.
import * as THREE from "three";
import { PLAYER, ZONES, WORLD } from "../config/balance.js";
import { clamp, collideCircle } from "../core/util.js";
import { buildWarden, setWeaponVisual, stepLimbs } from "../world/figures.js";

export class Player {
  constructor(game) {
    this.game = game;
    this.maxHp = game.progression.mods().maxHp;
    this.hp = this.maxHp;
    this.yaw = Math.PI;
    this.pitch = -0.28;
    this.pos = new THREE.Vector3(0, 0, 4);
    this.velY = 0;
    this.grounded = true;
    this.radius = PLAYER.radius;
    this.invuln = 0;
    this.downed = 0;
    this.swing = 0;
    this.stride = 0;
    this.gait = 0;
    this.bob = 0;
    this._ox = 0;
    this._oz = 4;
    this.traveled = 0;
    this.zoneNote = "";
    this.mesh = buildWarden();
    this.mesh.position.copy(this.pos);
    game.scene.add(this.mesh);
    this.forward = new THREE.Vector3();
    this.flatForward = new THREE.Vector3();
    this.flatRight = new THREE.Vector3();
    this._muzzle = new THREE.Vector3();
    this.attachWeapon("bat");
  }

  attachWeapon(id) {
    const mount = this.mesh.userData.weaponMount;
    if (mount) setWeaponVisual(mount, id);
  }

  faceVectors() {
    const cp = Math.cos(this.pitch);
    this.forward.set(-Math.sin(this.yaw) * cp, Math.sin(this.pitch), -Math.cos(this.yaw) * cp);
    this.flatForward.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    this.flatRight.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
  }

  muzzleWorld() {
    const mount = this.mesh.userData.weaponMount;
    if (mount) {
      this._muzzle.set(0, 0, -0.35);
      mount.localToWorld(this._muzzle);
      return this._muzzle;
    }
    this.faceVectors();
    return this._muzzle.copy(this.pos).add(new THREE.Vector3(0, 1.3, 0)).addScaledVector(this.flatForward, 0.6);
  }

  heal(amount) {
    this.hp = Math.min(this.maxHp, this.hp + amount);
  }

  down() {
    if (this.downed > 0) return;
    this.hp = 0;
    this.downed = PLAYER.respawnDelay;
    const loss = Math.floor(this.game.inventory.gold * PLAYER.downGoldLoss);
    this.game.inventory.gold = Math.max(0, this.game.inventory.gold - loss);
    if (this.game.waves) this.game.waves.resetAfterDeath();
    this.game.notify("You fell. Dawn returns, and the yard is clear.", "bad");
    this.game.audio.play("die");
    this.game.fx.addShake(0.25);
  }

  respawn() {
    this.downed = 0;
    this.pos.set(0, 0, 4);
    this.yaw = Math.PI;
    this.velY = 0;
    this.hp = this.maxHp;
    this.invuln = 2.2;
    this.game.notify("Back on your feet. The day is yours.", "good");
  }

  update(dt) {
    const input = this.game.input;
    const playing = this.game.state === "play" && !this.game.panel;
    this.maxHp = this.game.progression.mods().maxHp;
    if (this.hp > this.maxHp) this.hp = this.maxHp;

    if (playing && this.downed <= 0) {
      this.yaw -= input.lookX * 0.0032;
      this.pitch = clamp(this.pitch - input.lookY * 0.0026, -1.05, 0.8);
      // Arrow keys turn the camera so the game is playable without a drag-look.
      const turn = 1.8 * dt;
      if (input.down("arrowleft")) this.yaw += turn;
      if (input.down("arrowright")) this.yaw -= turn;
      if (input.down("arrowup")) this.pitch = clamp(this.pitch + turn * 0.45, -1.05, 0.8);
      if (input.down("arrowdown")) this.pitch = clamp(this.pitch - turn * 0.45, -1.05, 0.8);
    }
    this.faceVectors();

    if (this.downed > 0) {
      this.downed -= dt;
      this.mesh.rotation.z = Math.sin(this.downed * 8) * 0.04;
      if (this.downed <= 0) this.respawn();
    }

    const mods = this.game.progression.mods();
    let speed = 0;
    if (playing && this.downed <= 0) {
      const sprint = input.down("shift");
      speed = (sprint ? PLAYER.sprint : PLAYER.speed) * mods.speed;
      let mx = 0;
      let mz = 0;
      if (input.down("w")) {
        mx += this.flatForward.x;
        mz += this.flatForward.z;
      }
      if (input.down("s")) {
        mx -= this.flatForward.x;
        mz -= this.flatForward.z;
      }
      if (input.down("d")) {
        mx += this.flatRight.x;
        mz += this.flatRight.z;
      }
      if (input.down("a")) {
        mx -= this.flatRight.x;
        mz -= this.flatRight.z;
      }
      const len = Math.hypot(mx, mz);
      if (len > 0) {
        mx /= len;
        mz /= len;
        // Move one axis at a time so a wall slides you along instead of stopping you.
        const boxes = this.game.buildings ? this.game.buildings.collisionBoxes() : [];
        const world = (this.game.world && this.game.world.blockers) || [];
        const all = boxes.concat(world);
        const filter = (b) => {
          if (b.prop) return true;
          return !!(b.building && b.building.blocks("player"));
        };
        let step = collideCircle(this.pos.x + mx * speed * dt, this.pos.z, this.radius, all, filter);
        this.pos.x = step.x;
        this.pos.z = step.z;
        step = collideCircle(this.pos.x, this.pos.z + mz * speed * dt, this.radius, all, filter);
        this.pos.x = step.x;
        this.pos.z = step.z;
        this.traveled += speed * dt;
        this.bob += dt * (sprint ? 14 : 9);
      }
      if (input.edge(" ") && this.grounded) {
        this.velY = PLAYER.jump;
        this.grounded = false;
      }
    }

    this.velY -= PLAYER.gravity * dt;
    this.pos.y += this.velY * dt;
    if (this.pos.y <= 0) {
      this.pos.y = 0;
      this.velY = 0;
      this.grounded = true;
    }

    const border = WORLD.half - 4;
    const d = Math.hypot(this.pos.x, this.pos.z);
    if (d > border) {
      this.pos.x *= border / d;
      this.pos.z *= border / d;
    }
    this.lockZones();

    if (this.game.zombies) {
      for (const z of this.game.zombies.list) {
        if (!z.alive) continue;
        const dx = this.pos.x - z.x;
        const dz = this.pos.z - z.z;
        const min = this.radius + z.radius;
        const dd = dx * dx + dz * dz;
        if (dd < min * min && dd > 0.0001) {
          const dist = Math.sqrt(dd);
          const push = (min - dist) * 0.6;
          this.pos.x += (dx / dist) * push;
          this.pos.z += (dz / dist) * push;
        }
      }
    }

    const boxes = this.game.buildings ? this.game.buildings.collisionBoxes() : [];
    const world = (this.game.world && this.game.world.blockers) || [];
    const settled = collideCircle(this.pos.x, this.pos.z, this.radius, boxes.concat(world), (b) => {
      if (b.prop) return true;
      return !!(b.building && b.building.blocks("player"));
    });
    this.pos.x = settled.x;
    this.pos.z = settled.z;

    this.invuln = Math.max(0, this.invuln - dt);
    let regen = mods.regen;
    regen += this.game.buildings ? this.game.buildings.healAura(this.pos.x, this.pos.z) : 0;
    if (regen > 0 && this.hp > 0 && this.downed <= 0) this.heal(regen * dt);

    this.swing = Math.max(0, this.swing - dt * 3.2);
    const moved = Math.hypot(this.pos.x - this._ox, this.pos.z - this._oz);
    if (moved > 0.004 && this.downed <= 0) {
      this.stride += Math.min(moved * 3.6, dt * 9);
      this.gait = Math.min(1, this.gait + dt * 8);
    } else {
      this.gait = Math.max(0, this.gait - dt * 6);
    }
    this._ox = this.pos.x;
    this._oz = this.pos.z;
    stepLimbs(this.mesh, this.stride, this.gait, this.swing);

    this.mesh.position.set(this.pos.x, this.pos.y, this.pos.z);
    this.mesh.rotation.y = this.yaw;
    if (this.downed <= 0) this.mesh.rotation.z = Math.sin(this.stride) * 0.07 * this.gait;
    this.mesh.position.y = this.pos.y + Math.abs(Math.sin(this.stride)) * 0.1 * this.gait;
    this.mesh.visible = this.invuln <= 0 || Math.sin(this.invuln * 28) > 0;
  }

  lockZones() {
    const tier = this.game.progression.tier;
    for (const zone of ZONES) {
      if (tier >= zone.minTier) continue;
      if (zone.minTier <= 0) continue;
      const inside =
        this.pos.x >= zone.x &&
        this.pos.x <= zone.x + zone.w &&
        this.pos.z >= zone.z &&
        this.pos.z <= zone.z + zone.h;
      if (!inside) continue;
      const left = this.pos.x - zone.x;
      const right = zone.x + zone.w - this.pos.x;
      const top = this.pos.z - zone.z;
      const bot = zone.z + zone.h - this.pos.z;
      const m = Math.min(left, right, top, bot);
      if (m === left) this.pos.x = zone.x - 0.4;
      else if (m === right) this.pos.x = zone.x + zone.w + 0.4;
      else if (m === top) this.pos.z = zone.z - 0.4;
      else this.pos.z = zone.z + zone.h + 0.4;
      if (this.zoneNote !== zone.id) {
        this.zoneNote = zone.id;
        const need = ["Starter Camp", "Wooden Fort", "Stone Fort", "Military Base", "Fortress", "High-Tech Bunker"][zone.minTier];
        this.game.notify(zone.name + " is locked until " + need + ".", "bad");
      }
      return;
    }
  }

  serialize() {
    return { hp: this.hp, x: this.pos.x, y: this.pos.y, z: this.pos.z, yaw: this.yaw, pitch: this.pitch };
  }

  hydrate(data) {
    if (!data) return;
    this.hp = data.hp ?? this.hp;
    this.pos.set(data.x ?? 0, data.y ?? 0, data.z ?? 4);
    this.yaw = data.yaw ?? 0;
    this.pitch = data.pitch ?? -0.28;
  }
}
