// Mehanika vrata: ploča na dnu lubanje (glava) i nosač u otvoru vrata (poprsje), između njih
// kralježnični stup od diskova na savitljivoj jezgri, hidraulički cilindri (tijelo + kromirana
// klipnjača koja klizi) na ušicama, rebrasto crijevo grla s obujmicama, pleteni kabeli i dvije
// cijevi tekućeg hlađenja (grana prema reaktoru). Svaki kraj sjedi u priključku na dijelu.
// Sve se svaki frame prilagođava položaju glave (glava ima inerciju). Pri rastavljanju (unplug
// 0..1) utikači kabela izađu iz priključaka na lubanji, a bočni klipovi se uvuku.

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { FlexTube } from './flexTube.js';
import { Cable, connectorShadows } from './connectors.js';
import { SKULL_PLATE, SKULL_PORTS, NECK_BASE_MOUNT, BASE_PORTS } from './layout.js';
import { torsoSolid } from '../../geometry/robotModels.js';

export { FlexTube };

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _d = new THREE.Vector3();
const _q = new THREE.Quaternion();
const UP = new THREE.Vector3(0, 1, 0);
const V = (x, y, z) => new THREE.Vector3(x, y, z);

class Piston {
  constructor(mats, { bodyR = 0.42, rodR = 0.2, bodyLen = 5.4, rodLen = 5.6 }) {
    this.bodyLen = bodyLen;
    this.rodLen = rodLen;
    this.group = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(bodyR, bodyR, bodyLen, 28, 1), mats.anodized);
    const collar = new THREE.Mesh(new THREE.CylinderGeometry(bodyR * 1.18, bodyR * 1.18, 0.35, 28), mats.chrome);
    collar.position.y = bodyLen / 2 - 0.1;
    const base = new THREE.Mesh(new THREE.CylinderGeometry(bodyR * 1.1, bodyR * 1.1, 0.5, 28), mats.graphite);
    base.position.y = -bodyLen / 2 + 0.2;
    // Hidraulički priključak na tijelu cilindra (mali crni nastavak s vijkom).
    const port = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.3, 12).rotateZ(Math.PI / 2).translate(bodyR + 0.1, -bodyLen / 2 + 0.7, 0), mats.graphite);
    this.body = new THREE.Group();
    this.body.add(body, collar, base, port);
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(rodR, rodR, rodLen, 24), mats.chrome);
    this.rod = new THREE.Group();
    this.rod.add(rod);
    // Zglobne glave (clevis) na krajevima: prsten oko svornjaka ušice.
    const eye = new THREE.TorusGeometry(0.32, 0.12, 12, 24);
    this.endA = new THREE.Mesh(eye, mats.graphite);
    this.endB = new THREE.Mesh(eye, mats.graphite);
    for (const m of [body, collar, base, rod, port, this.endA, this.endB]) {
      m.castShadow = true;
      m.receiveShadow = true;
    }
    this.group.add(this.body, this.rod, this.endA, this.endB);
  }

  update(a, b) {
    _d.subVectors(b, a);
    const len = _d.length();
    _d.divideScalar(len);
    _q.setFromUnitVectors(UP, _d);
    this.body.quaternion.copy(_q);
    this.body.position.copy(a).addScaledVector(_d, this.bodyLen / 2);
    this.rod.quaternion.copy(_q);
    this.rod.position.copy(b).addScaledVector(_d, -this.rodLen / 2);
    this.endA.position.copy(a);
    this.endB.position.copy(b);
    // Prsten zgloba leži u ravnini koja sadrži os klipa (svornjak je okomit na nju).
    this.endA.quaternion.copy(_q).multiply(_qx);
    this.endB.quaternion.copy(_q).multiply(_qx);
  }
}
const _qx = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2);

/** Ušica (lug) sa svornjakom: vilica od ploče do točke zgloba. Vraća geometrije (u prostoru čvora). */
function lugGeos(pin, base, pinAxis = V(1, 0, 0)) {
  const dir = new THREE.Vector3().subVectors(pin, base);
  const len = dir.length();
  dir.normalize();
  const side = pinAxis.clone().normalize();
  const q = new THREE.Quaternion().setFromUnitVectors(UP, dir);
  const plates = [];
  for (const s of [-0.3, 0.3]) {
    const c = base.clone().addScaledVector(dir, len / 2 + 0.1).addScaledVector(side, s);
    plates.push(new RoundedBoxGeometry(0.22, len + 0.5, 0.75, 2, 0.06).applyQuaternion(q).translate(c.x, c.y, c.z));
  }
  const pinGeo = new THREE.CylinderGeometry(0.1, 0.1, 0.9, 12).applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, side)).translate(pin.x, pin.y, pin.z);
  return { plates, pin: pinGeo };
}

