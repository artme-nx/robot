// Priključci i kabeli. Svaki kabel, crijevo i cijev ima na oba kraja utikač (konektor) koji
// sjedi u priključku (utičnici) na dijelu na koji se spaja:
//   priključak — dijete dijela (miče se s njim): prirubnica i ovratnik stoje na površini dijela,
//                ušće je na površini, os +y gleda van iz dijela;
//   utikač     — računa se svaki frame iz priključka (+ iskopčavanje duž osi): nos ulazi u
//                ovratnik, cijev počinje na stražnjem kraju utikača i izlazi duž osi priključka.
// Cijev s tekućinom ima stakleni plašt i svjetleću jezgru, a na krajevima spojnice s maticom.
// Svaka veza zna izmjeriti svoje krajeve (measure) — za automatsku provjeru spojenosti.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { FlexTube } from './flexTube.js';

const UP = new THREE.Vector3(0, 1, 0);
const _m = new THREE.Matrix4();
const _pa = new THREE.Vector3();
const _pb = new THREE.Vector3();

// Duljina utikača od ušća priključka do početka cijevi (u polumjerima cijevi).
const PLUG_LEN = { cable: 4.2, fluid: 3.4 };

const geoCache = new Map();
function cached(key, make) {
  if (!geoCache.has(key)) geoCache.set(key, make());
  return geoCache.get(key);
}

const cylY = (r0, r1, y0, y1, seg = 20) => {
  const g = new THREE.CylinderGeometry(r1, r0, y1 - y0, seg);
  g.translate(0, (y0 + y1) / 2, 0);
  return g.index ? g.toNonIndexed() : g;
};
const merge = (geos) => mergeGeometries(geos, false);

/** Geometrije priključka po materijalu (os +y van iz dijela, ušće u y = 0 na površini dijela). */
export function socketGeometries(r, kind) {
  return cached(`s${kind}${r.toFixed(3)}`, () => {
    if (kind === 'fluid') {
      return {
        // Tijelo u dijelu (skriveno), šesterokutna matica na površini.
        metal: merge([cylY(r * 1.35, r * 1.35, -r * 2.2, 0, 16), cylY(r * 1.6, r * 1.6, 0, r * 0.55, 6), cylY(r * 1.75, r * 1.75, 0, r * 0.16, 24)]),
        bore: new THREE.CircleGeometry(r * 1.05, 18).rotateX(-Math.PI / 2).translate(0, r * 0.56, 0),
      };
    }
    return {
      dark: merge([cylY(r * 1.45, r * 1.45, -r * 2.2, 0, 16), cylY(r * 2.15, r * 2.15, 0, r * 0.14, 28)]),
      metal: cylY(r * 1.62, r * 1.62, r * 0.14, r * 0.55, 24),
      bore: new THREE.CircleGeometry(r * 1.22, 18).rotateX(-Math.PI / 2).translate(0, r * 0.56, 0),
    };
  });
}

/** Geometrije utikača po materijalu (os +y od ušća prema cijevi; vrh u y = 0). */
export function plugGeometries(r, kind) {
  return cached(`p${kind}${r.toFixed(3)}`, () => {
    const L = PLUG_LEN[kind] * r;
    if (kind === 'fluid') {
      return {
        L,
        // Navoj (u maticu priključka), matica, glatki rukavac do cijevi.
        metal: merge([cylY(r * 1.02, r * 1.02, -r * 1.2, r * 0.6, 16), cylY(r * 1.66, r * 1.66, r * 0.6, r * 1.55, 6)]),
        sleeve: cylY(r * 1.34, r * 1.2, r * 1.55, L, 20),
      };
    }
    return {
      L,
      // Kromirani nos (u ovratnik), anodizirano tijelo s nazubljenim prstenom, gumena manžeta.
      metal: merge([cylY(r * 1.18, r * 1.18, -r * 1.4, r * 0.55, 16), cylY(r * 1.48, r * 1.48, r * 1.95, r * 2.45, 24)]),
      body: cylY(r * 1.58, r * 1.58, r * 0.55, r * 1.95, 24),
      boot: cylY(r * 1.3, r * 1.04, r * 2.45, L, 16),
    };
  });
}

