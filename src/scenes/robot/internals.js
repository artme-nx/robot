// Unutrašnjost robota — vidi se kad se paneli rastave (exploded view).
//
//   GLAVA (prostor glave, cm; ishodište između očiju, +z naprijed):
//     • matična ploča (vodoravna, y 1,05–1,2) s procesorom, vodenim blokom, čipovima s
//       nožicama, kondenzatorima, prigušnicama, bakrenim stazama koje slabo svijetle i
//       LED-icama koje nepravilno trepere;
//     • središnji žiroskop (tri ugniježđena prstena oko svjetleće jezgre) na jarmu iznad ploče;
//     • dvije turbine s urezima na bokovima (suprotni smjerovi, različite brzine) i
//       podatkovni bubanj s ručicom straga dolje;
//     • tekuće hlađenje: spremnik → pumpa → (lijeva sljepoočnica) → vodeni blok → hladnjak s
//       ventilatorom → (desna sljepoočnica) → spremnik; grana iz pumpe ide kroz dno lubanje niz
//       vrat do reaktora i natrag u spremnik. Cijevi uz sljepoočnice prolaze kroz procjep
//       panela, pa se sjaj tekućine vidi i kad je glava sklopljena;
//     • stražnja kućišta očiju s optičkim vlaknima (svjetlosni impulsi do procesora),
//       servo motori očiju i čeljusti s kabelima, govorni modul iza usta (zasebna grupa).
//   POPRSJE: reaktor sa segmentiranim prstenovima koji se vrte u suprotnim smjerovima,
//     kralježnica, servo motori ramena, gumene cijevi i cijevi hlađenja s konektorima.
//
// Svi kabeli i cijevi završavaju utikačem u priključku (connectors.js). Sve stoji unutar
// kaveza (provjera: fitReport/cableReport u robotScene); kretanje i strujanje rastu s
// rastavljanjem.

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { EYE_X, CORE_CENTER, headSolid, robotHeadModel } from '../../geometry/robotModels.js';
import { Cable, connectorShadows } from './connectors.js';
import { SKULL_PORTS, BASE_PORTS } from './layout.js';
import { FLUID_ORANGE, FLUID_CYAN, fluidUniforms, fluidMaterial, glassMaterial, buildReservoir, buildPump, buildWaterBlock, buildRadiator } from './cooling.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const UP = V(0, 1, 0);

// ---------------------------------------------------------------- raspored (prostor glave)
export const HEAD_LAYOUT = {
  board: { x: 2.7, y0: 1.05, y1: 1.2, z0: -12.4, z1: -6.6 },
  gyro: V(0, 3.45, -8.4), // središte; prsteni 2,05 / 1,6 / 1,18, jezgra 0,5
  gyroR: [2.05, 1.6, 1.18],
  cpu: V(0, 1.2, -11.35),
  radiator: V(0, 4.8, -11.85),
  turbine: V(3.5, 3.0, -10.9), // ±x
  drum: V(0, -3.15, -10.25),
  pump: V(-1.9, -4.4, -7.6),
  reservoir: V(1.9, -4.5, -7.6),
  eyeBack: { z0: -4.5, z1: -5.85, r: 1.02 },
  speech: V(0, -6.1, -2.2),
};
const L = HEAD_LAYOUT;

// Putanja procjepa na sljepoočnici (desna strana; x se zrcali): 0,3 cm ispod površine panela,
// između kaveza i panela, od donjeg do gornjeg prozora kaveza (izračunato iz SDF-a glave).
const TEMPLE_PATH = [
  [5.2, -3.49, -3.54],
  [5.24, -2.98, -3.56],
  [5.27, -2.49, -3.57],
  [5.24, -1.55, -3.66],
  [5.1, -0.54, -3.83],
  [5.06, 0.55, -3.74],
  [5.14, 1.56, -3.31],
  [5.04, 2.46, -3.04],
  [4.92, 2.96, -2.93],
];

// ---------------------------------------------------------------- pomoćne funkcije
/** Visina unutarnje plohe dna kaveza glave (h = −1,15) ispod točke (x, z). */
function floorY(x, z, from = 0) {
  let lo = -10, hi = from; // headSolid(hi) + 1.15 < 0 (unutra), lo je ispod dna
  for (let i = 0; i < 40; i++) {
    const m = (lo + hi) / 2;
    if (headSolid(x, m, z) + 1.15 < 0) hi = m;
    else lo = m;
  }
  return hi;
}
/** Najviše dno ispod pravokutnika (da podloga nigdje ne uđe u kavez). */
const floorUnder = (x0, x1, z0, z1) => Math.max(...[[x0, z0], [x1, z0], [x0, z1], [x1, z1], [(x0 + x1) / 2, (z0 + z1) / 2]].map(([x, z]) => floorY(x, z)));
const nonIndexed = (g) => {
  const n = g.index ? g.toNonIndexed() : g;
  for (const k of Object.keys(n.attributes)) if (!['position', 'normal', 'uv'].includes(k)) n.deleteAttribute(k);
  if (!n.attributes.uv) n.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n.attributes.position.count * 2), 2));
  return n;
};
const mergeAll = (geos) => mergeGeometries(geos.map(nonIndexed), false);

/** Skupljač statičnih geometrija po materijalu → jedna mreža po materijalu (manje poziva crtanja). */
class Batch {
  constructor() {
    this.map = new Map();
  }
  add(mat, geo) {
    if (!this.map.has(mat)) this.map.set(mat, []);
    this.map.get(mat).push(geo);
    return geo;
  }
  build(parent, { cast = true } = {}) {
    for (const [mat, geos] of this.map) {
      const m = new THREE.Mesh(mergeAll(geos), mat);
      m.castShadow = cast;
      m.receiveShadow = true;
      parent.add(m);
    }
    this.map.clear();
  }
}

/** Valjak između dvije točke. */
/**
 * Spoji statične mreže ispod `root` po materijalu u jednu mrežu po materijalu (prostor root).
 * Preskače pokretne grupe (isDynamic), instancirane, prozirne, shader i višematerijalne mreže.
 */
function mergeStatic(root, isDynamic = () => false) {
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const byMat = new Map();
  const remove = [];
  root.traverse((o) => {
    if (!o.isMesh || o.isInstancedMesh || o === root) return;
    for (let x = o; x && x !== root; x = x.parent) if (isDynamic(x)) return;
    const m = o.material;
    if (Array.isArray(m) || m.isShaderMaterial || m.transparent || o.renderOrder || o.userData.keep) return;
    const g = nonIndexed(o.geometry.clone()).applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld));
    if (!byMat.has(m)) byMat.set(m, []);
    byMat.get(m).push(g);
    remove.push(o);
  });
  for (const o of remove) o.removeFromParent();
  for (const [mat, geos] of byMat) {
    const mesh = new THREE.Mesh(mergeAll(geos), mat);
    mesh.receiveShadow = true;
    root.add(mesh);
  }
}

function rod(a, b, r, seg = 14) {
  const len = a.distanceTo(b);
  const g = new THREE.CylinderGeometry(r, r, len, seg);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, b.clone().sub(a).normalize()));
  const m = a.clone().add(b).multiplyScalar(0.5);
  return g.translate(m.x, m.y, m.z);
}

/** Valjak duž osi sa središtem c. */
function cyl(c, r, len, axis = 'y', seg = 28, r2 = r) {
  const g = new THREE.CylinderGeometry(r2, r, len, seg);
  if (axis === 'x') g.rotateZ(-Math.PI / 2);
  if (axis === 'z') g.rotateX(Math.PI / 2);
  return g.translate(c.x, c.y, c.z);
}

const box = (c, sx, sy, sz, rad = 0) => (rad > 0 ? new RoundedBoxGeometry(sx, sy, sz, 2, rad) : new THREE.BoxGeometry(sx, sy, sz)).translate(c.x, c.y, c.z);