/** Sve ušice jednog čvora u dvije mreže (ploče, svornjaci). */
function lugs(mats, list) {
  const plates = [], pins = [];
  for (const [pin, base, axis] of list) {
    const g = lugGeos(pin, base, axis);
    plates.push(...g.plates.map((x) => x.toNonIndexed()));
    pins.push(g.pin.toNonIndexed());
  }
  const a = new THREE.Mesh(mergeGeometries(plates.map(strip)), mats.anodized);
  const b = new THREE.Mesh(mergeGeometries(pins.map(strip)), mats.chrome);
  for (const m of [a, b]) {
    m.castShadow = true;
    m.receiveShadow = true;
  }
  const g = new THREE.Group();
  g.name = 'ušice klipova';
  g.add(a, b);
  return g;
}
const strip = (g) => {
  for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
  return g;
};

/** Točka na površini poprsja iznad (x, z) i normala (SDF). */
function torsoSurface(x, z) {
  let lo = -40, hi = -14; // torsoSolid(lo) < 0 (unutra), torsoSolid(hi) > 0 (vani)
  for (let i = 0; i < 40; i++) {
    const m = (lo + hi) / 2;
    if (torsoSolid(x, m, z) < 0) lo = m;
    else hi = m;
  }
  const p = V(x, (lo + hi) / 2, z);
  const e = 0.02;
  const n = V(
    torsoSolid(x + e, p.y, z) - torsoSolid(x - e, p.y, z),
    torsoSolid(x, p.y + e, z) - torsoSolid(x, p.y - e, z),
    torsoSolid(x, p.y, z + e) - torsoSolid(x, p.y, z - e),
  ).normalize();
  return { p, n };
}

/** Tlocrt ploče (x, z) — zaobljen sprijeda (iza brade) i straga. */
function plateShape(P, grow = 0) {
  const s = new THREE.Shape();
  const x0 = -P.halfX - grow, x1 = P.halfX + grow, z0 = P.z0 - grow, z1 = P.z1 + grow;
  const cf = P.cornerFront, cb = P.cornerBack;
  // Shape je u ravnini (x, -z): nakon rotateX(-90°) lokalni y oblika postaje -z.
  s.moveTo(x0 + cb, -z0);
  s.lineTo(x1 - cb, -z0);
  s.quadraticCurveTo(x1, -z0, x1, -z0 - cb);
  s.lineTo(x1, -z1 + cf);
  s.quadraticCurveTo(x1, -z1, x1 - cf, -z1);
  s.lineTo(x0 + cf, -z1);
  s.quadraticCurveTo(x0, -z1, x0, -z1 + cf);
  s.lineTo(x0, -z0 - cb);
  s.quadraticCurveTo(x0, -z0, x0 + cb, -z0);
  return s;
}