/** Dijelovi priključka / utikača za instanciranje: [geometrija za r = 1, materijal, baca sjenu]. */
function partsOf(role, kind, mats) {
  if (role === 'socket') {
    const G = socketGeometries(1, kind);
    return kind === 'fluid' ? [[G.metal, mats.chrome, true], [G.bore, mats.bore, false]] : [[G.dark, mats.graphite, true], [G.metal, mats.chrome, true], [G.bore, mats.bore, false]];
  }
  const G = plugGeometries(1, kind);
  return kind === 'fluid' ? [[G.metal, mats.chrome, true], [G.sleeve, mats.anodized, true]] : [[G.metal, mats.chrome, true], [G.body, mats.anodized, true], [G.boot, mats.rubber, true]];
}

const pools = new Set();
const _mtx = new THREE.Matrix4();
const _scl = new THREE.Vector3();

/**
 * Svi utikači i priključci jednog prostora crtaju se instancirano (po vrsti i materijalu jedna
 * mreža), jer ih je mnogo: stotine malih mreža bile bi stotine poziva crtanja (i u sjenama).
 * Geometrija je zadana za r = 1, instanca je skalirana polumjerom cijevi.
 */
class ConnectorPool {
  constructor(space, mats) {
    this.space = space;
    this.mats = mats;
    this.sets = new Map();
    this.meshes = [];
    this.built = false;
    this.dirty = true;
    this.castShadow = true;
    pools.add(this);
  }

  /** Novi utikač ili priključak: vraća objekt (položaj/orijentacija u prostoru space). */
  register(role, kind, r) {
    const key = `${role}:${kind}`;
    if (!this.sets.has(key)) this.sets.set(key, { role, kind, items: [] });
    const proxy = new THREE.Object3D();
    proxy.userData.r = r;
    proxy.userData.pool = this;
    this.sets.get(key).items.push(proxy);
    if (this.built) throw new Error('ConnectorPool: registracija nakon izgradnje');
    return proxy;
  }

  #build() {
    for (const set of this.sets.values()) {
      for (const [geo, mat, cast] of partsOf(set.role, set.kind, this.mats)) {
        const im = new THREE.InstancedMesh(geo, mat, set.items.length);
        im.name = `${set.role === 'plug' ? 'utikači' : 'priključci'} (${set.kind})`;
        im.castShadow = cast && this.castShadow;
        im.receiveShadow = true;
        im.frustumCulled = false;
        im.userData.items = set.items;
        this.space.add(im);
        this.meshes.push(im);
      }
    }
    this.built = true;
  }

  sync() {
    if (!this.built) this.#build();
    if (!this.dirty) return;
    for (const im of this.meshes) {
      im.userData.items.forEach((p, i) => im.setMatrixAt(i, _mtx.compose(p.position, p.quaternion, _scl.setScalar(p.userData.r))));
      im.instanceMatrix.needsUpdate = true;
    }
    this.dirty = false;
  }
}

/** Osvježi instance svih utikača i priključaka (jednom po frameu, nakon update kabela). */
export function syncConnectors() {
  for (const p of pools) p.sync();
}

/** Prostor bez sjena utikača/priključaka (unutrašnjost: ionako je u sjeni kaveza). */
export function connectorShadows(space, on) {
  (space.userData.connectorPool ??= new ConnectorPool(space, null)).castShadow = on;
}

/**
 * Jedan kraj veze: priključak na čvoru `node` (dio na koji se spaja), ušće `pos` i smjer
 * izlaza `dir` u prostoru tog čvora. socket:false — priključak već postoji (npr. dio ga ima).
 * @typedef {{ node: THREE.Object3D, pos: THREE.Vector3, dir: THREE.Vector3, socket?: boolean }} End
 */

