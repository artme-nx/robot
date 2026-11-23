// Tekuće hlađenje: prozirne cijevi s jarko narančastom svjetlećom tekućinom (vidljivo strujanje,
// ponekad mjehurić), spremnik s razinom tekućine, pumpa s rotorom, vodeni blok na procesoru,
// hladnjak (radijator) s ventilatorom i povrat u spremnik; grana ide niz vrat do reaktora.
// Boja: narančasta; kad su oči jantarne — cijan (kontrast). Ljut robot: brže strujanje, više mjehurića.
// Svi dijelovi imaju priključke (ports: položaj + smjer izlaza, lokalno u grupi dijela).

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const FLUID_ORANGE = new THREE.Color('#ff6510');
export const FLUID_CYAN = new THREE.Color('#2fd9ff');

/** Zajednički uniformi svih tekućina (vrijeme, brzina, mjehurići, boja, sjaj). */
export function fluidUniforms() {
  return {
    time: { value: 0 },
    flow: { value: 2.2 }, // cm/s
    bubbles: { value: 0.16 }, // udio ćelija s mjehurićem
    color: { value: FLUID_ORANGE.clone() },
    intensity: { value: 1.25 },
  };
}

const fluidVertex = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vN;
  varying vec3 vV;
  void main() {
    vUv = uv;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vN = normalize(normalMatrix * normal);
    vV = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }
`;

const fluidFragment = /* glsl */ `
  uniform float time;
  uniform float flow;
  uniform float bubbles;
  uniform vec3 color;
  uniform float intensity;
  uniform float len;
  uniform float rad;
  varying vec2 vUv;
  varying vec3 vN;
  varying vec3 vV;
  float h1(float n) { return fract(sin(n) * 43758.5453); }
  void main() {
    float s = vUv.x * len;              // cm duž cijevi
    float a = vUv.y;                     // 0..1 oko opsega
    float x = s - time * flow;           // strujanje
    // Gustoća toka: dvije frekvencije, blago vrtložno po opsegu.
    float band = 0.5 + 0.5 * sin(x * 2.4 + a * 6.2832);
    band = mix(band, 0.5 + 0.5 * sin(x * 6.3 - a * 12.566), 0.35);
    // Mjehurići: ćelije duž cijevi; svaka ima (ili nema) mjehurić na slučajnom kutu, brži od tekućine.
    float xb = s - time * flow * 1.4;
    float cell = floor(xb / 0.8);
    float r = h1(cell * 12.9898 + 3.1);
    float ang = h1(cell * 78.233 + 1.7);
    float off = 0.25 + 0.5 * h1(cell * 39.425 + 5.3);
    float circ = 6.2832 * rad;
    vec2 d = vec2((fract(xb / 0.8) - off) * 0.8, (fract(a - ang + 0.5) - 0.5) * circ);
    float size = 0.07 + 0.06 * h1(cell * 7.77);
    float bub = step(r, bubbles) * smoothstep(size, size * 0.45, length(d));
    float rim = 1.0 - abs(dot(normalize(vN), normalize(vV)));
    // Jezgra toka svjetlija od rubova; vrijednosti ostaju blizu 1 po kanalu (bez tonemappinga),
    // pa narančasta ne prelazi u žutu — sjaj daje bloom.
    vec3 col = color * intensity * (0.72 + 0.5 * band) * (1.0 - 0.35 * rim * rim);
    col += vec3(1.0, 0.92, 0.8) * bub * 1.6;
    gl_FragColor = vec4(col, 1.0);
  }
