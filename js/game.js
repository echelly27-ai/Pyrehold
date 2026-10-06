// Pyrehold simulation root.
// Systems talk through this object instead of importing each other, so a later
// network layer can sit on js/net/commands.js without rewriting the raid.
import * as THREE from "three";
import { Input } from "./core/input.js";
import { AudioBus } from "./core/audio.js";
import { readSave, writeSave, hasSave, clearSave } from "./core/save.js";
import { MARKET, AMMO_PACKS } from "./config/balance.js";
import { BUILDINGS, BUILD_CATS, buildingsInCat } from "./config/buildings.js";
import { Inventory } from "./systems/inventory.js";
import { Progression } from "./systems/progression.js";
import { Armory } from "./systems/armory.js";
import { Player } from "./systems/player.js";
import { Resources } from "./systems/resources.js";
import { BuildingSystem } from "./systems/buildings.js?v=6";
import { Combat } from "./systems/combat.js";
import { Zombies } from "./systems/zombies.js";
import { Waves } from "./systems/waves.js";
import { Quests } from "./systems/quests.js";
import { Events } from "./systems/events.js";
import { Loot } from "./systems/loot.js";
import { DayNight } from "./systems/daynight.js";
import { Tutorial } from "./systems/tutorial.js";
import { Tycoon } from "./systems/tycoon.js";
import { Weaponry } from "./systems/weaponry.js";
import { createCommands } from "./net/commands.js";
import { HUD } from "./ui/hud.js";
import { Juice } from "./fx/juice.js";
import { buildWorld } from "./world/map.js";

function defaultStats() {
  return {
    wood: 0,
    stone: 0,
    metal: 0,
    goldEarned: 0,
    kills: 0,
    killsByType: {},
    bosses: 0,
    wavesCleared: 0,
    built: {},
  };
}

function defaultFlags() {
  return { merchantUntil: 0, rushUntil: 0, blood: false, bloodMoon: false, horde: false, forceNight: false };
}