export class Cable {
  /**
   * @param {object} o
   * @param {string} o.name
   * @param {object} o.mats chrome, anodized, graphite, rubber, bore
   * @param {THREE.Material} o.material plašt kabela (ili staklo cijevi)
   * @param {number} o.radius
   * @param {THREE.Object3D} o.space grupa u kojoj su cijev i utikači (u njenom prostoru se računa)
   * @param {End} o.a
   * @param {End} o.b
   * @param {Array<THREE.Vector3|{t:number, offset:THREE.Vector3}>} [o.via] međutočke (prostor space):
   *   apsolutne ili relativne (t duž A→B + pomak)
   * @param {number} [o.lead] koliko cijev ravno izlazi iz utikača prije savijanja (cm)
   * @param {THREE.Material} [o.core] svjetleća jezgra (tekućina ili svjetlosni impulsi)
   * @param {'cable'|'fluid'} [o.kind] vrsta konektora (zadano: fluid ako ima jezgru)
   */
  constructor({ name, mats, material, radius, space, a, b, via = [], lead = null, segments = 40, radial = 10, core = null, coreRadius = 0.78, kind = null, ripple = 0 }) {
    this.name = name;
    this.kind = kind ?? (core ? 'fluid' : 'cable');
    this.radius = radius;
    this.space = space;
    this.via = via;
    this.lead = lead ?? radius * 3.5;
    this.ends = [a, b];
    this.unplug = [0, 0];
    this.tube = new FlexTube(material, { segments, radial, radius, ripple });
    space.add(this.tube.mesh);
    if (core) {
      this.core = new FlexTube(core, { segments, radial: Math.max(6, radial - 2), radius: radius * coreRadius });
      this.core.mesh.castShadow = false;
      this.core.mesh.receiveShadow = false;
      // Prozirni plašt crta se nakon jezgre.
      this.core.mesh.renderOrder = 1;
      this.tube.mesh.renderOrder = 2;
      this.tube.mesh.castShadow = false;
      space.add(this.core.mesh);
    }
    const pool = (space.userData.connectorPool ??= new ConnectorPool(space, mats));
    pool.mats ??= mats;
    this.pool = pool;
    this.sockets = [];
    this.plugs = [];
    for (const end of this.ends) {
      end.dir = end.dir.clone().normalize();
      end.pos = end.pos.clone();
      this.sockets.push(end.socket === false ? null : pool.register('socket', this.kind, radius));
      const p = pool.register('plug', this.kind, radius);
      p.userData.length = PLUG_LEN[this.kind] * radius;
      this.plugs.push(p);
    }
    this._pts = Array.from({ length: 4 + via.length }, () => new THREE.Vector3());
    this._key = new Float32Array(14).fill(NaN);
    this._dA = new THREE.Vector3();
    this._dB = new THREE.Vector3();
    this.length = 1;
    this._visible = true;
  }

  set visible(v) {
    this._visible = v;
    this.tube.mesh.visible = v;
    if (this.core) this.core.mesh.visible = v;
  }

  get visible() {
    return this._visible;
  }

