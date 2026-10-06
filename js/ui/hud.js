// DOM HUD. The simulation never writes text itself; it asks the HUD to.
import { BUILD_CATS } from "../config/buildings.js";
import { buildingsInCat } from "../config/buildings.js";
import { WEAPON_ORDER, WEAPONS, upgradeCost, MAX_WEAPON_LEVEL } from "../config/weapons.js";
import { SKILL_TREES, MAX_SKILL_RANK } from "../config/skills.js";
import { TIERS, XP, storageUpgradeCost, AMMO_PACKS } from "../config/balance.js";
import { formatNum } from "../core/util.js";

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

export class HUD {
  constructor(game) {
    this.game = game;
    const root = document.getElementById("ui");
    root.innerHTML = `
      <div class="tl">
        <div class="stat"><span>HEALTH</span><div class="bar"><i id="hpBar"></i></div><b id="hpText">100</b></div>
        <div class="stat"><span>BASE</span><div class="bar base"><i id="baseBar"></i></div><b id="baseText">100</b></div>
        <div class="lvl"><span>LEVEL</span><div class="bar xp"><i id="xpBar"></i></div><b id="lvlText">1</b></div>
        <div class="power" id="powerText"></div>
      </div>
      <div class="tr">
        <div class="res"><span>GOLD</span><b id="goldText">0</b></div>
        <div class="res"><span>WOOD</span><b id="woodText">0</b><em id="woodCap"></em></div>
        <div class="res"><span>STONE</span><b id="stoneText">0</b><em id="stoneCap"></em></div>
        <div class="res"><span>METAL</span><b id="metalText">0</b><em id="metalCap"></em></div>
      </div>
      <div class="wave" id="waveBox"><strong id="waveTitle"></strong><span id="waveSub"></span></div>
      <div class="tracker" id="tracker"></div>
      <div class="prompt" id="prompt"></div>
      <div class="hotbar">
        <div class="weapon"><b id="wepName">Wooden Bat</b><span id="wepAmmo">MELEE</span></div>
        <button id="btnBuild" type="button">BUILD<small>B</small></button>
        <button id="btnShop" type="button">SHOP<small>G</small></button>
        <button id="btnSkills" type="button">SKILLS<small>K</small></button>
        <button id="btnQuests" type="button">QUESTS<small>J</small></button>
        <button id="btnUp" type="button">BASE<small>U</small></button>
      </div>
      <div class="buildbar" id="buildbar" hidden></div>
      <canvas id="minimap" width="180" height="180"></canvas>
      <div class="tutorial" id="lesson" hidden></div>
      <div id="announce"><strong></strong><span></span></div>
      <div id="gameover">
        <div class="over-card">
          <h1>GAME OVER</h1>
          <p>The dead walked into the pyre.</p>
          <div class="actions">
            <button class="primary" id="overRetry" type="button">TRY AGAIN</button>
            <button id="overQuit" type="button">QUIT</button>
          </div>
        </div>
      </div>
      <div id="toasts"></div>
      <div id="panel"></div>
      <div id="cross"></div>
      <div id="vignette"></div>
      <div class="fps" id="fps"></div>
      <div id="title">
        <div class="title-card">
          <h1>PYRE<span>HOLD</span></h1>
          <p>A cold pyre on an empty plot. The dropper spits gold coins — walk over them, then stand on a green pad to raise walls. The weaponry sells guns for wood, stone, and gold.</p>
          <div class="actions">
            <button class="primary" data-act="new" type="button">NEW GAME</button>
            <button data-act="continue" id="continueBtn" type="button" hidden>CONTINUE</button>
          </div>
          <p class="keys">Click the view to look · WASD move · Left click fights or places · Right click shoots · E gather · F repair · B build · G shop · J quests · K skills · U base · T call night · Esc releases the mouse</p>
          <p class="keys"><a href="scroll.html">The long night</a> · <a href="https://github.com/echelly27-ai/F2026/pull/1" target="_blank" rel="noopener">GitHub</a></p>
        </div>
      </div>
    `;
    this.root = root;
    this.map = root.querySelector("#minimap");
    this.mapCtx = this.map.getContext("2d");
    this.panelEl = root.querySelector("#panel");
    this.panelSig = "";
    this.buildSig = "";
    this.fpsAcc = 0;
    this.fpsN = 0;
    this.annT = 0;
    root.querySelector("#btnBuild").onclick = () => game.toggleBuild();
    root.querySelector("#btnShop").onclick = () => game.togglePanel("trade");
    root.querySelector("#btnSkills").onclick = () => game.togglePanel("skills");
    root.querySelector("#btnQuests").onclick = () => game.togglePanel("quests");
    root.querySelector("#btnUp").onclick = () => game.togglePanel("upgrade");
    root.querySelector("#overRetry").onclick = () => game.retryAfterLoss();
    root.querySelector("#overQuit").onclick = () => game.quitToTitle();
    root.querySelector("#title").addEventListener("click", (e) => {
      const b = e.target.closest("[data-act]");
      if (!b) return;
      if (b.dataset.act === "new") game.startNew();
      if (b.dataset.act === "continue") game.continueGame();
    });
    root.querySelector("#buildbar").addEventListener("click", (e) => {
      const cat = e.target.closest("[data-cat]");
      if (cat) {
        game.buildings.cat = cat.dataset.cat;
        this.buildSig = "";
        return;
      }
      const item = e.target.closest("[data-build]");
      if (item) game.commands.setBuild(item.dataset.build);
    });
    this.panelEl.addEventListener("click", (e) => this.onPanel(e));
    this.lesson = root.querySelector("#lesson");
    this.lesson.addEventListener("click", (e) => {
      if (e.target.closest("[data-act='skip']")) game.tutorial.skip();
    });
  }