/** Ploča na dnu lubanje: ekstrudirani tlocrt s prirubnicom, vijcima, ležajem kralježnice i prolazima. */
function skullPlate(mats) {
  const P = SKULL_PLATE;
  const h = P.top - P.bottom;
  const g = new THREE.Group();
  g.name = 'skullPlate';
  // ExtrudeGeometry ide po +z oblika; rotateX(-90°) → visina po +y, oblik (x, y) → (x, -z).
  const geo = new THREE.ExtrudeGeometry(plateShape(P, -0.12), { depth: h - 0.24, bevelEnabled: true, bevelThickness: 0.12, bevelSize: 0.12, bevelSegments: 2, curveSegments: 10 });
  geo.rotateX(-Math.PI / 2).translate(0, P.bottom + 0.12, 0);
  const plate = new THREE.Mesh(geo, mats.titanium);
  plate.castShadow = true;
  plate.receiveShadow = true;
  g.add(plate);
  // Tamna prirubnica pri dnu (spoj s vratom) i žlijeb.
  const fl = new THREE.ExtrudeGeometry(plateShape(P, 0.06), { depth: 0.28, bevelEnabled: false, curveSegments: 10 });
  fl.rotateX(-Math.PI / 2).translate(0, P.bottom + 0.35, 0);
  const flange = new THREE.Mesh(fl, mats.graphite);
  flange.castShadow = true;
  g.add(flange);
  const bolts = [];
  for (const [x, z] of [[-2.25, -8.7], [2.25, -8.7], [-2.35, -5.6], [2.35, -5.6], [-1.15, -3.25], [1.15, -3.25], [-2.3, -7.3], [2.3, -7.3]]) bolts.push(V(x, P.bottom - 0.04, z));
  g.add(boltRing(mats, bolts, 0.13, V(0, -1, 0)));
  // Ležaj vrha kralježnice: kromirani prsten s tamnim središtem.
  const sp = SKULL_PORTS.spine;
  const R = SKULL_PORTS.spineBearing;
  const bearing = new THREE.Mesh(new THREE.CylinderGeometry(R, R, 0.36, 48).translate(sp.x, P.bottom - 0.18, sp.z), mats.chrome);
  const race = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.55, R * 0.55, 0.4, 32).translate(sp.x, P.bottom - 0.2, sp.z), mats.graphite);
  bearing.castShadow = true;
  g.add(bearing, race);
  // Prolazi grane hlađenja kroz dno kaveza (od vrha ploče do unutrašnjosti lubanje).
  for (const b of SKULL_PORTS.bulkhead) {
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, P.top - b.y + 0.2, 16).translate(b.x, (P.top + b.y) / 2 - 0.1, b.z), mats.anodized);
    const nut = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.46, 0.22, 6).translate(b.x, b.y - 0.32, b.z), mats.chrome);
    g.add(tube, nut);
  }
  return g;
}

/** Nosač u otvoru vrata (poprsje): valjak s prirubnicom, ležajem kralježnice i vijcima. */
function neckBaseMount(mats) {
  const B = NECK_BASE_MOUNT;
  const g = new THREE.Group();
  g.name = 'neckBaseMount';
  const h = B.top - B.bottom;
  const body = new THREE.Mesh(new THREE.CylinderGeometry(B.r * 0.92, B.r, h, 56).translate(B.c.x, (B.top + B.bottom) / 2, B.c.z), mats.titanium);
  const flange = new THREE.Mesh(new THREE.CylinderGeometry(B.r * 1.04, B.r * 1.04, 0.3, 56).translate(B.c.x, B.top - 0.15, B.c.z), mats.graphite);
  const bearing = new THREE.Mesh(new THREE.CylinderGeometry(SKULL_PORTS.spineBearing, SKULL_PORTS.spineBearing, 0.36, 48).translate(BASE_PORTS.spine.x, B.top + 0.18, BASE_PORTS.spine.z), mats.chrome);
  for (const m of [body, flange, bearing]) {
    m.castShadow = true;
    m.receiveShadow = true;
  }
  const bolts = [];
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 + 0.3;
    bolts.push(V(B.c.x + Math.cos(a) * B.r * 0.9, B.top + 0.02, B.c.z + Math.sin(a) * B.r * 0.9));
  }
  g.add(body, flange, bearing, boltRing(mats, bolts, 0.12, V(0, 1, 0)));
  return g;
}

function boltRing(mats, positions, r, up) {
  const im = new THREE.InstancedMesh(new THREE.CylinderGeometry(r, r, r * 0.9, 6), mats.chrome, positions.length);
  const q = new THREE.Quaternion().setFromUnitVectors(UP, up);
  const m4 = new THREE.Matrix4();
  positions.forEach((p, i) => im.setMatrixAt(i, m4.compose(p, q, new THREE.Vector3(1, 1, 1))));
  im.castShadow = true;
  return im;
}

/**
 * @param {object} o
 * @param {THREE.Object3D} o.root prostor poprsja (grupa vrata je u njemu)
 * @param {THREE.Object3D} o.head čvor glave (ploča na dnu lubanje je u njemu)
 * @param {THREE.Object3D} o.torso čvor poprsja (nosač vrata, priključci na trapezu)
 * @param {object} o.mats materijali (graphite, chrome, anodized, braided, rubber, titanium, glass, bore)
 * @param {(len:number, rad:number) => THREE.Material} o.fluid materijal tekućine za cijev
 */