  /** Ušće priključka i os (u prostoru space) za kraj i. */
  #mouth(i, outPos, outDir) {
    const end = this.ends[i];
    end.node.updateWorldMatrix(true, false);
    outPos.copy(end.pos).applyMatrix4(end.node.matrixWorld);
    outDir.copy(end.dir).transformDirection(end.node.matrixWorld);
    _m.copy(this.space.matrixWorld).invert();
    outPos.applyMatrix4(_m);
    outDir.transformDirection(_m);
    return outPos;
  }

  /** Preračun cijevi; preskače se ako se krajevi nisu pomaknuli (force = uvijek). */
  update(force = false) {
    this.space.updateWorldMatrix(true, false);
    const P = this._pts;
    const A = P[0], A1 = P[1], B1 = P[P.length - 2], B = P[P.length - 1];
    const dA = this._dA, dB = this._dB;
    this.#mouth(0, A, dA);
    this.#mouth(1, B, dB);
    const key = this._key;
    const now = [A.x, A.y, A.z, dA.x, dA.y, dA.z, B.x, B.y, B.z, dB.x, dB.y, dB.z, this.unplug[0], this.unplug[1]];
    let same = !force;
    for (let k = 0; k < 14 && same; k++) if (!(Math.abs(now[k] - key[k]) < 1e-5)) same = false;
    if (same) return false;
    key.set(now);
    this.pool.dirty = true;
    for (const [i, out, dir] of [[0, A, dA], [1, B, dB]]) {
      // Priključak na ušću, utikač od ušća (+ iskopčavanje) duž osi; cijev počinje na stražnjem kraju utikača.
      const socket = this.sockets[i];
      if (socket) {
        socket.position.copy(out);
        socket.quaternion.setFromUnitVectors(UP, dir);
      }
      const plug = this.plugs[i];
      out.addScaledVector(dir, this.unplug[i]);
      plug.position.copy(out);
      plug.quaternion.setFromUnitVectors(UP, dir);
      out.addScaledVector(dir, plug.userData.length);
    }
    A1.copy(A).addScaledVector(dA, this.lead);
    B1.copy(B).addScaledVector(dB, this.lead);
    for (let k = 0; k < this.via.length; k++) {
      const v = this.via[k];
      const out = P[2 + k];
      if (v.isVector3) out.copy(v);
      else out.lerpVectors(A1, B1, v.t).add(v.offset);
    }
    this.tube.update(P);
    if (this.core) this.core.update(P);
    let len = 0;
    for (let k = 1; k < P.length; k++) len += P[k].distanceTo(P[k - 1]);
    this.length = this.tube.curve.getLength?.() ?? len;
    const u = this.core?.mesh.material.uniforms;
    if (u?.len) u.len.value = this.length;
    return true;
  }

  /**
   * Mjerenje krajeva (svjetske koordinate, cm prostora space): stvarni kraj geometrije cijevi
   * (središte prvog/zadnjeg prstena vrhova) ↔ stražnji kraj utikača, i vrh utikača ↔ ušće priključka.
   */
  measure() {
    const out = [];
    const pos = this.tube.positions;
    const R = this.tube.radial, S = this.tube.segments;
    this.space.updateWorldMatrix(true, false);
    const toSpace = _m.copy(this.space.matrixWorld).invert();
    for (const i of [0, 1]) {
      const ring = i === 0 ? 0 : S;
      const c = new THREE.Vector3();
      for (let j = 0; j < R; j++) {
        const k = (ring * (R + 1) + j) * 3;
        c.x += pos[k];
        c.y += pos[k + 1];
        c.z += pos[k + 2];
      }
      c.divideScalar(R);
      const plug = this.plugs[i];
      const tip = _pa.copy(plug.position);
      const back = _pb.set(0, plug.userData.length, 0).applyQuaternion(plug.quaternion).add(plug.position);
      const end = this.ends[i];
      end.node.updateWorldMatrix(true, false);
      const socket = end.pos.clone().applyMatrix4(end.node.matrixWorld).applyMatrix4(toSpace);
      out.push({
        name: `${this.name} ${i === 0 ? 'A' : 'B'}`,
        cableToPlug: c.distanceTo(back),
        plugToSocket: tip.distanceTo(socket),
        unplugged: this.unplug[i] > 1e-3,
        // Cijev (i jezgra) stvarno je u sceni, u svom prostoru.
        attached: this.tube.mesh.parent === this.space && (!this.core || this.core.mesh.parent === this.space),
        plugVisible: isShown(this.space),
        socketVisible: isShown(this.space),
      });
    }
    return out;
  }

  /** Točke središnje linije (prostor space), bez dijelova unutar utikača. */
  centerline(n = 32) {
    const pts = [];
    const c = this.tube.curve;
    for (let i = 0; i <= n; i++) pts.push(c.getPointAt(i / n));
    return pts;
  }
}

export function isShown(o) {
  for (let x = o; x; x = x.parent) if (!x.visible) return false;
  return true;
}

