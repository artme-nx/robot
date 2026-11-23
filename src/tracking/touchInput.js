// Dodir na mobitelu: zabavno i bez kamere.
//   povlačenje jednim prstom   = pomicanje glave (dok kamera ne radi)
//   kratki dodir / držanje     = vrh prsta na ekranu: oči ga prate, dodir lica → trzaj
//                                (držanje na licu ~2 s → ljutnja)
//   dva prsta: širenje         = otvoren dlan → rastavljanje (količina prati širenje)
//   dva prsta: skupljanje      = šaka → sklapanje
// Ruka ima isti oblik kao MouseHand / HandTracker trag (simulated), pa robot ne razlikuje izvore.

import { NEUTRAL_LOG_R } from '../interaction/handInput.js';

const FACE_LOG_R = Math.log(0.3); // prst "na ekranu" = puni doseg (vrh prsta na licu robota)
const DRAG_PX = 10; // pomak koji dodir pretvara u povlačenje
const PRESS_MS = 260; // držanje bez pomaka = prst na ekranu
const TAP_MS = 380; // koliko dugo traje "prst" nakon kratkog dodira
const HEAD_RANGE = [18, 10]; // cm: puni raspon glave pri povlačenju (lijevo-desno, gore-dolje)
const PINCH_OPEN = 1.08; // omjer razmaka prstiju: iznad = širenje
const PINCH_FULL = 2.0; // omjer za potpuno rastavljanje
const PINCH_CLOSE = 0.86; // ispod = skupljanje (šaka)
const UI = 'button, a, input, select, textarea, form, .mode-switch, .camera-note, .panel';

export class TouchInput {
  /**
   * @param {object} o
   * @param {() => boolean} o.headDrag smije li povlačenje micati glavu (kamera ne radi)
   * @param {number} o.rest udaljenost glave od ekrana (cm)
   */
  constructor({ headDrag, rest }) {
    this.headDrag = headDrag;
    this.touches = new Map();
    this.mode = 'idle'; // idle | pending | drag | finger | pinch | done
    this.pendingSince = 0;
    this.n = [0, 0]; // glava, -1..1
    this.head = [0, 0, rest];
    this.rest = rest;
    this.ndc = [0, 0];
    this.tapUntil = 0;
    this.pinchStart = 1;
    this.scale = 1;
    this.lastUsed = -1e9;
    this.events = [];
    this.frame = { valid: false, rect: null, since: 0 };
    this.track = {
      id: 'dodir',
      label: 'D',
      gesture: 'none',
      spread: 0,
      pinch: 0,
      pts: { tip: [0, 0, FACE_LOG_R], pinch: [0, 0, FACE_LOG_R], palm: [0, -0.12, FACE_LOG_R] },
      distanceCm: 30,
      features: null,
      landmarks: null,
      simulated: true,
    };

    const opts = { passive: false };
    window.addEventListener('pointerdown', (e) => this.#down(e), opts);
    window.addEventListener('pointermove', (e) => this.#move(e), opts);
    window.addEventListener('pointerup', (e) => this.#up(e), opts);
    window.addEventListener('pointercancel', (e) => this.#up(e), opts);
    // iOS Safari: dva prsta inače zumiraju stranicu.
    for (const t of ['gesturestart', 'gesturechange']) document.addEventListener(t, (e) => e.preventDefault(), opts);
  }

  /** Simulirana ruka je aktivna (prst na ekranu, nedavni dodir ili dva prsta). */
  get active() {
    return this.mode === 'finger' || this.mode === 'pinch' || performance.now() < this.tapUntil;
  }

  /** Netko je nedavno koristio dodir (za upute i status). */
  get recentlyUsed() {
    return performance.now() - this.lastUsed < 4000;
  }

  #toNdc(t, out) {
    out[0] = (t.x / window.innerWidth) * 2 - 1;
    out[1] = 1 - (t.y / window.innerHeight) * 2;
    return out;
  }

  #down(e) {
    if (e.pointerType !== 'touch' || e.target?.closest?.(UI)) return;
    e.preventDefault();
    this.lastUsed = performance.now();
    this.touches.set(e.pointerId, { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY });
    if (this.touches.size === 1) {
      this.mode = 'pending';
      this.pendingSince = performance.now();
      this.#toNdc(this.touches.get(e.pointerId), this.ndc);
    } else if (this.touches.size === 2) {
      this.mode = 'pinch';
      this.tapUntil = 0;
      this.pinchStart = Math.max(20, this.#spanPx());
      this.scale = 1;
    }
  }

  #move(e) {
    const t = this.touches.get(e.pointerId);
    if (!t) return;
    e.preventDefault();
    this.lastUsed = performance.now();
    const dx = e.clientX - t.x, dy = e.clientY - t.y;
    t.x = e.clientX;
    t.y = e.clientY;
    if (this.mode === 'pending' && Math.hypot(t.x - t.x0, t.y - t.y0) > DRAG_PX) {
      this.mode = this.headDrag() ? 'drag' : 'finger';
    }
    if (this.mode === 'drag') {
      // Cijela širina ekrana ≈ cijeli raspon glave (povlačenje udesno = glava udesno).
      this.n[0] = Math.max(-1, Math.min(1, this.n[0] + (dx / window.innerWidth) * 2.2));
      this.n[1] = Math.max(-1, Math.min(1, this.n[1] - (dy / window.innerHeight) * 2.2));
    } else if (this.mode === 'finger') {
      this.#toNdc(t, this.ndc);
    } else if (this.mode === 'pinch') {
      this.scale = this.#spanPx() / this.pinchStart;
    }
  }

  #up(e) {
    const t = this.touches.get(e.pointerId);
    if (!t) return;
    this.touches.delete(e.pointerId);
    if (this.mode === 'pending') {
      // Kratki dodir: prst kratko "dotakne" mjesto na ekranu.
      this.#toNdc(t, this.ndc);
      this.tapUntil = performance.now() + TAP_MS;
    }
    if (this.touches.size === 0) this.mode = 'idle';
    else if (this.mode === 'pinch') this.mode = 'done'; // jedan prst ostao: čekaj da se i on digne
  }

  #spanPx() {
    const [a, b] = [...this.touches.values()];
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
  }