export class Game {
  constructor() {
    this.canvas = document.createElement("canvas");
    this.canvas.id = "view";
    document.body.prepend(this.canvas);
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: false, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 220);
    this.clock = new THREE.Clock();
    this.time = 0;
    this.state = "title";
    this.panel = null;
    this.buildMode = false;
    this.buildRot = 0;
    this.snapCam = true;
    this._cam = new THREE.Vector3(12, 8, 14);
    this.saveTimer = 0;
    this._lastNote = "";
    this._lastNoteAt = 0;
    this.stats = defaultStats();
    this.flags = defaultFlags();
    this.audio = new AudioBus();
    this.fx = new Juice(this.scene);
    this.world = buildWorld(this.scene);
    this.raycastables = [...this.world.cover];
    this.input = new Input(this.canvas);
    this.inventory = new Inventory(this);
    this.progression = new Progression(this);
    this.armory = new Armory(this);
    this.player = new Player(this);
    this.buildings = new BuildingSystem(this);
    this.tycoon = new Tycoon(this);
    this.weaponry = new Weaponry(this);
    this.resources = new Resources(this);
    this.loot = new Loot(this);
    this.combat = new Combat(this);
    this.zombies = new Zombies(this);
    this.waves = new Waves(this);
    this.events = new Events(this);
    this.dayNight = new DayNight(this);
    this.tutorial = new Tutorial(this);
    this.quests = new Quests(this);
    this.commands = createCommands(this);
    this.hud = new HUD(this);
    this.hud.setContinue(hasSave());
    window.addEventListener("resize", () => this.resize());
    window.addEventListener("pointerdown", () => this.audio.ensure(), { once: false });
    window.addEventListener("beforeunload", () => {
      if (this.state === "play" && this.waves.phase !== "wave") writeSave(this.capture());
    });
    document.body.dataset.ready = "1";
  }

  resize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  start() {
    this.renderer.setAnimationLoop(() => this.frame());
  }

  frame() {
    const dt = Math.min(0.05, this.clock.getDelta());
    this.time += dt;
    try {
      this.tick(dt);
    } catch (err) {
      console.error(err);
      this.renderer.setAnimationLoop(null);
      const pre = document.createElement("pre");
      pre.style.cssText = "position:fixed;inset:12px;z-index:9;color:#fff;background:#201510ee;padding:16px;overflow:auto";
      pre.textContent = String(err && err.stack ? err.stack : err);
      document.body.appendChild(pre);
    } finally {
      this.input.endFrame();
    }
  }

  tick(dt) {
    if (this.state === "title") {
      this.updateCamera(dt);
      this.dayNight.update(dt);
      this.buildings.animate(dt);
      this.tycoon.update(dt);
      this.weaponry.update(dt);
      this.fx.update(dt, this.camera);
      this.renderer.render(this.scene, this.camera);
      return;
    }
    if (this.state === "play") this.armory.tick(dt);
    this.handleInput();
    if (this.state === "paused" || this.state === "over") {
      this.hud.update(dt);
      this.renderer.render(this.scene, this.camera);
      return;
    }
    this.dayNight.update(dt);
    this.player.update(dt);
    this.resources.update(dt);
    this.buildings.update(dt);
    this.tycoon.update(dt);
    this.weaponry.update(dt);
    this.zombies.update(dt);
    this.combat.update(dt);
    this.loot.update(dt);
    this.waves.update(dt);
    this.events.update(dt);
    this.tutorial.update(dt);
    this.quests.update(dt);
    this.updateCamera(dt);
    this.fx.update(dt, this.camera);
    this.autosave(dt);
    this.hud.update(dt);
    this.renderer.render(this.scene, this.camera);
  }

  handleInput() {
    const input = this.input;
    if (this.state === "over") return;
    input.capture = this.state === "play" && !this.panel;
    if (input.edge("escape")) {
      if (this.buildMode) {
        this.buildMode = false;
        this.audio.play("ui");
        if (input.locked) input.release();
        return;
      }
      if (input.locked) {
        input.release();
        return;
      }
      if (this.panel) this.closePanel();
      else this.togglePanel("pause");
      return;
    }
    if (this.panel === "pause") return;
    if (input.edge("b")) this.toggleBuild();
    if (input.edge("g")) this.togglePanel("trade");
    if (input.edge("j")) this.togglePanel("quests");
    if (input.edge("k")) this.togglePanel("skills");
    if (input.edge("u")) this.togglePanel("upgrade");
    if (input.edge("t")) this.commands.callWave();
    if (input.edge("r")) {
      if (this.buildMode) this.buildRot = (this.buildRot + 1) % 4;
      else this.armory.startReload();
    }
    if (input.edge("q") && this.buildMode) {
      const i = BUILD_CATS.findIndex((c) => c.id === this.buildings.cat);
      this.buildings.cat = BUILD_CATS[(i + 1) % BUILD_CATS.length].id;
      this.hud.buildSig = "";
    }
    if (input.edge("x") && this.buildMode) this.commands.demolish();
    if (input.edge("y")) this.commands.upgradeLooked();
    if (input.edge("e") && !this.buildMode && !this.resources.nearest()) {
      if (this.weaponry && this.weaponry.nearby()) this.togglePanel("weaponry");
      else {
        const gate = this.buildings.lookedAt(6);
        if (gate && gate.def.gate) this.commands.toggleGate(gate);
      }
    }
    const digit = input.digitEdge();
    if (digit && !this.panel) {
      if (this.buildMode) {
        const list = buildingsInCat(this.buildings.cat);
        if (list[digit - 1]) this.buildings.select(list[digit - 1].id);
      } else if (digit <= 4) this.armory.equipNth(digit);
    }
    if (input.wheel && !this.panel) {
      if (this.buildMode) this.buildRot = (this.buildRot + (input.wheel > 0 ? 1 : 3)) % 4;
      else this.armory.cycle(input.wheel > 0 ? 1 : -1);
    }
    if (this.panel || this.player.downed > 0) return;
    const weapon = this.armory.stats();
    if (this.buildMode) {
      if (input.primaryPressed) this.commands.place();
    } else if (weapon) {
      const held = input.primary || input.secondary;
      const tapped = input.primaryPressed || input.secondaryPressed;
      if (weapon.fullAuto ? held : tapped) this.combat.firePlayer();
    }
  }

  toggleBuild() {
    if (this.panel) return;
    this.buildMode = !this.buildMode;
    this.audio.play("ui");
  }

  togglePanel(name) {
    if (this.state === "title") return;
    if (this.input.locked) this.input.release();
    if (this.panel === name) {
      this.closePanel();
      return;
    }
    this.panel = name;
    this.buildMode = false;
    if (name === "pause") this.state = "paused";
    else if (this.state === "paused") this.state = "play";
    if (name === "upgrade") this.tutorial.sawUpgrade = true;
    this.audio.play("ui");
    this.hud.panelSig = "";
  }

  closePanel() {
    const wasPause = this.panel === "pause";
    this.panel = null;
    if (wasPause) this.state = "play";
    this.hud.panelSig = "";
  }

  startNew() {
    clearSave();
    this.hud.hideTitle();
    this.state = "play";
    this.snapCam = true;
    this.audio.ensure();
    if (!this.tutorial.done) {
      this.zombies.spawn("normal", 12, 16, { wild: true, hp: 36, homeX: 12, homeZ: 16, aggro: false });
    }
  }

  continueGame() {
    const data = readSave();
    if (!data) {
      this.startNew();
      return;
    }
    this.load(data);
    this.hud.hideTitle();
    this.state = "play";
    this.snapCam = true;
    this.audio.ensure();
  }

  gameOver() {
    if (this.state === "over" || this.state === "title") return;
    this.state = "over";
    this.buildMode = false;
    this.panel = null;
    this.input.release();
    this.fx.floaters.forEach((f) => f.el.remove());
    this.fx.floaters.length = 0;
    this.hud.showGameOver();
    this.audio.play("explode");
    this.fx.addShake(0.4);
  }

  retryAfterLoss() {
    this.hud.hideGameOver();
    this.zombies.clearAll();
    for (const p of this.combat.projectiles) this.scene.remove(p.mesh);
    this.combat.projectiles.length = 0;
    this.panel = null;
    this.buildMode = false;
    const data = readSave();
    if (!data) {
      clearSave();
      location.reload();
      return;
    }
    this.load(data);
    this.flags.blood = false;
    this.flags.bloodMoon = false;
    this.flags.forceNight = false;
    this.player.downed = 0;
    this.player.hp = this.player.maxHp;
    this.dayNight.factor = 0;
    this.dayNight.update(0);
    this.hud.hideTitle();
    this.state = "play";
    this.snapCam = true;
  }

  quitToTitle() {
    if (this.state !== "over" && this.waves.phase !== "wave") writeSave(this.capture());
    location.reload();
  }

  notify(text, kind) {
    const now = performance.now();
    if (text === this._lastNote && now - this._lastNoteAt < 1100) return;
    this._lastNote = text;
    this._lastNoteAt = now;
    if (this.hud) this.hud.toast(text, kind);
  }

  prompt() {
    if (this.state !== "play") return "";
    if (this.player.downed > 0) return "The pyre is pulling you back...";
    if (this.buildMode) {
      const h = this.buildings.hover;
      const def = BUILDINGS[this.buildings.selected];
      if (!def) return "";
      const cost = h ? this.buildings.costText(h.cost) : "";
      const why = h && !h.ok ? h.reason : "Left click to place";
      return def.name + "   " + cost + "   ·   " + why + "   ·   R rotate   X salvage";
    }
    const padHint = this.tycoon ? this.tycoon.hint() : "";
    const shopHint = this.weaponry ? this.weaponry.hint() : "";
    const node = this.resources.nearest();
    if (node && this.resources.hold > 0) return "Gathering " + node.label + "  " + Math.floor(this.resources.hold * 100) + "%";
    if (node) return "Hold E  ·  " + node.label;
    if (this.weaponry && this.weaponry.onMat()) return shopHint;
    if (padHint) return padHint;
    if (shopHint) return shopHint;
    const b = this.buildings.lookedAt(7);
    if (!this.input.locked) return "Click the view to look with the mouse. WASD walks. The opening is ahead.";
    if (!b) return "The dead come for the pyre.";
    if (b.def.gate) return "E  ·  " + (b.open ? "Close " : "Open ") + b.def.name;
    if (b.hp < b.maxHp - 1) return "Hold F  ·  Repair " + b.def.name + "  " + Math.ceil(b.hp) + "/" + b.maxHp;
    if (b.def.upgradeable) return "Y  ·  Upgrade " + b.def.name + " to level " + ((b.level || 1) + 1);
    if (b.def.core) return "U  ·  Upgrade " + this.progression.tierDef().name;
    if (b.def.storage) return "U  ·  Expand storage";
    if (b.def.powerUse && !b.powered) return b.def.name + " has no power. Build a generator.";
    return b.def.name;
  }

  marketSellMul() {
    let m = 1;
    if (this.buildings.hasTag("workshop")) m += MARKET.workshopSellBonus;
    if (this.time < (this.flags.merchantUntil || 0)) m += 0.3;
    return m;
  }

  marketSell(res) {
    return (MARKET.sell[res] || 0) * this.marketSellMul();
  }

  marketBuyMul() {
    return this.time < (this.flags.merchantUntil || 0) ? 0.7 : 1;
  }

  marketBuy(res) {
    return (MARKET.buy[res] || 0) * this.marketBuyMul();
  }

  ammoPack(type) {
    return AMMO_PACKS[type];
  }

  updateCamera(dt) {
    const p = this.player;
    if (this.state === "title") {
      const ang = this.time * 0.17;
      this.camera.position.set(Math.sin(ang) * 18, 8.5, Math.cos(ang) * 18);
      this.camera.lookAt(0, 1.5, 0);
      return;
    }
    p.faceVectors();
    const dist = 5.8;
    const look = new THREE.Vector3(p.pos.x, p.pos.y + 1.4, p.pos.z);
    const cp = Math.cos(p.pitch);
    const camDir = new THREE.Vector3(-Math.sin(p.yaw) * cp, Math.sin(p.pitch), -Math.cos(p.yaw) * cp);
    const desired = look.clone().addScaledVector(camDir, -dist);
    desired.addScaledVector(p.flatRight, 1.45);
    desired.y = Math.max(1.1, desired.y + 0.4);
    const ray = new THREE.Raycaster(look, desired.clone().sub(look).normalize(), 0, dist);
    const hits = ray.intersectObjects(this.raycastables, true);
    for (const hit of hits) {
      let o = hit.object;
      let block = false;
      while (o) {
        if (o.userData && (o.userData.bid != null || o.userData.cover)) block = true;
        o = o.parent;
      }
      if (block && hit.distance < dist - 0.4) {
        desired.copy(look).addScaledVector(camDir, -Math.max(1.6, hit.distance - 0.35));
        break;
      }
    }
    if (this.snapCam) {
      this._cam.copy(desired);
      this.snapCam = false;
    } else {
      const t = 1 - Math.pow(0.0008, dt);
      this._cam.lerp(desired, t);
    }
    const shake = this.fx.shake;
    this.camera.position.copy(this._cam);
    if (shake > 0) {
      this.camera.position.x += (Math.random() - 0.5) * shake;
      this.camera.position.y += (Math.random() - 0.5) * shake * 0.6;
    }
    this.camera.lookAt(look.clone().addScaledVector(camDir, 7.5));
  }

  autosave(dt) {
    if (this.waves.phase === "wave") return;
    this.saveTimer += dt;
    if (this.saveTimer < 20) return;
    this.saveTimer = 0;
    writeSave(this.capture());
  }

  save(toast) {
    if (this.waves.phase === "wave") {
      this.notify("Can't save during a raid", "bad");
      return false;
    }
    writeSave(this.capture());
    if (toast) this.notify("Progress saved", "good");
    return true;
  }

  capture() {
    return {
      inventory: this.inventory.serialize(),
      progression: this.progression.serialize(),
      armory: this.armory.serialize(),
      buildings: this.buildings.serialize(),
      resources: this.resources.serialize(),
      quests: this.quests.serialize(),
      tutorial: this.tutorial.serialize(),
      waves: this.waves.serialize(),
      player: this.player.serialize(),
      tycoon: this.tycoon.serialize(),
      stats: this.stats,
      flags: this.flags,
    };
  }

  load(data) {
    this.stats = Object.assign(defaultStats(), data.stats || {});
    this.stats.killsByType = this.stats.killsByType || {};
    this.stats.built = this.stats.built || {};
    this.flags = Object.assign(defaultFlags(), data.flags || {});
    this.inventory.hydrate(data.inventory);
    this.progression.hydrate(data.progression);
    this.player.hydrate(data.player);
    this.player.maxHp = this.progression.mods().maxHp;
    this.buildings.hydrate(data.buildings);
    this.buildings.recomputeAll();
    this.armory.hydrate(data.armory);
    this.resources.hydrate(data.resources);
    this.quests.hydrate(data.quests);
    this.tutorial.hydrate(data.tutorial);
    this.waves.hydrate(data.waves);
    this.tycoon.hydrate(data.tycoon);
    this.player.attachWeapon(this.armory.equipped);
  }
}
