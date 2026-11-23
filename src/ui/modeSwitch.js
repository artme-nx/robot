// Gumb u dnu ekrana: LOOK AROUND (ORBIT) ↔ FOLLOW ME (WINDOW). Tipka G radi isto.

export class ModeSwitch {
  /** @param {(mode: 'look'|'follow') => void} onSelect */
  constructor(onSelect) {
    this.el = document.getElementById('mode-switch');
    this.buttons = [...this.el.querySelectorAll('button[data-mode]')];
    for (const b of this.buttons) {
      b.addEventListener('click', (e) => {
        onSelect(b.dataset.mode);
        // Nakon klika mišem fokus ne ostaje na gumbu (Space/Enter su i prečaci ruku).
        if (e.detail > 0) b.blur();
      });
    }
  }

  /** Označi aktivni način. */
  set(mode) {
    this.el.dataset.mode = mode;
    for (const b of this.buttons) b.setAttribute('aria-pressed', String(b.dataset.mode === mode));
  }
}
