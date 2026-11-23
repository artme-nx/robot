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

  /** Priprema nije uspjela: umjesto znaka učitavanja pokaži poruku. */
  fail(message) {
    this.el.setAttribute('aria-busy', 'false');
    this.el.classList.add('is-failed');
    this.status.textContent = message;
  }
}