`;

/** Materijal svjetleće tekućine (svaka cijev ima svoju duljinu i polumjer). */
export function fluidMaterial(shared, { len = 1, rad = 0.2 } = {}) {
  return new THREE.ShaderMaterial({
    uniforms: { ...shared, len: { value: len }, rad: { value: rad } },
    vertexShader: fluidVertex,
    fragmentShader: fluidFragment,
    toneMapped: false,
  });
}

/** Staklo cijevi i spremnika (bez transmisijskog prolaza — prozirnost + odsjaji okoline). */
export function glassMaterial() {
  // Samo zrcalni odsjaj (aditivno, crna difuzna boja): staklo ne "ispire" boju tekućine,
  // a Fresnel daje svijetle rubove cijevi kao kod pravog stakla.
  const m = new THREE.MeshPhysicalMaterial({
    color: '#000000',
    metalness: 0,
    roughness: 0.06,
    transparent: true,
    blending: THREE.AdditiveBlending,
    envMapIntensity: 0.9,
    depthWrite: false,
  });
  return m;
}

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const shadow = (m, cast = true) => {
  m.castShadow = cast;
  m.receiveShadow = true;
  return m;
};

function screws(mat, positions, r = 0.07, up = V(0, 1, 0)) {
  const g = new THREE.CylinderGeometry(r, r, r * 0.8, 6);
  const im = new THREE.InstancedMesh(g, mat, positions.length);
  const q = new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), up);
  const m4 = new THREE.Matrix4();
  positions.forEach((p, i) => im.setMatrixAt(i, m4.compose(p, q, V(1, 1, 1))));
  return im;
}

/**
 * Spremnik: stakleni valjak s razinom tekućine, metalni poklopci s vijcima, mjehurići se dižu.
 * Os y. Priključci: dolje (izlaz prema pumpi), gore (povrat), bok (povrat grane iz reaktora).
 */
export function buildReservoir(M, shared, { r = 0.7, h = 2.8, lite = false } = {}) {
  const g = new THREE.Group();
  g.name = 'reservoir';
  const glass = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 36, 1, true), M.glass);
  glass.renderOrder = 2;
  const level = 0.72;
  const fluidMat = fluidMaterial(shared, { len: h * 3, rad: r });
  const fluid = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.9, r * 0.9, h * level, 32), fluidMat);
  fluid.position.y = -h / 2 + (h * level) / 2;
  fluid.renderOrder = 1;
  // Ljestvica razine (MIN/MAX) — tanki prstenovi na staklu.
  const marks = new THREE.Mesh(
    new THREE.TorusGeometry(r * 1.005, 0.012, 4, 40).rotateX(Math.PI / 2).translate(0, -h / 2 + h * 0.85, 0),
    M.chrome,
  );
  const marks2 = new THREE.Mesh(new THREE.TorusGeometry(r * 1.005, 0.012, 4, 40).rotateX(Math.PI / 2).translate(0, -h / 2 + h * 0.3, 0), M.chrome);
  const capGeo = new THREE.CylinderGeometry(r * 1.18, r * 1.18, 0.32, 36);
  const capT = shadow(new THREE.Mesh(capGeo, M.anodized));
  capT.position.y = h / 2 + 0.16;
  const capB = shadow(new THREE.Mesh(capGeo, M.anodized));
  capB.position.y = -h / 2 - 0.16;
  // Tri vertikalne šipke (stezaljka stakla) i vijci na poklopcima.
  const rods = [];
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + 1.55;
    const rod = shadow(new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, h + 0.5, 8), M.chrome));
    rod.position.set(Math.cos(a) * r * 1.1, 0, Math.sin(a) * r * 1.1);
    rods.push(rod);
  }
  const sc = [];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    sc.push(V(Math.cos(a) * r * 0.95, h / 2 + 0.34, Math.sin(a) * r * 0.95));
  }
  g.add(glass, fluid, marks, marks2, capT, capB, ...rods, screws(M.chrome, sc, 0.06));
  // Mjehurići koji se dižu kroz tekućinu.
  const count = lite ? 0 : 9;
  const bubbles = count ? new THREE.InstancedMesh(new THREE.SphereGeometry(0.06, 8, 6), new THREE.MeshBasicMaterial({ color: '#fff3e0', toneMapped: false }), count) : null;
  const seeds = [];
  if (bubbles) {
    for (let i = 0; i < count; i++) seeds.push([Math.random() * Math.PI * 2, Math.random() * r * 0.75, Math.random(), 0.35 + Math.random() * 0.4]);
    g.add(bubbles);
  }
  const m4 = new THREE.Matrix4();
  const bottom = -h / 2, top = -h / 2 + h * level;
  return {
    group: g,
    fluid,
    glowObjects: [fluid, ...(bubbles ? [bubbles] : [])],
    ports: {
      out: { pos: V(0, -h / 2 - 0.32, 0), dir: V(0, -1, 0) },
      in: { pos: V(0, h / 2 + 0.32, 0), dir: V(0, 1, 0) },
      side: { pos: V(0, -h / 2 - 0.16, -r * 1.18), dir: V(0, 0, -1) },
    },
    animate(t, dt, k, bubbleAmount) {
      // Razina blago podrhtava s pumpom; mjehurići se dižu brže kad je robot ljut.
      fluid.scale.y = 1 + 0.012 * Math.sin(t * 7.3) * k;
      if (!bubbles) return;
      seeds.forEach((s, i) => {
        s[2] = (s[2] + dt * s[3] * (0.6 + bubbleAmount * 3) * k) % 1;
        const y = bottom + 0.1 + s[2] * (top - bottom - 0.2);
        const wob = 0.04 * Math.sin(t * 6 + i);
        m4.makeTranslation(Math.cos(s[0]) * s[1] + wob, y, Math.sin(s[0]) * s[1]);
        bubbles.setMatrixAt(i, m4);
      });
      bubbles.instanceMatrix.needsUpdate = true;
    },
  };
}

/**
 * Pumpa (os y): spiralno kućište sa staklenim prozorom kroz koji se vidi rotor, motor ispod.
 * Priključci: ulaz straga, izlaz naprijed (tangencijalno), grana prema vratu dolje.
 */
export function buildPump(M, shared) {
  const g = new THREE.Group();
  g.name = 'pump';
  const R = 0.82;
  const housing = shadow(new THREE.Mesh(new THREE.CylinderGeometry(R, R, 0.7, 40), M.anodized));
  const lip = shadow(new THREE.Mesh(new THREE.TorusGeometry(R * 0.86, 0.06, 8, 40).rotateX(Math.PI / 2).translate(0, 0.36, 0), M.chrome));
  // Tekućina u kućištu (vidi se kroz prozor) i rotor s lopaticama.
  const fluidMat = fluidMaterial(shared, { len: 6, rad: R });
  const pool = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.78, R * 0.78, 0.06, 36).translate(0, 0.3, 0), fluidMat);
  const rotor = new THREE.Group();
  rotor.position.y = 0.36;
  const bladeGeo = new THREE.BoxGeometry(0.06, 0.12, R * 0.62).translate(0, 0, R * 0.36);
  for (let i = 0; i < 7; i++) {
    const b = new THREE.Mesh(bladeGeo, M.chrome);
    b.rotation.y = (i / 7) * Math.PI * 2;
    b.rotation.z = 0.0;
    b.rotateY(0.35); // zakrivljene lopatice (blagi zakret)
    rotor.add(b);
  }
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 0.16, 16), M.graphite);
  rotor.add(hub);
  const glass = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.82, R * 0.82, 0.04, 32).translate(0, 0.45, 0), M.glass);
  glass.renderOrder = 2;
  const motor = shadow(new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.6, 1.0, 32).translate(0, -0.85, 0), M.graphite));
  const ribs = [];
  for (let i = 0; i < 4; i++) ribs.push(new THREE.TorusGeometry(0.6, 0.035, 6, 32).rotateX(Math.PI / 2).translate(0, -0.55 - i * 0.2, 0));
  const ribMesh = new THREE.Mesh(mergeAll(ribs), M.chrome);
  const sc = [];
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    sc.push(V(Math.cos(a) * R * 0.9, 0.37, Math.sin(a) * R * 0.9));
  }
  // Natpis/LED pumpe.
  const led = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.06, 0.02).translate(0, 0.05, R + 0.01), new THREE.MeshBasicMaterial({ color: '#7dffb0', toneMapped: false }));
  g.add(housing, lip, pool, rotor, glass, motor, ribMesh, screws(M.chrome, sc, 0.055), led);
  return {
    group: g,
    glowObjects: [pool, led],
    led,
    rotor,
    ports: {
      in: { pos: V(R, 0, 0), dir: V(1, 0, 0) },
      out: { pos: V(R * 0.55, 0.05, R * 0.83), dir: V(0, 0, 1) },
      branch: { pos: V(0, -0.05, -R), dir: V(0, 0, -1) },
    },
    animate(t, dt, k, speed) {
      rotor.rotation.y += dt * Math.PI * 2 * 3.2 * speed * k;
      led.material.color.setScalar(0).setRGB(0.45, 1.6 * (0.6 + 0.4 * Math.sin(t * 9)), 0.8);
    },
  };
}

/**
 * Vodeni blok na procesoru: bakrena baza, akrilni poklopac kroz koji se vidi vijugavi kanal s
 * tekućinom, anodizirani okvir s vijcima. Leži na procesoru (dno u y = 0, normala +y).
 * Priključci: lijevo (ulaz) i desno (izlaz).
 */
export function buildWaterBlock(M, shared, { w = 2.5, d = 1.9 } = {}) {
  const g = new THREE.Group();
  g.name = 'waterBlock';
  const base = shadow(new THREE.Mesh(new RoundedBoxGeometry(w, 0.16, d, 2, 0.04).translate(0, 0.08, 0), M.copper));
  const lid = new THREE.Mesh(new RoundedBoxGeometry(w * 0.92, 0.42, d * 0.9, 3, 0.08).translate(0, 0.37, 0), M.glass);
  lid.renderOrder = 2;
  // Vijugavi kanal (tekućina vidljiva kroz akril).
  const pts = [];
  const rows = 5;
  for (let i = 0; i < rows; i++) {
    const z = -d * 0.34 + (i / (rows - 1)) * d * 0.68;
    const xs = i % 2 ? [w * 0.36, -w * 0.36] : [-w * 0.36, w * 0.36];
    pts.push(V(xs[0], 0.34, z), V(xs[1], 0.34, z));
  }
  const curve = new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.08);
  const chanLen = curve.getLength();
  const chan = new THREE.Mesh(new THREE.TubeGeometry(curve, 140, 0.085, 8, false), fluidMaterial(shared, { len: chanLen, rad: 0.085 }));
  // Okvir (dvije letve) s vijcima i natpisna pločica.
  const frame = [];
  for (const sz of [-1, 1]) frame.push(shadow(new THREE.Mesh(new RoundedBoxGeometry(w, 0.12, 0.22, 2, 0.03).translate(0, 0.62, sz * (d / 2 - 0.11)), M.anodized)));
  const sc = [];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) sc.push(V(sx * (w / 2 - 0.16), 0.69, sz * (d / 2 - 0.11)));
  // Priključne kocke na bokovima (ulaz/izlaz).
  const blocks = [];
  for (const sx of [-1, 1]) blocks.push(shadow(new THREE.Mesh(new RoundedBoxGeometry(0.22, 0.46, 0.62, 2, 0.04).translate(sx * (w / 2 + 0.06), 0.36, -0.35), M.anodized)));
  g.add(base, lid, chan, ...frame, ...blocks, screws(M.chrome, sc, 0.055));
  return {
    group: g,
    glowObjects: [chan],
    ports: {
      in: { pos: V(-w / 2 - 0.17, 0.36, -0.35), dir: V(-1, 0, 0) },
      out: { pos: V(w / 2 + 0.17, 0.36, -0.35), dir: V(1, 0, 0) },
    },
  };
}

/**
 * Hladnjak kao radijator: rebra (kroz njih prolazi tekućina) između dva spremnika duž z,
 * ventilator na vrhu. Desni spremnik ima ulaz (straga) i izlaz (sprijeda); središte u (0,0,0).
 */
export function buildRadiator(M, { halfX = 2.92, len = 2.1, finH = 1.2, fan = 1.55, lite = false } = {}) {
  const g = new THREE.Group();
  g.name = 'radiator';
  // Rebra: tanke aluminijske lamele duž z, spojene u jednu geometriju.
  const fins = [];
  const n = lite ? 12 : 26;
  for (let i = 0; i < n; i++) {
    const x = -halfX + 0.36 + (i / (n - 1)) * (halfX * 2 - 0.72);
    fins.push(new THREE.BoxGeometry(0.05, finH, len).translate(x, 0, 0));
  }
  const finMesh = shadow(new THREE.Mesh(mergeAll(fins), M.fins ?? M.chrome));
  // Cijevi kroz rebra (vidljive kroz razmake), donja i gornja ploča.
  const tubes = [];
  for (const y of [-finH * 0.28, finH * 0.28]) for (const z of [-len * 0.3, 0, len * 0.3]) tubes.push(new THREE.CylinderGeometry(0.07, 0.07, halfX * 2 - 0.5, 8).rotateZ(Math.PI / 2).translate(0, y, z));
  const tubeMesh = new THREE.Mesh(mergeAll(tubes), M.copper ?? M.chrome);
  const plates = shadow(new THREE.Mesh(mergeAll([new THREE.BoxGeometry(halfX * 2 - 0.5, 0.06, len + 0.06).translate(0, -finH / 2 - 0.03, 0), new THREE.BoxGeometry(halfX * 2 - 0.5, 0.06, len + 0.06).translate(0, finH / 2 + 0.03, 0)]), M.anodized));
  // Spremnici na krajevima (duž z) s kapama.
  const tankGeo = new THREE.CylinderGeometry(0.34, 0.34, len + 0.2, 24).rotateX(Math.PI / 2);
  const caps = [];
  const tanks = [];
  for (const sx of [-1, 1]) {
    tanks.push(tankGeo.clone().translate(sx * halfX, 0, 0));
    for (const sz of [-1, 1]) caps.push(new THREE.CylinderGeometry(0.38, 0.38, 0.1, 24).rotateX(Math.PI / 2).translate(sx * halfX, 0, sz * (len / 2 + 0.12)));
  }
  const tankMesh = shadow(new THREE.Mesh(mergeAll(tanks), M.anodized));
  const capMesh = shadow(new THREE.Mesh(mergeAll(caps), M.chrome));
  g.add(finMesh, tubeMesh, plates, tankMesh, capMesh);
  // Ventilator na vrhu: kvadratni okvir, 7 zakrivljenih lopatica, glavčina, nosači.
  const fanG = new THREE.Group();
  fanG.position.set(0, finH / 2 + 0.06 + 0.2, 0);
  const frame = shadow(new THREE.Mesh(ringFrame(fan, fan * 0.88, 0.36), M.graphite));
  const blades = new THREE.Group();
  const bladeShape = new THREE.Shape();
  const R = fan * 0.84;
  bladeShape.moveTo(0.2, -0.08);
  bladeShape.quadraticCurveTo(R * 0.6, -0.3, R, -0.04);
  bladeShape.lineTo(R * 0.98, 0.2);
  bladeShape.quadraticCurveTo(R * 0.6, 0.16, 0.2, 0.1);
  bladeShape.closePath();
  const bladeGeos = [];
  for (let i = 0; i < 7; i++) {
    const b = new THREE.ExtrudeGeometry(bladeShape, { depth: 0.035, bevelEnabled: false, curveSegments: 6 }).rotateX(Math.PI / 2);
    b.rotateZ(0.28).rotateY((i / 7) * Math.PI * 2);
    bladeGeos.push(b);
  }
  blades.add(new THREE.Mesh(mergeAll(bladeGeos), M.titanium ?? M.chrome));
  const hub = shadow(new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.22, 24), M.graphite));
  const hubCap = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.19, 0.24, 24), M.chrome);
  blades.add(hub, hubCap);
  const struts = [];
  for (let i = 0; i < 4; i++) struts.push(new THREE.BoxGeometry(0.07, 0.05, fan * 1.0).translate(0, -0.15, fan * 0.5).rotateY((i / 4) * Math.PI * 2 + Math.PI / 4));
  const fsc = [];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) fsc.push(V(sx * fan * 0.86, 0.2, sz * fan * 0.86));
  fanG.add(frame, blades, new THREE.Mesh(mergeAll(struts), M.graphite), screws(M.chrome, fsc, 0.06));
  g.add(fanG);
  return {
    group: g,
    fan: fanG,
    blades,
    top: fanG.position.y + 0.2,
    ports: {
      in: { pos: V(halfX, -0.34, -len * 0.3), dir: V(0, -1, 0) },
      out: { pos: V(halfX + 0.34, 0, len * 0.3), dir: V(1, 0, 0) },
    },
    animate(dt, speed) {
      blades.rotation.y += dt * Math.PI * 2 * 4.5 * speed;
    },
  };
}

/** Spoji geometrije (pozicija, normala, uv). */
export function mergeAll(geos) {
  return mergeGeometries(geos.map((g) => (g.index ? g.toNonIndexed() : g)), false);
}

/** Kvadratni okvir ventilatora s okruglim otvorom (y os). */
function ringFrame(outer, inner, h) {
  const s = new THREE.Shape();
  const o = outer, r = outer * 0.14;
  s.moveTo(-o + r, -o);
  s.lineTo(o - r, -o);
  s.quadraticCurveTo(o, -o, o, -o + r);
  s.lineTo(o, o - r);
  s.quadraticCurveTo(o, o, o - r, o);
  s.lineTo(-o + r, o);
  s.quadraticCurveTo(-o, o, -o, o - r);
  s.lineTo(-o, -o + r);
  s.quadraticCurveTo(-o, -o, -o + r, -o);
  const hole = new THREE.Path();
  hole.absarc(0, 0, inner, 0, Math.PI * 2, true);
  s.holes.push(hole);
  return new THREE.ExtrudeGeometry(s, { depth: h, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.03, bevelSegments: 1, curveSegments: 32 })
    .translate(0, 0, -h / 2)
    .rotateX(Math.PI / 2);
}
