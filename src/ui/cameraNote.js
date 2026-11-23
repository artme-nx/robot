// Mobitel bez kamere: mala poruka da s kamerom robot prati lice, uz gumb za ponovni pokušaj.
// (U Instagramovom pregledniku kamera je često blokirana — tada i savjet da se otvori u pregledniku.)

export class CameraNote {
  /** @param {() => Promise<unknown>} onRetry @param {boolean} inApp */
  constructor(onRetry, inApp) {
    this.el = document.getElementById('camera-note');
    this.text = document.getElementById('camera-note-text');
    this.button = document.getElementById('camera-retry');
    document.getElementById('camera-note-tip').hidden = !inApp;
    this.button.addEventListener('click', async () => {
      this.button.disabled = true;
      this.button.textContent = 'Trying…';
      try {
        await onRetry();
      } catch {
        this.text.textContent = 'Still no camera — allow it in your browser settings, then try again.';
      } finally {
        this.button.disabled = false;
        this.button.textContent = 'Try again';
      }
    });
  }

  show() {
    this.el.hidden = false;
  }

  hide() {
    this.el.hidden = true;
  }

  get visible() {
    return !this.el.hidden;
  }
}
