// Automatske provjere unutrašnjosti (poziva se iz testova preko window.__ht.robot):
//   connections — za svaki kraj svakog kabela/cijevi/klipa udaljenost kraja cijevi do utikača i
//                 utikača do priključka (cm);
//   fit         — svaki vrh unutarnjih dijelova (i rotirajućih u više položaja) mora biti unutar
//                 kaveza (glava h < −1,15, poprsje t < −1,4);
//   clearance   — središnja linija svake cijevi (bez dijela u utikaču) mora biti udaljena od
//                 površina drugih dijelova, drugih cijevi i kaveza/panela barem za svoj polumjer.

import * as THREE from 'three';
import { headSolid, torsoSolid, robotHeadModel, robotBodyModel } from '../../geometry/robotModels.js';
import { syncConnectors } from './connectors.js';

const _v = new THREE.Vector3();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();

/** Pozovi fn(p, mesh) za svaki vrh (u prostoru `space`) mreža ispod `root`. */
function eachVertex(root, space, fn, skip) {
  space.updateWorldMatrix(true, false);
  const inv = new THREE.Matrix4().copy(space.matrixWorld).invert();
  const m = new THREE.Matrix4();
  const im = new THREE.Matrix4();
  root.updateWorldMatrix(true, true);
  root.traverse((o) => {
    if (!o.isMesh || skip?.(o)) return;
    const pos = o.geometry.attributes.position;
    const n = o.isInstancedMesh ? o.count : 1;
    for (let k = 0; k < n; k++) {
      if (o.userData.items?.[k]?.userData.fitSkip) continue;
      m.multiplyMatrices(inv, o.matrixWorld);
      if (o.isInstancedMesh) {
        o.getMatrixAt(k, im);
        m.multiply(im);
      }
      for (let i = 0; i < pos.count; i++) fn(_v.fromBufferAttribute(pos, i).applyMatrix4(m), o);
    }
  });
}

/** Ime najbližeg imenovanog pretka (za izvještaj). */
function label(o, stop) {
  for (let x = o; x && x !== stop; x = x.parent) if (x.name) return x.name;
  return o.material?.name || o.type;
}

/** Gusti uzorak točaka na površinama mreža (prostor `space`), u prostornoj rešetki. */
class Cloud {
  constructor(cell = 0.4) {
    this.cell = cell;
    this.grid = new Map();
  }
  key(x, y, z) {
    const c = this.cell;
    return `${Math.floor(x / c)},${Math.floor(y / c)},${Math.floor(z / c)}`;
  }
  add(p, tag) {
    const k = this.key(p.x, p.y, p.z);
    if (!this.grid.has(k)) this.grid.set(k, []);
    this.grid.get(k).push(p.x, p.y, p.z, tag);
  }
  addMesh(o, space, tag, spacing = 0.12) {
    const inv = new THREE.Matrix4().copy(space.matrixWorld).invert();
    const pos = o.geometry.attributes.position;
    const idx = o.geometry.index;
    const tri = idx ? idx.count / 3 : pos.count / 3;
    const n = o.isInstancedMesh ? o.count : 1;
    const m = new THREE.Matrix4();
    const im = new THREE.Matrix4();
    for (let k = 0; k < n; k++) {
      m.multiplyMatrices(inv, o.matrixWorld);
      if (o.isInstancedMesh) {
        o.getMatrixAt(k, im);
        m.multiply(im);
      }
      for (let t = 0; t < tri; t++) {
        const i0 = idx ? idx.getX(t * 3) : t * 3, i1 = idx ? idx.getX(t * 3 + 1) : t * 3 + 1, i2 = idx ? idx.getX(t * 3 + 2) : t * 3 + 2;
        _a.fromBufferAttribute(pos, i0).applyMatrix4(m);
        _b.fromBufferAttribute(pos, i1).applyMatrix4(m);
        _c.fromBufferAttribute(pos, i2).applyMatrix4(m);
        const area = _v.subVectors(_b, _a).cross(new THREE.Vector3().subVectors(_c, _a)).length() / 2;
        const count = Math.max(1, Math.ceil(area / (spacing * spacing)));
        for (let s = 0; s < count; s++) {
          let u = Math.random(), w = Math.random();
          if (u + w > 1) (u = 1 - u), (w = 1 - w);
          this.add(new THREE.Vector3().copy(_a).addScaledVector(_v.subVectors(_b, _a), u).addScaledVector(new THREE.Vector3().subVectors(_c, _a), w), tag);
        }
        this.add(_a.clone(), tag);
      }
    }
  }
  /** Najbliža točka (udaljenost, oznaka) do p, unutar r. */
  nearest(p, r = 2, ignore = null) {
    const c = this.cell;
    const R = Math.ceil(r / c);
    const cx = Math.floor(p.x / c), cy = Math.floor(p.y / c), cz = Math.floor(p.z / c);
    let best = Infinity, tag = null;
    for (let i = -R; i <= R; i++)
      for (let j = -R; j <= R; j++)
        for (let k = -R; k <= R; k++) {
          const arr = this.grid.get(`${cx + i},${cy + j},${cz + k}`);
          if (!arr) continue;
          for (let q = 0; q < arr.length; q += 4) {
            if (ignore && ignore(arr[q + 3])) continue;
            const d = Math.hypot(arr[q] - p.x, arr[q + 1] - p.y, arr[q + 2] - p.z);
            if (d < best) (best = d), (tag = arr[q + 3]);
          }
        }
    return [best, tag];
  }
}