  setContinue(on) {
    this.root.querySelector("#continueBtn").hidden = !on;
  }

  hideTitle() {
    this.root.querySelector("#title").classList.add("hidden");
  }

  toast(text, kind) {
    const el = document.createElement("div");
    el.className = "toast " + (kind || "");
    el.textContent = text;
    const box = this.root.querySelector("#toasts");
    box.appendChild(el);
    setTimeout(() => el.remove(), 2600);
    while (box.children.length > 4) box.firstChild.remove();
  }

  showGameOver() {
    this.root.querySelector("#gameover").classList.add("show");
  }

  hideGameOver() {
    this.root.querySelector("#gameover").classList.remove("show");
  }

  announce(title, sub) {
    const box = this.root.querySelector("#announce");
    box.querySelector("strong").textContent = title;
    box.querySelector("span").textContent = sub || "";
    box.classList.add("show");
    clearTimeout(this.annT);
    this.annT = setTimeout(() => box.classList.remove("show"), 3400);
  }

  update(dt) {
    const g = this.game;
    const playing = g.state !== "title";
    this.root.style.display = "block";
    if (!playing) return;
    const inv = g.inventory;
    const caps = inv.caps();
    this.text("goldText", formatNum(inv.gold));
    this.text("woodText", formatNum(inv.wood));
    this.text("stoneText", formatNum(inv.stone));
    this.text("metalText", formatNum(inv.metal));
    this.text("woodCap", inv.wood + " / " + caps.wood);
    this.text("stoneCap", inv.stone + " / " + caps.stone);
    this.text("metalCap", inv.metal + " / " + caps.metal);
    const hpPct = Math.max(0, g.player.hp / g.player.maxHp);
    this.root.querySelector("#hpBar").style.width = (hpPct * 100).toFixed(1) + "%";
    this.text("hpText", Math.ceil(Math.max(0, g.player.hp)) + " / " + Math.round(g.player.maxHp));
    const core = g.buildings.core;
    const basePct = core ? Math.max(0, core.hp / core.maxHp) : 0;
    this.root.querySelector("#baseBar").style.width = (basePct * 100).toFixed(1) + "%";
    this.text("baseText", core ? Math.ceil(core.hp) + " / " + core.maxHp : "0");
    const need = XP.toNext(g.progression.level);
    this.root.querySelector("#xpBar").style.width = ((g.progression.xp / need) * 100).toFixed(1) + "%";
    const pts = g.progression.points ? " · " + g.progression.points + " SP" : "";
    this.text("lvlText", g.progression.level + pts);
    const pMax = g.buildings.powerMax || 0;
    this.text("powerText", pMax ? "POWER " + (g.buildings.powerUsed || 0) + " / " + pMax : g.progression.tierDef().name);

    const w = g.armory;
    const st = w.stats();
    this.text("wepName", w.def().name + "  L" + (w.levels[w.equipped] || 1));
    if (!st || st.melee) this.text("wepAmmo", "MELEE");
    else {
      const mag = w.currentMag();
      const rel = w.reload > 0 ? "  RELOADING" : "";
      this.text("wepAmmo", mag + " / " + w.reserve() + (rel || "  RMB"));
    }

    const wave = g.waves;
    let title = "";
    let sub = "";
    if (wave.phase === "prep") {
      title = "WAVE " + wave.number;
      sub = "NEXT WAVE IN " + Math.ceil(wave.timer) + "s · " + (wave.laneText || "HOLD");
    } else if (wave.phase === "wave") {
      title = "WAVE " + wave.number;
      sub = "ZOMBIES REMAINING: " + wave.remaining();
    } else if (wave.phase === "dawn") {
      title = "DAWN";
      sub = "The ring is quiet.";
    } else title = g.progression.tierDef().name.toUpperCase();
    this.text("waveTitle", title);
    this.text("waveSub", sub);
    this.text("prompt", g.prompt());
    this.root.classList.toggle("build-on", g.buildMode);
    this.root.querySelector("#btnBuild").classList.toggle("on", g.buildMode);
    this.root.querySelector("#vignette").style.opacity = String(0.15 + (1 - hpPct) * 0.55 + g.dayNight.factor * 0.25);

    this.drawTracker();
    this.drawLesson();
    this.drawBuild();
    this.drawPanel();
    this.drawMap();
    this.drawCross();
    this.fpsAcc += dt;
    this.fpsN++;
    if (this.fpsAcc > 0.5) {
      this.text("fps", Math.round(this.fpsN / this.fpsAcc) + " fps");
      this.fpsAcc = 0;
      this.fpsN = 0;
    }
  }

