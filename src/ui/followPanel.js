// T u FOLLOW ME: podešavanje ponašanja s kamerom uživo (klizači), spremanje u localStorage.
// Glava se okreće prema gledatelju za udio stvarnog geometrijskog kuta (Head gain) s mekim
// limitom (Head max; okomito 8/15 toga), a oči drže kontakt s render kamerom (Eye lock).

const STORAGE_KEY = 'robot:follow:v1';

export const FOLLOW_DEFAULTS = Object.freeze({
  headGain: 1, // udio stvarnog kuta prema gledateljevim očima (0 = glava miruje)
  headMax: 15, // ° meki limit vodoravno (okomito 8/15 toga)
  eyeLock: 1, // 0 = oči ciljaju stvarni položaj gledateljevih očiju, 1 = render kameru
});

export const FOLLOW_FIELDS = [
  { key: 'headGain', label: 'Head gain (share of the real angle)', min: 0, max: 2, step: 0.05, unit: '×' },
  { key: 'headMax', label: 'Head max (soft limit)', min: 0, max: 45, step: 0.5, unit: '°' },
  { key: 'eyeLock', label: 'Eye lock (0 = your eyes, 1 = render camera)', min: 0, max: 1, step: 0.05, unit: '' },
];

export function loadFollowSettings() {
  const out = { ...FOLLOW_DEFAULTS };
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
    if (parsed) for (const k of Object.keys(FOLLOW_DEFAULTS)) if (typeof parsed[k] === 'number') out[k] = parsed[k];
  } catch {
    /* pohrana nedostupna */
  }
  return out;
}

function saveFollowSettings(s) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    /* pohrana nedostupna */
  }
}

export class FollowPanel {
  constructor(settings) {
    this.settings = settings;
    this.el = document.createElement('form');
    this.el.className = 'panel panel--follow';
    this.el.hidden = true;
    this.el.autocomplete = 'off';
    document.body.appendChild(this.el);
    this.visible = false;
    this.#build();
  }

  toggle(force) {
    this.visible = force ?? !this.visible;
    this.el.hidden = !this.visible;
  }

  #build() {
    const f = this.el;
    f.innerHTML = `
      <header class="panel__head">
        <h2>Follow me (camera)</h2>
        <button type="button" class="icon-btn" data-act="close" aria-label="Close">×</button>
      </header>
      <p class="panel__note">The head turns toward you by a share of the real angle to your eyes; the eyes keep contact with the render camera. Values are saved in this browser.</p>
      <div class="panel__fields"></div>
      <p class="panel__note">Current values (copy):</p>
      <pre class="panel__values" data-values></pre>
      <p class="panel__measure" data-live></p>
      <footer class="panel__foot">
        <button type="button" class="btn btn--ghost" data-act="reset">Defaults</button>
        <button type="button" class="btn" data-act="close">Done</button>
      </footer>`;
    const fields = f.querySelector('.panel__fields');
    for (const def of FOLLOW_FIELDS) {
      const row = document.createElement('label');
      row.className = 'field';
      row.innerHTML = `
        <span>${def.label}</span>
        <span class="field__ctrl">
          <input type="range" min="${def.min}" max="${def.max}" step="${def.step}" data-range="${def.key}" />
          <input type="number" name="${def.key}" min="${def.min}" max="${def.max}" step="${def.step}" />
          <em>${def.unit}</em>
        </span>`;
      fields.appendChild(row);
    }
    this.values = f.querySelector('[data-values]');
    this.live = f.querySelector('[data-live]');
    this.#sync();

    f.addEventListener('input', (e) => {
      const el = e.target;
      const key = el.dataset.range ?? el.name;
      if (!key || !(key in FOLLOW_DEFAULTS)) return;
      const value = parseFloat(el.value);
      if (!Number.isFinite(value)) return;
      this.settings[key] = value;
      const twin = el.dataset.range ? f.querySelector(`input[name="${key}"]`) : f.querySelector(`[data-range="${key}"]`);
      if (twin) twin.value = value;
      saveFollowSettings(this.settings);
      this.#showValues();
    });
    f.addEventListener('submit', (e) => e.preventDefault());
    f.addEventListener('keydown', (e) => e.stopPropagation());
    f.addEventListener('click', (e) => {
      const act = e.target.closest('[data-act]')?.dataset.act;
      if (act === 'close') this.toggle(false);
      if (act === 'reset') {
        Object.assign(this.settings, FOLLOW_DEFAULTS);
        saveFollowSettings(this.settings);
        this.#sync();
      }
    });
  }

  #sync() {
    for (const def of FOLLOW_FIELDS) {
      const v = this.settings[def.key];
      this.el.querySelector(`input[name="${def.key}"]`).value = v;
      this.el.querySelector(`[data-range="${def.key}"]`).value = v;
    }
    this.#showValues();
  }

  #showValues() {
    const s = this.settings;
    this.values.textContent = `headGain: ${s.headGain}, headMax: ${s.headMax}, eyeLock: ${s.eyeLock}`;
  }

  /** Živi prikaz dok je panel otvoren. */
  showState(text) {
    if (!this.visible) return;
    if (this.live.textContent !== text) this.live.textContent = text;
  }
}
