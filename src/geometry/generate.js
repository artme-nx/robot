// Glavna nit: pokreće generiranje u workerima i vraća THREE.BufferGeometry po dijelu.

import * as THREE from 'three';
import { loadBakedGeometry } from './baked.js';

const cache = new Map();
let nextId = 1;
let baked = null; // mobitel: { url, onProgress, promise }

/** Mobitel: geometrija dolazi iz unaprijed izračunate datoteke (bez workera i računanja). */
export function useBakedGeometry(url, onProgress) {
  baked = { url, onProgress, promise: null };
}

export function generateSDF(name, params = {}) {
  if (baked) {
    baked.promise ??= loadBakedGeometry(baked.url, baked.onProgress);
    return baked.promise.then((all) => {
      if (!all[name]) throw new Error(`Nema unaprijed izračunate geometrije za ${name}`);
      return all[name];
    });
  }
  const key = name + JSON.stringify(params);
  if (cache.has(key)) return cache.get(key);
  const promise = new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./sdfWorker.js', import.meta.url), { type: 'module' });
    const id = nextId++;
    worker.onmessage = (ev) => {
      worker.terminate();
      if (ev.data.error) {
        reject(new Error(ev.data.error));
        return;
      }
      const geometries = {};
      for (const m of ev.data.meshes) {
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.BufferAttribute(m.positions, 3));
        g.setAttribute('normal', new THREE.BufferAttribute(m.normals, 3));
        g.setIndex(new THREE.BufferAttribute(m.indices, 1));
        if (m.depth) g.setAttribute('shellDepth', new THREE.BufferAttribute(m.depth, 1));
        g.computeBoundingBox();
        g.computeBoundingSphere();
        geometries[m.name] = g;
      }
      console.info(`[sdf] ${name}`, ev.data.stats);
      resolve(geometries);
    };
    worker.onerror = (e) => {
      worker.terminate();
      reject(e);
    };
    worker.postMessage({ id, name, params });
  });
  cache.set(key, promise);
  return promise;
}
