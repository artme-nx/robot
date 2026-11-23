// Mobitel: geometrija robota izračunata unaprijed pri buildu (scripts/bake-mobile.mjs),
// komprimirana meshoptimizerom. Ovdje se samo preuzme i dekodira — bez računanja SDF-a.

import * as THREE from 'three';
import { MeshoptDecoder } from 'meshoptimizer/decoder';
import { fetchBytes } from '../net.js';

/**
 * @param {string} url
 * @param {(loaded: number) => void} [onProgress]
 * @returns {Promise<Record<string, Record<string, THREE.BufferGeometry>>>} model → dio → geometrija
 */
export async function loadBakedGeometry(url, onProgress) {
  const [buf] = await Promise.all([fetchBytes(url, onProgress), MeshoptDecoder.ready]);
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  if (new TextDecoder().decode(buf.subarray(0, 4)) !== 'RBM1') throw new Error('Neispravna datoteka geometrije');
  const headerLen = dv.getUint32(4, true);
  const header = JSON.parse(new TextDecoder().decode(buf.subarray(8, 8 + headerLen)));
  const base = 8 + headerLen + ((4 - ((8 + headerLen) % 4)) % 4);
  const block = ([offset, length]) => buf.subarray(base + offset, base + offset + length);

  const out = {};
  for (const [name, model] of Object.entries(header.models)) {
    out[name] = {};
    for (const m of model.meshes) {
      const n = m.vertexCount;
      // Pozicije: 16 bita unutar okvira dijela.
      const q = new Uint8Array(n * 8);
      MeshoptDecoder.decodeVertexBuffer(q, n, 8, block(m.pos));
      const q16 = new Uint16Array(q.buffer);
      const positions = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        for (let c = 0; c < 3; c++) positions[i * 3 + c] = m.min[c] + (q16[i * 4 + c] / 65535) * (m.max[c] - m.min[c]);
      }
      // Normale: oktaedarski filtar → snorm8.
      const nq = new Uint8Array(n * 4);
      MeshoptDecoder.decodeVertexBuffer(nq, n, 4, block(m.nrm), 'OCTAHEDRAL');
      const n8 = new Int8Array(nq.buffer);
      const normals = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        const x = n8[i * 4], y = n8[i * 4 + 1], z = n8[i * 4 + 2];
        const l = Math.hypot(x, y, z) || 1;
        normals[i * 3] = x / l;
        normals[i * 3 + 1] = y / l;
        normals[i * 3 + 2] = z / l;
      }
      const iq = new Uint8Array(m.indexCount * 4);
      MeshoptDecoder.decodeIndexBuffer(iq, m.indexCount, 4, block(m.idx));
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      g.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
      g.setIndex(new THREE.BufferAttribute(new Uint32Array(iq.buffer), 1));
      if (m.depth) {
        const dq = new Uint8Array(n * 4);
        MeshoptDecoder.decodeVertexBuffer(dq, n, 4, block(m.depth.block));
        const d16 = new Uint16Array(dq.buffer);
        const [d0, d1] = m.depth.range;
        const depth = new Float32Array(n);
        for (let i = 0; i < n; i++) depth[i] = d0 + (d16[i * 2] / 65535) * (d1 - d0);
        g.setAttribute('shellDepth', new THREE.BufferAttribute(depth, 1));
      }
      g.computeBoundingBox();
      g.computeBoundingSphere();
      out[name][m.name] = g;
    }
  }
  return out;
}
