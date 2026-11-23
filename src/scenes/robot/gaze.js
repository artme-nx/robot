// Ponašanje pogleda: oči gledaju točno u 3D položaj gledateljevih očiju
// (kamera), uz realistične sakade, mikrosakade i tremor; glava i vrat slijede s
// kašnjenjem i inercijom (opruga s prigušenjem, "servo" mrtva zona); blenda se
// sužava kad se gledatelj približi; treptaj je zatvarač fotoaparata (iris-blenda).

import * as THREE from 'three';

const rand = (a, b) => a + Math.random() * (b - a);

// Treptaj = zatvarač: lamele se brzo zatvore do kraja, kratko ostanu zatvorene
// (da se vidi i na snimci od 30 fps) pa se oštro otvore. Sekunde.
const SHUTTER = { close: 0.08, hold: 0.04, open: 0.16, doubleGap: 0.09, doubleChance: 0.15 };

/** Kritično prigušena opruga po komponentama (2D kutovi). */
class Spring2 {
  constructor(freq, damping) {
    this.freq = freq;
    this.damping = damping;
    this.x = new THREE.Vector2();
    this.v = new THREE.Vector2();
  }
  update(target, dt) {
    const w = this.freq * Math.PI * 2;
    const k = w * w;
    const c = 2 * this.damping * w;
    // Polu-implicitni Euler u malim koracima (stabilno i pri 30 fps).
    const steps = Math.max(1, Math.ceil(dt / 0.004));
    const h = dt / steps;
    for (let i = 0; i < steps; i++) {
      const ax = k * (target.x - this.x.x) - c * this.v.x;
      const ay = k * (target.y - this.x.y) - c * this.v.y;
      this.v.x += ax * h;
      this.v.y += ay * h;
      this.x.x += this.v.x * h;
      this.x.y += this.v.y * h;
    }
    return this.x;
  }
}

export class GazeController {
  constructor() {
    // Pogled (offset cilja u cm, u ravnini gledateljevog lica).
    this.offset = new THREE.Vector2();
    this.offsetTarget = new THREE.Vector2();
    this.saccadeFrom = new THREE.Vector2();
    this.saccadeT = 1;
    this.saccadeDur = 0.05;
    this.nextSaccade = rand(1.2, 2.5);
    this.returnTimer = 0;
    this.micro = new THREE.Vector2();
    this.nextMicro = rand(0.4, 1.0);
    this.tremorPhase = Math.random() * 100;

    // Glava (yaw, pitch u radijanima) i vrat.
    this.headSpring = new Spring2(0.85, 0.62);
    this.neckSpring = new Spring2(0.5, 0.8);
    this.headGoal = new THREE.Vector2();
    this.servoHold = new THREE.Vector2();
    this.jolt = new THREE.Vector2();
    this.nextJolt = rand(3, 7);

    // Blenda i treptanje (zatvarač).
    this.aperture = 0.5;
    this.apertureV = 0;
    this.blinkT = -1; // < 0: nema treptaja u tijeku
    this.nextBlink = rand(2.5, 5);
    this.doubleBlink = false;
    this.doubleWait = 0; // stanka prije drugog "klika"
    this.irisClose = 0;
    this.time = 0;
  }

