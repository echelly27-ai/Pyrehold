// Grid base. Placement, power, turrets, repairs, and the pyre hearth all
// live here so combat can ask "what is blocking this zombie?" without
// knowing how walls are built.
import { BUILDINGS, buildingsInCat, scaledCost, repairCostOf } from "../config/buildings.js";
import { TIERS, plotOf } from "../config/balance.js";
import {
  CELL,
  cellKey,
  worldToCell,
  footprint,
  footprintCenter,
  aabbFromFootprint,
  dist2,
} from "../core/util.js";
import { makeBuildingMesh, tintGhost } from "../world/props.js";

let NEXT_ID = 1;

function blocksKind(building, kind) {
  if (!building || building.destroyed || building.hp <= 0 || building.open) return false;
  if (kind === "player") return !!building.def.blocksPlayer;
  if (kind === "crawler") return !!building.def.blocksCrawlers;
  return !!building.def.blocksZombies;
}

export class BuildingSystem {
  constructor(game) {
    this.game = game;
    this.list = [];
    this.byId = new Map();
    this.occupancy = new Map();
    this.solid = new Map();
    this.core = null;
    this.boxes = [];
    this.dirty = true;
    this.selected = "wood_wall";
    this.hover = null;
    this.ghost = null;
    this.repairCarry = 0;
    this.cat = "basic";
    this.spawnStarter();
    this.resizePlot();
  }

  hasTag(tag) {
    return this.list.some((b) => b.def[tag] && !b.destroyed && b.hp > 0);
  }

  collisionBoxes() {
    if (this.dirty) this.rebuildBoxes();
    return this.boxes;
  }

  rebuildBoxes() {
    this.boxes = [];
    for (const b of this.list) {
      if (b.destroyed || b.hp <= 0) continue;
      if (!b.def.blocksPlayer && !b.def.blocksZombies && !b.def.blocksCrawlers) continue;
      const box = aabbFromFootprint(b.def, b.gx, b.gz, b.rot, 0.05);
      box.building = b;
      this.boxes.push(box);
    }
    this.dirty = false;
  }

  resizePlot() {
    const p = plotOf(this.game.progression.tier);
    const w = (p.maxX - p.minX + 1) * CELL;
    const d = (p.maxZ - p.minZ + 1) * CELL;
    const plot = this.game.world.plot;
    plot.scale.set(w, d, 1);
    const cx = ((p.minX + p.maxX + 1) / 2) * CELL;
    const cz = ((p.minZ + p.maxZ + 1) / 2) * CELL;
    plot.position.set(cx, 0.03, cz);
  }

  zombieInPyre(x, z) {
    const core = this.core;
    if (!core || core.destroyed || core.hp <= 0) return false;
    const cell = worldToCell(x, z);
    return core.cells.some(([gx, gz]) => gx === cell.gx && gz === cell.gz);
  }

  coreMaxHp() {
    const tier = TIERS[this.game.progression.tier] || TIERS[0];
    const bunker = this.hasTag("bunker") ? 1.5 : 1;
    const mods = this.game.progression.mods().buildHp;
    return Math.round(tier.coreHp * bunker * mods);
  }

  recompute(b, keepRatio) {
    const ratio = b.maxHp > 0 ? b.hp / b.maxHp : 1;
    if (b.def.core) b.maxHp = this.coreMaxHp();
    else {
      const lvl = 1 + 0.35 * ((b.level || 1) - 1);
      b.maxHp = Math.round(b.def.hp * lvl * this.game.progression.mods().buildHp);
    }
    b.hp = keepRatio ? Math.min(b.maxHp, Math.max(1, b.maxHp * ratio)) : b.maxHp;
  }

  recomputeAll() {
    for (const b of this.list) if (!b.destroyed) this.recompute(b, true);
  }

  onTierChanged() {
    if (this.core) this.recompute(this.core, true);
    this.resizePlot();
  }

  spawnStarter() {
    for (let gx = -4; gx <= 4; gx++) {
      this.place("wood_wall", gx, -4, 0, { free: true, silent: true });
      if (gx !== -1 && gx !== 0 && gx !== 1) this.place("wood_wall", gx, 4, 0, { free: true, silent: true });
    }
    const gate = this.place("wood_gate", 1, 4, 0, { free: true, silent: true });
    if (gate) {
      gate.open = true;
      const leaf = gate.mesh.getObjectByName("gateLeaf");
      if (leaf) leaf.rotation.y = 1.15;
      this.refreshSolids(gate);
    }
    for (let gz = -3; gz <= 3; gz++) {
      this.place("wood_wall", -4, gz, 0, { free: true, silent: true });
      this.place("wood_wall", 4, gz, 0, { free: true, silent: true });
    }
    this.place("hearth", -1, -1, 0, { free: true, silent: true });
    this.place("campfire", 2, -2, 0, { free: true, silent: true });
    this.place("storage_small", -3, 2, 0, { free: true, silent: true });
  }

