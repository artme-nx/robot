// Otvorenost ruke (kamera) → količina rastavljanja robota.
//
// Otvorenost (0 = šaka … 1 = ispruženi prsti; palac se ne broji, vidi gestures.js)
// izravno zadaje cilj rastavljanja: rašireni dlan = potpuno rastavljeno, kako se ruka
// zatvara robot se postupno sklapa, zatvorena ruka = sklopljeno. Mjera se zaglađuje
// (One Euro), na oba kraja ima malu mrtvu zonu, a pri dnu "magnet": kad je ruka gotovo
// zatvorena, robot se sam dovrši sklopiti brže, pa dijelovi sjednu s odskokom i klikom.
//
// Ruka preuzme upravljanje tek kad se jasno pokaže (otvoren dlan ili šaka, mirno, cijela
// u kadru), pa ruka koja samo prolazi ili pokazuje kažiprstom ništa ne mijenja. Dok ruka
// upravlja, nepouzdani uzorci (brz pokret, ruka na rubu kadra) se ne koriste. Kad ruka
// krene naglo (spuštanje) ili prijeđe u kažiprst, cilj se vrati na vrijednost od prije
// ~0,35 s (pri spuštanju se ruka opusti) i ostaje. Kad kamera izgubi ruku, cilj ostaje
// točno gdje je bio; ako se ruka brzo vrati u sličnom položaju (kratki ispad), nastavlja
// se bez skoka.

import { OneEuroFilter } from '../tracking/oneEuro.js';

export const OPEN = {
  dead: [0.15, 0.85], // mrtve zone: ispod = sklopljeno, iznad = potpuno rastavljeno
  closed: [0.22, 0.28], // magnet pri dnu: ulaz / izlaz (histereza)
  closedS: 0.1, // s: ruka toliko dugo zatvorena → magnet
  engageOpen: 0.75, // otvoren dlan preuzima upravljanje …
  engageOpenS: 0.15, // … nakon ovoliko sekundi mirno u kadru
  engageClosedS: 0.25, // šaka preuzima nakon ovoliko sekundi
  fast: 2.4, // NDC/s: brže od toga je premještanje ili spuštanje ruke, ne gesta
  pointS: 0.2, // kažiprst dulje od ovoga = pokazivanje, a ne zatvaranje ruke
  closedIndex: 0.5, // zatvorena ruka: i kažiprst savijen (inače je to kažiprst, ne šaka)
  rollbackS: 0.35, // pri prekidu: cilj od prije ovoliko sekundi
  keepS: 1.0, // ruka smije nestati ovoliko dugo i nastaviti
  resumeTol: 0.2, // vraćena ruka nastavlja ako joj je otvorenost ovoliko blizu prijašnjoj
  settleS: 0.1, // nakon povratka ili prekida: toliko pouzdanih uzoraka prije odluke
  gapS: 0.25, // dulja rupa u uzorcima → filtar kreće ispočetka (bez razmazivanja starog i novog)
  magnetHz: 2.6, // opruga rastavljanja tijekom magneta (inače 1 Hz)
  magnetBelow: 0.3, // … dok je napredak rastavljanja ispod ovoga
};
const FILTER = { minCutoff: 1.2, beta: 1.5, dCutoff: 1.0 };
const HISTORY_S = 1.5;

const clamp01 = (x) => Math.min(1, Math.max(0, x));

/** Otvorenost → cilj rastavljanja (mrtve zone na oba kraja, linearno između). */
export function openToTarget(o) {
  const [a, b] = OPEN.dead;
  return clamp01((o - a) / (b - a));
}

class HandOpen {
  constructor(id, t) {
    this.id = id;
    this.firstSeen = t;
    this.filter = new OneEuroFilter(FILTER);
    this.o = null; // zaglađena otvorenost (null dok nema pouzdanog uzorka)
    this.raw = null;
    this.fingers = null;
    this.sampleKey = undefined;
    this.fedTf = -1e9; // vrijeme filtra zadnjeg korištenog uzorka
    this.palm = null;
    this.speed = 0;
    this.edge = false;
    this.reliable = false;
    this.reliableFor = 0;
    this.openFor = 0;
    this.closedFor = 0;
    this.pointFor = 0;
    this.pointShape = false;
  }

