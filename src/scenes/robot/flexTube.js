// Cijev duž krivulje s fiksnom topologijom — vrhovi se pomiču svaki frame (kabeli,
// crijeva, cijevi s tekućinom). UV: u duž cijevi (0..1), v oko opsega.

import * as THREE from 'three';

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _d = new THREE.Vector3();
const S_DIV = (s) => s * 2;

/** Cijev duž krivulje s fiksnom topologijom — vrhovi se pomiču svaki frame. */
export class FlexTube {
  constructor(material, { segments = 48, radial = 12, radius = 0.3, ripple = 0 } = {}) {
    this.segments = segments;
    this.radial = radial;
    this.radius = radius;
    this.ripple = ripple;
    const count = (segments + 1) * (radial + 1);
    this.positions = new Float32Array(count * 3);
    this.normals = new Float32Array(count * 3);
    const uvs = new Float32Array(count * 2);
    const index = [];
    for (let i = 0; i <= segments; i++) {
      for (let j = 0; j <= radial; j++) {
        const k = i * (radial + 1) + j;
        uvs[k * 2] = i / segments;
        uvs[k * 2 + 1] = j / radial;
        if (i < segments && j < radial) {
          // Namotaj tako da normala lica gleda prema van (du × dv = -van).
          const a = k, b = k + radial + 1, c = k + radial + 2, d = k + 1;
          index.push(a, d, b, b, d, c);
        }
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.positions, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('normal', new THREE.BufferAttribute(this.normals, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    g.setIndex(index);
    this.geometry = g;
    this.mesh = new THREE.Mesh(g, material);
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.mesh.frustumCulled = false;
    // Vrhovi se mijenjaju svaki frame: nikad se ne spaja sa statičnim mrežama.
    this.mesh.userData.keep = true;
    this.curve = new THREE.CatmullRomCurve3([new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()], false, 'centripetal');
    this._t = new THREE.Vector3();
    this._n = new THREE.Vector3(1, 0, 0);
    this._bn = new THREE.Vector3();
    this._p = new THREE.Vector3();
  }

  /** @param {THREE.Vector3[]} points kontrolne točke krivulje */
  update(points) {
    const curve = this.curve;
    for (let i = 0; i < points.length; i++) {
      if (!curve.points[i]) curve.points[i] = new THREE.Vector3();
      curve.points[i].copy(points[i]);
    }
    curve.points.length = points.length;
    // Točke se mijenjaju svaki frame: duljine luka (parametrizacija po duljini) treba preračunati.
    curve.arcLengthDivisions = Math.max(48, S_DIV(this.segments));
    curve.needsUpdate = true;
    const S = this.segments, R = this.radial;
    const t = this._t, n = this._n, bn = this._bn, p = this._p;
    curve.getTangentAt(0, t);
    // Početna normala okomita na tangentu, dalje paralelni prijenos.
    n.set(0, 0, 1);
    if (Math.abs(t.dot(n)) > 0.9) n.set(1, 0, 0);
    n.sub(_a.copy(t).multiplyScalar(t.dot(n))).normalize();
    for (let i = 0; i <= S; i++) {
      const u = i / S;
      curve.getPointAt(u, p);
      const tPrev = _b.copy(t);
      curve.getTangentAt(u, t);
      // Paralelni prijenos normale.
      const axis = _d.crossVectors(tPrev, t);
      const s = axis.length();
      if (s > 1e-6) {
        axis.divideScalar(s);
        const ang = Math.acos(THREE.MathUtils.clamp(tPrev.dot(t), -1, 1));
        n.applyAxisAngle(axis, ang);
      }
      bn.crossVectors(t, n);
      let r = this.radius;
      if (this.ripple) r *= 1 + this.ripple * Math.pow(Math.abs(Math.sin(u * Math.PI * 28)), 3);
      for (let j = 0; j <= R; j++) {
        const v = (j / R) * Math.PI * 2;
        const cx = Math.cos(v), sy = Math.sin(v);
        const nx = n.x * cx + bn.x * sy, ny = n.y * cx + bn.y * sy, nz = n.z * cx + bn.z * sy;
        const k = (i * (R + 1) + j) * 3;
        this.positions[k] = p.x + nx * r;
        this.positions[k + 1] = p.y + ny * r;
        this.positions[k + 2] = p.z + nz * r;
        this.normals[k] = nx;
        this.normals[k + 1] = ny;
        this.normals[k + 2] = nz;
      }
    }
    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.normal.needsUpdate = true;
  }
}
