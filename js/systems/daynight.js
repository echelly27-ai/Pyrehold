// Lighting follows the raid clock. Preparation is daylight.
// A wave, a blood moon, or a boss invasion pulls the sky down.
import * as THREE from "three";

export class DayNight {
  constructor(game) {
    this.game = game;
    this.factor = 0;
    const scene = game.scene;
    scene.background = new THREE.Color(0x9ec8c6);
    scene.fog = new THREE.Fog(0xb7d0c8, 36, 150);
    this.hemi = new THREE.HemisphereLight(0xfff1d2, 0x6a7a4a, 0.9);
    scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xfff2d8, 1.25);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(512, 512);
    this.sun.shadow.bias = -0.001;
    this.sun.shadow.camera.near = 1;
    this.sun.shadow.camera.far = 80;
    const s = 28;
    this.sun.shadow.camera.left = -s;
    this.sun.shadow.camera.right = s;
    this.sun.shadow.camera.top = s;
    this.sun.shadow.camera.bottom = -s;
    scene.add(this.sun);
    scene.add(this.sun.target);
    this.moon = new THREE.DirectionalLight(0x9bb4ff, 0);
    scene.add(this.moon);
    scene.add(this.moon.target);
    this.fill = new THREE.PointLight(0xff7a32, 1.6, 16, 2);
    this.fill.position.set(0, 2.2, 0);
    scene.add(this.fill);
    this.moonMesh = new THREE.Mesh(
      new THREE.SphereGeometry(3.2, 16, 12),
      new THREE.MeshBasicMaterial({ color: 0xf4efe4 })
    );
    scene.add(this.moonMesh);
  }

  targetFactor() {
    if (this.game.flags.forceNight) return 1;
    if (this.game.flags.blood && this.game.waves && this.game.waves.phase === "wave") return 1;
    const phase = this.game.waves ? this.game.waves.phase : "wait";
    if (phase === "wave") return 1;
    if (phase === "prep" && this.game.waves.timer < 8) return 0.45;
    if (phase === "dawn") return 0.25;
    return 0;
  }

  update(dt) {
    const target = this.targetFactor();
    this.factor += (target - this.factor) * Math.min(1, dt * 0.45);
    const n = this.factor;
    const blood = this.game.flags.blood && n > 0.4;
    const dayC = new THREE.Color(blood ? 0x6a3038 : 0x9ec8c6);
    const nightC = new THREE.Color(blood ? 0x2a1018 : 0x141820);
    this.game.scene.background.copy(dayC).lerp(nightC, n);
    const fogDay = new THREE.Color(blood ? 0x5a3030 : 0xb7d0c8);
    const fogNight = new THREE.Color(blood ? 0x1a0c10 : 0x1a2030);
    this.game.scene.fog.color.copy(fogDay).lerp(fogNight, n);
    this.game.scene.fog.near = 36 - n * 18;
    this.game.scene.fog.far = 150 - n * 55;
    this.hemi.intensity = 0.9 - n * 0.55;
    this.hemi.color.set(blood ? 0xffb0b0 : 0xfff1d2);
    this.sun.intensity = 1.25 - n * 1.15;
    this.moon.intensity = n * 0.45;
    this.fill.intensity = 1.4 + n * 1.3 + Math.sin(this.game.time * 6) * 0.15;
    const p = this.game.player.pos;
    this.sun.position.set(p.x + 18, 28, p.z + 10);
    this.sun.target.position.set(p.x, 0, p.z);
    this.moon.position.set(p.x - 16, 22, p.z - 12);
    this.moon.target.position.copy(p);
    this.moonMesh.position.set(p.x - 40, 28 + n * 6, p.z - 30);
    this.moonMesh.visible = n > 0.15;
    if (this.game.world.stars) this.game.world.stars.material.opacity = n * 0.85;
    const mood = blood ? "blood" : n > 0.6 ? "night" : "day";
    if (this.game.audio.mood !== mood) this.game.audio.setMood(mood);
    void dt;
  }
}