  text(id, value) {
    const el = this.root.querySelector("#" + id);
    if (el && el.textContent !== value) el.textContent = value;
  }

  drawCross() {
    const c = this.root.querySelector("#cross");
    const input = this.game.input;
    if (this.game.panel || this.game.state !== "play") {
      c.style.display = "none";
      return;
    }
    c.style.display = "block";
    c.classList.add("center");
    void input;
  }

  drawTracker() {
    const rows = this.game.quests.tracker();
    const html = rows
      .map((r) => `<div><b>${esc(r.quest.title)}</b><span>${Math.min(r.quest.count, Math.floor(r.value))} / ${r.quest.count} · ${esc(r.text)}</span></div>`)
      .join("");
    const el = this.root.querySelector("#tracker");
    if (el.innerHTML !== html) el.innerHTML = html;
  }

  drawLesson() {
    const step = this.game.tutorial.current();
    const el = this.lesson;
    if (!step) {
      el.hidden = true;
      return;
    }
    el.hidden = false;
    const html = `<b>LESSON ${this.game.tutorial.index + 1}</b><p>${esc(step.text)}</p><button data-act="skip" type="button">Skip lessons</button>`;
    if (el.dataset.step !== step.id) {
      el.dataset.step = step.id;
      el.innerHTML = html;
    }
  }

  drawBuild() {
    const bar = this.root.querySelector("#buildbar");
    if (!this.game.buildMode) {
      bar.hidden = true;
      return;
    }
    bar.hidden = false;
    const cat = this.game.buildings.cat;
    const sig = cat + "|" + this.game.buildings.selected + "|" + this.game.progression.tier + "|" + this.game.inventory.wood + "|" + this.game.inventory.stone + "|" + this.game.inventory.metal + "|" + this.game.inventory.gold;
    if (sig === this.buildSig) return;
    this.buildSig = sig;
    const cats = BUILD_CATS.map((c) => `<button type="button" data-cat="${c.id}" class="${c.id === cat ? "on" : ""}">${c.name}</button>`).join("");
    const items = buildingsInCat(cat)
      .map((def, i) => {
        const cost = Object.entries(def.cost).map(([k, v]) => v + " " + k).join(", ");
        const locked = def.tier > this.game.progression.tier;
        const on = def.id === this.game.buildings.selected ? "on" : "";
        return `<button type="button" class="${on} ${locked ? "bad" : ""}" data-build="${def.id}"><b>${i + 1}. ${esc(def.name)}</b><small class="cost">${locked ? "Locked" : esc(cost)} · ${def.hp} HP</small></button>`;
      })
      .join("");
    bar.innerHTML = `<div class="cats">${cats}</div><div class="items">${items}</div>`;
  }

