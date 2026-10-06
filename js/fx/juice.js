// Hit sparks, tracers, floating combat text, and screen shake.
// Effects are pooled so a busy wave does not allocate every shot.
import * as THREE from "three";

export class Juice {
  constructor(scene) {
    this.scene = scene;
    this.shake = 0;
    this.flash = 0;
    this.parts = [];
    this.tracers = [];
    this.floaters = [];
    this.layer = document.createElement("div");
    this.layer.id = "floaters";
    document.body.appendChild(this.layer);
    this.muzzle = new THREE.PointLight(0xffc48a, 0, 6);
    scene.add(this.muzzle);
    this._geo = new THREE.BoxGeometry(0.12, 0.12, 0.12);
  }

  burst(pos, color, count = 8, speed = 4) {
    for (let i = 0; i < count; i++) {
      let mesh = this.parts.find((p) => !p.alive);
      if (!mesh) {
        if (this.parts.length > 80) return;
        mesh = {
          alive: false,
          mesh: new THREE.Mesh(
            this._geo,
            new THREE.MeshBasicMaterial({ color: 0xffffff })
          ),
          v: new THREE.Vector3(),
          life: 0,
        };
        this.scene.add(mesh.mesh);
        this.parts.push(mesh);
      }
      mesh.alive = true;
      mesh.life = 0.35 + Math.random() * 0.2;
      mesh.mesh.position.copy(pos);
      mesh.mesh.material.color.set(color);
      mesh.v.set(Math.random() - 0.5, Math.random() * 0.8, Math.random() - 0.5).multiplyScalar(speed);
      mesh.mesh.visible = true;
    }
  }

  tracer(from, to, color) {
    const dir = new THREE.Vector3().subVectors(to, from);
    const len = dir.length();
    if (len < 0.05) return;
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.08, 0.08, 1),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95 })
    );
    mesh.position.copy(from).addScaledVector(dir, 0.5);
    mesh.lookAt(to);
    mesh.scale.z = len;
    this.scene.add(mesh);
    this.tracers.push({ mesh, life: 0.22 });
  }

  muzzleFlash(pos) {
    this.muzzle.position.copy(pos);
    this.muzzle.intensity = 3.5;
  }

  floatText(world, text, color, camera) {
    const el = document.createElement("div");
    el.className = "floater";
    el.textContent = text;
    el.style.color = color;
    this.layer.appendChild(el);
    this.floaters.push({ el, world: world.clone(), life: 0.9, vy: 0.8 });
    if (this.floaters.length > 30) {
      const old = this.floaters.shift();
      old.el.remove();
    }
    // camera is unused until update; kept for call-site clarity
    void camera;
  }

  addShake(amount) {
    this.shake = Math.min(0.45, this.shake + amount);
  }

  update(dt, camera) {
    this.shake = Math.max(0, this.shake - dt * 0.8);
    this.muzzle.intensity = Math.max(0, this.muzzle.intensity - dt * 28);
    for (const p of this.parts) {
      if (!p.alive) continue;
      p.life -= dt;
      p.v.y -= dt * 8;
      p.mesh.position.addScaledVector(p.v, dt);
      if (p.life <= 0) {
        p.alive = false;
        p.mesh.visible = false;
      }
    }
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const t = this.tracers[i];
      t.life -= dt;
      t.mesh.material.opacity = Math.max(0, t.life * 10);
      if (t.life <= 0) {
        this.scene.remove(t.mesh);
        t.mesh.geometry.dispose();
        t.mesh.material.dispose();
        this.tracers.splice(i, 1);
      }
    }
    const proj = new THREE.Vector3();
    for (let i = this.floaters.length - 1; i >= 0; i--) {
      const f = this.floaters[i];
      f.life -= dt;
      f.world.y += f.vy * dt;
      proj.copy(f.world).project(camera);
      const x = (proj.x * 0.5 + 0.5) * window.innerWidth;
      const y = (-proj.y * 0.5 + 0.5) * window.innerHeight;
      f.el.style.transform = `translate(${x}px, ${y}px)`;
      f.el.style.opacity = String(Math.max(0, f.life));
      if (f.life <= 0 || proj.z > 1) {
        f.el.remove();
        this.floaters.splice(i, 1);
      }
    }
  }
}