  /**
   * @param {number} dt
   * @param {number} viewerDist udaljenost gledatelja od ekrana (cm)
   * @param {THREE.Vector2} headGoal ciljni kut glave (yaw, pitch u rad); robot odlučuje
   *   koliki dio kuta prema gledatelju (ili prstu) glava prati
   */
  update(dt, viewerDist, headGoal) {
    this.time += dt;
    const t = this.time;

    // --- Sakade: povremeno kratko pogleda gledateljevo lijevo/desno oko ili usta ---
    this.nextSaccade -= dt;
    if (this.returnTimer > 0) {
      this.returnTimer -= dt;
      if (this.returnTimer <= 0) this.#startSaccade(0, 0);
    } else if (this.nextSaccade <= 0) {
      const r = Math.random();
      if (r < 0.32) this.#startSaccade(-3.15, 0.2); // gledateljevo desno oko (s robotove strane lijevo)
      else if (r < 0.64) this.#startSaccade(3.15, 0.2);
      else if (r < 0.78) this.#startSaccade(rand(-1, 1), -6.5); // usta
      else this.#startSaccade(rand(-1.2, 1.2), rand(-0.8, 0.8));
      this.returnTimer = rand(0.35, 0.9);
      this.nextSaccade = rand(1.8, 4.2);
    }
    if (this.saccadeT < 1) {
      this.saccadeT = Math.min(1, this.saccadeT + dt / this.saccadeDur);
      // Brzi start, mekano zaustavljanje (profil sakade).
      const e = 1 - Math.pow(1 - this.saccadeT, 3);
      this.offset.lerpVectors(this.saccadeFrom, this.offsetTarget, e);
    }

    // --- Mikrosakade + tremor (vrlo mali, ali čine pogled "živim") ---
    this.nextMicro -= dt;
    if (this.nextMicro <= 0) {
      this.micro.set(rand(-0.12, 0.12), rand(-0.1, 0.1));
      this.nextMicro = rand(0.35, 1.1);
    }
    const tremor = new THREE.Vector2(
      Math.sin(t * 37.0 + this.tremorPhase) * 0.012 + Math.sin(t * 61.0) * 0.008,
      Math.cos(t * 41.0 + this.tremorPhase) * 0.012,
    );

    // --- Glava: slijedi zadani kut, s mrtvom zonom (servo) ---
    const goal = headGoal.clone();
    if (goal.distanceTo(this.servoHold) > THREE.MathUtils.degToRad(1.4)) this.servoHold.copy(goal);
    this.nextJolt -= dt;
    if (this.nextJolt <= 0) {
      this.jolt.set(rand(-1, 1), rand(-1, 1)).multiplyScalar(THREE.MathUtils.degToRad(0.35));
      this.nextJolt = rand(3.5, 8);
    }
    this.jolt.multiplyScalar(Math.exp(-dt * 9));
    const headTarget = this.servoHold.clone().add(this.jolt);
    const head = this.headSpring.update(headTarget, dt);
    const neck = this.neckSpring.update(new THREE.Vector2(head.x * 0.45, head.y * 0.35), dt);

    // --- Blenda: bliže = uža blenda i jača jezgra; s blagim "traženjem fokusa" ---
    const near = THREE.MathUtils.clamp((viewerDist - 30) / (95 - 30), 0, 1);
    const apertureGoal = THREE.MathUtils.lerp(0.2, 0.6, near);
    const k = 60, c = 9.5; // lagani podbačaj kao kod pravog mehanizma
    this.apertureV += (k * (apertureGoal - this.aperture) - c * this.apertureV) * dt;
    this.aperture += this.apertureV * dt;
    this.brightness = THREE.MathUtils.lerp(1.65, 0.85, near);

    // --- Treptanje: zatvarač fotoaparata (iris-blenda), ponekad dvaput zaredom ---
    this.nextBlink -= dt;
    if (this.doubleWait > 0) {
      this.doubleWait -= dt;
      if (this.doubleWait <= 0) this.blinkT = 0;
    } else if (this.blinkT < 0 && this.nextBlink <= 0) {
      this.blinkT = 0;
      this.doubleBlink = Math.random() < SHUTTER.doubleChance;
      this.nextBlink = rand(2.8, 6.5);
    }
    this.irisClose = 0;
    if (this.blinkT >= 0) {
      this.blinkT += dt;
      const { close, hold, open } = SHUTTER;
      const t = this.blinkT;
      if (t < close) {
        const p = t / close;
        this.irisClose = p * p; // ubrzava i "škljocne" na kraju
      } else if (t < close + hold) {
        this.irisClose = 1;
      } else {
        const p = Math.min(1, (t - close - hold) / open);
        this.irisClose = (1 - p) * (1 - p); // oštar početak, mekano dosjedanje
      }
      if (t >= close + hold + open) {
        this.blinkT = -1;
        if (this.doubleBlink) {
          // Drugi "klik" nakon kratke stanke.
          this.doubleBlink = false;
          this.doubleWait = SHUTTER.doubleGap;
        }
      }
    }

    return {
      offset: this.offset.clone().add(this.micro).add(new THREE.Vector2(tremor.x * 10, tremor.y * 10)),
      head: head.clone(),
      neck: neck.clone(),
      aperture: Math.max(0.0, this.aperture * (1 - this.irisClose)),
      // Svjetlo oka izlazi kroz otvor blende: zatvoren zatvarač ga gotovo ugasi.
      brightness: this.brightness * (1 - 0.92 * this.irisClose),
      shutter: this.irisClose,
    };
  }

  /** Okini zatvarač odmah (za testove i snimanje). */
  blinkNow() {
    this.blinkT = 0;
    this.doubleBlink = false;
    this.doubleWait = 0;
  }

  #startSaccade(x, y) {
    this.saccadeFrom.copy(this.offset);
    this.offsetTarget.set(x, y);
    this.saccadeT = 0;
    const amp = this.saccadeFrom.distanceTo(this.offsetTarget);
    this.saccadeDur = 0.025 + amp * 0.008;
  }
}
