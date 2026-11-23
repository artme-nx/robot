// Pri buildu (npm run build / dev): unaprijed pripremi sve što mobitel inače računa ili
// skida u punoj veličini, da robot na mobitelu bude vidljiv za par sekundi.
//   1. Geometrija robota (glava + poprsje) u grubljoj razini, komprimirana meshoptimizerom
//      → public/mobile/robot.bin (mobitel je samo dekodira, ništa ne računa).
//   2. Studijski HDRI smanjen s 2k na 1k (RGBE s RLE) → public/mobile/studio_1k.hdr.
//   3. src/generated/mobileAssets.js — putanje i točne veličine (za stvarni napredak učitavanja).
// Računalo ništa od ovoga ne koristi (geometriju i dalje računa u workerima, HDRI je 2k).

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MeshoptEncoder } from 'meshoptimizer/encoder';
import { buildMeshes } from '../src/geometry/buildMeshes.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'public/mobile');
const GEN = join(ROOT, 'src/generated');

// Mobilna razina detalja: veći korak mreže i veća dopuštena greška pojednostavljenja
// (0,02–0,03 cm, nevidljivo na ekranu mobitela; normale i dalje dolaze iz SDF-a, pa je
// sjenčanje jednako glatko). Računalo: 0,095 / 0,14 cm korak i 0,006 / 0,008 cm greška.
const MOBILE_LOD = {
  robotHead: { step: 0.12, simplifyError: 0.02 },
  robotBody: { step: 0.18, simplifyError: 0.03 },
};

const t0 = performance.now();
await MeshoptEncoder.ready;
mkdirSync(OUT, { recursive: true });
mkdirSync(GEN, { recursive: true });

// ---------- 1. Geometrija ----------
const blocks = [];
let offset = 0;
const addBlock = (u8) => {
  const at = offset;
  blocks.push(u8);
  offset += u8.byteLength;
  const pad = (4 - (offset % 4)) % 4;
  if (pad) {
    blocks.push(new Uint8Array(pad));
    offset += pad;
  }
  return [at, u8.byteLength];
};

const header = { version: 1, models: {} };
let totalTris = 0;
for (const [name, params] of Object.entries(MOBILE_LOD)) {
  const { meshes, stats } = await buildMeshes(name, params);
  totalTris += stats.tris;
  header.models[name] = { params, tris: stats.tris, meshes: [] };
  for (const m of meshes) {
    const vcount = m.positions.length / 3;
    const indices = new Uint32Array(m.indices);
    // Poredak za GPU (vertex cache / fetch) — ujedno najbolje komprimira.
    const [remap, unique] = MeshoptEncoder.reorderMesh(indices, true, true);
    const move = (src, comps) => {
      const out = new Float32Array(unique * comps);
      for (let i = 0; i < vcount; i++) {
        const r = remap[i];
        if (r === 0xffffffff) continue;
        for (let c = 0; c < comps; c++) out[r * comps + c] = src[i * comps + c];
      }
      return out;
    };
    const pos = move(m.positions, 3);
    const nrm = move(m.normals, 3);
    const depth = m.depth ? move(m.depth, 1) : null;

    // Pozicije: 16 bita po osi unutar okvira dijela (preciznost ~0,001 cm).
    const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < unique; i++) for (let c = 0; c < 3; c++) {
      min[c] = Math.min(min[c], pos[i * 3 + c]);
      max[c] = Math.max(max[c], pos[i * 3 + c]);
    }
    const q = new Uint16Array(unique * 4);
    for (let i = 0; i < unique; i++) for (let c = 0; c < 3; c++) {
      const span = max[c] - min[c] || 1;
      q[i * 4 + c] = Math.round(((pos[i * 3 + c] - min[c]) / span) * 65535);
    }
    // Normale: oktaedarsko kodiranje, 8 bita.
    const n4 = new Float32Array(unique * 4);
    for (let i = 0; i < unique; i++) for (let c = 0; c < 3; c++) n4[i * 4 + c] = nrm[i * 3 + c];
    const oct = MeshoptEncoder.encodeFilterOct(n4, unique, 4, 8);
    // Dubina ispod vanjske ljuske (samo neki dijelovi): 16 bita u rasponu.
    let depthInfo = null;
    if (depth) {
      let dmin = Infinity, dmax = -Infinity;
      for (const d of depth) {
        dmin = Math.min(dmin, d);
        dmax = Math.max(dmax, d);
      }
      const dq = new Uint16Array(unique * 2);
      for (let i = 0; i < unique; i++) dq[i * 2] = Math.round(((depth[i] - dmin) / (dmax - dmin || 1)) * 65535);
      depthInfo = { range: [dmin, dmax], block: addBlock(MeshoptEncoder.encodeVertexBuffer(new Uint8Array(dq.buffer), unique, 4)) };
    }
    header.models[name].meshes.push({
      name: m.name,
      vertexCount: unique,
      indexCount: indices.length,
      min,
      max,
      pos: addBlock(MeshoptEncoder.encodeVertexBuffer(new Uint8Array(q.buffer), unique, 8)),
      nrm: addBlock(MeshoptEncoder.encodeVertexBuffer(oct, unique, 4)),
      idx: addBlock(MeshoptEncoder.encodeIndexBuffer(new Uint8Array(indices.buffer), indices.length, 4)),
      depth: depthInfo,
    });
  }
}
// Datoteka: "RBM1" | duljina zaglavlja (u32) | JSON zaglavlje | poravnanje | blokovi.
const json = new TextEncoder().encode(JSON.stringify(header));
const pre = 8 + json.byteLength;
const prePad = (4 - (pre % 4)) % 4;
const file = new Uint8Array(pre + prePad + offset);
file.set(new TextEncoder().encode('RBM1'), 0);
new DataView(file.buffer).setUint32(4, json.byteLength, true);
file.set(json, 8);
let at = pre + prePad;
for (const b of blocks) {
  file.set(b, at);
  at += b.byteLength;
}
writeFileSync(join(OUT, 'robot.bin'), file);