/** Točke središnje linije kabela s duljinom luka od oba kraja. */
function cablePoints(c, step = 0.12) {
  const curve = c.tube.curve;
  const len = curve.getLength();
  const n = Math.max(8, Math.ceil(len / step));
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const u = i / n;
    pts.push({ p: curve.getPointAt(u), s0: u * len, s1: (1 - u) * len });
  }
  return pts;
}

export function connectionReport(scene) {
  scene.root.updateMatrixWorld(true);
  for (const c of scene.internals.cables) c.update(true);
  for (const c of scene.neck.cables) c.update(true);
  syncConnectors();
  return [...scene.neck.measure(), ...scene.internals.cables.flatMap((c) => c.measure())];
}

/**
 * Uklapanje u kavez: najgori vrh po dijelu (cm iznad dopuštene granice; ≤ 0 je u redu).
 * Rotirajući dijelovi se provjeravaju u 8 položaja.
 */
export function fitReport(scene) {
  const I = scene.internals;
  const head = I.head, torso = I.torso;
  for (const c of I.cables) c.update(true);
  syncConnectors();
  const worst = new Map();
  const note = (name, v, p) => {
    const w = worst.get(name);
    if (!w || v > w.v) worst.set(name, { v, p: [p.x, p.y, p.z].map((x) => +x.toFixed(2)) });
  };
  const skip = (o) => hasFlag(o, 'fitSkip') || isCableMesh(I, o);
  const checkHead = (root) => eachVertex(root, scene.procHead, (p, o) => note(label(o, head), headSolid(p.x, p.y, p.z) + 1.15, p), skip);
  const checkTorso = (root) => eachVertex(root, scene.torso, (p, o) => note(label(o, torso), torsoSolid(p.x, p.y, p.z) + 1.4, p), skip);
  checkHead(head);
  checkTorso(torso);
  for (const { obj, axis } of I.spinners) {
    const r0 = obj.rotation[axis];
    for (let k = 1; k < 8; k++) {
      obj.rotation[axis] = r0 + (k * Math.PI) / 4;
      obj.updateMatrixWorld(true);
      (head.getObjectById(obj.id) ? checkHead : checkTorso)(obj);
    }
    obj.rotation[axis] = r0;
    obj.updateMatrixWorld(true);
  }
  return [...worst].map(([name, w]) => ({ name, over: +w.v.toFixed(3), at: w.p })).sort((a, b) => b.over - a.over);
}

function hasFlag(o, flag) {
  for (let x = o; x; x = x.parent) if (x.userData[flag]) return true;
  return false;
}

function isCableMesh(I, o) {
  for (const c of I.cables) if (o === c.tube.mesh || o === c.core?.mesh) return true;
  return false;
}

/**
 * Razmaci cijevi: najmanji razmak (cm, površina cijevi ↔ površina) prema drugim dijelovima,
 * drugim cijevima i ljusci. Krajevi (utikač + ravni izlaz + 0,3) se ne broje.
 */