  select(id) {
    if (!BUILDINGS[id] || BUILDINGS[id].hidden) return;
    this.selected = id;
  }

  cellFree(cells, ignoreId) {
    for (const [x, z] of cells) {
      const occ = this.occupancy.get(cellKey(x, z));
      if (occ && occ.id !== ignoreId) return false;
    }
    return true;
  }

  inPlot(cells) {
    const plot = plotOf(this.game.progression.tier);
    for (const [x, z] of cells) {
      if (x < plot.minX || x > plot.maxX || z < plot.minZ || z > plot.maxZ) return false;
    }
    return true;
  }

  playerBlocks(cells) {
    const p = worldToCell(this.game.player.pos.x, this.game.player.pos.z);
    return cells.some(([x, z]) => x === p.gx && z === p.gz);
  }

  evaluate(id, gx, gz, rot) {
    const def = BUILDINGS[id];
    if (!def) return { ok: false, reason: "Unknown" };
    const cells = footprint(def, gx, gz, rot);
    if (def.tier > this.game.progression.tier) return { ok: false, reason: "Locked by base tier", cells };
    if (def.unique && this.list.some((b) => b.type === id && !b.destroyed)) {
      return { ok: false, reason: "Already built", cells };
    }
    if (!this.inPlot(cells)) return { ok: false, reason: "Outside your plot", cells };
    if (!this.cellFree(cells)) return { ok: false, reason: "Blocked", cells };
    if (this.playerBlocks(cells)) return { ok: false, reason: "You're standing there", cells };
    const cost = scaledCost(def.cost, this.game.progression.mods().buildCost);
    if (!this.game.inventory.canAfford(cost)) return { ok: false, reason: "Can't afford", cells, cost };
    return { ok: true, cells, cost };
  }

  place(id, gx, gz, rot, opts = {}) {
    const def = BUILDINGS[id];
    if (!def) return null;
    const cells = footprint(def, gx, gz, rot);
    if (!opts.free) {
      const check = this.evaluate(id, gx, gz, rot);
      if (!check.ok) {
        if (!opts.silent) {
          this.game.notify(check.reason, "bad");
          this.game.audio.play("error");
        }
        return null;
      }
      this.game.inventory.spend(check.cost);
    }
    const center = footprintCenter(def, gx, gz, rot);
    const mesh = makeBuildingMesh(def);
    mesh.position.set(center.x, 0, center.z);
    mesh.rotation.y = rot * (Math.PI / 2);
    const building = {
      id: NEXT_ID++,
      type: id,
      def,
      gx,
      gz,
      rot,
      level: opts.level || 1,
      hp: def.hp,
      maxHp: def.hp,
      mesh,
      open: false,
      powered: !def.powerUse,
      cooldown: 0,
      genTimer: 0,
      acid: 0,
      destroyed: false,
      cells,
    };
    building.blocks = (kind) => blocksKind(building, kind);
    this.recompute(building, false);
    if (opts.hp != null) building.hp = Math.min(building.maxHp, opts.hp);
    mesh.traverse((o) => {
      o.userData.bid = building.id;
      if (o.name === "hpbar") o.raycast = () => {};
    });
    this.game.scene.add(mesh);
    this.game.raycastables.push(mesh);
    this.list.push(building);
    this.byId.set(building.id, building);
    this.occupy(building);
    this.dirty = true;
    if (def.core) this.core = building;
    if (!opts.free && !opts.silent) {
      this.game.stats.built[id] = (this.game.stats.built[id] || 0) + 1;
      this.game.audio.play("build");
      this.game.progression.addXp(4);
      this.game.fx.burst(mesh.position.clone().setY(0.5), 0xe7c08a, 8, 2);
    }
    this.refreshPower();
    return building;
  }

  occupy(b) {
    for (const [x, z] of b.cells) {
      const k = cellKey(x, z);
      this.occupancy.set(k, b);
      if (b.def.blocksZombies || b.def.blocksCrawlers) this.solid.set(k, b);
    }
  }

