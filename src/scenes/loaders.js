// Učitavanje vlastite glave robota: ispušteni .glb/.gltf (uz pripadne .bin i teksture).

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const MESH_EXT = ['glb', 'gltf'];

const ext = (name) => name.split('.').pop().toLowerCase();

/** Glavna datoteka modela među ispuštenima, ili null ako nema .glb/.gltf. */
export function classifyFiles(files) {
  const all = [...files];
  const main = all.find((f) => MESH_EXT.includes(ext(f.name)));
  return main ? { main, all } : null;
}

/** .glb ili .gltf (uz pripadne .bin/teksture ako su ispuštene zajedno). */
export async function loadMeshFiles(main, all) {
  const urls = new Map(all.map((f) => [f.name, URL.createObjectURL(f)]));
  const manager = new THREE.LoadingManager();
  manager.setURLModifier((url) => {
    const name = decodeURIComponent(url.split('/').pop().split('?')[0]);
    return urls.get(name) ?? url;
  });
  try {
    const gltf = await new GLTFLoader(manager).loadAsync(urls.get(main.name));
    // RobotScene.setCustomHead uzima model iz userData.inner.
    const wrapper = new THREE.Group();
    wrapper.add(gltf.scene);
    wrapper.userData = { inner: gltf.scene };
    return wrapper;
  } finally {
    // Teksture su već dekodirane; blob URL-ovi više nisu potrebni.
    setTimeout(() => urls.forEach((u) => URL.revokeObjectURL(u)), 5000);
  }
}