  drawPanel() {
    if (!this.game.panel) {
      // closePanel clears the signature before this runs, so the DOM
      // itself is what tells us the old panel is still on screen.
      if (this.panelEl.innerHTML) this.panelEl.innerHTML = "";
      this.panelSig = "";
      return;
    }
    const sig = this.panelSignature();
    if (sig === this.panelSig) return;
    this.panelSig = sig;
    const name = this.game.panel;
    let body = "";
    if (name === "trade") body = this.tradePanel();
    else if (name === "weaponry") body = this.weaponryPanel();
    else if (name === "skills") body = this.skillPanel();
    else if (name === "quests") body = this.questPanel();
    else if (name === "upgrade") body = this.upgradePanel();
    else if (name === "pause") body = this.pausePanel();
    this.panelEl.innerHTML = `<div class="panel">${body}</div>`;
  }

  panelSignature() {
    const g = this.game;
    return [
      g.panel,
      g.inventory.gold,
      g.inventory.wood,
      g.inventory.stone,
      g.inventory.metal,
      g.armory.parts,
      g.armory.owned.join(","),
      g.armory.equipped,
      JSON.stringify(g.armory.levels),
      g.progression.points,
      g.progression.tier,
      g.progression.level,
      g.inventory.storageLevel,
      g.quests.claimed.size,
      g.audio.muted ? 1 : 0,
    ].join("|");
  }

  tradePanel() {
    const g = this.game;
    const rows = WEAPON_ORDER.map((id) => {
      const def = WEAPONS[id];
      const owned = g.armory.owned.includes(id);
      const lvl = g.armory.levels[id] || 1;
      const price = g.armory.costText(id);
      let buttons = "";
      if (!owned) buttons = `<button class="primary" data-act="buy-weapon" data-id="${id}" type="button">BUY ${esc(price)}</button>`;
      else {
        buttons = `<button data-act="equip" data-id="${id}" type="button">${g.armory.equipped === id ? "EQUIPPED" : "EQUIP"}</button>`;
        if (lvl < MAX_WEAPON_LEVEL) {
          const cost = upgradeCost(def, lvl + 1);
          buttons += `<button data-act="up-weapon" data-id="${id}" type="button">UPGRADE ${cost.gold}g / ${cost.parts} parts</button>`;
        }
      }
      return `<div class="row"><div><b>${esc(def.name)}</b> tier ${def.tier}${owned ? " · L" + lvl : ""}<p>${esc(def.blurb)} · DMG ${def.damage}${def.pellets > 1 ? " x" + def.pellets : ""} · ${def.melee ? "melee" : def.fireRate + "/s"}</p></div><div class="actions">${buttons}</div></div>`;
    }).join("");
    const ammo = Object.entries(AMMO_PACKS)
      .map(([id, pack]) => `<button data-act="ammo" data-id="${id}" type="button">${esc(pack.name)} ${pack.rounds} · ${pack.price}g</button>`)
      .join("");
    const sell = ["wood", "stone", "metal"]
      .map((r) => `<button data-act="sell" data-id="${r}" data-n="10" type="button">Sell 10 ${r}</button><button data-act="sell" data-id="${r}" data-n="all" type="button">Sell all ${r}</button>`)
      .join("");
    const buy = ["wood", "stone", "metal"]
      .map((r) => `<button data-act="buy-mat" data-id="${r}" type="button">Buy 10 ${r}</button>`)
      .join("");
    return `<h2>ARMORY & TRADE</h2><p class="keys">Parts: ${g.armory.parts}. Guns also sell at the weaponry stall for wood, stone, and gold. A workshop improves sale prices. An armory discounts guns. Weapon upgrades past level 2 need a workshop.</p>${rows}<div class="actions">${ammo}<button data-act="medkit" type="button">Field kit 80g</button></div><h2>SELL</h2><div class="actions">${sell}</div><h2>BUY MATERIALS</h2><div class="actions">${buy}</div><button data-act="close" type="button">CLOSE</button>`;
  }