  /** Glava koju glumi povlačenje (cm, prostor ekrana). */
  updateHead(rect, dt) {
    const target = [rect.cx + this.n[0] * HEAD_RANGE[0], rect.cy + this.n[1] * HEAD_RANGE[1], this.rest];
    const k = 1 - Math.exp(-dt * 12);
    for (let i = 0; i < 3; i++) this.head[i] += (target[i] - this.head[i]) * k;
    return this.head;
  }

  /** Jednom po frameu: stanje simulirane ruke. Vraća događaje (nema ih). */
  update(nowMs) {
    if (this.mode === 'pending' && nowMs - this.pendingSince > PRESS_MS) this.mode = 'finger';
    const tr = this.track;
    let gesture = 'none';
    let logR = FACE_LOG_R;
    let spread = 0;
    if (this.mode === 'pinch' || this.mode === 'done') {
      // Ruka daleko od lica (neutralna dubina), da dva prsta ne "dotaknu" robota.
      logR = NEUTRAL_LOG_R;
      if (this.mode === 'pinch' && this.scale >= PINCH_OPEN) {
        gesture = 'open';
        spread = 0.1 + 0.9 * Math.min(1, (this.scale - PINCH_OPEN) / (PINCH_FULL - PINCH_OPEN));
      } else if (this.mode === 'pinch' && this.scale <= PINCH_CLOSE) {
        gesture = 'fist';
      }
      const pts = [...this.touches.values()];
      if (pts.length === 2) this.#toNdc({ x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 }, this.ndc);
    } else if (this.mode === 'finger' || nowMs < this.tapUntil) {
      gesture = 'point';
    }
    if (gesture !== tr.gesture) tr.gestureSince = nowMs;
    tr.gesture = gesture;
    tr.spread = spread;
    for (const p of [tr.pts.tip, tr.pts.pinch]) {
      p[0] = this.ndc[0];
      p[1] = this.ndc[1];
      p[2] = logR;
    }
    tr.pts.palm[0] = this.ndc[0];
    tr.pts.palm[1] = this.ndc[1] - 0.12;
    tr.pts.palm[2] = logR + 0.05;
    tr.lastSeen = nowMs;
    const events = this.events;
    this.events = [];
    return events;
  }
}