export class NeckRig {
  constructor({ root, head, torso, mats, fluid, lite = false }) {
    this.root = root;
    this.head = head;
    this.torso = torso;
    this.group = new THREE.Group();
    this.group.name = 'neck';
    root.add(this.group);
    this.cables = []; // sve veze s priključcima (Cable)
    // Mobitel: utikači i priključci vrata bez sjena (manje prolaza sjena).
    if (lite) connectorShadows(this.group, false);

    // Nosači: ploča lubanje (glava) i nosač u otvoru vrata (poprsje).
    this.plate = skullPlate(mats);
    this.mount = neckBaseMount(mats);
    head.add(this.plate);
    torso.add(this.mount);
    // Obujmica crijeva i ušice klipova na ploči lubanje / nosaču vrata.
    head.add(
      lugs(mats, [
        ...SKULL_PORTS.pistonFront.map((p) => [p, V(p.x, SKULL_PLATE.bottom, p.z)]),
        ...SKULL_PORTS.pistonSide.map((p) => [p, V(Math.sign(p.x) * (SKULL_PLATE.halfX - 0.4), SKULL_PLATE.bottom + 0.45, p.z), V(0, 0, 1)]),
      ]),
    );
    // Bočni klipovi sjede na trapezu: ušica na površini, svornjak malo iznad.
    this.sidePins = [];
    const torsoLugs = BASE_PORTS.pistonFront.map((p) => [p, V(p.x, NECK_BASE_MOUNT.top, p.z)]);
    for (const sx of [-1, 1]) {
      const [x, z] = BASE_PORTS.pistonSide[0];
      const { p, n } = torsoSurface(sx * x, z);
      const pin = p.clone().addScaledVector(n, 0.55);
      torsoLugs.push([pin, p.clone().addScaledVector(n, -0.2), V(0, 0, 1)]);
      this.sidePins.push(pin);
    }
    torso.add(lugs(mats, torsoLugs));

    // Kralježnični stup: diskovi na savitljivoj jezgri, od ležaja nosača vrata do ležaja lubanje.
    this.vertebrae = [];
    const disc = new THREE.CylinderGeometry(1.46, 1.54, 0.9, 40, 1);
    const ring = new THREE.TorusGeometry(1.36, 0.08, 10, 48).rotateX(Math.PI / 2);
    for (let i = 0; i < 7; i++) {
      const v = new THREE.Group();
      const d = new THREE.Mesh(disc, mats.graphite);
      const r = new THREE.Mesh(ring, mats.chrome);
      r.position.y = 0.55;
      d.castShadow = r.castShadow = true;
      d.receiveShadow = true;
      v.add(d, r);
      this.group.add(v);
      this.vertebrae.push(v);
    }
    this.spineCore = new FlexTube(mats.chrome, { radius: 0.55, segments: 24, radial: 14 });
    this.group.add(this.spineCore.mesh);

    // Hidraulika: prednji par (ispod čeljusti) i bočni par.
    this.pistons = [
      { p: new Piston(mats, { bodyR: 0.46, rodR: 0.21, bodyLen: 5.6, rodLen: 6.0 }), a: { node: torso, pos: BASE_PORTS.pistonFront[0] }, b: { node: head, pos: SKULL_PORTS.pistonFront[0] } },
      { p: new Piston(mats, { bodyR: 0.46, rodR: 0.21, bodyLen: 5.6, rodLen: 6.0 }), a: { node: torso, pos: BASE_PORTS.pistonFront[1] }, b: { node: head, pos: SKULL_PORTS.pistonFront[1] } },
      { p: new Piston(mats, { bodyR: 0.38, rodR: 0.17, bodyLen: 5.0, rodLen: 5.6 }), a: { node: torso, pos: this.sidePins[0] }, b: { node: head, pos: SKULL_PORTS.pistonSide[0] }, side: true },
      { p: new Piston(mats, { bodyR: 0.38, rodR: 0.17, bodyLen: 5.0, rodLen: 5.6 }), a: { node: torso, pos: this.sidePins[1] }, b: { node: head, pos: SKULL_PORTS.pistonSide[1] }, side: true },
    ];
    for (const { p } of this.pistons) this.group.add(p.group);

    // Pleteni kabeli: od stražnje plohe ploče lubanje (natrag, malo dolje i van) do trapeza.
    for (const sx of [-1, 1]) {
      SKULL_PORTS.cables.forEach((hp, i) => {
        const [bx, bz] = BASE_PORTS.cables[i];
        const { p, n } = torsoSurface(sx * bx, bz);
        const r = [0.22, 0.27, 0.32][i];
        const cable = new Cable({
          name: `kabel vrata ${sx < 0 ? 'L' : 'D'}${i + 1}`,
          mats,
          material: mats.braided,
          radius: r,
          space: this.group,
          a: { node: head, pos: V(sx * hp.pos.x, hp.pos.y, hp.pos.z), dir: V(sx * hp.dir.x, hp.dir.y, hp.dir.z) },
          b: { node: torso, pos: p.clone().addScaledVector(n, -0.04), dir: n },
          // Isti pomak za sva tri kabela strane: razmak među njima prati razmak priključaka.
          via: [{ t: 0.45, offset: V(sx * 0.9, -0.3, -0.9) }],
          lead: 0.7,
          segments: 40,
        });
        this.cables.push(cable);
      });
    }

    // Rebrasto crijevo grla s obujmicama na oba kraja.
    this.hose = new Cable({
      name: 'crijevo grla',
      mats,
      material: mats.rubber,
      radius: 0.46,
      space: this.group,
      a: { node: torso, pos: BASE_PORTS.hose, dir: V(0, 1, 0.05) },
      b: { node: head, pos: SKULL_PORTS.hose, dir: V(0, -1, 0.05) },
      via: [{ t: 0.5, offset: V(0, 0, 0.55) }],
      lead: 0.6,
      segments: 64,
      radial: 16,
      ripple: 0.16,
    });
    this.cables.push(this.hose);

    // Grana tekućeg hlađenja: dovod (lijevo) i povrat (desno), iza kralježnice; na lubanji
    // izlaze iz stražnje plohe ploče, na poprsju ulaze u nosač vrata.
    this.coolant = [0, 1].map((i) =>
      new Cable({
        name: `hlađenje vrat ${i ? 'povrat' : 'dovod'}`,
        mats,
        material: mats.glass,
        core: fluid(11, 0.26 * 0.68),
        radius: 0.26,
        space: this.group,
        a: { node: torso, pos: BASE_PORTS.coolant[i], dir: V(0, 1, -0.05) },
        b: { node: head, pos: SKULL_PORTS.coolant[i], dir: V(0, -0.35, -1) },
        via: [{ t: 0.55, offset: V(i ? 0.25 : -0.25, 0, -0.5) }],
        lead: 0.5,
        segments: 40,
        radial: 10,
      }),
    );
    this.cables.push(...this.coolant);

    if (lite) {
      for (const root of [this.plate, this.mount]) root.traverse((o) => { if (o.isMesh) o.castShadow = false; });
      for (const c of this.cables) if (c.radius < 0.3) c.tube.mesh.castShadow = false;
    }
    this.unplug = 0; // 0 = ukopčano, 1 = kabeli izvučeni iz lubanje i bočni klipovi uvučeni
    this._m = new THREE.Matrix4();
    this._q0 = new THREE.Quaternion();
    this._qh = new THREE.Quaternion();
  }