  vacate(b) {
    for (const [x, z] of b.cells) {
      const k = cellKey(x, z);
      if (this.occupancy.get(k) === b) this.occupancy.delete(k);
      if (this.solid.get(k) === b) this.solid.delete(k);
    }
  }

  refreshSolids(b) {
    for (const [x, z] of b.cells) {
      const k = cellKey(x, z);
      const blocking = b.blocks("zombie") || b.blocks("crawler");
      if (blocking) this.solid.set(k, b);
      else if (this.solid.get(k) === b) this.solid.delete(k);
    }
  }

  placeSelected() {
    if (!this.hover) return null;
    const built = this.place(this.selected, this.hover.gx, this.hover.gz, this.game.buildRot || 0);
    if (built) this.game.buildMode = false;
    return built;
  }

  demolishLooked() {
    const b = this.lookedAt(8);
    if (!b) return;
    if (b.def.core) {
      this.game.notify("The hearth stays.", "bad");
      return;
    }
    if (b.hp < b.maxHp * 0.45) {
      this.game.notify("Too damaged to salvage", "bad");
      return;
    }
    const refund = scaledCost(b.def.cost, 0.4);
    for (const [k, v] of Object.entries(refund)) this.game.inventory.add(k, v, { silent: k === "gold" });
    this.game.notify("Salvaged " + b.def.name, "good");
    this.remove(b);
  }

  remove(b) {
    b.destroyed = true;
    b.hp = 0;
    this.vacate(b);
    this.dirty = true;
    this.game.scene.remove(b.mesh);
    const idx = this.game.raycastables.indexOf(b.mesh);
    if (idx >= 0) this.game.raycastables.splice(idx, 1);
    this.list = this.list.filter((x) => x !== b);
    this.byId.delete(b.id);
    this.refreshPower();
  }

  destroy(b) {
    if (b.def.core || b.destroyed) return;
    this.game.notify(b.def.name + " destroyed", "bad");
    this.game.audio.play("explode");
    this.game.fx.burst(b.mesh.position.clone().setY(1), 0x8a5a3c, 14, 4);
    this.game.fx.addShake(0.08);
    this.remove(b);
  }

  toggleGate(b) {
    if (!b || !b.def.gate || b.destroyed) return;
    b.open = !b.open;
    const leaf = b.mesh.getObjectByName("gateLeaf");
    if (leaf) leaf.rotation.y = b.open ? 1.15 : 0;
    this.refreshSolids(b);
    this.dirty = true;
    this.game.audio.play("ui");
    this.game.notify(b.open ? "Gate open" : "Gate closed", "good");
  }

  upgradeLooked() {
    const b = this.lookedAt(8);
    if (!b || !b.def.upgradeable) {
      this.game.notify("Nothing here to upgrade", "bad");
      return false;
    }
    if (b.level >= 3) {
      this.game.notify("Already fully upgraded", "bad");
      return false;
    }
    const cost = { gold: 180 * b.level * (b.def.tier + 1) };
    if (b.def.cost.metal) cost.metal = 8 * b.level;
    else if (b.def.cost.stone) cost.stone = 14 * b.level;
    else cost.wood = 24 * b.level;
    if (!this.game.inventory.spend(cost)) {
      this.game.notify("Can't afford the upgrade", "bad");
      this.game.audio.play("error");
      return false;
    }
    b.level += 1;
    this.recompute(b, true);
    b.hp = b.maxHp;
    this.game.notify(b.def.name + " level " + b.level, "good");
    this.game.audio.play("build");
    return true;
  }

  lookedAt(maxDist) {
    const aim = this.game.combat ? this.game.combat.aimPoint(40) : null;
    if (!aim) return null;
    let best = null;
    let bestD = (maxDist || 7) * (maxDist || 7);
    for (const b of this.list) {
      if (b.destroyed) continue;
      const dx = aim.x - b.mesh.position.x;
      const dz = aim.z - b.mesh.position.z;
      const d = dx * dx + dz * dz;
      const reach = dist2(this.game.player.pos.x, this.game.player.pos.z, b.mesh.position.x, b.mesh.position.z);
      if (d < 2.2 && reach < bestD) {
        best = b;
        bestD = reach;
      }
    }
    return best;
  }

