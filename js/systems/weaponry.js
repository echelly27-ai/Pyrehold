// A stall in the yard. Stand on the mat or press E to buy guns
// with wood, stone, and gold.
import * as THREE from "three";
import { CELL } from "../core/util.js";

const AMBER = 0xff9a2a;

function makeSign(title, sub) {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 256;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, 512, 256);
  ctx.fillStyle = "rgba(36, 18, 6, 0.88)";
  ctx.fillRect(24, 18, 464, 220);
  ctx.textAlign = "center";
  ctx.fillStyle = "#fff4e4";
  ctx.font = "800 72px Trebuchet MS, Verdana, sans-serif";
  ctx.fillText(title, 256, 108);
  ctx.fillStyle = "#ffc56a";
  ctx.font = "700 42px Trebuchet MS, Verdana, sans-serif";
  ctx.fillText(sub, 256, 186);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 0.85), material);
  mesh.renderOrder = 2;
  return mesh;
}

export class Weaponry {
  constructor(game) {
    this.game = game;
    // East of the hearth, clear of the green build pads.
    this.x = (1 + 0.5) * CELL;
    this.z = (0 + 0.5) * CELL;
    this.matX = this.x;
    this.matZ = this.z - CELL;
    this.dwell = 0;
    this.latched = false;
    this.buildStall();
  }

  buildStall() {
    const group = new THREE.Group();
    const wood = new THREE.MeshStandardMaterial({ color: 0x6a4630, roughness: 0.84, flatShading: true });
    const dark = new THREE.MeshStandardMaterial({ color: 0x2a211c, roughness: 0.7, metalness: 0.2, flatShading: true });
    const amber = new THREE.MeshBasicMaterial({ color: AMBER, toneMapped: false });
    const box = (w, h, d, material, x, y, z) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
      mesh.position.set(x, y, z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
      return mesh;
    };
    box(1.35, 0.92, 0.62, wood, 0, 0.46, 0);
    box(1.42, 0.08, 0.7, amber, 0, 0.94, 0);
    box(1.4, 1.15, 0.12, wood, 0, 1.35, 0.32);
    box(0.08, 0.1, 0.72, dark, -0.28, 1.15, 0.18);
    box(0.08, 0.1, 0.55, dark, 0.05, 1.28, 0.2);
    box(0.1, 0.16, 0.42, dark, 0.38, 1.05, 0.16);
    this.trim = box(1.2, 0.08, 0.08, amber, 0, 0.7, -0.32);
    group.position.set(this.x, 0, this.z);
    this.game.scene.add(group);
    this.sign = makeSign("WEAPONRY", "WOOD · STONE · GOLD");
    this.sign.position.set(this.x, 2.35, this.z);
    this.game.scene.add(this.sign);
    this.matMat = new THREE.MeshBasicMaterial({ color: AMBER, toneMapped: false });
    const mat = new THREE.Mesh(new THREE.BoxGeometry(1.35, 0.08, 1.35), this.matMat);
    mat.position.set(this.matX, 0.08, this.matZ);
    this.game.scene.add(mat);
    const blockers = this.game.world && this.game.world.blockers;
    if (blockers) {
      blockers.push({
        minX: this.x - 0.7,
        maxX: this.x + 0.7,
        minZ: this.z - 0.36,
        maxZ: this.z + 0.42,
        prop: true,
      });
    }
  }

  onMat() {
    const p = this.game.player;
    return Math.hypot(p.pos.x - this.matX, p.pos.z - this.matZ) < 1.05;
  }

  nearby() {
    const p = this.game.player;
    const stall = Math.hypot(p.pos.x - this.x, p.pos.z - this.z);
    const mat = Math.hypot(p.pos.x - this.matX, p.pos.z - this.matZ);
    return Math.min(stall, mat) < 2.15;
  }

  hint() {
    if (!this.nearby()) return "";
    return "E · Weaponry · guns cost wood, stone, and gold";
  }

  update(dt) {
    const cam = this.game.camera.position;
    this.sign.lookAt(cam.x, this.sign.position.y, cam.z);
    const wave = 0.72 + Math.sin(this.game.time * 3) * 0.28;
    if (this.trim) this.trim.material.color.setRGB(wave, wave * 0.62, 0.12);
    if (this.matMat) this.matMat.color.setRGB(wave, wave * 0.58, 0.1);
    if (this.game.state !== "play" || this.game.player.downed > 0) return;
    if (!this.onMat() || this.game.panel) {
      if (!this.onMat()) {
        this.dwell = 0;
        this.latched = false;
      }
      return;
    }
    this.dwell += dt;
    if (this.dwell < 0.28 || this.latched) return;
    this.latched = true;
    this.game.togglePanel("weaponry");
  }
}
