// Snimač upravljanja rukom (debug prikaz D, tipka R): ~10 s svaki frame zapiše otvorenost
// ruke (sirovu i zaglađenu, po prstima), rub kadra, brzinu, stanje upravljanja (mode,
// reason, magnet) te cilj i napredak rastavljanja. Na kraju se JSON spremi kao preuzimanje
// (u Downloads) pod imenom robot-ruka-<vrijeme>.json. Služi za usporedbu prije/poslije.

const r3 = (x) => (x == null || !Number.isFinite(x) ? x ?? null : Math.round(x * 1000) / 1000);
const arr3 = (a) => (a ? Array.from(a, r3) : null);
const pad = (n) => String(n).padStart(2, '0');

function stamp(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;
}

export class HandRecorder {
  constructor(durationS = 10) {
    this.durationS = durationS;
    this.frames = null;
    this.t0 = 0;
    this.meta = null;
    this.saved = null; // { name, at } zadnje spremljene snimke (za poruku u debug prikazu)
  }

  get active() {
    return this.frames != null;
  }

  start(now, meta = {}) {
    const d = new Date();
    this.frames = [];
    this.t0 = now;
    this.meta = { started: d.toISOString(), name: `robot-ruka-${stamp(d)}.json`, durationS: this.durationS, ...meta };
  }

  /** Jedan frame (zove se nakon robot.update, pa su cilj i napredak iz ovog framea). */
  record(now, { dt, source, framing, views, control, explode }) {
    if (!this.frames) return;
    const t = (now - this.t0) / 1000;
    const byId = new Map(control.hands.map((h) => [h.id, h]));
    const hands = views.map((v) => {
      const h = byId.get(v.id);
      const f = v.track?.features;
      const b = v.track?.box;
      return {
        id: v.id,
        label: v.label,
        gesture: v.gesture,
        raw: r3(v.openRaw),
        o: r3(h?.o),
        fingers: arr3(v.fingers),
        ext: arr3(f?.ext),
        bends: f?.bends ? Array.from(f.bends, (x) => Math.round(x)) : null,
        edge: !!v.edge,
        box: b ? [r3(b.x0), r3(b.y0), r3(b.x1), r3(b.y1)] : null,
        cm: r3(v.distanceCm),
        speed: r3(h?.speed),
        reliable: h?.reliable ?? null,
        reliableFor: r3(h?.reliableFor),
        openFor: r3(h?.openFor),
        closedFor: r3(h?.closedFor),
        pointFor: r3(h?.pointFor),
        pointShape: h?.pointShape ?? null,
        fresh: h?.fresh ?? null, // nova detekcija u ovom frameu
      };
    });
    this.frames.push({
      t: r3(t),
      dt: r3(dt),
      source,
      framing,
      mode: control.mode,
      reason: control.reason,
      activeId: control.activeId,
      latched: control.latched,
      explodeTarget: r3(explode.target),
      p: r3(explode.p),
      amount: r3(explode.amount),
      freq: r3(explode.freq),
      hands,
    });
    if (t >= this.durationS) this.stop();
  }

  /** Završi i spremi (i kad se prekine ranije). */
  stop() {
    if (!this.frames) return null;
    const data = { meta: { ...this.meta, frames: this.frames.length }, frames: this.frames };
    const name = this.meta.name;
    this.frames = null;
    const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    this.saved = { name, at: performance.now() };
    return name;
  }

  /** Redak za debug prikaz (ili null). */
  status(now) {
    if (this.frames) {
      const t = (now - this.t0) / 1000;
      return `● SNIMAM ${t.toFixed(1)} / ${this.durationS} s · ${this.frames.length} frameova (R = stop)`;
    }
    if (this.saved && now - this.saved.at < 6000) return `✓ spremljeno: ${this.saved.name}`;
    return 'R      snimi 10 s upravljanja rukom (JSON u Downloads)';
  }
}
