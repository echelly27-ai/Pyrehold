// A dropper throws gold onto the yard. Green pads spend that gold and
// raise the matching structure, the way a tycoon button builds a part.
import * as THREE from "three";
import { BUILDINGS } from "../config/buildings.js";
import { DROPPER, PADS, PAD_DWELL, cellCenter } from "../config/tycoon.js";
import { footprint } from "../core/util.js";

const NEON = 0x39ff6a;

function makeLabel(name, price) {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 256;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, 512, 256);
  ctx.fillStyle = "rgba(6, 28, 16, 0.82)";
  ctx.fillRect(24, 18, 464, 220);
  ctx.textAlign = "center";
  ctx.fillStyle = "#f3fff6";
  ctx.font = "800 58px Trebuchet MS, Verdana, sans-serif";
  ctx.fillText(name.toUpperCase(), 256, 100);
  ctx.fillStyle = "#b6ffc6";
  ctx.font = "800 78px Trebuchet MS, Verdana, sans-serif";
  ctx.fillText(price, 256, 196);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1.45, 0.72), material);
  mesh.renderOrder = 2;
  return mesh;
}

export class Tycoon {
  constructor(game) {
    this.game = game;
    this.pads = [];
    this.cash = [];
    this.bought = new Set();
    this.rises = [];
    this.dropTimer = DROPPER.first;
    this.coinGeo = new THREE.CylinderGeometry(0.28, 0.28, 0.08, 14);
    this.coinMat = new THREE.MeshStandardMaterial({
      color: 0xffc14a,
      emissive: 0xff9a1a,
      emissiveIntensity: 0.85,
      metalness: 0.55,
      roughness: 0.32,
    });
    this.padGeo = new THREE.BoxGeometry(1.42, 0.1, 1.42);
    this.rimGeo = new THREE.BoxGeometry(1.62, 0.05, 1.62);
    this.rimMat = new THREE.MeshBasicMaterial({ color: 0x0c3d22, toneMapped: false });
    this.buildDropper();
    for (const spec of PADS) this.addPad(spec);
  }

