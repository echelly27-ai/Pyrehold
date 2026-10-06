// Small synthesized audio bus. No external files, so the game stays self-contained.
// Sounds are short and quiet on purpose.

export class AudioBus {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
    this.volume = 0.7;
    this.drone = null;
    this.mood = "day";
  }

  ensure() {
    if (this.muted) return null;
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume;
      this.master.connect(this.ctx.destination);
      this.startDrone();
    }
    if (this.ctx.state === "suspended") this.ctx.resume();
    return this.ctx;
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : this.volume;
  }

  startDrone() {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    const o2 = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "sine";
    o2.type = "triangle";
    o.frequency.value = 55;
    o2.frequency.value = 82.5;
    g.gain.value = 0.012;
    o.connect(g);
    o2.connect(g);
    g.connect(this.master);
    o.start();
    o2.start();
    this.drone = { o, o2, g };
  }

  setMood(mood) {
    this.mood = mood;
    if (!this.drone || !this.ctx) return;
    const night = mood === "night" || mood === "blood";
    const f = night ? 42 : 58;
    const now = this.ctx.currentTime;
    this.drone.o.frequency.setTargetAtTime(f, now, 0.8);
    this.drone.o2.frequency.setTargetAtTime(night ? 63 : 87, now, 0.8);
    this.drone.g.gain.setTargetAtTime(night ? 0.02 : 0.012, now, 0.6);
  }

  tone(freq, dur, type, gain, slideTo) {
    const ctx = this.ensure();
    if (!ctx) return;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type || "sine";
    o.frequency.value = freq;
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(40, slideTo), ctx.currentTime + dur);
    g.gain.setValueAtTime(gain, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
    o.connect(g);
    g.connect(this.master);
    o.start();
    o.stop(ctx.currentTime + dur + 0.02);
  }

  noise(dur, gain, hp) {
    const ctx = this.ensure();
    if (!ctx) return;
    const n = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, n, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < n; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const filter = ctx.createBiquadFilter();
    filter.type = "highpass";
    filter.frequency.value = hp || 800;
    const g = ctx.createGain();
    g.gain.value = gain;
    src.connect(filter);
    filter.connect(g);
    g.connect(this.master);
    src.start();
  }

  play(name) {
    switch (name) {
      case "bat":
        this.noise(0.08, 0.18, 200);
        this.tone(180, 0.09, "triangle", 0.06, 70);
        break;
      case "pistol":
        this.noise(0.07, 0.22, 400);
        this.tone(220, 0.08, "square", 0.04, 80);
        break;
      case "shotgun":
        this.noise(0.14, 0.32, 180);
        this.tone(120, 0.16, "sawtooth", 0.05, 40);
        break;
      case "auto":
        this.noise(0.04, 0.12, 500);
        this.tone(260, 0.04, "square", 0.025, 90);
        break;
      case "sniper":
        this.noise(0.12, 0.2, 300);
        this.tone(520, 0.12, "triangle", 0.05, 140);
        break;
      case "rocket":
        this.noise(0.2, 0.25, 120);
        this.tone(90, 0.25, "sawtooth", 0.06, 40);
        break;
      case "energy":
        this.tone(640, 0.08, "sawtooth", 0.03, 880);
        this.tone(880, 0.06, "sine", 0.02, 1200);
        break;
      case "reload":
        this.tone(540, 0.05, "square", 0.03, 320);
        this.tone(700, 0.04, "square", 0.02);
        break;
      case "hit":
        this.noise(0.05, 0.12, 600);
        break;
      case "head":
        this.tone(880, 0.07, "square", 0.04, 1320);
        break;
      case "zombie":
        this.tone(110 + Math.random() * 40, 0.18, "sawtooth", 0.03, 60);
        break;
      case "die":
        this.tone(160, 0.2, "triangle", 0.04, 40);
        break;
      case "explode":
        this.noise(0.35, 0.4, 80);
        this.tone(70, 0.4, "sine", 0.08, 30);
        break;
      case "build":
        this.tone(220, 0.07, "square", 0.04);
        this.noise(0.06, 0.08, 400);
        break;
      case "gather":
        this.tone(480, 0.06, "triangle", 0.04, 720);
        break;
      case "gold":
        this.tone(660, 0.08, "sine", 0.04);
        this.tone(880, 0.1, "sine", 0.03);
        break;
      case "error":
        this.tone(140, 0.12, "square", 0.04, 90);
        break;
      case "wave":
        this.tone(196, 0.3, "sawtooth", 0.05, 98);
        this.tone(247, 0.4, "triangle", 0.04);
        break;
      case "boss":
        this.tone(80, 0.5, "sawtooth", 0.07, 40);
        this.tone(120, 0.45, "square", 0.04);
        break;
      case "level":
        this.tone(523, 0.1, "sine", 0.05);
        this.tone(659, 0.12, "sine", 0.05);
        this.tone(784, 0.18, "sine", 0.05);
        break;
      case "ui":
        this.tone(420, 0.04, "sine", 0.03);
        break;
      case "repair":
        this.tone(300, 0.05, "triangle", 0.03, 420);
        break;
      case "scream":
        this.tone(700, 0.35, "sawtooth", 0.04, 240);
        break;
      default:
        break;
    }
  }
}