  /** Jedan frame: brzina dlana, pouzdanost, novi uzorak u filtar, brojači za odluke. */
  update(v, t, dt) {
    const px = v.s?.palm?.x ?? v.palm?.x ?? 0;
    const py = v.s?.palm?.y ?? v.palm?.y ?? 0;
    if (this.palm && dt > 0) {
      const inst = Math.hypot(px - this.palm[0], py - this.palm[1]) / dt;
      this.speed += (inst - this.speed) * (1 - Math.exp(-dt / 0.08));
    }
    this.palm = [px, py];
    this.edge = !!v.edge;
    this.reliable = !this.edge && this.speed < OPEN.fast;
    this.raw = v.openRaw;
    this.fingers = v.fingers ?? null;
    // Oblik kažiprsta (ispružen kažiprst, ostali savijeni) — i prije nego ga gesta potvrdi.
    const F = this.fingers;
    this.pointShape = !!F && F[0] > 0.7 && Math.max(F[1], F[2], F[3]) < 0.45;

    // Kamera: novi uzorak samo kad stigne nova detekcija; test/simulacija: svaki frame.
    const key = v.openT ?? t;
    if (key !== this.sampleKey) {
      this.sampleKey = key;
      if (this.reliable) {
        const tf = v.openT != null ? v.openT / 1000 : t;
        if (tf - this.fedTf > OPEN.gapS) this.filter.reset();
        this.o = clamp01(this.filter.filter(v.openRaw, tf));
        this.fedTf = tf;
      }
    }
    if (this.reliable && this.o != null) {
      this.reliableFor += dt;
      this.openFor = this.o >= OPEN.engageOpen ? this.openFor + dt : 0;
      const closed = this.o <= OPEN.closed[0] && (!F || F[0] <= OPEN.closedIndex);
      this.closedFor = closed ? this.closedFor + dt : 0;
    } else {
      this.reliableFor = 0;
      this.openFor = 0;
      this.closedFor = 0;
    }
    this.pointFor = v.gesture === 'point' || this.pointShape ? this.pointFor + dt : 0;
  }
}

export class OpenControl {
  constructor() {
    this.hands = new Map();
    this.mode = 'idle'; // idle: čeka dlan ili šaku · active: ruka upravlja · hold: ruka nestala, drži
    this.activeId = null;
    this.latched = false; // magnet pri dnu (cilj 0 dok se ruka opet ne otvori)
    this.holdSince = 0;
    this.holdO = null; // otvorenost u trenutku na koji se cilj vratio …
    this.holdO2 = null; // … i u trenutku prekida (nastavlja se ako je ruka blizu bilo kojoj)
    this.holdId = null; // ruka koja je upravljala (smije nastaviti i kad nije nova)
    this.history = []; // [{ t, target, o, latched }]
    this.reason = '';
  }

  /** Prekini bez vraćanja (dodir, miš, vlastita glava). */
  cancel() {
    this.mode = 'idle';
    this.activeId = null;
    this.latched = false;
    this.history.length = 0;
  }

  /** Magnet: zadnji dio sklapanja ide brže (dijelovi sjednu s odskokom). */
  get magnet() {
    return this.latched;
  }

