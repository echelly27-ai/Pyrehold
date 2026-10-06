// Random events keep a long preparation from turning into a checklist.
import * as THREE from "three";
import { EVENTS, rollEvent } from "../config/events.js";
import { mulberry32 } from "../core/util.js";

export class Events {
  constructor(game) {
    this.game = game;
    this.timer = 55;
    this.nextIn = 75;
    this.rng = mulberry32(77);
    this.log = [];
  }

  update(dt) {
    if (this.game.state !== "play") return;
    if (!this.game.tutorial.done) return;
    if (this.game.waves.phase === "wave") return;
    this.timer += dt;
    if (this.timer < this.nextIn) return;
    this.timer = 0;
    this.nextIn = 80 + this.rng() * 50;
    const ev = rollEvent(this.rng);
    this.fire(ev);
  }

  fire(ev) {
    this.log.unshift({ id: ev.id, name: ev.name, t: this.game.time });
    this.log = this.log.slice(0, 6);
    this.game.hud.announce(ev.name.toUpperCase(), ev.desc);
    this.game.audio.play(ev.id === "invasion" || ev.id === "blood" ? "boss" : "wave");
    if (ev.id === "horde") this.game.flags.horde = true;
    if (ev.id === "blood") this.game.flags.bloodMoon = true;
    if (ev.id === "rush") this.game.flags.rushUntil = this.game.time + 60;
    if (ev.id === "merchant") this.game.flags.merchantUntil = this.game.time + 90;
    if (ev.id === "supply") this.supply();
    if (ev.id === "convoy") this.convoy();
    if (ev.id === "invasion") this.invasion();
  }

  supply() {
    const ang = this.rng() * Math.PI * 2;
    const x = Math.cos(ang) * 16;
    const z = Math.sin(ang) * 16;
    const mesh = new THREE.Group();
    const box = new THREE.Mesh(
      new THREE.BoxGeometry(0.9, 0.6, 0.9),
      new THREE.MeshStandardMaterial({ color: 0xc47a3a, roughness: 0.6 })
    );
    box.position.y = 0.3;
    box.castShadow = true;
    mesh.add(box);
    mesh.position.set(x, 0, z);
    this.game.resources.spawnDrop({
      kind: "crate",
      x,
      z,
      amount: 1,
      mesh,
      label: "Open supply drop",
      rarity: "epic",
      bonus: { gold: 180, parts: 3, metal: 0, ammo: "rifle", rounds: 40 },
    });
    // metal is granted by a second tiny pile so the crate bonus stays simple
    this.game.inventory.add("metal", 6);
    this.game.notify("A supply crate landed outside the ring", "good");
  }

  convoy() {
    for (let i = 0; i < 4; i++) {
      this.game.zombies.spawn("armored", -6 + i * 3.2, 22, {
        wild: true,
        aggro: true,
        homeX: -6 + i * 3.2,
        homeZ: 22,
        lootBonus: true,
        force: true,
      });
    }
    this.game.notify("A dead convoy is marching up the south road", "bad");
  }

  invasion() {
    const options = ["brute", "necromancer", "abomination"];
    const type = options[Math.floor(this.rng() * options.length)];
    const lane = this.game.waves.lanes[0];
    const x = lane ? lane.x * 30 : 0;
    const z = lane ? lane.z * 30 : -30;
    this.game.zombies.spawn(type, x, z, { invasion: true, force: true, waveNumber: Math.max(10, this.game.waves.number) });
    this.game.flags.forceNight = true;
  }
}

export { EVENTS };
