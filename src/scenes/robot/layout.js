// Zajednički raspored točaka spajanja vrata: ploča na dnu lubanje (prostor glave) i nosač u
// otvoru vrata na poprsju (prostor poprsja). Na njih se spajaju kralježnica, klipovi, crijevo
// grla, kabeli i grana tekućeg hlađenja — vrat i unutrašnjost čitaju iste točke.
//
// Dno lubanje (SDF): ravno na y = −8,69 za z −3..−8 (|x| ≤ 2,8), straga se diže (z −9,5: −8,1);
// kavez iznad njega na y −7,54 (unutarnja ploha). Ploča ide od unutrašnjosti ljuske (vrh
// skriven u lubanji) do ispod lubanje, u razini brade.

import * as THREE from 'three';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

// Ploča: tlocrt (x, z) zaobljen sprijeda (brada) i straga; visina od top do bottom.
export const SKULL_PLATE = { halfX: 2.75, z0: -9.2, z1: -2.9, cornerFront: 2.2, cornerBack: 1.0, top: -7.65, bottom: -10.6 };

export const SKULL_PORTS = {
  spine: V(0, SKULL_PLATE.bottom, -6.5),
  spineBearing: 1.62,
  hose: V(0, SKULL_PLATE.bottom, -3.82),
  // Ušice klipova: točka zgloba (svornjak).
  pistonFront: [V(-2.05, -11.3, -4.15), V(2.05, -11.3, -4.15)],
  pistonSide: [V(-3.55, -10.95, -6.3), V(3.55, -10.95, -6.3)],
  // Kabeli (desna strana; x se zrcali): dva na stražnjoj plohi (z = z0), debeli na bočnoj plohi —
  // poredani kao i njihovi priključci na trapezu (unutra → van), pa se ne križaju.
  cables: [
    { pos: V(0.52, -8.95, -9.2), dir: V(0.22, -0.32, -1) },
    { pos: V(1.42, -8.95, -9.2), dir: V(0.3, -0.32, -1) },
    { pos: V(2.75, -9.55, -7.55), dir: V(1, -0.32, -0.42) },
  ],
  // Grana hlađenja na stražnjoj plohi (dovod lijevo, povrat desno).
  coolant: [V(-0.5, -10.02, SKULL_PLATE.z0), V(0.5, -10.02, SKULL_PLATE.z0)],
  // Prolaz kroz dno kaveza: gornji priključci grane (u lubanji).
  bulkhead: [V(-0.5, -6.95, -8.65), V(0.5, -6.95, -8.65)],
};

// Nosač u otvoru vrata (poprsje): valjak koji sjedi u otvoru (dno otvora y −24,5).
export const NECK_BASE_MOUNT = { c: V(0, 0, -6.4), r: 4.15, top: -21.7, bottom: -24.7 };

export const BASE_PORTS = {
  spine: V(0, NECK_BASE_MOUNT.top, -6.5),
  hose: V(0, NECK_BASE_MOUNT.top, -3.6),
  pistonFront: [V(-2.35, -21.2, -3.1), V(2.35, -21.2, -3.1)],
  coolant: [V(-0.5, NECK_BASE_MOUNT.top, -9.55), V(0.5, NECK_BASE_MOUNT.top, -9.55)],
  // Prolazi kroz dno otvora vrata u unutrašnjost poprsja (donji priključci grane).
  coolantBottom: [V(-1.9, -26.0, -9.0), V(1.9, -26.0, -9.0)],
  // Kabeli na trapezu (x, z po strani; y i smjer se traže na površini poprsja).
  cables: [[4.6, -10.9], [5.9, -10.2], [7.2, -9.0]],
  // Bočni klipovi na trapezu.
  pistonSide: [[6.0, -6.6]],
};