  /** Točka iz prostora čvora u prostor vrata (root). */
  toRoot(node, v, out) {
    node.updateWorldMatrix(true, false);
    return out.copy(v).applyMatrix4(node.matrixWorld).applyMatrix4(this._inv);
  }

  update() {
    this.root.updateMatrixWorld();
    this._inv = this._inv ?? new THREE.Matrix4();
    this._inv.copy(this.root.matrixWorld).invert();
    this._m.copy(this._inv).multiply(this.head.matrixWorld);
    this._qh.setFromRotationMatrix(this._m);
    this.torso.updateWorldMatrix(true, false);
    this._q0.setFromRotationMatrix(_m2.copy(this._inv).multiply(this.torso.matrixWorld));

    // Kralježnica: od ležaja nosača vrata do ležaja lubanje (Bézier), diskovi ravnomjerno.
    const base = this.toRoot(this.torso, BASE_PORTS.spine, new THREE.Vector3()).add(_a.set(0, 0.35, 0));
    const top = this.toRoot(this.head, SKULL_PORTS.spine, new THREE.Vector3());
    const topDir = _b.set(0, -1, 0).applyQuaternion(this._qh);
    top.addScaledVector(topDir, 0.35);
    const ctrl = new THREE.Vector3().lerpVectors(base, top, 0.5);
    ctrl.z -= 0.4;
    const bez = (t, out) => {
      const it = 1 - t;
      return out.set(
        it * it * base.x + 2 * it * t * ctrl.x + t * t * top.x,
        it * it * base.y + 2 * it * t * ctrl.y + t * t * top.y,
        it * it * base.z + 2 * it * t * ctrl.z + t * t * top.z,
      );
    };
    const n = this.vertebrae.length;
    const span = base.distanceTo(top);
    const half = 0.45 / span; // pola visine diska u udjelu krivulje
    this.vertebrae.forEach((v, i) => {
      const t = half + (i / (n - 1)) * (1 - 2 * half);
      bez(t, v.position);
      v.quaternion.slerpQuaternions(this._q0, this._qh, t);
    });
    const core = [];
    for (let i = 0; i <= 6; i++) core.push(bez(i / 6, new THREE.Vector3()));
    // Jezgra ulazi u ležajeve na oba kraja.
    core[0].addScaledVector(_a.set(0, -1, 0), 0.3);
    core[6].addScaledVector(topDir, -0.3);
    this.spineCore.update(core);
    this.spineEnds = { base: core[0], top: core[6] };

    const u = this.unplug;
    for (const pst of this.pistons) {
      const a = this.toRoot(pst.a.node, pst.a.pos, new THREE.Vector3());
      const b = this.toRoot(pst.b.node, pst.b.pos, new THREE.Vector3());
      pst.p.update(a, b);
    }

    // Pri rastavljanju se pleteni kabeli iskopčaju na lubanji (utikač izađe iz priključka);
    // crijevo i cijevi hlađenja ostaju spojeni i prate glavu.
    for (const c of this.cables) {
      if (c.kind === 'cable' && c !== this.hose) c.unplug[0] = 1.5 * u;
      c.update();
    }
  }