  buildDropper() {
    const spot = cellCenter(DROPPER.gx, DROPPER.gz);
    this.x = spot.x;
    this.z = spot.z;
    this.dirX = DROPPER.dirX;
    this.dirZ = DROPPER.dirZ;
    this.spillX = this.x + this.dirX * 1.75;
    this.spillZ = this.z + this.dirZ * 1.75;
    const group = new THREE.Group();
    const body = new THREE.MeshStandardMaterial({ color: 0x4a4038, roughness: 0.82, flatShading: true });
    const gold = new THREE.MeshStandardMaterial({
      color: 0xffc14a,
      emissive: 0xff9a1a,
      emissiveIntensity: 0.7,
      metalness: 0.4,
      roughness: 0.35,
      flatShading: true,
    });
    const neon = new THREE.MeshBasicMaterial({ color: 0xffe14a, toneMapped: false });
    const box = (w, h, d, material, x, y, z) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
      mesh.position.set(x, y, z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
      return mesh;
    };
    box(1.15, 0.72, 0.9, body, 0, 0.36, 0);
    box(0.72, 0.34, 0.72, body, 0, 0.86, 0);
    box(0.5, 0.2, 0.28, gold, 0.62, 0.7, 0);
    this.mouth = box(0.12, 0.3, 0.36, neon, 0.9, 0.7, 0);
    const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.16, 10), gold);
    drum.position.set(0, 1.12, 0);
    drum.castShadow = true;
    group.add(drum);
    group.rotation.y = Math.atan2(-this.dirZ, this.dirX);
    group.position.set(this.x, 0, this.z);
    this.game.scene.add(group);
    this.machine = group;
    this.sign = makeLabel("Dropper", "+" + DROPPER.amount + " each");
    this.sign.position.set(this.x, 1.85, this.z);
    this.game.scene.add(this.sign);
    const blockers = this.game.world && this.game.world.blockers;
    if (blockers) {
      const reach = 0.7;
      blockers.push({
        minX: this.x - 0.58 + Math.min(0, this.dirX * reach),
        maxX: this.x + 0.58 + Math.max(0, this.dirX * reach),
        minZ: this.z - 0.46 + Math.min(0, this.dirZ * reach),
        maxZ: this.z + 0.46 + Math.max(0, this.dirZ * reach),
        prop: true,
      });
    }
  }

  addPad(spec) {
    const spot = cellCenter(spec.padGx, spec.padGz);
    const topMat = new THREE.MeshBasicMaterial({ color: NEON, toneMapped: false });
    const root = new THREE.Group();
    const rim = new THREE.Mesh(this.rimGeo, this.rimMat);
    rim.position.y = 0.07;
    const top = new THREE.Mesh(this.padGeo, topMat);
    top.position.y = 0.13;
    root.add(rim, top);
    root.position.set(spot.x, 0, spot.z);
    this.game.scene.add(root);
    const label = makeLabel(spec.name, spec.price + " gold");
    label.position.set(spot.x, 1.65, spot.z);
    this.game.scene.add(label);
    this.pads.push({
      ...spec,
      x: spot.x,
      z: spot.z,
      root,
      topMat,
      label,
      dwell: 0,
      flash: 0,
      nag: 0,
    });
  }

  spotFree(pad) {
    const def = BUILDINGS[pad.building];
    if (!def) return false;
    return this.game.buildings.cellFree(footprint(def, pad.gx, pad.gz, pad.rot || 0));
  }

  update(dt) {
    this.pulse(dt);
    this.tickRises(dt);
    if (this.game.state !== "play") return;
    this.tickDropper(dt);
    this.tickCash(dt);
    this.tickPads(dt);
  }

  pulse(dt) {
    const cam = this.game.camera.position;
    const t = this.game.time;
    // Mesh lookAt aims the plane's front face at the camera. Keep the sign upright.
    this.sign.lookAt(cam.x, this.sign.position.y, cam.z);
    if (this.mouth) {
      const glow = 0.65 + Math.sin(t * 6) * 0.35;
      this.mouth.material.color.setRGB(glow, glow * 0.86, 0.15);
    }
    for (const pad of this.pads) {
      pad.label.lookAt(cam.x, pad.label.position.y, cam.z);
      pad.flash = Math.max(0, pad.flash - dt);
      const wave = 0.72 + Math.sin(t * 3 + pad.x) * 0.28;
      if (pad.flash > 0) pad.topMat.color.setRGB(1, 0.25, 0.22);
      else pad.topMat.color.setRGB(0.12 * wave, wave, 0.32 * wave);
      const s = 1 + Math.min(0.08, pad.dwell * 0.2);
      pad.root.scale.setScalar(s);
    }
  }

  tickDropper(dt) {
    this.dropTimer -= dt;
    if (this.dropTimer > 0) return;
    this.dropTimer = DROPPER.interval;
    if (this.cash.length >= DROPPER.maxLoose) return;
    this.spawnCash();
  }

  spawnCash() {
    const mesh = new THREE.Mesh(this.coinGeo, this.coinMat);
    const side = (Math.random() - 0.5) * 0.7;
    const speed = 2.35 + Math.random() * 0.35;
    const coin = {
      mesh,
      x: this.x + this.dirX * 0.85,
      y: 0.95,
      z: this.z + this.dirZ * 0.85,
      vx: this.dirX * speed - this.dirZ * side,
      vy: 2.6 + Math.random() * 0.4,
      vz: this.dirZ * speed + this.dirX * side,
      settled: false,
      age: 0,
      amount: DROPPER.amount,
    };
    mesh.position.set(coin.x, coin.y, coin.z);
    this.game.scene.add(mesh);
    this.cash.push(coin);
  }

  tickCash(dt) {
    const player = this.game.player;
    const playing = player.downed <= 0 && !this.game.panel;
    for (let i = this.cash.length - 1; i >= 0; i--) {
      const coin = this.cash[i];
      coin.age += dt;
      if (!coin.settled) {
        coin.vy -= 14 * dt;
        coin.x += coin.vx * dt;
        coin.y += coin.vy * dt;
        coin.z += coin.vz * dt;
        if (coin.y <= 0.16) {
          coin.y = 0.16;
          coin.vy = 0;
          coin.vx = 0;
          coin.vz = 0;
          coin.settled = true;
        }
      } else {
        coin.y = 0.16 + Math.sin(coin.age * 4) * 0.04;
      }
      coin.mesh.position.set(coin.x, coin.y, coin.z);
      coin.mesh.rotation.y += dt * 2.4;
      if (!playing || !coin.settled) continue;
      const dist = Math.hypot(player.pos.x - coin.x, player.pos.z - coin.z);
      if (dist > 1.15) continue;
      const gained = this.game.inventory.add("gold", coin.amount);
      if (gained <= 0) continue;
      this.game.audio.play("gold");
      this.game.fx.floatText(new THREE.Vector3(coin.x, 1.1, coin.z), "+" + gained, "#ffd56a", this.game.camera);
      this.game.scene.remove(coin.mesh);
      this.cash.splice(i, 1);
    }
  }

  tickPads(dt) {
    const player = this.game.player;
    if (player.downed > 0 || this.game.panel) {
      for (const pad of this.pads) pad.dwell = 0;
      return;
    }
    let target = null;
    for (const pad of this.pads) {
      const dist = Math.hypot(player.pos.x - pad.x, player.pos.z - pad.z);
      if (dist > 1.02) {
        pad.dwell = 0;
        continue;
      }
      pad.dwell += dt;
      if (pad.dwell >= PAD_DWELL && !target) target = pad;
    }
    if (target) this.game.commands.buyPad(target.id);
  }

  hint() {
    let best = null;
    let bestD = 2.7 * 2.7;
    const player = this.game.player;
    for (const pad of this.pads) {
      const d = (player.pos.x - pad.x) ** 2 + (player.pos.z - pad.z) ** 2;
      if (d < bestD) {
        best = pad;
        bestD = d;
      }
    }
    if (!best) return "";
    if (this.game.inventory.gold >= best.price && best.dwell > 0.05) return "Buying " + best.name + "...";
    if (this.game.inventory.gold >= best.price) return "Stand on the pad · " + best.name + " · " + best.price + " gold";
    return "Need " + best.price + " gold · " + best.name;
  }

  purchase(id) {
    const pad = this.pads.find((p) => p.id === id);
    if (!pad) return false;
    if (!this.spotFree(pad)) {
      this.game.notify(pad.name + " is already there", "good");
      this.removePad(pad);
      return false;
    }
    if (this.game.inventory.gold < pad.price) {
      pad.dwell = 0;
      pad.flash = 0.45;
      if (this.game.time >= pad.nag) {
        pad.nag = this.game.time + 1.8;
        this.game.notify("Need " + pad.price + " gold for " + pad.name, "bad");
        this.game.audio.play("error");
      }
      return false;
    }
    this.game.inventory.gold -= pad.price;
    const built = this.game.buildings.place(pad.building, pad.gx, pad.gz, pad.rot || 0, { free: true, silent: true });
    if (!built) {
      this.game.inventory.gold += pad.price;
      pad.dwell = 0;
      this.game.notify("Can't build " + pad.name, "bad");
      this.game.audio.play("error");
      return false;
    }
    built.mesh.scale.setScalar(0.12);
    this.rises.push({ mesh: built.mesh, t: 0 });
    this.game.stats.built[pad.building] = (this.game.stats.built[pad.building] || 0) + 1;
    this.game.progression.addXp(4);
    this.game.audio.play("build");
    this.game.notify(pad.name + " built", "good");
    this.game.fx.burst(built.mesh.position.clone().setY(0.6), NEON, 12, 3);
    this.removePad(pad);
    return true;
  }

  tickRises(dt) {
    for (let i = this.rises.length - 1; i >= 0; i--) {
      const rise = this.rises[i];
      rise.t += dt;
      const k = Math.min(1, rise.t / 0.28);
      const s = 0.12 + 0.88 * (1 - (1 - k) * (1 - k) * (1 - k));
      rise.mesh.scale.setScalar(s);
      if (k >= 1) this.rises.splice(i, 1);
    }
  }

  removePad(pad) {
    this.bought.add(pad.id);
    this.game.scene.remove(pad.root);
    this.game.scene.remove(pad.label);
    pad.topMat.dispose();
    pad.label.material.map.dispose();
    pad.label.material.dispose();
    pad.label.geometry.dispose();
    this.pads = this.pads.filter((p) => p !== pad);
  }

  serialize() {
    return { bought: [...this.bought] };
  }

  hydrate(data) {
    const ids = new Set((data && data.bought) || []);
    for (const pad of [...this.pads]) {
      if (ids.has(pad.id) || !this.spotFree(pad)) this.removePad(pad);
    }
  }
}