export function clearanceReport(scene) {
  const I = scene.internals;
  const out = [];
  const panelsHead = robotHeadModel();
  const panelsBody = robotBodyModel();
  const tmp = new Float32Array(8);
  const assembled = scene.explode.amount < 0.01;
  for (const c of [...I.cables, ...scene.neck.cables]) c.update(true);
  syncConnectors();
  scene.root.updateMatrixWorld(true);
  const groups = [
    { name: 'glava', space: scene.procHead, cables: I.headCables, parts: [I.head], shell: 'head' },
    { name: 'poprsje', space: scene.torso, cables: I.torsoCables, parts: [I.torso], shell: 'torso' },
    { name: 'vrat', space: scene.neck.group, cables: scene.neck.cables, parts: [scene.neck.group, scene.neck.plate, scene.neck.mount], shell: 'neck' },
  ];
  for (const G of groups) {
    const cloud = new Cloud(0.4);
    const cableMeshes = new Set();
    for (const c of G.cables) {
      cableMeshes.add(c.tube.mesh);
      if (c.core) cableMeshes.add(c.core.mesh);
    }
    for (const root of G.parts) {
      root.traverse((o) => {
        if (!o.isMesh || cableMeshes.has(o)) return;
        cloud.addMesh(o, G.space, label(o, root));
      });
    }
    // Centralne linije svih cijevi u ovoj skupini (za razmak cijev ↔ cijev).
    const lines = G.cables.map((c) => ({ c, pts: cablePoints(c) }));
    const toHead = new THREE.Matrix4();
    const toTorso = new THREE.Matrix4();
    if (G.shell === 'neck') {
      toHead.copy(scene.procHead.matrixWorld).invert().multiply(G.space.matrixWorld);
      toTorso.copy(scene.torso.matrixWorld).invert().multiply(G.space.matrixWorld);
    }
    for (const { c, pts } of lines) {
      const r = c.radius;
      const endZone = c.plugs[0].userData.length + c.lead + 0.3;
      let parts = [Infinity, '', null], other = [Infinity, ''], shell = [Infinity, ''];
      for (const { p, s0, s1 } of pts) {
        if (s0 < endZone || s1 < endZone) continue;
        const [d, tag] = cloud.nearest(p, 1.5);
        if (d - r < parts[0]) parts = [d - r, tag, [p.x, p.y, p.z].map((v) => +v.toFixed(2))];
        for (const L of lines) {
          if (L.c === c) continue;
          for (const q of L.pts) {
            const dd = p.distanceTo(q.p) - r - L.c.radius;
            if (dd < other[0]) other = [dd, L.c.name, [p.x, p.y, p.z].map((v) => +v.toFixed(2)), (q.s0 / (q.s0 + q.s1)).toFixed(2), (s0 / (s0 + s1)).toFixed(2)];
          }
        }
        // Ljuska: unutarnje cijevi unutar kaveza; cijevi sljepoočnica u procjepu (izvan panela i
        // kaveza); vrat izvan panela glave i poprsja.
        let sd = Infinity, which = '';
        if (G.shell === 'head') {
          if (c.space === I.temple) {
            // Paneli samo sklopljeni (rastavljeni su se maknuli); kavez i površina uvijek.
            panelsHead.eval(p.x, p.y, p.z, tmp);
            for (let i = assembled ? 0 : 5; i < 6; i++) if (tmp[i] < sd) (sd = tmp[i]), (which = panelsHead.pieces[i]);
            const hs = -headSolid(p.x, p.y, p.z);
            if (hs < sd) (sd = hs), (which = 'površina');
          } else {
            (sd = -(headSolid(p.x, p.y, p.z) + 1.15)), (which = 'kavez');
          }
        } else if (G.shell === 'torso') {
          (sd = -(torsoSolid(p.x, p.y, p.z) + 1.4)), (which = 'kavez');
        } else {
          const ph = _v.copy(p).applyMatrix4(toHead);
          panelsHead.eval(ph.x, ph.y, ph.z, tmp);
          for (let i = assembled ? 0 : 5; i < 6; i++) if (tmp[i] < sd) (sd = tmp[i]), (which = `glava ${panelsHead.pieces[i]}`);
          const pt = _v.copy(p).applyMatrix4(toTorso);
          panelsBody.eval(pt.x, pt.y, pt.z, tmp);
          for (let i = 0; i < 5; i++) if (tmp[i] < sd) (sd = tmp[i]), (which = `poprsje ${panelsBody.pieces[i]}`);
        }
        if (sd - r < shell[0]) shell = [sd - r, which];
      }
      out.push({
        group: G.name,
        name: c.name,
        parts: +parts[0].toFixed(2),
        partsAt: parts[1],
        partsP: parts[2],
        cables: +other[0].toFixed(2),
        cablesAt: other[1],
        cablesP: other.slice(2),
        shell: +shell[0].toFixed(2),
        shellAt: shell[1],
      });
    }
  }
  return out;
}

function isVisible(o) {
  for (let x = o; x; x = x.parent) if (!x.visible) return false;
  return true;
}
