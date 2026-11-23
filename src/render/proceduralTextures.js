// Proceduralne teksture iz canvasa: tekst u prstenu objektiva robotova oka.
// Natpisi na robotu crtaju se fontom Barlow Condensed (public/fonts).

import * as THREE from 'three';

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

let fontsReady = null;
export function loadFonts() {
  if (!fontsReady) {
    const base = `${import.meta.env.BASE_URL}fonts/`;
    const faces = [
      new FontFace('Barlow Condensed', `url(${base}BarlowCondensed-500.woff2)`, { weight: '500' }),
      new FontFace('Barlow Condensed', `url(${base}BarlowCondensed-600.woff2)`, { weight: '600' }),
    ];
    fontsReady = Promise.all(
      faces.map((f) =>
        f.load().then(
          (loaded) => document.fonts.add(loaded),
          () => null,
        ),
      ),
    );
  }
  return fontsReady;
}

/** Tekst u prstenu (oznake na objektivu oka): bijeli tekst na prozirnom. */
export async function createRingTextTexture(text, { size = 1024, inner = 0.66, outer = 0.94, font = '600 58px "Barlow Condensed", sans-serif' } = {}) {
  await loadFonts();
  const c = canvas(size, size);
  const g = c.getContext('2d');
  g.clearRect(0, 0, size, size);
  g.fillStyle = '#ffffff';
  g.font = font;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const radius = (size / 2) * ((inner + outer) / 2);
  const chars = [...text];
  const total = chars.reduce((s, ch) => s + g.measureText(ch).width + 6, 0);
  let angle = -Math.PI / 2 - total / radius / 2;
  for (const ch of chars) {
    const wch = g.measureText(ch).width + 6;
    angle += wch / radius / 2;
    g.save();
    g.translate(size / 2 + Math.cos(angle) * radius, size / 2 + Math.sin(angle) * radius);
    g.rotate(angle + Math.PI / 2);
    g.fillText(ch, 0, 0);
    g.restore();
    angle += wch / radius / 2;
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}