  weaponryPanel() {
    const g = this.game;
    const rows = WEAPON_ORDER.filter((id) => id !== "bat")
      .map((id) => {
        const def = WEAPONS[id];
        const owned = g.armory.owned.includes(id);
        const cost = g.armory.costText(id);
        const locked = def.tier > g.progression.tier;
        let button = "";
        if (owned) button = `<button data-act="equip" data-id="${id}" type="button">${g.armory.equipped === id ? "EQUIPPED" : "EQUIP"}</button>`;
        else button = `<button class="primary" data-act="buy-weapon" data-id="${id}" type="button">${locked ? "LOCKED" : "BUY"}</button>`;
        const tag = owned ? "Owned" : locked ? cost + " · needs a stronger base" : cost;
        return `<div class="row"><div><b>${esc(def.name)}</b><p>${esc(def.blurb)}</p><p>${esc(tag)}</p></div><div class="actions">${button}</div></div>`;
      })
      .join("");
    return `<h2>WEAPONRY</h2><p class="keys">Every gun costs wood, stone, and gold. Stand on the amber mat or press E.</p>${rows}<button data-act="close" type="button">CLOSE</button>`;
  }

  skillPanel() {
    const g = this.game;
    const cols = SKILL_TREES.map((tree) => {
      const skills = tree.skills
        .map((s) => {
          const rank = g.progression.ranks[tree.id][s.id] || 0;
          const pips = Array.from({ length: MAX_SKILL_RANK }, (_, i) => `<i class="${i < rank ? "on" : ""}"></i>`).join("");
          return `<div class="skill"><b>${esc(s.name)}</b><span>${esc(s.desc)}</span><div class="bars">${pips}</div><button data-act="skill" data-tree="${tree.id}" data-id="${s.id}" type="button">LEARN</button></div>`;
        })
        .join("");
      return `<div><h2>${esc(tree.name)}</h2>${skills}</div>`;
    }).join("");
    return `<h2>SKILLS · ${g.progression.points} POINTS</h2><div class="grid">${cols}</div><button data-act="close" type="button">CLOSE</button>`;
  }

  questPanel() {
    const rows = this.game.quests
      .all()
      .map((r) => `<div class="row"><div><b>${esc(r.quest.title)}</b><p>${esc(r.quest.desc)} · ${Math.min(r.quest.count, Math.floor(r.value))} / ${r.quest.count}</p></div><div>${r.done ? "DONE" : esc(r.text)}</div></div>`)
      .join("");
    return `<h2>QUESTS</h2>${rows}<button data-act="close" type="button">CLOSE</button>`;
  }

  upgradePanel() {
    const g = this.game;
    const cur = g.progression.tierDef();
    const next = g.progression.nextTier();
    const check = g.progression.canUpgradeTier();
    let nextHtml = "<p>The bunker is as deep as this ground goes.</p>";
    if (next) {
      const cost = Object.entries(next.cost || {}).map(([k, v]) => v + " " + k).join(", ");
      nextHtml = `<p>${esc(next.blurb)}</p><p>Requires wave ${next.needWave}. Cost: ${esc(cost)}</p><p>${esc(check.reason || "Ready.")}</p><button class="primary" data-act="upgrade-base" type="button">UPGRADE TO ${esc(next.name)}</button>`;
    }
    const store = storageUpgradeCost(g.inventory.storageLevel);
    const storeTxt = Object.entries(store).map(([k, v]) => v + " " + k).join(", ");
    const caps = g.inventory.caps();
    return `<h2>${esc(cur.name)}</h2><p>${esc(cur.blurb)}</p>${nextHtml}<h2>STORAGE ${g.inventory.storageLevel}</h2><p>Wood ${caps.wood} · Stone ${caps.stone} · Metal ${caps.metal}</p><p>Next: ${esc(storeTxt)}</p><button data-act="upgrade-storage" type="button">EXPAND STORAGE</button><p class="keys">Look at a turret and press Y to upgrade that structure.</p><button data-act="close" type="button">CLOSE</button>`;
  }