/** Prsten (anulus u ravnini xy) s izrezima; opcionalno nazubljen vanjski rub. */
function slottedRing(R, w, thick, { slots = 12, teeth = 0, slotFrac = 0.55 } = {}) {
  const s = new THREE.Shape();
  if (teeth) {
    for (let i = 0; i <= teeth * 4; i++) {
      const a = (i / (teeth * 4)) * Math.PI * 2;
      const r = i % 4 < 2 ? R : R - 0.07;
      if (i === 0) s.moveTo(Math.cos(a) * r, Math.sin(a) * r);
      else s.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
  } else {
    s.absarc(0, 0, R, 0, Math.PI * 2, false);
  }
  const inner = new THREE.Path();
  inner.absarc(0, 0, R - w, 0, Math.PI * 2, true);
  s.holes.push(inner);
  const r0 = R - w * 0.78, r1 = R - w * 0.3 - (teeth ? 0.06 : 0);
  for (let i = 0; i < slots; i++) {
    const a0 = (i / slots) * Math.PI * 2 + 0.08, a1 = a0 + ((Math.PI * 2) / slots) * slotFrac;
    const h = new THREE.Path();
    h.absarc(0, 0, r1, a0, a1, false);
    h.absarc(0, 0, r0, a1, a0, true);
    h.closePath();
    s.holes.push(h);
  }
  const g = new THREE.ExtrudeGeometry(s, { depth: thick, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.02, bevelSegments: 1, curveSegments: 64 });
  return g.translate(0, 0, -thick / 2);
}

/** Disk s radijalnim urezima (os z). */
function notchedDisk(R, thick, { notches = 10, hole = 0.18, slot = [0.35, 0.82] } = {}) {
  const s = new THREE.Shape();
  s.absarc(0, 0, R, 0, Math.PI * 2, false);
  const c = new THREE.Path();
  c.absarc(0, 0, hole, 0, Math.PI * 2, true);
  s.holes.push(c);
  for (let i = 0; i < notches; i++) {
    const a = (i / notches) * Math.PI * 2;
    const da = (Math.PI * 2) / notches * 0.28;
    const h = new THREE.Path();
    h.absarc(0, 0, R * slot[1], a - da, a + da, false);
    h.absarc(0, 0, R * slot[0], a + da * 0.6, a - da * 0.6, true);
    h.closePath();
    s.holes.push(h);
  }
  const g = new THREE.ExtrudeGeometry(s, { depth: thick, bevelEnabled: true, bevelThickness: 0.015, bevelSize: 0.015, bevelSegments: 1, curveSegments: 48 });
  return g.translate(0, 0, -thick / 2);
}

/** Zupčanik (os y). */
function gear(r, thick, teeth = 18) {
  const s = new THREE.Shape();
  for (let i = 0; i < teeth * 2; i++) {
    const a = (i / (teeth * 2)) * Math.PI * 2;
    const rr = i % 2 ? r : r * 0.86;
    if (i === 0) s.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
    else s.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  s.closePath();
  const hole = new THREE.Path();
  hole.absarc(0, 0, r * 0.28, 0, Math.PI * 2, true);
  s.holes.push(hole);
  const g = new THREE.ExtrudeGeometry(s, { depth: thick, bevelEnabled: true, bevelThickness: thick * 0.15, bevelSize: thick * 0.15, bevelSegments: 1, curveSegments: 4 });
  return g.translate(0, 0, -thick / 2).rotateX(Math.PI / 2);
}

function instanced(geo, mat, matrices) {
  const im = new THREE.InstancedMesh(geo, mat, matrices.length);
  matrices.forEach((m, i) => im.setMatrixAt(i, m));
  im.instanceMatrix.needsUpdate = true;
  return im;
}
const _m4 = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const compose = (p, q = _q.identity(), s = V(1, 1, 1)) => new THREE.Matrix4().compose(p, q, s);

// ---------------------------------------------------------------- teksture
/** Tiskana ploča: tamna lemna maska, bakrene staze, vije, oznake. Vraća map i emissiveMap (staze). */
function pcbTextures({ W = 1024, H = 1100, board, parts }) {
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const e = document.createElement('canvas');
  e.width = W;
  e.height = H;
  const g = c.getContext('2d');
  const ge = e.getContext('2d');
  // Koordinate ploče (x, z) → piksel. Gornji red kanvasa = stražnji rub (z0).
  const px = (x) => ((x + board.x) / (2 * board.x)) * W;
  const pz = (z) => ((z - board.z0) / (board.z1 - board.z0)) * H;
  g.fillStyle = '#0b1915';
  g.fillRect(0, 0, W, H);
  // Blaga varijacija maske.
  for (let i = 0; i < 2600; i++) {
    g.fillStyle = `rgba(${20 + Math.random() * 20},${40 + Math.random() * 30},${34 + Math.random() * 20},0.08)`;
    g.fillRect(Math.random() * W, Math.random() * H, 3 + Math.random() * 14, 3 + Math.random() * 14);
  }
  ge.fillStyle = '#000';
  ge.fillRect(0, 0, W, H);
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const copper = '#b5733e';
  const trace = (pts, w, glow = 1) => {
    for (const [ctx, col] of [[g, copper], [ge, `rgba(255,255,255,${glow})`]]) {
      ctx.strokeStyle = col;
      ctx.lineWidth = w;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.beginPath();
      pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.stroke();
    }
  };
  const via = (x, y, r = 5) => {
    for (const [ctx, col] of [[g, '#d39a62'], [ge, 'rgba(255,255,255,0.8)']]) {
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    g.fillStyle = '#0b0b0b';
    g.beginPath();
    g.arc(x, y, r * 0.45, 0, Math.PI * 2);
    g.fill();
  };
  // Sabirnica: paralelne staze s lomom pod 45° od točke a do točke b.
  const bus = (a, b, n, gap = 9, w = 3) => {
    const [ax, ay] = a, [bx, by] = b;
    for (let i = 0; i < n; i++) {
      const o = (i - (n - 1) / 2) * gap;
      const dx = bx - ax, dy = by - ay;
      const diag = Math.min(Math.abs(dx), Math.abs(dy));
      const mx = ax + o, my = ay + o * 0.0;
      const p1 = [mx, my + Math.sign(dy) * (Math.abs(dy) - diag) * 0.5];
      const p2 = [p1[0] + Math.sign(dx) * diag, p1[1] + Math.sign(dy) * diag];
      trace([[mx, ay], p1, p2, [bx + o, p2[1]], [bx + o, by]], w, 0.85);
      via(bx + o, by, 3.5);
    }
  };
  const cpu = [px(parts.cpu.x), pz(parts.cpu.z)];
  for (const [x, z] of parts.chips) bus(cpu, [px(x), pz(z)], 6, 10, 3);
  for (const [x, z] of parts.sockets) bus([px(x * 0.6), pz(parts.cpu.z + 1.2)], [px(x), pz(z)], 3, 8, 2.5);
  // Prsten indukcijske podloge ispod žiroskopa.
  const gy = [px(parts.gyro.x), pz(parts.gyro.z)];
  for (const [r, w] of [[0.98, 7], [0.82, 3], [0.6, 3]]) {
    for (const [ctx, col] of [[g, copper], [ge, '#fff']]) {
      ctx.strokeStyle = col;
      ctx.lineWidth = w;
      ctx.beginPath();
      ctx.arc(gy[0], gy[1], (r / (2 * board.x)) * W, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    const r0 = (0.98 / (2 * board.x)) * W, r1 = (1.25 / (2 * board.x)) * W;
    trace([[gy[0] + Math.cos(a) * r0, gy[1] + Math.sin(a) * r0], [gy[0] + Math.cos(a) * r1, gy[1] + Math.sin(a) * r1]], 2.5, 0.7);
  }
  // Nasumične staze (Manhattan + 45°) i vije po cijeloj ploči.
  for (let i = 0; i < 140; i++) {
    let x = rnd() * W, y = rnd() * H;
    const pts = [[x, y]];
    for (let k = 0; k < 4; k++) {
      const d = 30 + rnd() * 120;
      const dir = Math.floor(rnd() * 8);
      const a = (dir / 8) * Math.PI * 2;
      x += Math.round(Math.cos(a)) * d;
      y += Math.round(Math.sin(a)) * d;
      pts.push([x, y]);
    }
    trace(pts, 1.5 + rnd() * 2.2, 0.35 + rnd() * 0.4);
    via(x, y, 3 + rnd() * 2);
  }
  // Natpisi (sitotisak).
  g.fillStyle = 'rgba(235,240,236,0.82)';
  g.font = '600 26px "Barlow Condensed", sans-serif';
  if ('letterSpacing' in g) g.letterSpacing = '3px';
  g.fillText('NX-07  NEURAL BUS  REV C', 40, H - 34);
  g.font = '500 20px "Barlow Condensed", sans-serif';
  const labels = [['U1', cpu[0] - 150, cpu[1] - 120], ['GYRO-3', gy[0] + 120, gy[1] - 140], ['J4 OPT', 60, H - 90], ['J5 OPT', W - 150, H - 90], ['VRM', cpu[0] + 150, cpu[1] + 150], ['C47', 70, 300], ['L2', W - 90, 420]];
  for (const [t, x, y] of labels) g.fillText(t, x, y);
  // Rubna linija (uzemljenje).
  for (const [ctx, col] of [[g, copper], [ge, 'rgba(255,255,255,0.5)']]) {
    ctx.strokeStyle = col;
    ctx.lineWidth = 6;
    ctx.strokeRect(14, 14, W - 28, H - 28);
  }
  const map = new THREE.CanvasTexture(c);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 8;
  const emissiveMap = new THREE.CanvasTexture(e);
  emissiveMap.anisotropy = 8;
  return { map, emissiveMap };
}

/** Mala oznaka (bijeli tekst na prozirnom). */
function labelTexture(lines, { w = 256, h = 128, size = 34 } = {}) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(225,228,232,0.9)';
  g.textBaseline = 'middle';
  lines.forEach((t, i) => {
    g.font = `${i ? 500 : 600} ${i ? size * 0.62 : size}px "Barlow Condensed", sans-serif`;
    if ('letterSpacing' in g) g.letterSpacing = i ? '2px' : '4px';
    g.fillText(t, 10, (h / (lines.length + 0.4)) * (i + 0.75));
  });
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/** Natpis na maloj pločici (ravnina okrenuta prema +z), za dijelove. */
function plate(text, w, h, { size = 40, sub = null, color = '#c9ced4' } = {}) {
  const tex = labelTexture(sub ? [text, sub] : [text], { w: 256, h: Math.round((256 * h) / w), size });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false, color }));
  m.renderOrder = 3;
  return m;
}

/**
 * Zakovice po trakama kaveza glave (sagitalna, ekvator, gornji prsten, koronalni luk): točke na
 * vanjskoj plohi kaveza (h = −0,55) gdje je kavez pun, okrenute po normali.
 */
function cageRivets(M) {
  const cand = [];
  const ring = (fn, n) => {
    for (let i = 0; i < n; i++) cand.push(fn((i + 0.5) / n));
  };
  // Sagitalna traka (dva reda), luk preko glave od čela do zatiljka.
  for (const x of [-0.5, 0.5]) ring((t) => { const a = -0.2 + t * 3.3; return V(x, 2.7 + Math.cos(a) * 9, -7.5 + Math.sin(a) * 9.3); }, 30);
  // Ekvator (y ≈ 0,25) i gornji prsten (y ≈ 6) — dva reda svaki, oko glave.
  for (const y of [-0.42, 0.92, 5.6, 6.4]) ring((t) => { const a = t * Math.PI * 2; return V(Math.sin(a) * 8, y, -7.5 + Math.cos(a) * 9); }, 44);
  // Koronalni luk (z ≈ −7,6).
  for (const z of [-7.05, -8.15]) ring((t) => { const a = Math.PI * (0.08 + t * 0.84); return V(Math.cos(a) * 8, 2.7 + Math.sin(a) * 9, z); }, 26);
  const model = robotHeadModel();
  const out = new Float32Array(8);
  const e = 0.02;
  const mats = [];
  for (const p of cand) {
    // Projekcija na plohu h = −0,55 (vanjska ploha kaveza) duž gradijenta.
    for (let k = 0; k < 12; k++) {
      const h = headSolid(p.x, p.y, p.z) + 0.55;
      const g = V(headSolid(p.x + e, p.y, p.z) - headSolid(p.x - e, p.y, p.z), headSolid(p.x, p.y + e, p.z) - headSolid(p.x, p.y - e, p.z), headSolid(p.x, p.y, p.z + e) - headSolid(p.x, p.y, p.z - e)).divideScalar(2 * e);
      p.addScaledVector(g, -h / Math.max(1e-4, g.lengthSq()));
    }
    const n = V(headSolid(p.x + e, p.y, p.z) - headSolid(p.x - e, p.y, p.z), headSolid(p.x, p.y + e, p.z) - headSolid(p.x, p.y - e, p.z), headSolid(p.x, p.y, p.z + e) - headSolid(p.x, p.y, p.z - e)).normalize();
    // Samo gdje je kavez pun i daleko od ruba prozora.
    const q = p.clone().addScaledVector(n, -0.3);
    model.eval(q.x, q.y, q.z, out);
    if (!(out[5] < -0.12) || Math.abs(headSolid(p.x, p.y, p.z) + 0.55) > 0.03) continue;
    mats.push(compose(p.clone().addScaledVector(n, 0.015), new THREE.Quaternion().setFromUnitVectors(UP, n)));
  }
  const im = instanced(new THREE.CylinderGeometry(0.075, 0.095, 0.08, 6), M.titanium, mats);
  im.name = 'zakovice kaveza';
  im.receiveShadow = true;
  return im;
}

// ---------------------------------------------------------------- shaderi
/** Optičko vlakno: tamna jezgra kroz koju putuju svjetlosni impulsi (od oka prema procesoru). */
function pulseMaterial(shared) {
  return new THREE.ShaderMaterial({
    uniforms: { time: shared.time, color: shared.pulseColor, k: shared.pulseK, len: { value: 1 } },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform float time; uniform vec3 color; uniform float k; uniform float len;
      varying vec2 vUv;
      float h1(float n) { return fract(sin(n) * 43758.5453); }
      void main() {
        float s = vUv.x * len;
        // Impulsi idu od kraja A (oko) prema B (procesor), u nepravilnim paketima.
        float x = s - time * 9.0;
        float cell = floor(x / 1.6);
        float on = step(0.35, h1(cell * 3.7 + 1.0));
        float p = fract(x / 1.6);
        float pulse = on * exp(-pow((p - 0.5) * 7.0, 2.0));
        vec3 col = color * (0.12 + 3.2 * pulse * k);
        gl_FragColor = vec4(col, 1.0);
      }`,
    toneMapped: false,
  });
}

// ---------------------------------------------------------------- glava
function buildHead(M, mats, shared, { lite }) {
  const head = new THREE.Group();
  head.name = 'headInternals';
  const glowObjects = [];
  const anim = [];
  const parts = {};
  const batch = new Batch();

  // ------------------ matična ploča
  const B = L.board;
  const boardGroup = new THREE.Group();
  boardGroup.name = 'motherboard';
  const bw = B.x * 2, bd = B.z1 - B.z0, bt = B.y1 - B.y0;
  const chips = [[-1.75, -8.0], [1.75, -8.0], [-1.75, -9.3], [1.75, -9.3]];
  const optSockets = [[-1.7, -7.05], [1.7, -7.05]];
  const tex = pcbTextures({ board: B, parts: { cpu: L.cpu, gyro: L.gyro, chips, sockets: optSockets } });
  mats.pcb = new THREE.MeshStandardMaterial({ map: tex.map, emissiveMap: tex.emissiveMap, emissive: new THREE.Color('#ff7a2e'), emissiveIntensity: 0.25, metalness: 0.35, roughness: 0.42 });
  mats.pcb.userData.darkEnv = true;
  const boardGeo = new THREE.BoxGeometry(bw, bt, bd);
  const board = new THREE.Mesh(boardGeo, [mats.pcbEdge, mats.pcbEdge, mats.pcb, mats.pcbEdge, mats.pcbEdge, mats.pcbEdge]);
  board.position.set(0, (B.y0 + B.y1) / 2, (B.z0 + B.z1) / 2);
  board.castShadow = board.receiveShadow = true;
  boardGroup.add(board);
  const top = B.y1;
  // Procesor (podloga + metalni poklopac), vodeni blok dolazi na njega.
  batch.add(mats.substrate, box(V(L.cpu.x, top + 0.04, L.cpu.z), 2.3, 0.08, 2.05));
  batch.add(M.chrome, box(V(L.cpu.x, top + 0.1, L.cpu.z), 1.7, 0.06, 1.6));
  // Memorijski/neuronski čipovi s nožicama i oznakama.
  const pins = [];
  const chipLabel = new THREE.MeshBasicMaterial({ map: labelTexture(['NX-N7', 'NEURAL 2048']), transparent: true, depthWrite: false, toneMapped: false, color: '#9aa1a8' });
  for (const [x, z] of chips) {
    batch.add(mats.chip, box(V(x, top + 0.06, z), 1.0, 0.1, 0.72, 0.02));
    for (let i = 0; i < 9; i++) {
      for (const s of [-1, 1]) pins.push(compose(V(x - 0.4 + i * 0.1, top + 0.03, z + s * 0.4)));
    }
    const lbl = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.4).rotateX(-Math.PI / 2), chipLabel);
    lbl.position.set(x, top + 0.112, z);
    boardGroup.add(lbl);
  }
  // Napajanje (VRM): niz malih čipova i prigušnica uz procesor, kondenzatori uz rubove.
  for (let i = 0; i < 6; i++) {
    const x = -1.25 + i * 0.5;
    batch.add(mats.chip, box(V(x, top + 0.05, -10.05), 0.34, 0.08, 0.28, 0.02));
    for (let k = 0; k < 4; k++) for (const s of [-1, 1]) pins.push(compose(V(x - 0.12 + k * 0.08, top + 0.025, -10.05 + s * 0.16)));
  }
  if (!lite) {
    for (const sx of [-1, 1]) for (const z of [-10.75, -11.95]) batch.add(mats.ferrite, box(V(sx * 1.62, top + 0.17, z), 0.4, 0.34, 0.4, 0.05));
  }
  const pinMesh = instanced(new THREE.BoxGeometry(0.035, 0.05, 0.09), M.chrome, pins);
  boardGroup.add(pinMesh);
  const caps = [];
  const capSpots = [];
  for (const sx of [-1, 1]) {
    for (let i = 0; i < (lite ? 2 : 4); i++) capSpots.push(V(sx * 2.38, top, -7.0 - i * 0.92));
    capSpots.push(V(sx * 0.95, top, -12.15), V(sx * 2.25, top, -12.15));
  }
  for (const p of capSpots) {
    caps.push(compose(V(p.x, p.y + 0.19, p.z)));
  }
  boardGroup.add(instanced(new THREE.CylinderGeometry(0.14, 0.14, 0.38, 16), mats.capSleeve, caps));
  boardGroup.add(instanced(new THREE.CylinderGeometry(0.125, 0.125, 0.02, 16).translate(0, 0.2, 0), M.chrome, caps));
  // LED-ice: nepravilno trepere (boja po instanci).
  const ledSpots = [];
  for (let i = 0; i < 8; i++) ledSpots.push(V(-2.1 + i * 0.6, top + 0.03, -6.78));
  for (const [x, z] of chips) ledSpots.push(V(x + 0.62, top + 0.03, z + 0.2), V(x + 0.62, top + 0.03, z - 0.2));
  ledSpots.push(V(-1.05, top + 0.03, -12.22), V(1.05, top + 0.03, -12.22), V(0, top + 0.03, -10.45));
  const leds = new THREE.InstancedMesh(new THREE.BoxGeometry(0.11, 0.05, 0.07), mats.led, ledSpots.length);
  ledSpots.forEach((p, i) => {
    leds.setMatrixAt(i, compose(p));
    leds.setColorAt(i, new THREE.Color(0));
  });
  boardGroup.add(leds);
  glowObjects.push(leds);
  const ledState = ledSpots.map((p, i) => ({ phase: Math.random() * 10, rate: 0.6 + Math.random() * 3.5, kind: i % 5 === 0 ? 'warn' : i % 3 === 0 ? 'data' : 'eye', on: 0 }));
  // Odstojnici (straga do dna kaveza) i prednji most između kućišta očiju.
  for (const sx of [-1, 1]) {
    const fy = floorUnder(sx * 1.8 - 0.3, sx * 1.8 + 0.3, -12.2, -11.6) + 0.08;
    batch.add(M.titanium, rod(V(sx * 1.8, B.y0, -11.9), V(sx * 1.8, fy, -11.9), 0.13));
    batch.add(M.graphite, cyl(V(sx * 1.8, fy, -11.9), 0.3, 0.14, 'y', 20));
    batch.add(M.chrome, cyl(V(sx * 1.8, B.y1 + 0.03, -11.9), 0.16, 0.06, 'y', 6));
  }
  batch.add(M.titanium, box(V(0, 0.85, -6.85), 4.6, 0.32, 0.36, 0.06));
  for (const sx of [-1, 1]) batch.add(M.titanium, box(V(sx * 2.5, 0.55, -6.3), 0.32, 0.5, 1.0, 0.06));
  head.add(boardGroup);
  parts.board = boardGroup;

  // ------------------ žiroskop na jarmu
  const G = L.gyro;
  const gyro = new THREE.Group();
  gyro.name = 'gyroscope';
  gyro.position.copy(G);
  const [R0, R1, R2] = L.gyroR;
  const outer = new THREE.Group();
  const middle = new THREE.Group();
  const inner = new THREE.Group();
  const core = new THREE.Group();
  outer.add(new THREE.Mesh(slottedRing(R0, 0.26, 0.13, { slots: 16 }), M.titanium));
  middle.add(new THREE.Mesh(slottedRing(R1, 0.22, 0.12, { slots: 10, teeth: 56 }), M.anodized));
  inner.add(new THREE.Mesh(slottedRing(R2, 0.2, 0.11, { slots: 6, slotFrac: 0.4 }), M.chrome));
  for (const r of [outer, middle, inner]) r.children[0].castShadow = r.children[0].receiveShadow = true;
  // Osovine: jaram↔vanjski (x), vanjski↔srednji (y), srednji↔unutarnji (x), unutarnji↔jezgra (y).
  const axle = (a, b, r = 0.075) => new THREE.Mesh(rod(a, b, r, 10), M.chrome);
  outer.add(axle(V(-R0 - 0.3, 0, 0), V(-R0 + 0.12, 0, 0), 0.09), axle(V(R0 - 0.12, 0, 0), V(R0 + 0.3, 0, 0), 0.09));
  outer.add(axle(V(0, -R0 + 0.15, 0), V(0, -R1 + 0.1, 0)), axle(V(0, R1 - 0.1, 0), V(0, R0 - 0.15, 0)));
  middle.add(axle(V(-R1 + 0.12, 0, 0), V(-R2 + 0.1, 0, 0), 0.065), axle(V(R2 - 0.1, 0, 0), V(R1 - 0.12, 0, 0), 0.065));
  inner.add(axle(V(0, -R2 + 0.12, 0), V(0, -0.5, 0), 0.055), axle(V(0, 0.5, 0), V(0, R2 - 0.12, 0), 0.055));
  // Ležajne čahure na spojevima.
  const bushGeo = new THREE.CylinderGeometry(0.13, 0.13, 0.2, 14);
  for (const [grp, pts, ax] of [[outer, [V(0, R0 - 0.13, 0), V(0, -R0 + 0.13, 0)], 'y'], [middle, [V(R1 - 0.11, 0, 0), V(-R1 + 0.11, 0, 0)], 'x']]) {
    for (const p of pts) {
      const b = new THREE.Mesh(bushGeo, M.graphite);
      b.position.copy(p);
      if (ax === 'x') b.rotation.z = Math.PI / 2;
      grp.add(b);
    }
  }
  // Svjetleće oznake na vanjskom prstenu (obje strane).
  const ticks = [];
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    for (const s of [-1, 1]) ticks.push(compose(V(Math.cos(a) * (R0 - 0.08), Math.sin(a) * (R0 - 0.08), s * 0.072), new THREE.Quaternion().setFromAxisAngle(V(0, 0, 1), a)));
  }
  const tickMesh = instanced(new THREE.BoxGeometry(0.1, 0.028, 0.012), mats.glow, ticks);
  outer.add(tickMesh);
  glowObjects.push(tickMesh);
  // Jezgra: svjetleća kugla u žičanom kavezu i prsten oko nje.
  const coreSphere = new THREE.Mesh(new THREE.IcosahedronGeometry(0.42, 3), mats.coreGlow);
  const coreCage = new THREE.Mesh(new THREE.IcosahedronGeometry(0.56, 1), mats.coreWire);
  const coreBand = new THREE.Mesh(new THREE.TorusGeometry(0.6, 0.035, 8, 48), M.chrome);
  core.add(coreSphere, coreCage, coreBand);
  glowObjects.push(coreSphere, coreCage);
  inner.add(core);
  middle.add(inner);
  outer.add(middle);
  gyro.add(outer);
  // Jaram: dva stupa s ploče do osovina vanjskog prstena.
  for (const sx of [-1, 1]) {
    const x = sx * (R0 + 0.42);
    batch.add(M.anodized, box(V(x, (top + G.y) / 2 + 0.1, G.z), 0.24, G.y - top + 0.5, 0.62, 0.06));
    batch.add(M.graphite, box(V(x, top + 0.06, G.z), 0.62, 0.12, 0.95, 0.04));
    batch.add(M.chrome, cyl(V(x - sx * 0.13, G.y, G.z), 0.27, 0.18, 'x', 24));
  }
  head.add(gyro);
  parts.gyro = { group: gyro, outer, middle, inner, core };
  // Svjetlo jezgre (osvjetljava ploču i prstene iznutra).
  const gyroLight = new THREE.PointLight('#79e6ff', 0, 10, 2);
  gyroLight.position.copy(G);

  // ------------------ turbine na bokovima
  const turbines = [];
  for (const sx of [-1, 1]) {
    const T = new THREE.Group();
    T.name = `turbine${sx < 0 ? 'L' : 'R'}`;
    T.position.set(sx * L.turbine.x, L.turbine.y, L.turbine.z);
    const disk = new THREE.Mesh(notchedDisk(1.1, 0.14, { notches: 10 }).rotateY(Math.PI / 2), M.titanium);
    disk.castShadow = true;
    const blades = [];
    for (let i = 0; i < 14; i++) {
      const b = new THREE.BoxGeometry(0.1, 0.55, 0.035).translate(0, 0.48, 0);
      b.rotateY(0.5).rotateX((i / 14) * Math.PI * 2);
      blades.push(b);
    }
    blades.push(new THREE.CylinderGeometry(0.25, 0.25, 0.14, 24).rotateZ(Math.PI / 2));
    blades.push(new THREE.TorusGeometry(0.76, 0.04, 8, 48).rotateY(Math.PI / 2));
    const rotorB = new THREE.Mesh(mergeAll(blades), M.anodized);
    rotorB.position.x = sx * 0.24;
    const spinA = new THREE.Group();
    spinA.add(disk);
    // Svjetleće točke na disku (vide se kao trag pri vrtnji).
    const dots = [];
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + 0.3;
      dots.push(compose(V(sx * 0.08, Math.cos(a) * 0.96, Math.sin(a) * 0.96)));
    }
    const dotMesh = instanced(new THREE.BoxGeometry(0.02, 0.06, 0.06), mats.glow, dots);
    spinA.add(dotMesh);
    glowObjects.push(dotMesh);
    const spinB = new THREE.Group();
    spinB.add(rotorB);
    const hubCap = new THREE.Mesh(cyl(V(sx * 0.34, 0, 0), 0.16, 0.08, 'x', 20), M.chrome);
    spinB.add(hubCap);
    // Pogonski motor (unutra) i nosač prema ploči.
    const pod = new THREE.Group();
    pod.add(new THREE.Mesh(cyl(V(-sx * 0.3, 0, 0), 0.42, 0.36, 'x', 28), mats.housing));
    pod.add(new THREE.Mesh(cyl(V(-sx * 0.1, 0, 0), 0.3, 0.06, 'x', 28), M.chrome));
    pod.add(new THREE.Mesh(rod(V(-sx * 0.3, -0.2, -0.3), V(-sx * 0.95, top - L.turbine.y + 0.05, -0.95), 0.08, 10), M.titanium));
    pod.add(new THREE.Mesh(rod(V(-sx * 0.3, -0.2, 0.3), V(-sx * 0.95, top - L.turbine.y + 0.05, 0.6), 0.08, 10), M.titanium));
    pod.add(new THREE.Mesh(cyl(V(-sx * 0.95, top - L.turbine.y + 0.04, -0.95), 0.16, 0.08, 'y', 12), M.graphite), new THREE.Mesh(cyl(V(-sx * 0.95, top - L.turbine.y + 0.04, 0.6), 0.16, 0.08, 'y', 12), M.graphite));
    for (const m of pod.children) m.castShadow = true;
    T.add(spinA, spinB, pod);
    head.add(T);
    turbines.push({ group: T, spinA, spinB, sx, base: T.position.clone() });
  }
  parts.turbines = turbines;

  // ------------------ podatkovni bubanj straga dolje (dva diska, suprotna vrtnja, ručica)
  const D = L.drum;
  const drum = new THREE.Group();
  drum.name = 'dataDrum';
  drum.position.copy(D);
  const platter = new THREE.Mesh(notchedDisk(1.12, 0.08, { notches: 24, hole: 0.16, slot: [0.88, 0.97] }).rotateX(-Math.PI / 2), mats.mirror);
  platter.position.y = 0.2;
  const platter2 = new THREE.Mesh(notchedDisk(0.86, 0.1, { notches: 8, hole: 0.16 }).rotateX(-Math.PI / 2), M.titanium);
  platter2.position.y = -0.2;
  for (const m of [platter, platter2]) m.castShadow = true;
  const arm = new THREE.Group();
  arm.position.set(1.05, 0.34, 0.75);
  arm.add(new THREE.Mesh(box(V(-0.45, 0, -0.32), 1.05, 0.04, 0.12).rotateY(0.6), M.chrome));
  arm.add(new THREE.Mesh(cyl(V(0, -0.1, 0), 0.14, 0.32, 'y', 18), mats.housing));
  drum.add(platter, platter2, arm);
  batch.add(M.chrome, rod(V(D.x, D.y - 0.45, D.z), V(D.x, B.y0, D.z), 0.12));
  const drumFloor = floorUnder(D.x - 0.42, D.x + 0.42, D.z - 0.42, D.z + 0.42) + 0.08;
  batch.add(M.titanium, rod(V(D.x, drumFloor, D.z), V(D.x, D.y - 0.95, D.z), 0.18));
  batch.add(M.graphite, cyl(V(D.x, drumFloor, D.z), 0.42, 0.14, 'y', 24));
  batch.add(M.graphite, cyl(V(D.x, D.y, D.z), 0.2, 0.5, 'y', 18));
  batch.add(mats.housing, cyl(V(D.x, D.y - 0.75, D.z), 0.36, 0.5, 'y', 28));
  batch.add(M.chrome, cyl(V(D.x, D.y - 0.48, D.z), 0.3, 0.05, 'y', 28));
  batch.add(mats.housing, cyl(V(D.x + 1.05, D.y + 0.05, D.z + 0.75), 0.11, 0.62, 'y', 12));
  head.add(drum);
  parts.drum = { group: drum, platter, platter2, arm };

  // ------------------ hlađenje: spremnik, pumpa, vodeni blok, hladnjak
  const reservoir = buildReservoir(M, shared, { r: 0.6, h: 2.2, lite });
  reservoir.group.position.copy(L.reservoir);
  const pump = buildPump(M, shared);
  pump.group.position.copy(L.pump);
  const wb = buildWaterBlock(M, shared);
  wb.group.position.set(L.cpu.x, top + 0.13, L.cpu.z);
  const radiator = buildRadiator(M, { lite });
  radiator.group.position.copy(L.radiator);
  // Nosači hladnjaka: četiri stupa s ploče (iza turbina).
  for (const sx of [-1, 1]) for (const z of [-10.85, -12.75]) batch.add(M.titanium, rod(V(sx * 2.0, top, z), V(sx * 2.0, L.radiator.y - 0.66, z), 0.09, 10));
  head.add(reservoir.group, pump.group, wb.group, radiator.group);
  if (!lite) {
    const l1 = plate('P-2 FLOW', 0.5, 0.2, { sub: '24V · 1.8 L/MIN' });
    l1.position.set(0, -0.85, 0.585);
    pump.group.add(l1);
    const l2 = plate('COOLANT', 0.5, 0.16);
    l2.position.set(0, 1.1 + 0.16, 0.6 * 1.18 + 0.005);
    reservoir.group.add(l2);
    const l3 = plate('NX THERMAL 07  ▲ HOT', 1.5, 0.15, { size: 52 });
    l3.rotation.x = -Math.PI / 2;
    l3.position.set(0, radiator.top + 0.005, 1.455);
    radiator.group.add(l3);
  }
  glowObjects.push(...reservoir.glowObjects, ...pump.glowObjects, ...wb.glowObjects);
  parts.reservoir = reservoir;
  parts.pump = pump;
  parts.waterBlock = wb;
  parts.radiator = radiator;
  // Nosač spremnika i pumpe (traka do dna kaveza).
  // Podloge stoje na dnu kaveza (visina iz SDF-a), stupovi do dna pumpe / poklopca spremnika.
  for (const p of [L.reservoir, L.pump]) {
    const fy = floorUnder(p.x - 0.45, p.x + 0.45, p.z - 0.4, p.z + 0.4) + 0.07;
    batch.add(M.graphite, box(V(p.x, fy, p.z), 0.9, 0.12, 0.8, 0.04));
    if (p === L.pump) batch.add(M.titanium, rod(V(p.x, fy, p.z), V(p.x, p.y - 1.35, p.z), 0.16, 12));
    else for (const dx of [-0.32, 0.32]) batch.add(M.titanium, rod(V(p.x + dx, fy, p.z + 0.25), V(p.x + dx, p.y - 1.3, p.z + 0.25), 0.07, 10));
  }

  // ------------------ stražnja kućišta očiju, nosači, servo motori očiju i čeljusti
  const E = L.eyeBack;
  for (const sx of [-1, 1]) {
    const ex = sx * EYE_X;
    batch.add(M.anodized, cyl(V(ex, 0.05, (E.z0 + E.z1) / 2), E.r, E.z0 - E.z1, 'z', 40));
    batch.add(M.graphite, cyl(V(ex, 0.05, E.z1 - 0.08), E.r + 0.08, 0.16, 'z', 40));
    batch.add(M.chrome, new THREE.TorusGeometry(E.r + 0.02, 0.05, 8, 48).translate(ex, 0.05, E.z0 - 0.25));
    batch.add(M.anodized, new THREE.TorusGeometry(1.32, 0.16, 12, 48).translate(ex, 0.05, -5.2));
    // Servo za zakretanje (ispod), za nagib (sa strane), zupčanici.
    batch.add(mats.housing, new RoundedBoxGeometry(1.3, 1.05, 1.5, 3, 0.18).translate(ex, -2.35, -5.9));
    batch.add(mats.housing, new RoundedBoxGeometry(0.8, 1.15, 1.15, 3, 0.14).translate(ex + sx * 1.2, 0.0, -6.95));
    batch.add(M.chrome, gear(0.55, 0.16, 16).translate(ex, -1.72, -5.9));
    batch.add(M.chrome, gear(0.46, 0.14, 14).rotateZ(Math.PI / 2).translate(ex + sx * 0.74, 0.0, -6.95));
    batch.add(M.titanium, rod(V(ex, -1.3, -5.3), V(ex, -1.78, -5.6), 0.1, 10));
    // Servo čeljusti s zupčanikom.
    batch.add(mats.housing, cyl(V(sx * 3.3, -5.4, -5.5), 0.55, 1.0, 'x', 28));
    batch.add(M.chrome, gear(0.62, 0.16, 16).rotateZ(Math.PI / 2).translate(sx * 2.72, -5.4, -5.5));
    batch.add(M.titanium, rod(V(sx * 2.8, -5.4, -5.5), V(sx * 1.9, -6.4, -3.9), 0.12, 10));
    // Vijci na stražnjoj ploči kućišta.
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      batch.add(M.chrome, cyl(V(ex + Math.cos(a) * 0.86, 0.05 + Math.sin(a) * 0.86, E.z1 - 0.18), 0.07, 0.06, 'z', 6));
    }
  }

  // ------------------ govorni modul iza usta (zasebna grupa — govor dolazi kasnije)
  const speech = new THREE.Group();
  speech.name = 'speechModule';
  speech.position.copy(L.speech);
  const prof = [[0, 0], [0.9, 0], [0.92, 0.08], [0.7, 0.14], [0.5, 0.06], [0.3, 0.12], [0, 0.16]].map(([x, y]) => new THREE.Vector2(x, y));
  const membrane = new THREE.Mesh(new THREE.LatheGeometry(prof, 40).rotateX(Math.PI / 2), M.graphite);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.95, 0.09, 10, 40), M.chrome);
  const can = new THREE.Mesh(cyl(V(0, 0, -0.32), 0.82, 0.5, 'z', 32, 0.62), mats.housing);
  const ampBox = new THREE.Mesh(box(V(0, -0.05, -0.72), 1.0, 0.7, 0.32, 0.06), mats.housing);
  for (const m of [membrane, rim, can, ampBox]) m.castShadow = true;
  speech.add(membrane, rim, can, ampBox);
  speech.userData.membrane = membrane;
  head.add(speech);
  parts.speech = speech;

  batch.build(head);
  const rivets = lite ? null : cageRivets(M);

  // ------------------ kabeli i cijevi glave (svi s utikačima u priključcima)
  const cables = [];
  const temple = new THREE.Group();
  temple.name = 'templeCoolant';
  connectorShadows(head, false);
  connectorShadows(temple, false);
  // Mobitel: manje segmenata cijevi; sitni servo kabeli se izostave (svi prikazani su spojeni).
  const add = (o) => {
    if (lite && o.optional) return null;
    const segments = Math.round((o.segments ?? 44) * (lite ? 0.55 : 1));
    const c = new Cable({ mats: M, radial: lite ? 8 : 10, ...o, segments });
    cables.push(c);
    return c;
  };
  const port = (part, key) => ({ node: part.group, pos: part.ports[key].pos, dir: part.ports[key].dir });
  const fluid = (r) => fluidMaterial(shared, { len: 10, rad: r * 0.68 });
  const FR = 0.17; // polumjer cijevi hlađenja
  const tp = (sx) => TEMPLE_PATH.map(([x, y, z]) => V(sx * x, y, z));
  // Lijeva sljepoočnica: pumpa → (kroz donji prozor kaveza, uz procjep, kroz gornji prozor) → vodeni blok.
  add({
    name: 'hlađenje: pumpa → lijeva sljepoočnica → vodeni blok',
    material: M.glass,
    core: fluid(FR),
    radius: FR,
    space: temple,
    a: port(pump, 'out'),
    b: port(wb, 'in'),
    via: [V(-2.0, -3.9, -5.0), V(-3.7, -3.8, -4.7), V(-4.6, -3.75, -3.95), ...tp(-1), V(-4.35, 3.5, -3.2), V(-3.55, 3.6, -4.6), V(-3.2, 2.6, -7.0), V(-3.15, 2.2, -8.4), V(-2.45, 2.05, -10.25), V(-2.55, 1.8, -11.5)],
    lead: 0.35,
    segments: 150,
    radial: 10,
  });
  // Desna sljepoočnica: hladnjak → (gornji prozor, procjep, donji prozor) → spremnik.
  add({
    name: 'hlađenje: hladnjak → desna sljepoočnica → spremnik',
    material: M.glass,
    core: fluid(FR),
    radius: FR,
    space: temple,
    a: port(radiator, 'out'),
    b: port(reservoir, 'in'),
    via: [V(4.05, 4.45, -9.0), V(3.75, 3.95, -6.2), V(3.55, 3.6, -4.6), V(4.35, 3.5, -3.2), ...tp(1).reverse(), V(4.6, -3.75, -3.95), V(3.7, -3.8, -4.7), V(3.0, -3.35, -6.0), V(2.65, -2.85, -7.05)],
    lead: 0.35,
    segments: 150,
    radial: 10,
  });
  add({ name: 'hlađenje: spremnik → pumpa', material: M.glass, core: fluid(FR), radius: FR, space: head, a: port(reservoir, 'out'), b: port(pump, 'in'), via: [V(1.2, -6.85, -7.8), V(-0.1, -6.2, -7.7)], lead: 0.3 });
  add({ name: 'hlađenje: vodeni blok → hladnjak', material: M.glass, core: fluid(FR), radius: FR, space: head, a: port(wb, 'out'), b: port(radiator, 'in'), via: [V(2.5, 2.25, -11.75)], lead: 0.3 });
  add({ name: 'hlađenje: pumpa → dno lubanje (dovod)', material: M.glass, core: fluid(FR), radius: FR, space: head, a: port(pump, 'branch'), b: { node: head, pos: SKULL_PORTS.bulkhead[0], dir: V(0, 1, 0) }, via: [V(-1.2, -5.9, -9.1)], lead: 0.3 });
  add({ name: 'hlađenje: dno lubanje → spremnik (povrat)', material: M.glass, core: fluid(FR), radius: FR, space: head, a: { node: head, pos: SKULL_PORTS.bulkhead[1], dir: V(0, 1, 0) }, b: port(reservoir, 'side'), via: [V(1.25, -5.85, -9.1)], lead: 0.3 });

  // Optička vlakna: vrh stražnjeg kućišta oka → priključak na ploči (impulsi prema procesoru).
  for (const sx of [-1, 1]) {
    const ex = sx * EYE_X;
    add({
      name: `optičko vlakno ${sx < 0 ? 'L' : 'D'}`,
      material: M.glass,
      core: pulseMaterial(shared),
      coreRadius: 0.62,
      kind: 'cable',
      radius: 0.13,
      space: head,
      a: { node: head, pos: V(ex - sx * 0.3, 0.05 + Math.sqrt(E.r * E.r - 0.09) - 0.01, -5.25), dir: V(0, 1, 0) },
      b: { node: boardGroup, pos: V(sx * 1.7, top, -7.05), dir: V(0, 1, 0) },
      via: [V(sx * 2.4, 2.45, -6.2)],
      lead: 0.3,
    });
  }
  // Servo kabeli: zakretanje i nagib očiju, čeljust → donja strana ploče.
  const under = (x, z) => ({ node: boardGroup, pos: V(x, B.y0, z), dir: V(0, -1, 0) });
  for (const sx of [-1, 1]) {
    const ex = sx * EYE_X;
    const S = sx < 0 ? 'L' : 'D';
    add({ optional: true, name: `servo oka (zakret) ${S}`, material: M.braided, radius: 0.1, space: head, a: { node: head, pos: V(ex, -2.35, -6.65), dir: V(0, 0, -1) }, b: under(sx * 2.2, -8.4), via: [V(sx * 2.85, -1.2, -7.9)], lead: 0.25 });
    add({ optional: true, name: `servo oka (nagib) ${S}`, material: M.braided, radius: 0.1, space: head, a: { node: head, pos: V(ex + sx * 1.2, 0, -7.525), dir: V(0, 0, -1) }, b: under(sx * 2.45, -9.35), via: [V(sx * 3.6, -0.25, -8.9)], lead: 0.25 });
    add({ optional: true, name: `servo čeljusti ${S}`, material: M.braided, radius: 0.09, space: head, a: { node: head, pos: V(sx * 3.3, -4.85, -5.5), dir: V(0, 1, 0) }, b: under(sx * 1.3, -9.95), via: [V(sx * 3.05, -2.9, -7.9), V(sx * 2.0, -0.6, -9.8)], lead: 0.22 });
    add({ optional: true, name: `turbina ${S}`, material: M.braided, radius: 0.09, space: head, a: { node: turbines[sx < 0 ? 0 : 1].group, pos: V(-sx * 0.48, -0.15, 0), dir: V(-sx, 0, 0) }, b: { node: boardGroup, pos: V(sx * 2.05, top, -10.35), dir: V(0, 1, 0) }, via: [], lead: 0.2 });
  }
  add({ optional: true, name: 'govorni modul', material: M.braided, radius: 0.11, space: head, a: { node: speech, pos: V(0, -0.05, -0.88), dir: V(0, 0, -1) }, b: under(0.0, -7.5), via: [V(0, -3.6, -4.7)], lead: 0.3 });
  add({ optional: true, name: 'bubanj', material: M.braided, radius: 0.09, space: head, a: { node: head, pos: V(D.x + 0.36, D.y - 0.8, D.z), dir: V(1, 0, 0) }, b: under(1.35, -11.2), via: [V(1.75, -1.6, -10.6)], lead: 0.2 });

  // Manje poziva crtanja: statični dijelovi po materijalu u jednu mrežu (pokretni ostaju zasebni).
  for (const o of glowObjects) o.userData.keep = true;
  const dyn = new Set([gyro, radiator.group, pump.rotor, reservoir.fluid, speech, parts.drum.platter, parts.drum.platter2, parts.drum.arm, ...turbines.flatMap((t) => [t.spinA, t.spinB])]);
  mergeStatic(head, (x) => dyn.has(x));
  mergeStatic(radiator.group, (x) => x === radiator.blades);
  for (const t of turbines) for (const s of [t.spinA, t.spinB]) mergeStatic(s);
  mergeStatic(parts.gyro.outer, (x) => x === parts.gyro.middle);
  mergeStatic(parts.gyro.middle, (x) => x === parts.gyro.inner);
  mergeStatic(parts.gyro.inner, (x) => x === parts.gyro.core);
  // Priključci na prolazima kroz dno lubanje prolaze kroz kavez (namjerno).
  for (const c of cables) for (const [i, e] of c.ends.entries()) if (SKULL_PORTS.bulkhead.some((q) => q.distanceTo(e.pos) < 1e-6)) c.sockets[i].userData.fitSkip = c.plugs[i].userData.fitSkip = true;
  const g = parts.gyro;
  const spinners = [
    { obj: g.outer, axis: 'x' },
    { obj: g.middle, axis: 'y' },
    { obj: g.inner, axis: 'x' },
    ...turbines.flatMap((t) => [{ obj: t.spinA, axis: 'x' }, { obj: t.spinB, axis: 'x' }]),
    { obj: parts.drum.platter, axis: 'y' },
    { obj: parts.drum.platter2, axis: 'y' },
    { obj: radiator.blades, axis: 'y' },
  ];
  return { head, temple, rivets, glowObjects, parts, cables, leds, ledState, gyroLight: lite ? null : gyroLight, anim, spinners };
}

// ---------------------------------------------------------------- poprsje
function buildTorso(M, mats, shared, { lite }) {
  const torso = new THREE.Group();
  torso.name = 'torsoInternals';
  const glowObjects = [];
  const batch = new Batch();
  const C = V(...CORE_CENTER);
  const parts = {};

  // Reaktor: kućište (čaša), radijalni nosači, segmentirani prstenovi, jezgra.
  const core = new THREE.Group();
  core.name = 'reactor';
  const cup = [[3.5, -1.6], [3.75, -1.2], [3.75, 0.9], [3.46, 1.25], [3.2, 1.25], [3.2, -0.9], [1.1, -1.45], [0, -1.5]].map(([r, z]) => new THREE.Vector2(r, z));
  const housing = new THREE.Mesh(new THREE.LatheGeometry(cup, 72).rotateX(Math.PI / 2).translate(C.x, C.y, C.z), mats.housing);
  housing.castShadow = housing.receiveShadow = true;
  core.add(housing);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    batch.add(M.chrome, rod(V(C.x + Math.cos(a) * 1.15, C.y + Math.sin(a) * 1.15, C.z - 0.4), V(C.x + Math.cos(a) * 3.15, C.y + Math.sin(a) * 3.15, C.z - 0.4), 0.1, 8));
  }
  // Vijci po rubu čaše.
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    batch.add(M.chrome, cyl(V(C.x + Math.cos(a) * 3.48, C.y + Math.sin(a) * 3.48, C.z + 1.27), 0.08, 0.06, 'z', 6));
  }
  // Segmentirani prstenovi: lukovi s razmacima, svaki se vrti u suprotnom smjeru od susjednog.
  const reactorRings = [];
  const ringSpec = [
    [2.75, 0.12, 0.55, 0.5, 8, 1],
    [2.12, 0.1, 0.25, 0.8, 6, -1.6],
    [1.5, 0.09, -0.05, 1.2, 4, 2.3],
  ];
  for (const [r, t, z, k, segs, speed] of ringSpec) {
    const arcs = [];
    for (let i = 0; i < segs; i++) {
      const arc = ((Math.PI * 2) / segs) * 0.78;
      arcs.push(new THREE.TorusGeometry(r, t, 10, 40, arc).rotateZ((i / segs) * Math.PI * 2));
      // Kromirane čeljusti na krajevima luka.
      const a = (i / segs) * Math.PI * 2;
      arcs.push(new THREE.BoxGeometry(t * 2.8, t * 2.8, t * 3.2).translate(r, 0, 0).rotateZ(a));
    }
    const glowArcs = mergeAll(arcs.filter((_, i) => i % 2 === 0));
    const clamps = mergeAll(arcs.filter((_, i) => i % 2 === 1));
    const g = new THREE.Group();
    g.position.set(C.x, C.y, C.z + z);
    g.userData.baseZ = C.z + z;
    g.userData.k = k;
    g.userData.speed = speed;
    const m = new THREE.Mesh(glowArcs, mats.glow.clone());
    g.add(m, new THREE.Mesh(clamps, M.chrome));
    core.add(g);
    reactorRings.push(g);
    glowObjects.push(m);
  }
  const coreSphere = new THREE.Mesh(new THREE.IcosahedronGeometry(0.88, 3), mats.glow.clone());
  coreSphere.position.copy(C).add(V(0, 0, -0.3));
  core.add(coreSphere);
  glowObjects.push(coreSphere);
  const coreLight = new THREE.PointLight('#79e6ff', 0, 26, 2);
  coreLight.position.copy(C).add(V(0, 0, 1.2));
  torso.add(core);
  parts.reactor = core;

  // Kralježnica (straga) i servo motori ramena.
  const SPINE = (i) => [-27.7 - i * 2.65, -10.4 + i * 0.1];
  for (let i = 0; i < 6; i++) {
    const [y, z] = SPINE(i);
    batch.add(M.graphite, new THREE.CylinderGeometry(1.25, 1.32, 1.5, 32).translate(0, y, z));
    batch.add(M.chrome, new THREE.TorusGeometry(1.2, 0.07, 8, 40).rotateX(Math.PI / 2).translate(0, y + 0.88, z));
  }
  for (const sx of [-1, 1]) {
    batch.add(mats.housing, cyl(V(sx * 12.6, -28.2, -7.6), 2.1, 2.4, 'x', 40));
    batch.add(mats.housing, cyl(V(sx * 14.0, -28.2, -7.6), 1.2, 0.8, 'x', 32));
    batch.add(M.chrome, gear(1.95, 0.3, 26).rotateZ(Math.PI / 2).translate(sx * 11.25, -28.2, -7.6));
  }
  // Prolazi grane hlađenja kroz dno otvora vrata (od nosača do unutrašnjosti).
  for (const p of BASE_PORTS.coolantBottom) {
    const pass = new THREE.Mesh(mergeAll([cyl(V(p.x, (p.y + -24.6) / 2, p.z), 0.3, -24.6 - p.y, 'y', 16), cyl(V(p.x, p.y + 0.35, p.z), 0.46, 0.2, 'y', 6)]), M.anodized);
    pass.name = 'prolaz grane (dno vrata)';
    pass.userData.fitSkip = true;
    pass.userData.keep = true;
    torso.add(pass);
  }
  batch.build(torso);

  // Kabeli/cijevi poprsja s konektorima.
  const cables = [];
  connectorShadows(torso, false);
  const add = (o) => {
    const c = new Cable({ mats: M, segments: 40, radial: 10, ...o });
    cables.push(c);
    return c;
  };
  const fluid = (r) => fluidMaterial(shared, { len: 10, rad: r * 0.68 });
  const radial = (ang, rr = 3.75, dz = -0.55) => ({ pos: V(C.x + Math.cos(ang) * rr, C.y + Math.sin(ang) * rr, C.z + dz), dir: V(Math.cos(ang), Math.sin(ang), 0) });
  for (const sx of [-1, 1]) {
    const S = sx < 0 ? 'L' : 'D';
    // Grana hlađenja iz vrata u reaktor (dovod lijevo, povrat desno).
    const cp = radial(sx < 0 ? Math.PI - 0.7 : 0.7);
    add({ name: `hlađenje reaktor ${sx < 0 ? 'dovod' : 'povrat'}`, material: M.glass, core: fluid(0.24), radius: 0.24, space: torso, a: { node: torso, pos: BASE_PORTS.coolantBottom[sx < 0 ? 0 : 1], dir: V(0, -1, 0) }, b: { node: core, ...cp }, via: [V(sx * 3.4, -26.2, -8.3)], lead: 0.35 });
    // Gumene cijevi: reaktor → servo ramena, reaktor → dno kralježnice.
    const rp = radial(sx < 0 ? Math.PI + 0.12 : -0.12);
    add({ name: `cijev reaktor → rame ${S}`, material: M.rubber, radius: 0.3, space: torso, a: { node: core, ...rp }, b: { node: torso, pos: V(sx * 12.6, -28.2 + 2.1, -7.6), dir: V(0, 1, 0) }, via: [V(sx * 7.6, -27.9, -7.2), V(sx * 11.0, -24.9, -7.1)], lead: 0.4 });
    const bp = radial(sx < 0 ? Math.PI + 0.95 : -0.95);
    const [y5, z5] = SPINE(5);
    add({ name: `cijev reaktor → kralježnica ${S}`, material: M.rubber, radius: 0.24, space: torso, a: { node: core, ...bp }, b: { node: torso, pos: V(sx * 1.27, y5, z5 + 0.2), dir: V(sx, 0, 0) }, via: [V(sx * 3.3, -35.0, -8.4)], lead: 0.35 });
  }
  for (const o of glowObjects) o.userData.keep = true;
  mergeStatic(torso, (x) => reactorRings.includes(x) || x === coreSphere);
  // Priključci na prolazima kroz dno vrata prolaze kroz kavez (namjerno).
  for (const c of cables) for (const [i, e] of c.ends.entries()) if (BASE_PORTS.coolantBottom.some((q) => q.distanceTo(e.pos) < 1e-6)) c.sockets[i].userData.fitSkip = c.plugs[i].userData.fitSkip = true;
  const spinners = reactorRings.map((r) => ({ obj: r, axis: 'z' }));
  return { torso, glowObjects, cables, reactorRings, coreSphere, coreLight, parts, spinners };
}

// ---------------------------------------------------------------- javno sučelje
/**
 * @param {object} M zajednički materijali robota (graphite, anodized, chrome, braided, rubber, titanium…)
 * @param {{lite?: boolean}} opts lite = mobitel (manje sitnih detalja; tekućina i rotirajući sklop ostaju)
 */
export function buildInternals(M, { lite = false } = {}) {
  M.glass ??= glassMaterial();
  M.bore ??= new THREE.MeshStandardMaterial({ color: '#050506', roughness: 0.9, metalness: 0.1 });
  M.copper ??= new THREE.MeshPhysicalMaterial({ color: '#b87547', metalness: 1, roughness: 0.28 });
  M.fins ??= new THREE.MeshPhysicalMaterial({ color: '#a7aeb6', metalness: 1, roughness: 0.3 });
  const mats = {
    housing: new THREE.MeshPhysicalMaterial({ color: '#1b1e23', metalness: 0.85, roughness: 0.32, clearcoat: 0.3, clearcoatRoughness: 0.25 }),
    substrate: new THREE.MeshStandardMaterial({ color: '#13261f', metalness: 0.2, roughness: 0.5 }),
    pcbEdge: new THREE.MeshStandardMaterial({ color: '#1f3a2f', metalness: 0.1, roughness: 0.6 }),
    chip: new THREE.MeshStandardMaterial({ color: '#0c0d0f', metalness: 0.15, roughness: 0.45 }),
    ferrite: new THREE.MeshStandardMaterial({ color: '#3a3d42', metalness: 0.4, roughness: 0.55 }),
    capSleeve: new THREE.MeshPhysicalMaterial({ color: '#1c2633', metalness: 0.3, roughness: 0.35, clearcoat: 0.6 }),
    mirror: new THREE.MeshPhysicalMaterial({ color: '#c8ccd2', metalness: 1, roughness: 0.07 }),
    glow: new THREE.MeshBasicMaterial({ color: '#79e6ff', toneMapped: false }),
    coreGlow: new THREE.MeshBasicMaterial({ color: '#79e6ff', toneMapped: false }),
    coreWire: new THREE.MeshBasicMaterial({ color: '#79e6ff', wireframe: true, toneMapped: false, transparent: true, opacity: 0.85 }),
    led: new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false }),
  };
  for (const m of [mats.housing, mats.chip, mats.substrate, mats.pcbEdge, mats.ferrite]) m.userData.darkEnv = true;
  const shared = fluidUniforms();
  shared.pulseColor = { value: new THREE.Color('#79e6ff') };
  shared.pulseK = { value: 0 };

  const H = buildHead(M, mats, shared, { lite });
  const T = buildTorso(M, mats, shared, { lite });
  // Unutrašnjost ne baca sjene (u sjeni je kaveza; štedi prolaze sjena), samo ih prima.
  for (const root of [H.head, H.temple, T.torso]) root.traverse((o) => { if (o.isMesh) o.castShadow = false; });
  for (const c of [...H.cables, ...T.cables]) c.tube.mesh.castShadow = false;
  const fluidColor = new THREE.Color();
  const tmp = new THREE.Color();
  const amberRef = new THREE.Color('#ffae42');
  const cyanRef = new THREE.Color('#79e6ff');
  let ledClock = 0;

  const api = {
    head: H.head,
    temple: H.temple,
    rivets: H.rivets,
    torso: T.torso,
    parts: { ...H.parts, ...T.parts },
    radiator: H.parts.radiator.group,
    turbines: H.parts.turbines,
    speechModule: H.parts.speech,
    reactor: T.parts.reactor,
    reactorRings: T.reactorRings,
    coreSphere: T.coreSphere,
    coreLight: T.coreLight,
    gyroLight: H.gyroLight,
    cables: [...H.cables, ...T.cables],
    spinners: [...H.spinners, ...T.spinners],
    headCables: H.cables,
    torsoCables: T.cables,
    glowObjects: [...H.glowObjects, ...T.glowObjects],
    mats,
    shared,
    /** Materijal tekućine za cijevi izvan modula (vrat). */
    fluidMat: (len, rad) => fluidMaterial(shared, { len, rad }),

    /**
     * Svaki frame. e = razina rastavljanja (0..1), color = boja očiju (s ljutnjom), anger 0..1.
     * Kretanje i strujanje rastu s rastavljanjem; sklopljen robot računa samo cijevi uz
     * sljepoočnice (vide se kroz procjep).
     */
    update(dt, { e, color, eyeColor, anger, pulse = 0, headVisible = true }) {
      const k = THREE.MathUtils.smoothstep(e, 0.05, 0.9);
      const angerK = 1 + 1.4 * anger;
      // Tekućina: narančasta; kad su oči jantarne — cijan. Ljutnja: brže strujanje, više mjehurića.
      const amber = THREE.MathUtils.clamp((eyeColor.r - cyanRef.r) / (amberRef.r - cyanRef.r), 0, 1);
      fluidColor.copy(FLUID_ORANGE).lerp(FLUID_CYAN, amber);
      shared.color.value.copy(fluidColor);
      shared.intensity.value = 1.2 + 0.35 * anger;
      shared.flow.value = (1.0 + 2.2 * k) * angerK;
      shared.bubbles.value = 0.1 + 0.3 * anger;
      shared.time.value += dt;
      shared.pulseColor.value.copy(color);
      shared.pulseK.value = 0.25 + 0.75 * k;

      // Cijevi uz sljepoočnice uvijek (sjaj kroz procjep); ostalo samo kad je vidljivo.
      for (const c of H.cables) if (c.space === H.temple) c.update();
      if (!headVisible) return;
      for (const c of H.cables) if (c.space !== H.temple) c.update();
      for (const c of T.cables) c.update();

      // Žiroskop: tri prstena različitim brzinama, jezgra se vrti najbrže.
      const P = H.parts;
      const w = k * angerK;
      P.gyro.outer.rotation.x += dt * 0.55 * w;
      P.gyro.middle.rotation.y += dt * 1.05 * w;
      P.gyro.inner.rotation.x -= dt * 1.8 * w;
      P.gyro.core.rotation.y += dt * 3.2 * w;
      P.gyro.core.rotation.z += dt * 0.7 * w;
      mats.coreGlow.color.copy(color).multiplyScalar(6 + 2 * pulse);
      mats.coreWire.color.copy(color).multiplyScalar(2.4);
      mats.glow.color.copy(color).multiplyScalar(2.6);
      if (H.gyroLight) {
        H.gyroLight.color.copy(color);
        H.gyroLight.intensity = 34 * k;
      }
      // Turbine (suprotni smjerovi, različite brzine) i bubanj s ručicom.
      for (const t of P.turbines) {
        t.spinA.rotation.x += dt * t.sx * 2.6 * w;
        t.spinB.rotation.x -= dt * t.sx * 4.4 * w;
      }
      P.drum.platter.rotation.y += dt * 3.4 * w;
      P.drum.platter2.rotation.y -= dt * 2.1 * w;
      const T0 = shared.time.value;
      P.drum.arm.rotation.y = 0.25 * Math.sin(T0 * 1.7) * k + 0.12 * Math.sin(T0 * 5.3) * k;
      // Hlađenje: pumpa, ventilator, mjehurići u spremniku.
      P.pump.animate(T0, dt, k, angerK);
      P.radiator.animate(dt, k * angerK);
      P.reservoir.animate(T0, dt, Math.max(0.2, k), anger);
      // Bakrene staze slabo svijetle i dišu.
      mats.pcb.emissiveIntensity = (0.18 + 0.12 * Math.sin(T0 * 1.3)) * (0.4 + 0.6 * k);
      // LED-ice: nepravilno treptanje (svaka svojim ritmom, ponekad brzi niz).
      ledClock += dt;
      H.ledState.forEach((s, i) => {
        const v = Math.sin(ledClock * s.rate + s.phase) + Math.sin(ledClock * s.rate * 2.7 + s.phase * 1.3);
        const on = v > 0.6 ? 1 : v > -0.2 && Math.random() < 0.04 ? 1 : 0;
        s.on += (on - s.on) * Math.min(1, dt * 30);
        if (s.kind === 'warn') tmp.setRGB(1.0, 0.36, 0.08);
        else if (s.kind === 'data') tmp.setRGB(0.35, 1.0, 0.45);
        else tmp.copy(color);
        tmp.multiplyScalar(0.05 + 3.2 * s.on);
        H.leds.setColorAt(i, tmp);
      });
      H.leds.instanceColor.needsUpdate = true;
      // Reaktor: prstenovi se vrte u suprotnim smjerovima.
      T.reactorRings.forEach((r, i) => {
        r.rotation.z += dt * r.userData.speed * 0.6 * (0.3 + 0.7 * k) * angerK;
        r.children[0].material.color.copy(color).multiplyScalar((3 + i * 2.2) * (1 + 0.25 * pulse));
      });
      T.coreSphere.material.color.copy(color).multiplyScalar(14 * (1 + 0.25 * pulse));
    },
  };
  return api;
}
