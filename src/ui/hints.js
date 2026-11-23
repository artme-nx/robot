// Kratke upute na ekranu (engleski), jedna po jedna: izmjenjuju se, a svaka nestane
// kad korisnik tu gestu prvi put uspješno napravi (do ponovnog učitavanja stranice).
// Skup uputa se može zamijeniti (kamera ↔ dodir na mobitelu); odrađene ostaju odrađene.

const SHOW_MS = 3400; // koliko dugo je jedna uputa na ekranu
const GAP_MS = 500; // stanka između uputa (dulja od CSS odtapanja)
const DONE_MS = 1000; // koliko dugo se vidi kvačica nakon uspjeha

export class Hints {
  /** @param {{id:string, text:string, when?:() => boolean}[]} items redoslijed prikazivanja */
  constructor(items) {
    this.el = document.getElementById('hint');
    this.textEl = document.getElementById('hint-text');
    this.done = new Set();
    this.items = items;
    this.index = -1;
    this.current = null;
    this.until = 0;
    this.startAt = null;
  }

  /** Zamijeni skup uputa (npr. kad kamera proradi ili ne uspije). */
  setItems(items) {
    if (items === this.items) return;
    this.items = items;
    this.index = -1;
    if (this.current && !items.includes(this.current)) {
      this.current = null;
      this.el.classList.remove('is-visible', 'is-done');
      this.until = performance.now() + GAP_MS;
    }
  }

  /** Počni prikazivati upute nakon delayMs. */
  start(now, delayMs = 0) {
    this.startAt = now + delayMs;
  }

  /** Gesta je uspjela: njena uputa se više ne prikazuje (a ako je na ekranu, dobije kvačicu). */
  complete(id, now) {
    if (this.done.has(id)) return;
    this.done.add(id);
    if (this.current?.id === id) {
      this.el.classList.add('is-done');
      this.until = now + DONE_MS;
    }
  }

  isDone(id) {
    return this.done.has(id);
  }

  /** Sve upute trenutnog skupa su odrađene. */
  get allDone() {
    return this.items.every((it) => this.done.has(it.id));
  }

  update(now) {
    if (this.startAt === null || now < this.startAt || now < this.until) return;
    if (this.current) {
      // Isteklo vrijeme (ili kvačica): odtopi i napravi stanku.
      this.current = null;
      this.el.classList.remove('is-visible');
      this.until = now + GAP_MS;
      return;
    }
    const next = this.#next();
    if (!next) return;
    this.current = next;
    this.textEl.textContent = next.text;
    this.el.classList.remove('is-done');
    this.el.classList.add('is-visible');
    this.until = now + SHOW_MS;
  }

  #next() {
    const n = this.items.length;
    for (let k = 1; k <= n; k++) {
      const i = (this.index + k) % n;
      const it = this.items[i];
      if (this.done.has(it.id) || (it.when && !it.when())) continue;
      this.index = i;
      return it;
    }
    return null;
  }
}