  /** Mjerenje spojenosti svih krajeva (cm): kabeli, crijevo, cijevi, klipovi, kralježnica. */
  measure() {
    const out = [];
    for (const c of this.cables) out.push(...c.measure());
    const w = new THREE.Vector3();
    // Klipovi: zglobna glava mora biti na svornjaku ušice, a klipnjača u tijelu cilindra.
    const inv = new THREE.Matrix4().copy(this.root.matrixWorld).invert();
    const W = (o) => o.getWorldPosition(new THREE.Vector3()).applyMatrix4(inv);
    for (const [i, pst] of this.pistons.entries()) {
      const name = `klip ${['prednji L', 'prednji D', 'bočni L', 'bočni D'][i]}`;
      const pa = this.toRoot(pst.a.node, pst.a.pos, new THREE.Vector3());
      const pb = this.toRoot(pst.b.node, pst.b.pos, new THREE.Vector3());
      const span = pa.distanceTo(pb);
      // Preklop klipnjače i tijela (mora biti > 0, inače bi klipnjača ispala iz cilindra).
      const overlap = pst.p.bodyLen + pst.p.rodLen - span;
      out.push({ name: `${name} dolje`, plugToSocket: W(pst.p.endA).distanceTo(pa), cableToPlug: 0 });
      out.push({ name: `${name} gore`, plugToSocket: W(pst.p.endB).distanceTo(pb), cableToPlug: Math.max(0, -overlap), overlap });
    }
    // Kralježnica: kraj jezgre mora biti u ležaju (ušće ležaja, jezgra ulazi 0,3 u njega).
    const baseP = this.toRoot(this.torso, BASE_PORTS.spine, new THREE.Vector3());
    const topP = this.toRoot(this.head, SKULL_PORTS.spine, new THREE.Vector3());
    w.copy(this.spineEnds.base);
    out.push({ name: 'kralježnica dolje', plugToSocket: Math.abs(w.distanceTo(baseP) - 0.05), cableToPlug: 0 });
    w.copy(this.spineEnds.top);
    out.push({ name: 'kralježnica gore', plugToSocket: Math.abs(w.distanceTo(topP) - 0.05), cableToPlug: 0 });
    return out;
  }
}
const _m2 = new THREE.Matrix4();
