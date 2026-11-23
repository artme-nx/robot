// Kratke upute na ekranu (engleski), jedna po jedna: izmjenjuju se, a svaka nestane
// kad korisnik tu gestu prvi put uspješno napravi (do ponovnog učitavanja stranice).

const SHOW_MS = 3400; // koliko dugo je jedna uputa na ekranu
const GAP_MS = 500; // stanka između uputa (dulja od CSS odtapanja)
const DONE_MS = 1000; // koliko dugo se vidi kvačica nakon uspjeha

export class Hints {
  /** @param {{id:string, text:string}[]} items redoslijed prikazivanja */
  constructor(items) {
    this.el = document.getElementById('hint');
    this.textEl = document.getElementById('hint-text');
    this.items = items.map((it) => ({ ...it, done: false }));
    this.index = -1;
    this.current = null;
    this.until = 0;
    this.startAt = null;
  }

  /** Počni prikazivati upute nakon delayMs. */
  start(now, delayMs = 0) {
    this.startAt = now + delayMs;
  }

  /** Gesta je uspjela: njena uputa se više ne prikazuje (a ako je na ekranu, dobije kvačicu). */
  complete(id, now) {
    const item = this.items.find((it) => it.id === id);
    if (!item || item.done) return;
    item.done = true;
    if (this.current === item) {
      this.el.classList.add('is-done');
      this.until = now + DONE_MS;
    }
  }

  isDone(id) {
    return !!this.items.find((it) => it.id === id)?.done;
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
    if (this.items.every((it) => it.done)) return null;
    do this.index = (this.index + 1) % this.items.length;
    while (this.items[this.index].done);
    return this.items[this.index];
  }
}
