// Boot Pyrehold. The page is a canvas plus a DOM HUD; all rules live in js/.
import { Game } from "./game.js?v=7";

try {
  const game = new Game();
  game.start();
  window.PYRE = game;
} catch (err) {
  console.error(err);
  const pre = document.createElement("pre");
  pre.id = "boot-error";
  pre.style.cssText = "position:fixed;inset:12px;z-index:9;color:#fff;background:#201510ee;padding:16px;overflow:auto;white-space:pre-wrap";
  pre.textContent = String(err && err.stack ? err.stack : err);
  document.body.appendChild(pre);
}