// ---------- 2. HDRI 2k → 1k (RGBE) ----------
function readHDR(buf) {
  let p = 0;
  const line = () => {
    let s = '';
    while (buf[p] !== 0x0a) s += String.fromCharCode(buf[p++]);
    p++;
    return s;
  };
  const lines = [];
  for (let l = line(); l !== ''; l = line()) lines.push(l);
  const res = line().match(/-Y (\d+) \+X (\d+)/);
  const H = +res[1], W = +res[2];
  const rgbe = new Uint8Array(W * H * 4);
  for (let y = 0; y < H; y++) {
    const row = y * W * 4;
    if (buf[p] === 2 && buf[p + 1] === 2 && ((buf[p + 2] << 8) | buf[p + 3]) === W) {
      p += 4;
      for (let c = 0; c < 4; c++) {
        for (let x = 0; x < W; ) {
          let n = buf[p++];
          if (n > 128) {
            n -= 128;
            const v = buf[p++];
            for (let k = 0; k < n; k++) rgbe[row + (x++) * 4 + c] = v;
          } else {
            for (let k = 0; k < n; k++) rgbe[row + (x++) * 4 + c] = buf[p++];
          }
        }
      }
    } else {
      rgbe.set(buf.subarray(p, p + W * 4), row);
      p += W * 4;
    }
  }
  return { W, H, rgbe, header: lines };
}
function toFloat(r, g, b, e) {
  if (!e) return [0, 0, 0];
  const f = Math.pow(2, e - 136);
  return [r * f, g * f, b * f];
}
function toRGBE(r, g, b) {
  const m = Math.max(r, g, b);
  if (m < 1e-32) return [0, 0, 0, 0];
  const e = Math.ceil(Math.log2(m) + 1e-9);
  const f = Math.pow(2, 8 - e);
  return [Math.min(255, Math.floor(r * f)), Math.min(255, Math.floor(g * f)), Math.min(255, Math.floor(b * f)), e + 128];
}
function writeHDR(W, H, rgbe) {
  const parts = [Buffer.from(`#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n\n-Y ${H} +X ${W}\n`, 'ascii')];
  const out = [];
  for (let y = 0; y < H; y++) {
    out.push(2, 2, W >> 8, W & 255);
    for (let c = 0; c < 4; c++) {
      const ch = new Uint8Array(W);
      for (let x = 0; x < W; x++) ch[x] = rgbe[(y * W + x) * 4 + c];
      // RLE: niz od ≥ 3 jednaka bajta → (128 + n, v); inače doslovno do 128 bajtova.
      for (let x = 0; x < W; ) {
        let run = 1;
        while (x + run < W && run < 127 && ch[x + run] === ch[x]) run++;
        if (run >= 3) {
          out.push(128 + run, ch[x]);
          x += run;
        } else {
          let n = 0;
          const start = x;
          while (x < W && n < 128) {
            let r2 = 1;
            while (x + r2 < W && r2 < 3 && ch[x + r2] === ch[x]) r2++;
            if (r2 >= 3) break;
            x++;
            n++;
          }
          out.push(n, ...ch.subarray(start, start + n));
        }
      }
    }
  }
  parts.push(Buffer.from(out));
  return Buffer.concat(parts);
}
const src = readHDR(readFileSync(join(ROOT, 'public/env/ferndale_studio_11_2k.hdr')));
const W2 = src.W / 2, H2 = src.H / 2;
const small = new Uint8Array(W2 * H2 * 4);
for (let y = 0; y < H2; y++) for (let x = 0; x < W2; x++) {
  let r = 0, g = 0, b = 0;
  for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
    const i = ((y * 2 + dy) * src.W + (x * 2 + dx)) * 4;
    const [fr, fg, fb] = toFloat(src.rgbe[i], src.rgbe[i + 1], src.rgbe[i + 2], src.rgbe[i + 3]);
    r += fr / 4;
    g += fg / 4;
    b += fb / 4;
  }
  small.set(toRGBE(r, g, b), (y * W2 + x) * 4);
}
const hdr = writeHDR(W2, H2, small);
writeFileSync(join(OUT, 'studio_1k.hdr'), hdr);

// ---------- 3. Manifest za aplikaciju ----------
const assets = {
  geometry: { url: 'mobile/robot.bin', bytes: file.byteLength },
  hdr: { url: 'mobile/studio_1k.hdr', bytes: hdr.byteLength },
};
writeFileSync(
  join(GEN, 'mobileAssets.js'),
  `// Generira scripts/bake-mobile.mjs pri buildu — ne uređivati ručno.\nexport const MOBILE_ASSETS = ${JSON.stringify(assets, null, 2)};\n`,
);

const mb = (n) => (n / 1e6).toFixed(2) + ' MB';
console.log(
  `[bake-mobile] geometrija ${totalTris} trokuta → ${mb(file.byteLength)} (gzip ${mb(gzipSync(file).byteLength)}), ` +
    `HDRI ${W2}×${H2} → ${mb(hdr.byteLength)} (gzip ${mb(gzipSync(hdr).byteLength)}), ${Math.round(performance.now() - t0)} ms`,
);
