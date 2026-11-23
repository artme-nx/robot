// Ekran za učitavanje: crna podloga, mali natpis "Artificial Media" i diskretan
// znak učitavanja. Stoji preko svega dok se robot ne iscrta, a zatim se glatko odtopi.

export class Loader {
  constructor() {
    this.el = document.getElementById('loader');
    this.status = document.getElementById('loader-status');
  }

  /** Robot je na ekranu: odtopi ekran za učitavanje i makni ga iz DOM-a. */
  reveal() {
    performance.mark('robot:revealed');
    const el = this.el;
    el.setAttribute('aria-busy', 'false');
    el.classList.add('is-done');
    const remove = () => el.remove();
    el.addEventListener('transitionend', remove, { once: true });
    setTimeout(remove, 2000); // ako transitionend ne stigne (npr. smanjeno kretanje)
  }

  /**
   * Stvarni napredak (mobitel): traka se puni do p (0–1), uz mali postotak ispod.
   * Napredak samo raste (preuzimanje → sastavljanje → shaderi → prvi frameovi).
   */
  setProgress(p) {
    if (!this.pctEl) {
      this.el.classList.add('is-determinate');
      this.bar = this.el.querySelector('.loader__bar');
      this.bar.setAttribute('role', 'progressbar');
      this.bar.setAttribute('aria-valuemin', '0');
      this.bar.setAttribute('aria-valuemax', '100');
      this.pctEl = document.createElement('div');
      this.pctEl.className = 'loader__pct';
      this.pctEl.setAttribute('aria-hidden', 'true');
      this.bar.after(this.pctEl);
      this.shown = 0;
    }
    this.shown = Math.max(this.shown, Math.min(1, p));
    const pct = Math.round(this.shown * 100);
    this.el.style.setProperty('--p', this.shown.toFixed(3));
    this.pctEl.textContent = `${pct}%`;
    this.bar.setAttribute('aria-valuenow', String(pct));
  }

  /** Priprema nije uspjela: umjesto znaka učitavanja pokaži poruku. */
  fail(message) {
    this.el.setAttribute('aria-busy', 'false');
    this.el.classList.add('is-failed');
    this.status.textContent = message;
  }
}