  repairTick(b) {
    if (!b || b.destroyed || b.hp >= b.maxHp - 0.5) return;
    const missing = 1 - b.hp / b.maxHp;
    const slice = Math.min(0.22, missing);
    const cost = repairCostOf(b.def, slice, this.game.progression.mods());
    if (!this.game.inventory.spend(cost)) {
      this.game.notify("Not enough resources to repair", "bad");
      return;
    }
    b.hp = Math.min(b.maxHp, b.hp + b.maxHp * slice);
    this.game.audio.play("repair");
  }

  healAura(x, z) {
    let heal = 0;
    for (const b of this.list) {
      if (b.destroyed || !b.def.heal) continue;
      if (b.def.powerUse && !b.powered) continue;
      const d = dist2(x, z, b.mesh.position.x, b.mesh.position.z);
      const r = b.def.healRadius || 6;
      if (d <= r * r) heal += b.def.heal;
    }
    return heal;
  }

  refreshPower() {
    let supply = 0;
    const consumers = [];
    for (const b of this.list) {
      if (b.destroyed) continue;
      if (b.def.power) supply += b.def.power;
      if (b.def.powerUse) consumers.push(b);
    }
    consumers.sort((a, b) => a.def.powerUse - b.def.powerUse || a.id - b.id);
    for (const b of this.list) b.powered = !b.def.powerUse;
    for (const b of consumers) {
      if (supply >= b.def.powerUse) {
        supply -= b.def.powerUse;
        b.powered = true;
      } else b.powered = false;
    }
    this.powerSupply = supply;
    this.powerUsed = consumers.reduce((s, b) => s + (b.powered ? b.def.powerUse : 0), 0);
    this.powerMax = this.list.reduce((s, b) => s + (b.destroyed ? 0 : b.def.power || 0), 0);
  }

  update(dt) {
    this.updateGhost();
    this.tickRepair(dt);
    this.tickGenerators(dt);
    this.tickAcid(dt);
    this.tickShock(dt);
    this.tickTurrets(dt);
    this.animate(dt);
  }

  tickRepair(dt) {
    const playing = this.game.state === "play" && !this.game.panel && this.game.player.downed <= 0;
    if (!playing || !this.game.input.down("f") || this.game.buildMode) {
      this.repairCarry = 0;
      return;
    }
    const b = this.lookedAt(8);
    if (!b || b.hp >= b.maxHp - 0.5) return;
    const speed = this.game.progression.mods().repairSpeed;
    this.repairCarry += dt * speed;
    if (this.repairCarry >= 0.38) {
      this.repairCarry = 0;
      this.repairTick(b);
    }
  }

  tickGenerators(dt) {
    for (const b of this.list) {
      if (b.destroyed || !b.def.generates) continue;
      b.genTimer += dt;
      const every = b.def.interval || 10;
      if (b.genTimer < every) continue;
      b.genTimer = 0;
      for (const [res, n] of Object.entries(b.def.generates)) {
        this.game.inventory.add(res, n);
      }
    }
  }

  tickAcid(dt) {
    for (const b of [...this.list]) {
      if (b.destroyed || b.acid <= 0) continue;
      const dps = b.acid;
      b.acid = Math.max(0, b.acid - dt * 4);
      this.game.combat.damageBuilding(b, dps * dt, { acid: true });
    }
  }

  tickShock(dt) {
    for (const b of this.list) {
      if (b.destroyed || !b.def.shock || !b.powered) continue;
      for (const z of this.game.zombies.list) {
        if (!z.alive) continue;
        if (dist2(z.x, z.z, b.mesh.position.x, b.mesh.position.z) < 2.4) {
          this.game.combat.damageZombie(z, b.def.shock * dt, { source: "fence", pierce: true });
        }
      }
    }
  }

  turretStats(b) {
    const t = b.def.turret;
    const lvl = 1 + 0.28 * ((b.level || 1) - 1);
    let damage = t.damage * lvl;
    let range = t.range;
    if (this.hasTag("barracks")) damage *= 1.15;
    if (this.hasTag("command") && this.list.some((c) => c.def.command && c.powered && !c.destroyed)) range *= 1.22;
    return { ...t, damage, range, rate: t.rate * (1 + 0.06 * ((b.level || 1) - 1)) };
  }

  tickTurrets(dt) {
    const zombies = this.game.zombies.list;
    for (const b of this.list) {
      if (b.destroyed || !b.def.turret) continue;
      if (b.def.powerUse && !b.powered) continue;
      b.cooldown -= dt;
      if (b.cooldown > 0) continue;
      const stats = this.turretStats(b);
      const target = this.pickTurretTarget(b, stats, zombies);
      if (!target) continue;
      const muzzle = this.muzzle(b);
      this.game.combat.fireTurret(b, stats, muzzle, target);
      b.cooldown = 1 / stats.rate;
    }
  }

