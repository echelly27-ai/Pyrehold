// Keyboard and mouse. Clicking the view captures the mouse so looking works
// like a normal game. Menus release that capture so buttons stay clickable.
// Right click fires the weapon in hand. Looking is the captured mouse.

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = {};
    this.pressed = {};
    this.looking = false;
    this.rmb = false;
    this.capture = false;
    this.primary = false;
    this.primaryPressed = false;
    this.primaryReleased = false;
    this.secondary = false;
    this.secondaryPressed = false;
    this.mx = window.innerWidth / 2;
    this.my = window.innerHeight / 2;
    this.wheel = 0;
    this.lookX = 0;
    this.lookY = 0;
    this._onKeyDown = (e) => this.onKey(e, true);
    this._onKeyUp = (e) => this.onKey(e, false);
    this._onMouseDown = (e) => this.onMouseDown(e);
    this._onMouseUp = (e) => this.onMouseUp(e);
    this._onMove = (e) => this.onMove(e);
    this._onWheel = (e) => {
      this.wheel += Math.sign(e.deltaY);
      e.preventDefault();
    };
    this._onContext = (e) => e.preventDefault();
    window.addEventListener("keydown", this._onKeyDown);
    window.addEventListener("keyup", this._onKeyUp);
    window.addEventListener("mouseup", this._onMouseUp);
    window.addEventListener("mousemove", this._onMove);
    window.addEventListener("mousedown", (e) => this.onRightClick(e));
    window.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      this.onRightClick(e);
    });
    canvas.addEventListener("mousedown", this._onMouseDown);
    canvas.addEventListener("wheel", this._onWheel, { passive: false });
    canvas.addEventListener("contextmenu", this._onContext);
    document.addEventListener("pointerlockchange", () => this.syncLook());
    window.addEventListener("blur", () => {
      this.keys = {};
      this.rmb = false;
      this.primary = false;
      this.secondary = false;
      this.syncLook();
    });
  }

  get locked() {
    return document.pointerLockElement === this.canvas;
  }

  syncLook() {
    this.looking = this.locked;
  }

  onRightClick(e) {
    if (e.button != null && e.button !== 2 && e.type !== "contextmenu") return;
    const ui = e.target && e.target.closest && e.target.closest("button, a, input, textarea, .panel, #title, #gameover");
    if (ui) return;
    this.secondaryPressed = true;
    if (e.type !== "contextmenu") {
      this.secondary = true;
      this.rmb = true;
    }
  }

  release() {
    if (this.locked) document.exitPointerLock();
  }

  onKey(e, down) {
    const tag = (e.target && e.target.tagName) || "";
    if (tag === "INPUT" || tag === "TEXTAREA") return;
    const k = e.key.toLowerCase();
    if ([" ", "tab", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(k) || e.code === "Space") {
      e.preventDefault();
    }
    if (down) {
      if (!this.keys[k]) {
        this.pressed[k] = true;
        if (e.code && e.code.startsWith("Digit")) this.pressed[e.code] = true;
      }
      this.keys[k] = true;
    } else {
      this.keys[k] = false;
    }
  }

  onMouseDown(e) {
    if (e.button === 2) {
      this.rmb = true;
      this.secondary = true;
      this.secondaryPressed = true;
      this.syncLook();
    }
    if (e.button === 0) {
      this.primary = true;
      this.primaryPressed = true;
      // Must run inside the click, not on the next frame, or the browser
      // rejects the lock and the mouse never looks.
      if (this.capture && !this.locked) {
        const pending = this.canvas.requestPointerLock();
        if (pending && pending.catch) pending.catch(() => {});
      }
    }
  }

  onMouseUp(e) {
    if (e.button === 2) {
      this.rmb = false;
      this.secondary = false;
      this.syncLook();
    }
    if (e.button === 0) {
      this.primary = false;
      this.primaryReleased = true;
    }
  }

  onMove(e) {
    this.mx = e.clientX;
    this.my = e.clientY;
    if (this.looking) {
      this.lookX += e.movementX;
      this.lookY += e.movementY;
    }
  }

  // Shots and build ghosts always leave from the middle of the view, which
  // is where the crosshair sits. The cursor is for menus, not for aiming.
  aimNdc() {
    return { x: 0, y: 0 };
  }

  down(k) {
    return !!this.keys[k.toLowerCase()];
  }

  edge(k) {
    return !!this.pressed[k.toLowerCase()];
  }

  digitEdge() {
    for (let i = 1; i <= 9; i++) {
      if (this.pressed["Digit" + i]) return i;
    }
    return 0;
  }

  endFrame() {
    this.pressed = {};
    this.primaryPressed = false;
    this.primaryReleased = false;
    this.secondaryPressed = false;
    this.wheel = 0;
    this.lookX = 0;
    this.lookY = 0;
  }
}
