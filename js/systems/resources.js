// World nodes and the hold-to-gather loop. Nodes are created by the map
// so their ids stay stable across saves.
import { GATHER, ZONES } from "../config/balance.js";
import { dist2 } from "../core/util.js";
import { hideNode } from "../world/map.js";

export class Resources {
  constructor(game) {
    this.game = game;
    this.nodes = game.world.nodes;
    this.hold = 0;
    this.holdNode = null;
  }

  nearest(maxDist = 4.6) {
    const p = this.game.player;
    let best = null;
    let bestD = maxDist * maxDist;
    for (const n of this.nodes) {
      if (n.amount <= 0 || !n.mesh.visible) continue;
      if (!this.zoneOpen(n.x, n.z)) continue;
      const d = dist2(p.pos.x, p.pos.z, n.x, n.z);
      if (d < bestD) {
        best = n;
        bestD = d;
      }
    }
    return best;
  }

  zoneOpen(x, z) {
    const tier = this.game.progression.tier;
    for (const zone of ZONES) {
      if (tier >= zone.minTier) continue;
      if (x >= zone.x && x <= zone.x + zone.w && z >= zone.z && z <= zone.z + zone.h) return false;
    }
    return true;
  }

  progress() {
    return this.hold;
  }

  update(dt) {
    const input = this.game.input;
    const playing = this.game.state === "play" && !this.game.panel && this.game.player.downed <= 0;
    const node = playing ? this.nearest() : null;
    if (playing && input.down("e") && node && !this.game.buildMode) {
      const spec = GATHER[node.kind] || GATHER.wood;
      const speed = this.game.progression.mods().gatherSpeed;
      this.hold += (dt / spec.time) * speed;
      this.holdNode = node.id;
      if (this.hold >= 1) {
        this.hold = 0;
        this.gather(node);
      }
    } else {
      this.hold = 0;
      this.holdNode = null;
    }

    for (const n of this.nodes) {
      if (n.amount > 0 || n.oneShot) continue;
      n.timer -= dt;
      if (n.timer <= 0) {
        n.amount = n.max;
        hideNode(n, false);
      }
    }
  }

  gather(node) {
    if (!node || node.amount <= 0) return false;
    const mods = this.game.progression.mods();
    const rush = this.game.time < (this.game.flags.rushUntil || 0) ? 2 : 1;
    if (node.kind === "gold") {
      const got = this.game.inventory.add("gold", node.amount);
      node.amount = 0;
      hideNode(node, true);
      this.game.audio.play("gold");
      this.game.notify("+" + got + " gold", "good");
      this.game.fx.burst(node.mesh.position.clone().setY(0.6), 0xffb13a, 12, 3);
      this.game.progression.addXp(8);
      return true;
    }
    if (node.kind === "crate") {
      const bonus = node.bonus || { gold: 80 };
      if (bonus.gold) this.game.inventory.add("gold", bonus.gold);
      if (bonus.parts) this.game.armory.addParts(bonus.parts);
      if (bonus.ammo) this.game.armory.addAmmo(bonus.ammo, bonus.rounds || 20);
      node.amount = 0;
      hideNode(node, true);
      this.game.audio.play("gold");
      this.game.notify("Crate searched", "good");
      this.game.progression.addXp(12);
      return true;
    }
    const spec = GATHER[node.kind] || GATHER.wood;
    const chunk = Math.max(1, Math.round(spec.chunk * mods.gatherYield * rush));
    const take = Math.min(node.amount, chunk);
    const added = this.game.inventory.add(node.kind, take);
    if (added <= 0) return false;
    node.amount -= added;
    this.game.audio.play("gather");
    this.game.progression.addXp(1);
    this.game.fx.burst(node.mesh.position.clone().setY(1), node.kind === "metal" ? 0x9bb4b0 : 0xc4a36a, 6, 2);
    if (node.amount <= 0) {
      hideNode(node, true);
      if (!node.oneShot) nTimer(node);
    }
    return true;
  }

  spawnDrop(spec) {
    const node = {
      id: "drop-" + this.nodes.length + "-" + Math.floor(Math.random() * 9999),
      kind: spec.kind,
      x: spec.x,
      z: spec.z,
      amount: spec.amount,
      max: spec.amount,
      respawn: spec.respawn || 0,
      timer: 0,
      oneShot: true,
      mesh: spec.mesh,
      label: spec.label || "Collect",
      rarity: spec.rarity || "rare",
      bonus: spec.bonus || null,
    };
    this.nodes.push(node);
    this.game.world.group.add(node.mesh);
    return node;
  }

  serialize() {
    return this.nodes
      .filter((n) => !String(n.id).startsWith("drop-"))
      .map((n) => ({ id: n.id, amount: n.amount, timer: n.timer }));
  }

  hydrate(data) {
    if (!data) return;
    const byId = new Map(data.map((n) => [n.id, n]));
    for (const n of this.nodes) {
      const saved = byId.get(n.id);
      if (!saved) continue;
      n.amount = saved.amount;
      n.timer = saved.timer || 0;
      hideNode(n, n.amount <= 0);
    }
  }
}

function nTimer(node) {
  node.timer = node.respawn || 30;
}