  pausePanel() {
    return `<h2>PAUSED</h2><div class="actions"><button class="primary" data-act="resume" type="button">RESUME</button><button data-act="save" type="button">SAVE</button><button data-act="mute" type="button">${this.game.audio.muted ? "UNMUTE" : "MUTE"}</button><button data-act="quit" type="button">QUIT TO TITLE</button></div><p class="keys">Click to look · WASD move · Left click attacks or places · Right click shoots · R reload / rotate · E gather or gates · F repair · X salvage in build mode · Q build category · T call the night · Esc releases the mouse</p><p class="keys">Zombies path toward the pyre and chew whatever blocks them. Runners chase you. Tanks pick the toughest wall. Spitters hang back. Exploders detonate on contact. Powered turrets sleep without a generator.</p>`;
  }

  onPanel(e) {
    const b = e.target.closest("[data-act]");
    if (!b) return;
    const g = this.game;
    const act = b.dataset.act;
    if (act === "close" || act === "resume") g.closePanel();
    else if (act === "buy-weapon") g.commands.buyWeapon(b.dataset.id);
    else if (act === "equip") g.commands.equip(b.dataset.id);
    else if (act === "up-weapon") g.commands.upgradeWeapon(b.dataset.id);
    else if (act === "ammo") g.commands.buyAmmo(b.dataset.id);
    else if (act === "medkit") g.commands.buyMedkit();
    else if (act === "sell") g.commands.sell(b.dataset.id, b.dataset.n === "all" ? 999999 : 10);
    else if (act === "buy-mat") g.commands.buyMat(b.dataset.id, 10);
    else if (act === "skill") g.commands.spendSkill(b.dataset.tree, b.dataset.id);
    else if (act === "upgrade-base") g.commands.upgradeBase();
    else if (act === "upgrade-storage") g.commands.upgradeStorage();
    else if (act === "save") g.save(true);
    else if (act === "mute") g.audio.setMuted(!g.audio.muted);
    else if (act === "quit") g.quitToTitle();
    this.panelSig = "";
  }

  drawMap() {
    const ctx = this.mapCtx;
    const w = 180;
    const h = 180;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "rgba(18,14,11,0.9)";
    ctx.fillRect(0, 0, w, h);
    const half = 120;
    const px = (x) => ((x + half) / (half * 2)) * w;
    const py = (z) => ((z + half) / (half * 2)) * h;
    const g = this.game;
    ctx.fillStyle = "rgba(196,163,106,0.35)";
    const plot = g.world.plot;
    ctx.fillRect(px(plot.position.x - plot.scale.x / 2), py(plot.position.z - plot.scale.y / 2), (plot.scale.x / (half * 2)) * w, (plot.scale.y / (half * 2)) * h);
    ctx.fillStyle = "#c4a36a";
    for (const b of g.buildings.list) {
      if (b.destroyed) continue;
      ctx.fillRect(px(b.mesh.position.x) - 1.5, py(b.mesh.position.z) - 1.5, 3, 3);
    }
    ctx.fillStyle = "#7dcc6a";
    for (const n of g.resources.nodes) {
      if (n.amount <= 0) continue;
      if (n.kind === "wood") ctx.fillStyle = "#3d8156";
      else if (n.kind === "stone") ctx.fillStyle = "#b7b1a4";
      else if (n.kind === "metal") ctx.fillStyle = "#8fd0ff";
      else ctx.fillStyle = "#ffb13a";
      ctx.fillRect(px(n.x), py(n.z), 2, 2);
    }
    ctx.fillStyle = "#ff5d45";
    for (const z of g.zombies.list) {
      if (!z.alive) continue;
      ctx.fillRect(px(z.x) - 1, py(z.z) - 1, 3, 3);
    }
    const p = g.player;
    ctx.save();
    ctx.translate(px(p.pos.x), py(p.pos.z));
    ctx.rotate(p.yaw);
    ctx.fillStyle = "#f4efe4";
    ctx.beginPath();
    ctx.moveTo(0, -5);
    ctx.lineTo(4, 4);
    ctx.lineTo(-4, 4);
    ctx.fill();
    ctx.restore();
  }
}
