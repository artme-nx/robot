// Mobitel / tablet: dodirni ekran bez miša (Instagram šalje posjetitelje većinom s mobitela,
// često kroz svoj ugrađeni preglednik). Na računalu se ništa od ovoga ne koristi: sve
// mobilne grane u programu provjeravaju IS_MOBILE, a postavke za računalo ostaju zadane.

const ua = navigator.userAgent;

/** Instagram / Facebook ugrađeni preglednik (kamera je tamo često nedostupna). */
export const IN_APP = /Instagram|FBAN|FBAV|FB_IAB/i.test(ua);

/** Mobitel ili tablet: UA mobilnog uređaja, ili dodir kao glavni pokazivač bez hovera (iPad). */
export const IS_MOBILE =
  /Android|iPhone|iPad|iPod|Mobile/i.test(ua) ||
  IN_APP ||
  (navigator.maxTouchPoints > 1 && matchMedia('(pointer: coarse)').matches && !matchMedia('(hover: hover)').matches);

/** Tablet (kraća strana ekrana ≥ 600 CSS px). */
const IS_TABLET = IS_MOBILE && Math.min(screen.width, screen.height) >= 600;

export const MOBILE = {
  // Gustoća CSS piksela: mobiteli ~140–160 CSS px po inču (iPhone ~153, Pixel ~159,
  // Galaxy ~141), tableti ~132. Iz toga i veličine prozora slijedi stvarna veličina u cm.
  pxPerCm: (IS_TABLET ? 132 : 150) / 2.54,
  // Prednja kamera mobitela: ~70° vidnog polja po duljoj strani slike (16:9 video).
  cameraFovLong: 70,
  // Kamera je ~1 cm izvan ruba slike (statusna traka / izrez) — iznad u uspravnom,
  // sa strane u položenom položaju.
  cameraInset: 1.0,
  // Mobitel se drži bliže nego laptop.
  restDistance: 35,
};

/** Vodoravni FOV kamere za trenutnu orijentaciju slike (uspravna slika = uži kut). */
export function mobileCameraFov(video) {
  const w = video?.videoWidth || 0;
  const h = video?.videoHeight || 0;
  const half = (MOBILE.cameraFovLong * Math.PI) / 360;
  if (!w || !h || w >= h) return MOBILE.cameraFovLong;
  return (2 * Math.atan(Math.tan(half) * (w / h)) * 180) / Math.PI;
}

/**
 * Položaj prednje kamere u cm (ishodište = centar prozora): iznad gornjeg ruba kad je
 * mobitel uspravan; u položenom položaju sa strane gdje je bio vrh uređaja
 * (orijentacija 90° = zakrenut ulijevo → kamera lijevo; 270° / -90° → desno).
 */
export function mobileCameraPosition(rect) {
  if (rect.height >= rect.width) return [0, rect.y1 + MOBILE.cameraInset];
  const angle = screen.orientation?.angle ?? window.orientation ?? 90;
  const side = angle === 90 ? -1 : 1;
  return [side * (rect.width / 2 + MOBILE.cameraInset), 0];
}