  pickTurretTarget(b, stats, zombies) {
    let best = null;
    let bestScore = Infinity;
    for (const z of zombies) {
      if (!z.alive || z.wild && !z.aggro) continue;
      const d = Math.hypot(z.x - b.mesh.position.x, z.z - b.mesh.position.z);
      if (d > stats.range) continue;
      let score = d;
      if (stats.priority === "big" && (z.def.big || z.def.boss || z.def.explode)) score -= 20;
      if (score < bestScore) {
        best = z;
        bestScore = score;
      }
    }
    return best;
  }

  muzzle(b) {
    const style = b.def.style;
    const y = style === "tower" ? 3.05 : style === "missile" ? 2.1 : 1.5;
    const local = b._muzzle || (b._muzzle = b.mesh.position.clone());
    local.set(0, y, -0.7);
    return b.mesh.localToWorld(local);
  }

  animate(dt) {
    const t = this.game.time;
    for (const b of this.list) {
      const flame = b.mesh.getObjectByName("flame");
      if (flame && !b.destroyed) {
        const s = 1 + Math.sin(t * 9 + b.id) * 0.08;
        flame.scale.set(s, 1 + Math.sin(t * 12 + b.id) * 0.12, s);
      }
      const bar = b.mesh.getObjectByName("hpbar");
      if (bar) {
        const hurt = b.hp < b.maxHp - 1;
        bar.visible = hurt;
        if (hurt) {
          bar.scale.x = Math.max(0.05, b.hp / b.maxHp);
          bar.lookAt(this.game.camera.position);
        }
      }
    }
    void dt;
  }

  clearGhost() {
    if (!this.ghost) return;
    this.game.scene.remove(this.ghost);
    this.ghost.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material && o.material.dispose) o.material.dispose();
    });
    this.ghost = null;
    this.ghostKey = "";
  }

  updateGhost() {
    this.hover = null;
    if (!this.game.buildMode || this.game.state !== "play") {
      this.clearGhost();
      return;
    }
    const point = this.game.combat.groundAim();
    if (!point) return;
    const cell = worldToCell(point.x, point.z);
    const rot = this.game.buildRot || 0;
    const key = this.selected + ":" + rot;
    if (!this.ghost || this.ghostKey !== key) {
      this.clearGhost();
      const ghost = makeBuildingMesh(BUILDINGS[this.selected]);
      ghost.traverse((o) => {
        o.raycast = () => {};
        o.castShadow = false;
      });
      this.game.scene.add(ghost);
      this.ghost = ghost;
      this.ghostKey = key;
    }
    const check = this.evaluate(this.selected, cell.gx, cell.gz, rot);
    const center = footprintCenter(BUILDINGS[this.selected], cell.gx, cell.gz, rot);
    this.ghost.position.set(center.x, 0.05, center.z);
    this.ghost.rotation.y = rot * (Math.PI / 2);
    tintGhost(this.ghost, check.ok);
    this.hover = {
      gx: cell.gx,
      gz: cell.gz,
      ok: check.ok,
      reason: check.reason || "",
      cost: check.cost || scaledCost(BUILDINGS[this.selected].cost, this.game.progression.mods().buildCost),
    };
  }

  costText(cost) {
    if (!cost) return "";
    return Object.entries(cost)
      .map(([k, v]) => v + " " + k)
      .join("  ");
  }

  serialize() {
    return this.list.map((b) => ({
      type: b.type,
      gx: b.gx,
      gz: b.gz,
      rot: b.rot,
      hp: b.hp,
      level: b.level,
      open: b.open,
    }));
  }

  hydrate(data) {
    if (!data) return;
    for (const b of [...this.list]) this.remove(b);
    this.core = null;
    for (const saved of data) {
      const b = this.place(saved.type, saved.gx, saved.gz, saved.rot || 0, {
        free: true,
        silent: true,
        level: saved.level || 1,
        hp: saved.hp,
      });
      if (b && saved.open) {
        b.open = true;
        const leaf = b.mesh.getObjectByName("gateLeaf");
        if (leaf) leaf.rotation.y = 1.15;
        this.refreshSolids(b);
        this.dirty = true;
      }
    }
    this.resizePlot();
  }
}

export function catalog(cat) {
  return buildingsInCat(cat);
}
