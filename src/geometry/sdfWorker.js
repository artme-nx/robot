// Web worker: SDF model → mreže (jezgra u buildMeshes.js), rezultat se prenosi bez kopiranja.

import { buildMeshes } from './buildMeshes.js';

self.onmessage = async (ev) => {
  const { id, name, params } = ev.data;
  try {
    const { meshes, stats, transfer } = await buildMeshes(name, params);
    self.postMessage({ id, meshes, stats }, transfer);
  } catch (err) {
    self.postMessage({ id, error: String(err?.stack ?? err) });
  }
};
