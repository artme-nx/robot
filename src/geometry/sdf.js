// Skalarne SDF primitive i operacije (bez alokacija — vrte se milijune puta u workeru).
// Konvencija: negativno unutra, jedinice su centimetri.

const { sqrt, abs, max, min } = Math;

export const sdSphere = (x, y, z, r) => sqrt(x * x + y * y + z * z) - r;

/** Elipsoid (IQ aproksimacija, dovoljno točna blizu površine). */
export function sdEllipsoid(x, y, z, rx, ry, rz) {
  const ax = x / rx, ay = y / ry, az = z / rz;
  const k0 = sqrt(ax * ax + ay * ay + az * az);
  const bx = x / (rx * rx), by = y / (ry * ry), bz = z / (rz * rz);
  const k1 = sqrt(bx * bx + by * by + bz * bz);
  return k1 > 1e-9 ? (k0 * (k0 - 1)) / k1 : -min(rx, ry, rz);
}

export function sdRoundBox(x, y, z, bx, by, bz, r) {
  const qx = abs(x) - bx + r, qy = abs(y) - by + r, qz = abs(z) - bz + r;
  const mx = max(qx, 0), my = max(qy, 0), mz = max(qz, 0);
  return sqrt(mx * mx + my * my + mz * mz) + min(max(qx, max(qy, qz)), 0) - r;
}

/** Kapsula između točaka a i b. */
export function sdCapsule(px, py, pz, ax, ay, az, bx, by, bz, r) {
  const pax = px - ax, pay = py - ay, paz = pz - az;
  const bax = bx - ax, bay = by - ay, baz = bz - az;
  let h = (pax * bax + pay * bay + paz * baz) / (bax * bax + bay * bay + baz * baz);
  h = h < 0 ? 0 : h > 1 ? 1 : h;
  const dx = pax - bax * h, dy = pay - bay * h, dz = paz - baz * h;
  return sqrt(dx * dx + dy * dy + dz * dz) - r;
}

/** Valjak duž osi Y, radijus r, polu-visina h, zaobljenje rub. */
export function sdCylinderY(x, y, z, r, h, round = 0) {
  const dx = sqrt(x * x + z * z) - r + round;
  const dy = abs(y) - h + round;
  const ox = max(dx, 0), oy = max(dy, 0);
  return min(max(dx, dy), 0) + sqrt(ox * ox + oy * oy) - round;
}

export function sdCylinderX(x, y, z, r, h, round = 0) {
  return sdCylinderY(y, x, z, r, h, round);
}

export function sdCylinderZ(x, y, z, r, h, round = 0) {
  return sdCylinderY(x, z, y, r, h, round);
}

/** Glatka unija (polinomska), k = širina prijelaza u cm. */
export function smin(a, b, k) {
  if (k <= 0) return min(a, b);
  const h = max(k - abs(a - b), 0) / k;
  return min(a, b) - h * h * k * 0.25;
}

export function smax(a, b, k) {
  return -smin(-a, -b, k);
}