  /**
   * @param {number} t vrijeme scene (s)
   * @param {number} dt
   * @param {Array} views ruke iz HandInput (koriste se samo žive s openRaw — kamera ili test)
   * @param {number} current trenutni cilj rastavljanja
   * @returns {number|null} novi cilj ili null (ne diraj)
   */
  update(t, dt, views, current) {
    const live = views.filter((v) => v.alive && v.openRaw != null);
    const framing = views.some((v) => v.alive && v.gesture === 'frame');
    const seen = new Set();
    for (const v of live) {
      seen.add(v.id);
      let h = this.hands.get(v.id);
      if (!h) this.hands.set(v.id, (h = new HandOpen(v.id, t)));
      h.update(v, t, dt);
    }
    for (const id of this.hands.keys()) if (!seen.has(id)) this.hands.delete(id);

    let out = null;
    if (this.mode === 'active') {
      const h = this.hands.get(this.activeId);
      if (framing) {
        out = this.#stop('idle', t - OPEN.rollbackS, 'okvir', t);
      } else if (!h) {
        // Kamera izgubila ruku: drži točno trenutno stanje (bez vraćanja unatrag).
        out = this.#stop('hold', Infinity, 'ruka izgubljena', t);
      } else if (!h.reliable) {
        out = this.#stop('hold', t - OPEN.rollbackS, h.edge ? 'ruka na rubu kadra' : 'brz pokret', t);
      } else if (h.pointFor >= OPEN.pointS) {
        out = this.#stop('idle', t - h.pointFor - OPEN.rollbackS, 'kažiprst', t);
      } else if (h.pointFor > 0) {
        // Možda kažiprst: zamrzni cilj dok se ne razjasni.
      } else if (h.o != null) {
        if (!this.latched && h.closedFor >= OPEN.closedS) {
          // Magnet: sklopljeno je potvrđeno, povratak unatrag više ne ide preko toga.
          this.latched = true;
          this.history.length = 0;
        }
        if (this.latched && h.o > OPEN.closed[1]) this.latched = false;
        out = this.latched ? 0 : openToTarget(h.o);
        this.history.push({ t, target: out, o: h.o, latched: this.latched });
        while (this.history.length > 1 && t - this.history[0].t > HISTORY_S) this.history.shift();
      }
    }

    if (this.mode === 'hold' && t - this.holdSince > OPEN.keepS) {
      this.mode = 'idle';
      this.reason = '';
    }
    if ((this.mode === 'hold' || this.mode === 'idle') && !framing) {
      for (const h of this.hands.values()) {
        if (h.o == null || h.pointFor > 0 || h.reliableFor < OPEN.settleS) continue;
        // Kratki ispad: ista ruka (ili tek vraćena) u istoj pozi → nastavi; inače treba
        // jasno pokazati dlan ili šaku. Druga ruka koja je cijelo vrijeme u kadru ne preuzima.
        const back = h.id === this.holdId || h.firstSeen >= this.holdSince - 0.05;
        const near = (o) => o != null && Math.abs(h.o - o) <= OPEN.resumeTol;
        const resume = this.mode === 'hold' && back && (near(this.holdO) || near(this.holdO2));
        const open = h.openFor >= OPEN.engageOpenS;
        const closed = h.closedFor >= OPEN.engageClosedS;
        if (resume || open || closed) {
          this.mode = 'active';
          this.activeId = h.id;
          this.history.length = 0;
          this.reason = resume ? 'nastavlja' : open ? 'dlan' : 'šaka';
          if (closed && !resume) this.latched = true;
          else if (h.o > OPEN.closed[1]) this.latched = false;
          out = this.latched ? 0 : openToTarget(h.o);
          this.history.push({ t, target: out, o: h.o, latched: this.latched });
          break;
        }
      }
    }
    if (out == null) return null;
    if (out > 0) this.latched = false;
    return out === current ? null : out;
  }

  /** Prekid upravljanja: cilj se vrati na vrijednost iz povijesti (prije smetnje). */
  #stop(mode, tRef, reason, t) {
    let e = this.history[0] ?? null;
    for (const h of this.history) {
      if (h.t > tRef) break;
      e = h;
    }
    this.mode = mode;
    this.reason = reason;
    this.holdSince = t;
    this.holdO = e?.o ?? null;
    this.holdO2 = this.history.at(-1)?.o ?? null;
    this.holdId = this.activeId;
    this.activeId = null;
    this.history.length = 0;
    if (!e) return null;
    this.latched = e.latched;
    return e.target;
  }

  /** Stanje za debug prikaz i testove. */
  debug() {
    const list = [...this.hands.values()].map((h) => ({
      id: h.id,
      o: h.o,
      raw: h.raw,
      fingers: h.fingers,
      reliable: h.reliable,
      edge: h.edge,
      speed: h.speed,
    }));
    const active = this.hands.get(this.activeId) ?? null;
    return { mode: this.mode, reason: this.reason, activeId: this.activeId, latched: this.latched, hands: list, active: active ? list.find((x) => x.id === active.id) : null };
  }
}
