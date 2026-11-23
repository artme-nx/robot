// Robot | Artificial Media — head-coupled perspective s praćenjem glave web kamerom:
// robot iza ekrana gleda u tvoje oči i reagira na ruke.

import * as THREE from 'three';

import { loadSettings } from './config.js';
import { VisionSource } from './tracking/vision.js';
import { HeadTracker } from './tracking/headTracker.js';
import { HandTracker } from './tracking/handTracker.js';
import { MouseHead } from './tracking/mouseHead.js';
import { MouseHand } from './tracking/mouseHand.js';
import { HandInput } from './interaction/handInput.js';
import { FingerMarkers } from './interaction/fingerMarker.js';
import { DirectorFrame } from './interaction/directorFrame.js';
import { applyOffAxis } from './projection/offAxis.js';
import { getCanvasRect } from './projection/screenRect.js';
import { AnaglyphRenderer } from './render/anaglyph.js';
import { installPCSS } from './render/pcss.js';
import { PostPipeline, QUALITY } from './render/postPipeline.js';
import { GpuProfiler } from './render/gpuProfiler.js';
import { RobotScene } from './scenes/robot/robotScene.js';
import { classifyFiles, loadMeshFiles } from './scenes/loaders.js';
import { DebugOverlay } from './ui/debugOverlay.js';
import { CalibrationPanel } from './ui/calibrationPanel.js';
import { OrbitPanel } from './ui/orbitPanel.js';
import { OrbitController, loadOrbitSettings } from './camera/orbitController.js';
import { Hud } from './ui/hud.js';
import { Loader } from './ui/loader.js';
import { ModeSwitch } from './ui/modeSwitch.js';
import { Hints } from './ui/hints.js';
import { CameraNote } from './ui/cameraNote.js';
import { TouchInput } from './tracking/touchInput.js';
import { IS_MOBILE, IN_APP, MOBILE, mobileCameraFov, mobileCameraPosition } from './device.js';
import { setupDropzone } from './ui/dropzone.js';
import './style.css';

const REST_DISTANCE = IS_MOBILE ? MOBILE.restDistance : 60; // cm — kamo se pogled vraća kad se lice izgubi
const NEAR = 0.5;
const FAR = 2000;
// Robot se prvo crta ispod ekrana za učitavanje: prvi frameovi kompajliraju shadere
// postprocessinga i alociraju sjene, pa zapinju. Ekran se odtopi tek kad se render
// smiri (nekoliko brzih frameova zaredom), a najkasnije nakon maxWaitMs.
const REVEAL = { stableFrames: 4, stableFrameMs: 25, maxWaitMs: 900 };

const settings = loadSettings();
const orbitSettings = loadOrbitSettings();
installPCSS();
if (IS_MOBILE) {
  // Mobitel: stvarna veličina prozora iz CSS piksela umjesto mjera MacBook Aira, a FOV i
  // položaj prednje kamere prate orijentaciju (postavlja se svaki frame). Računalo: kao prije.
  settings.mobilePxPerCm = MOBILE.pxPerCm;
  document.documentElement.classList.add('is-mobile');
}

// Dva načina (gumb u dnu ekrana, tipka G):
//   LOOK AROUND — ORBIT kamera, ti kružiš oko robota; on stoji mirno, oči prate do ±25° (pogled 1);
//   FOLLOW ME   — FIKSNA kamera u neutralnom kadru (glava ne utječe ni na kameru ni na projekciju):
//                 poprsje stoji, a oči, glava i vrat okreću se za tobom (pogled 3, pojačan okret).
// M ručno bira ORBIT ili WINDOW (fizički točna projekcija s oka; nije ni jedan od dva gumba).
// Pri otvaranju stranice uvijek je FOLLOW ME.
const VIEW_MODES = {
  look: { camera: 'orbit', gaze: 1, toast: 'Look around — move your head to circle the robot' },
  follow: { camera: 'fixed', gaze: 3, toast: 'Follow me — the robot turns to follow you' },
};
let cameraMode = VIEW_MODES.follow.camera;
// Ponašanje pogleda po načinu kamere: 1 = prati do ±25°, 2 = oči uvijek prate, 3 = glava i oči prate.
const gazeModes = { orbit: VIEW_MODES.look.gaze, fixed: VIEW_MODES.follow.gaze, window: 3 };
const viewModeOf = (camera) => (camera === 'orbit' ? 'look' : camera === 'fixed' ? 'follow' : 'window');
const CAMERA_BADGE = { orbit: 'ORBIT', window: 'WINDOW', fixed: 'FOLLOW ME' };

const QUALITY_KEY = 'robot:quality';
let quality = 'high';
try {
  if (localStorage.getItem(QUALITY_KEY) === 'low') quality = 'low';
} catch {
  /* bez pohrane */
}
// Mobitel: uvijek kreće s low efektima; render kreće s pixel ratio 1, a dinamička
// rezolucija ga diže do 1,5 kad uređaj može (ili spušta do 0,6 kad ne može).
const MOBILE_PIXELS = { start: 1, min: 0.6, max: 1.5 };
if (IS_MOBILE) quality = 'low';

// ---------- Renderer ----------
const canvas = document.getElementById('view');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
// Tone mapping (AgX) radi postprocessing; PCSS sjene trebaju BasicShadowMap, a
// računaju se jednom po frameu (refleksije, oba oka i bloom ih dijele).
renderer.toneMapping = THREE.NoToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.BasicShadowMap;
renderer.shadowMap.autoUpdate = false;
renderer.info.autoReset = false;

const scene = new THREE.Scene();

// Robot je građen oko ishodišta; "world" se pomiče na centar prozora.
const world = new THREE.Group();
scene.add(world);

const camMono = new THREE.PerspectiveCamera();
const camLeft = new THREE.PerspectiveCamera();
const camRight = new THREE.PerspectiveCamera();
const anaglyph = new AnaglyphRenderer(renderer);
const profiler = new GpuProfiler(renderer.getContext());

// Postprocessing (N8AO, volumetrija, selektivni bloom, SMAA…).
const post = new PostPipeline(renderer, scene, camMono);
post.setQuality(quality);
for (const [name, pass] of Object.entries({
  render: post.renderPass,
  n8ao: post.n8ao,
  volumetric: post.volumetric,
  bloomTone: post.gradePass,
  smaaGrain: post.finishPass,
  output: post.output,
})) profiler.wrap(pass, 'render', name);
post.setSize(window.innerWidth, window.innerHeight);

// ?dpr=2 — samo za testiranje (emulacija retina zaslona u headless pregledniku).
const forcedDpr = Number(new URLSearchParams(location.search).get('dpr')) || 0;

// Dinamička rezolucija (kao u igrama): robot drži 60 fps tako da pri
// preopterećenju malo spusti render scale, a kad ima rezerve vrati ga gore.
const adaptive = { ratio: null, frames: [], lastChange: 0, lastProbe: 0 };

function targetPixelRatio() {
  const device = forcedDpr || window.devicePixelRatio;
  const q = QUALITY[quality];
  const cap = IS_MOBILE ? Math.min(device, MOBILE_PIXELS.max) : Math.min(device, q.pixelRatio);
  if (adaptive.ratio === null) adaptive.ratio = IS_MOBILE ? Math.min(cap, MOBILE_PIXELS.start) : cap;
  adaptive.ratio = Math.min(cap, Math.max(Math.min(minRatio(), cap), adaptive.ratio));
  return adaptive.ratio;
}

// U anaglifu se cijeli pipeline crta dvaput, pa smije niže.
function minRatio() {
  const q = QUALITY[quality];
  if (IS_MOBILE) return MOBILE_PIXELS.min;
  return stereo ? Math.min(q.minPixelRatio, 0.9) : q.minPixelRatio;
}

function applyPixelRatio() {
  renderer.setPixelRatio(targetPixelRatio());
}

function adaptResolution(now, frameMs) {
  if (IS_MOBILE) return adaptResolutionMobile(now, frameMs);
  if (phase === 'loading' || forcedDpr) return;
  const f = adaptive.frames;
  f.push(frameMs);
  if (f.length > 90) f.shift();
  if (now - adaptive.lastChange < 1500 || f.length < 60) return;
  const avg = f.reduce((a, b) => a + b, 0) / f.length;
  const q = QUALITY[quality];
  const cap = Math.min(window.devicePixelRatio, q.pixelRatio);
  let next = adaptive.ratio;
  // Detekcija (lice/ruke) u workeru dijeli GPU s renderom: ako gladuje, render
  // spušta rezoluciju iako sam stiže 60 fps. Proba naviše čeka sve dulje ako je
  // prethodna proba izgladnjela detekciju (bez titranja rezolucije).
  const starved = vision.starved;
  if (avg > 18.2 || starved) {
    next = adaptive.ratio - 0.125;
    if (starved && now - adaptive.lastProbe < 4000) adaptive.backoff = Math.min(60000, (adaptive.backoff ?? 8000) * 2);
  } else if (avg < 17.4 && adaptive.ratio < cap && vision.healthy && now - adaptive.lastProbe > (adaptive.backoff ?? 8000)) {
    next = adaptive.ratio + 0.125;
    adaptive.lastProbe = now;
  }
  next = Math.min(cap, Math.max(Math.min(minRatio(), cap), next));
  if (next !== adaptive.ratio) {
    adaptive.ratio = next;
    adaptive.lastChange = now;
    adaptive.frames.length = 0;
    resize();
  }
}

// Mobitel: isti princip, ali proračun frameova prati stvarni ritam zaslona (preglednik u
// štednji baterije crta na 30 Hz), a kad ni najniža rezolucija ne drži 60 fps, prelazi na
// stabilnih 30 fps (crta svaki drugi frame) umjesto trzanja između 35 i 55 fps.
let halfRate = false;
let frameTick = 0;
function adaptResolutionMobile(now, frameMs) {
  if (phase === 'loading' || forcedDpr) return;
  const f = adaptive.frames;
  f.push(frameMs);
  if (f.length > 90) f.shift();
  if (now - adaptive.lastChange < 1500 || f.length < 60) return;
  const avg = f.reduce((a, b) => a + b, 0) / f.length;
  const budget = Math.min(...f) > 28 ? 1000 / 30 : 1000 / 60;
  const cap = Math.min(window.devicePixelRatio, MOBILE_PIXELS.max);
  const floor = Math.min(MOBILE_PIXELS.min, cap);
  if (!halfRate && budget < 20 && adaptive.ratio <= floor + 1e-6 && avg > budget * 1.15 && avg < 30) {
    halfRate = true;
    adaptive.frames.length = 0;
    adaptive.lastChange = now;
    return;
  }
  let next = adaptive.ratio;
  const starved = vision.starved;
  if (avg > budget * 1.09 || starved) {
    next = adaptive.ratio - 0.125;
    if (starved && now - adaptive.lastProbe < 4000) adaptive.backoff = Math.min(60000, (adaptive.backoff ?? 8000) * 2);
  } else if (avg < budget * 1.045 && adaptive.ratio < cap && vision.healthy && now - adaptive.lastProbe > (adaptive.backoff ?? 8000)) {
    next = adaptive.ratio + 0.125;
    adaptive.lastProbe = now;
  }
  next = Math.min(cap, Math.max(floor, next));
  if (next !== adaptive.ratio) {
    adaptive.ratio = next;
    adaptive.lastChange = now;
    adaptive.frames.length = 0;
    resize();
  }
}

function resize() {
  applyPixelRatio();
  renderer.setSize(window.innerWidth, window.innerHeight);
  const size = renderer.getDrawingBufferSize(new THREE.Vector2());
  anaglyph.setSize(size.x, size.y);
  post.setSize(window.innerWidth, window.innerHeight);
}
window.addEventListener('resize', resize);

// ---------- Robot ----------
// Faze: 'loading' (geometrija u workerima, HDR, fontovi) → 'compiling' (shaderi se
// kompajliraju paralelno) → 'live' (robot se crta). Dok robot nije na ekranu,
// preko svega stoji crni ekran za učitavanje; praćenje glave i ruku već radi.
const robot = new RobotScene(renderer);
const robotReady = robot.init();
let phase = 'loading';
let laidOut = { w: 0, h: 0 };
let firstFrameAt = 0;
let stableFrames = 0;
let revealed = false;
let postWarmed = false;

robotReady.then(activateRobot, (err) => {
  console.error(err);
  loader.fail(`The robot could not be prepared: ${err?.message ?? err}`);
});

function activateRobot() {
  world.add(robot.group);
  resize();
  robot.activate(scene, { post, renderer });
  robot.setQuality(QUALITY[quality]);
  laidOut = { w: 0, h: 0 }; // forsiraj layout
  // Robot ima puno materijala: kompajliraj ih paralelno (KHR_parallel_shader_compile)
  // umjesto da prvi frame zamrzne praćenje glave.
  phase = 'compiling';
  const done = () => {
    robot.compiled = true;
    phase = 'live';
  };
  renderer.compileAsync(scene, camMono).then(done, done);
}

/** Poziva se nakon svakog iscrtanog framea dok se robot ne otkrije. */
function onRobotFrame(now, frameMs) {
  if (!firstFrameAt) {
    firstFrameAt = now;
    performance.mark('robot:first-frame');
    return;
  }
  stableFrames = frameMs < REVEAL.stableFrameMs ? stableFrames + 1 : 0;
  if (stableFrames < REVEAL.stableFrames && now - firstFrameAt < REVEAL.maxWaitMs) return;
  revealed = true;
  loader.reveal();
  // Oči su zatvorene ispod ekrana za učitavanje; otvore se kao pri buđenju dok se on odtapa.
  robot.wake(0.5);
  hints.start(now, 2600);
  if (pendingToast) hud.toast(...pendingToast);
  pendingToast = null;
}

function setQuality(name) {
  quality = name;
  adaptive.ratio = null;
  try {
    localStorage.setItem(QUALITY_KEY, name);
  } catch {
    /* bez pohrane */
  }
  post.setQuality(name);
  if (phase !== 'loading') robot.setQuality(QUALITY[name]);
  resize();
  hud.toast(`Quality: ${name}`, 1400);
}

// ---------- UI ----------
const loader = new Loader();
const hud = new Hud();
const debug = new DebugOverlay();
const vision = new VisionSource();
const tracker = new HeadTracker(settings, vision);
const hands = new HandTracker(settings, vision);
const mouse = new MouseHead();
const mouseHand = new MouseHand();
const handInput = new HandInput();
const markers = new FingerMarkers(scene);
const director = new DirectorFrame();
const panel = new CalibrationPanel(settings, (s) => {
  tracker.applySettings(s);
  laidOut = { w: 0, h: 0 };
});
const orbit = new OrbitController(orbitSettings);
const orbitPanel = new OrbitPanel(orbitSettings, () => {});
const modeSwitch = new ModeSwitch((mode) => setViewMode(mode));
modeSwitch.set(viewModeOf(cameraMode));
// Upute (izmjenjuju se; svaka nestane kad gesta prvi put uspije).
const CAMERA_HINTS = [
  { id: 'head', text: 'Move your head' },
  { id: 'point', text: 'Point at its face' },
  { id: 'palm', text: 'Open your palm' },
];
// Mobitel bez kamere: iste reakcije dodirom.
const TOUCH_HINTS = [
  { id: 'drag', text: 'Drag to move around' },
  { id: 'tap', text: 'Tap its face' },
  { id: 'spread', text: 'Spread two fingers' },
  { id: 'pinch', text: 'Pinch to put it back', when: () => robot.explode.amount > 0.4 },
];
const hints = new Hints(IS_MOBILE ? TOUCH_HINTS : CAMERA_HINTS);
// Dodir na mobitelu (povlačenje = glava dok kamera ne radi, dodir = prst, dva prsta = dlan/šaka).
const touch = IS_MOBILE ? new TouchInput({ headDrag: () => cameraFailed || !tracker.ready, rest: REST_DISTANCE }) : null;
const cameraNote = IS_MOBILE ? new CameraNote(() => startCamera(), IN_APP) : null;

// Obavijesti iz vremena učitavanja (kamera) pokažu se tek kad se robot otkrije.
let pendingToast = null;
function notify(message, ms) {
  if (revealed) hud.toast(message, ms);
  else pendingToast = [message, ms];
}

function setCameraMode(mode, { badge = true } = {}) {
  cameraMode = mode;
  if (mode === 'orbit' && !orbit.neutral) orbit.recalibrate(performance.now(), 1.0);
  modeSwitch.set(viewModeOf(mode));
  if (badge) hud.badge(CAMERA_BADGE[mode]);
}

/** LOOK AROUND ili FOLLOW ME (gumb, tipka G): kamera + pripadni pogled robota. */
function setViewMode(name) {
  const m = VIEW_MODES[name];
  gazeModes[m.camera] = m.gaze;
  if (m.camera !== cameraMode) hud.toast(m.toast, 2200);
  setCameraMode(m.camera, { badge: false });
}

let stereo = false;
let mouseMode = false;
let cameraFailed = false;
let headOverride = null; // za automatske testove (window.__ht.setHead)
let handOverride = null; // za automatske testove (window.__ht.setHand)

resize();

function startCamera() {
  return tracker
    .start()
    .then(() => {
      cameraFailed = false;
      cameraNote?.hide();
      notify('Camera ready — move your head', 2000);
    })
    .catch((err) => {
      cameraFailed = true;
      console.warn('Kamera nije dostupna', err);
      // Mobitel: umjesto obavijesti stoji poruka s gumbom za ponovni pokušaj.
      if (cameraNote) cameraNote.show();
      else notify('No camera — your mouse moves the head (wheel = distance)', 4200);
      throw err;
    });
}
startCamera().catch(() => {});
// Mobitel: ako se kamera ne javi (preglednik ne pita, Instagramov preglednik…), poruka se
// pokaže i bez greške — dodir radi cijelo vrijeme.
if (cameraNote) setTimeout(() => !vision.streaming && !cameraFailed && cameraNote.show(), 8000);

// Vlastiti .glb/.gltf postaje glava robota i dobiva iste oči.
setupDropzone(async (files) => {
  const picked = classifyFiles(files);
  if (!picked) {
    hud.toast('Supported: .glb and .gltf (with their .bin and textures)');
    return;
  }
  hud.toast(`Loading ${picked.main.name}…`, 60000);
  try {
    const obj = await loadMeshFiles(picked.main, picked.all);
    await robotReady;
    robot.setCustomHead(obj);
    hud.toast(`${picked.main.name} is the robot's new head · R flip · [ ] size · ↑↓ eyes`, 4000);
  } catch (err) {
    console.error(err);
    hud.toast(`Can't load ${picked.main.name}: ${err.message ?? err}`, 5000);
  }
});

window.addEventListener('keydown', (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  switch (e.key.toLowerCase()) {
    case 'f':
      if (document.fullscreenElement) document.exitFullscreen();
      else document.documentElement.requestFullscreen?.().catch(() => {});
      break;
    case 'd':
      debug.toggle();
      break;
    case 'c':
      panel.toggle();
      if (panel.visible) orbitPanel.toggle(false);
      break;
    case 't':
      orbitPanel.toggle();
      if (orbitPanel.visible) panel.toggle(false);
      break;
    case 'n':
      orbit.recalibrate(performance.now(), 0.6);
      hud.toast('Center: current head position', 1400);
      break;
    case 'g':
      setViewMode(viewModeOf(cameraMode) === 'follow' ? 'look' : 'follow');
      break;
    case 's':
      stereo = !stereo;
      hud.toast(stereo ? 'Anaglyph on — red left, cyan right' : 'Anaglyph off', 1600);
      break;
    case 'm':
      setCameraMode(cameraMode === 'orbit' ? 'window' : 'orbit');
      break;
    case 'k':
      mouseMode = !mouseMode;
      hud.toast(mouseMode ? 'Mouse moves the head' : 'Camera tracking', 1400);
      break;
    case 'h': {
      const on = markers.toggle();
      hud.toast(on ? 'Fingertip marker on' : 'Fingertip marker off', 1400);
      break;
    }
    case 'u':
      hud.toggle();
      break;
    case 'r':
      robot.flipCustomHead();
      break;
    case '[':
      robot.scaleCustomHead(1 / 1.08);
      break;
    case ']':
      robot.scaleCustomHead(1.08);
      break;
    case 'arrowup':
    case 'arrowdown':
      if (robot.custom) {
        robot.nudgeEyes(e.key === 'ArrowUp' ? 0.25 : -0.25);
        e.preventDefault();
      }
      break;
    case 'q':
      setQuality(quality === 'high' ? 'low' : 'high');
      break;
    case 'e':
      if (phase !== 'loading') {
        const name = robot.toggleEyeColor();
        hud.toast(`Eye color: ${name}`, 1200);
      }
      break;
    case 'escape':
      panel.toggle(false);
      orbitPanel.toggle(false);
      break;
  }
});

// ---------- Položaj glave ----------
const pose = {
  tracked: [0, 0, REST_DISTANCE], // zadnji poznati položaj s kamere
  roll: 0,
  weight: 0, // 0 = mirovanje u centru, 1 = prati glavu
  eye: [0, 0, REST_DISTANCE],
};

const smoothstep = (x) => x * x * (3 - 2 * x);

// Neutralni položaj za ORBIT: kalibrira se automatski kad se lice pronađe
// (i nakon duljeg gubitka), ručno tipkom N; za miš je centar prozora.
const orbitState = { source: null, lostSince: 0, wasTracking: false };

function updateOrbitCalibration(now, source, rect) {
  const rest = new THREE.Vector3(rect.cx, rect.cy, REST_DISTANCE);
  if (source !== orbitState.source) {
    if (source === 'miš' || source === 'test' || source === 'dodir') orbit.setNeutral(rest);
    orbitState.source = source;
  }
  if (source === 'kamera' || source === 'centar') {
    const tracking = source === 'kamera';
    if (tracking && !orbitState.wasTracking) {
      // Lice pronađeno: kalibriraj ako je to prvi put ili nakon duljeg gubitka.
      if (!orbit.neutral || now - orbitState.lostSince > 2500) orbit.recalibrate(now, 1.4);
    }
    if (!tracking && orbitState.wasTracking) orbitState.lostSince = now;
    orbitState.wasTracking = tracking;
  }
}

function updatePose(now, dt, rect) {
  const rest = [rect.cx, rect.cy, REST_DISTANCE];
  let source;

  if (headOverride) {
    // Automatski test: glava na zadanom položaju (relativno na centar prozora).
    pose.eye[0] = rect.cx + headOverride[0];
    pose.eye[1] = rect.cy + headOverride[1];
    pose.eye[2] = headOverride[2];
    pose.tracked = [...pose.eye];
    pose.weight = 1;
    pose.roll = 0;
    hud.setStatus('mouse', 'Test head position');
    return 'test';
  }

  if (IS_MOBILE && (cameraFailed || !tracker.ready)) {
    // Mobitel bez kamere (ili dok se pokreće): povlačenje prstom glumi glavu.
    pose.tracked = [...touch.updateHead(rect, dt)];
    pose.roll = 0;
    pose.weight = 1;
    source = 'dodir';
    hud.setStatus('idle', cameraFailed ? 'No camera · drag to move' : vision.streaming ? 'Starting face tracking…' : 'Waiting for camera…');
  } else if (mouseMode || cameraFailed || !tracker.ready) {
    // Miš glumi glavu: ručno (K), bez kamere, ili dok se kamera još pokreće.
    pose.tracked = [...mouse.update(rect, dt, mouseHand.capturesMouse)];
    pose.roll = 0;
    pose.weight = 1;
    source = 'miš';
    const label = cameraFailed
      ? 'No camera · mouse moves the head'
      : !tracker.ready
        ? 'Waiting for camera · allow access · mouse moves the head'
        : 'Mouse moves the head';
    hud.setStatus(cameraFailed || !tracker.ready ? 'idle' : 'mouse', label);
  } else {
    const tracking = tracker.update(now, hands.boxes, dt);
    if (tracking) {
      pose.tracked = [...tracker.head];
      pose.roll = tracker.roll;
      // Pri ponovnom pronalasku lica glatko se vraćamo iz centra.
      pose.weight = Math.min(1, pose.weight + dt * 4);
      hud.setStatus('tracking', tracker.held ? 'Hand in front of your face — holding position' : 'Tracking your head');
    } else {
      // Lice izgubljeno: pogled se glatko vraća u centar.
      pose.weight = Math.max(0, pose.weight - dt * 1.2);
      hud.setStatus('searching', 'Looking for your face…');
    }
    source = tracking ? 'kamera' : 'centar';
  }

  // Mobitel s kamerom: položaj kamere i držanje mobitela nisu poznati točno, pa je "ravno
  // ispred" tamo gdje je lice bilo kad je pronađeno (isti neutralni položaj kao za ORBIT).
  if (IS_MOBILE) updateMobileCenter(dt, source, rest);
  const w = smoothstep(pose.weight);
  for (let i = 0; i < 3; i++) pose.eye[i] = rest[i] + (pose.tracked[i] - mobileCenter[i] - rest[i]) * w;
  pose.eye[2] = Math.max(pose.eye[2], 5);
  return source;
}

const mobileCenter = [0, 0, 0]; // računalo: uvijek nula
function updateMobileCenter(dt, source, rest) {
  const camera = source === 'kamera' || source === 'centar';
  const n = orbit.neutral;
  const tx = camera && n && !orbit.calibrating ? n.x - rest[0] : camera ? mobileCenter[0] : 0;
  const ty = camera && n && !orbit.calibrating ? n.y - rest[1] : camera ? mobileCenter[1] : 0;
  const k = 1 - Math.exp(-dt * 2.5);
  mobileCenter[0] += (tx - mobileCenter[0]) * k;
  mobileCenter[1] += (ty - mobileCenter[1]) * k;
}

// ---------- Upute: prepoznavanje prvog uspjeha ----------
// Glava: pomak od ~7 cm od položaja na kojem je izvor (kamera/miš) počeo.
// Kažiprst: oči robota drže prst ~0,35 s. Dlan: robot se vidljivo rastavio.
const hintProbe = { source: null, ref: null, pointFor: 0 };
function updateHints(now, dt, source) {
  // Mobitel: upute za kameru tek kad kamera stvarno prati, inače upute za dodir.
  if (IS_MOBILE) hints.setItems(tracker.ready && !cameraFailed ? CAMERA_HINTS : TOUCH_HINTS);
  if (source !== hintProbe.source) {
    hintProbe.source = source;
    hintProbe.ref = null;
  }
  if (source !== 'centar') {
    const p = pose.tracked;
    if (!hintProbe.ref) hintProbe.ref = [...p];
    else if (Math.hypot(p[0] - hintProbe.ref[0], p[1] - hintProbe.ref[1]) > 7) hints.complete(source === 'dodir' ? 'drag' : 'head', now);
  }
  hintProbe.pointFor = robot.fingerAttn > 0.8 ? hintProbe.pointFor + dt : 0;
  if (hintProbe.pointFor > 0.35) hints.complete('point', now);
  if (touch?.active && robot.touching) hints.complete('tap', now);
  if (robot.explode.amount > 0.4) {
    hints.complete('palm', now);
    hints.complete('spread', now);
    hintProbe.exploded = true;
  } else if (hintProbe.exploded && robot.explode.amount < 0.05) {
    hints.complete('pinch', now);
  }
  hints.update(now);
}

// ---------- Mobitel: kadar ----------
// Mjerilo robota prema visini prozora (kao na računalu), bez donje granice od 0,75.
// Mobitel je bliže licu (35 cm) nego laptop (60 cm), pa u niskom položenom prozoru
// robot treba ~0,7 tog mjerila da glava zauzme sličan dio kadra kao na računalu (~½ visine).
function mobileLayout(rect) {
  const k = rect.width > rect.height ? 0.7 : 1;
  return { scale: Math.max(0.2, (rect.height / 18.8) * k) };
}
// Robot ostaje u sredini (sučelje je uz rubove); mjesto za eventualni pomak kadra.
function mobileLift() {
  return 0;
}

// ---------- Petlja ----------
const pa = new THREE.Vector3();
const pb = new THREE.Vector3();
const pc = new THREE.Vector3();
const eyeC = new THREE.Vector3();
const eyeL = new THREE.Vector3();
const eyeR = new THREE.Vector3();
const half = new THREE.Vector3();
const orbitHead = new THREE.Vector3();
const orbitTarget = new THREE.Vector3();
const neutralEye = new THREE.Vector3();
let lastFrame = performance.now();
let t = 0;
let testFrameCost = 0; // ms, samo za testove (window.__ht.setFrameCost)

function frame() {
  // Mobitel koji ne drži 60 fps: stabilnih 30 fps (svaki drugi frame preskoči).
  if (halfRate && frameTick++ % 2) return;
  renderer.info.reset();
  const now = performance.now();
  const frameMs = now - lastFrame;
  const dt = Math.min(frameMs / 1000, 0.1);
  lastFrame = now;
  adaptResolution(now, frameMs);
  t += dt;

  const rect = getCanvasRect(settings);
  if (IS_MOBILE) {
    // FOV i položaj prednje kamere prate orijentaciju mobitela.
    settings.cameraFov = mobileCameraFov(vision.video);
    [settings.cameraX, settings.cameraY] = mobileCameraPosition(rect);
  }
  if (Math.abs(rect.width - laidOut.w) > 0.05 || Math.abs(rect.height - laidOut.h) > 0.05) {
    if (IS_MOBILE) robot.layout(rect, mobileLayout(rect));
    else robot.layout(rect);
    laidOut = { w: rect.width, h: rect.height };
  }
  world.position.set(rect.cx, rect.cy + (IS_MOBILE ? mobileLift(rect) : 0), 0);
  world.updateMatrixWorld(true);
  // Detekcija (u načinu glavne niti) i ruke prije glave: glava treba okvire ruku
  // da zna kad ruka zaklanja lice.
  vision.update(now);
  hands.update(now, pose.tracked[2]);
  const mouseEvents = mouseHand.update(now, dt);
  const touchEvents = touch?.update(now) ?? [];
  const source = updatePose(now, dt, rect);
  updateOrbitCalibration(now, source, rect);
  // ORBIT ulaz: zadnji praćeni položaj glave; težina pada na 0 kad se lice izgubi.
  orbitHead.fromArray(source === 'test' ? pose.eye : pose.tracked);
  const orbitWeight = source === 'kamera' || source === 'centar' ? smoothstep(pose.weight) : 1;
  orbit.update(now, dt, orbitHead, orbitWeight);
  if (phase !== 'live') {
    // Robot se još priprema (ili mu se kompajliraju shaderi): praćenje radi, a robot se ne crta.
    // Dok workeri generiraju geometriju, glavna nit je slobodna: jedan prazan prolaz kroz
    // postprocessing (ispod ekrana za učitavanje) kompajlira njegove shadere sada, a ne u
    // prvom frameu robota.
    if (!postWarmed) {
      postWarmed = true;
      post.render(camMono, dt, null);
    }
    vision.afterRender();
    debug.tick(now);
    return;
  }

  const mode = cameraMode;
  // Oči: centar ± pola IPD-a duž linije očiju (uzima u obzir nagib glave).
  eyeC.fromArray(pose.eye);
  half.set(Math.cos(pose.roll), Math.sin(pose.roll), 0).multiplyScalar(settings.ipd / 2);
  const mono = eyeC.clone();

  if (mode === 'orbit') {
    // Kamera kruži oko točke interesa; pri neutralnom položaju vidi isto kao window.
    const target = robot.orbitTarget(orbitTarget);
    neutralEye.set(rect.cx, rect.cy, REST_DISTANCE);
    const vfov = THREE.MathUtils.radToDeg(2 * Math.atan(rect.height / 2 / REST_DISTANCE));
    orbit.apply(camMono, target, neutralEye, vfov, rect.width / rect.height, robot.orbitLimits());
    if (stereo) orbit.applyStereo(camMono, camLeft, camRight, (settings.ipd / 2) * settings.stereoStrength);
    mono.copy(camMono.position);
  } else {
    // Kutovi prozora na ravnini z = 0.
    pa.set(rect.x0, rect.y0, 0);
    pb.set(rect.x1, rect.y0, 0);
    pc.set(rect.x0, rect.y1, 0);
    // FOLLOW ME: kamera stoji u neutralnom kadru (oko na mirovanju u sredini), pa se ni
    // robot ni njegova veličina ne mijenjaju s glavom; WINDOW: kamera je na stvarnom oku.
    const camEye = mode === 'fixed' ? neutralEye.set(rect.cx, rect.cy, REST_DISTANCE) : eyeC;
    if (mode === 'fixed') mono.copy(camEye);
    else if (settings.eye === 'left') mono.sub(half);
    else if (settings.eye === 'right') mono.add(half);
    applyOffAxis(camMono, pa, pb, pc, mono, NEAR, FAR);
    if (stereo) {
      const k = settings.stereoStrength;
      if (mode === 'fixed') half.set(settings.ipd / 2, 0, 0);
      eyeL.copy(camEye).addScaledVector(half, -k);
      eyeR.copy(camEye).addScaledVector(half, k);
      applyOffAxis(camLeft, pa, pb, pc, eyeL, NEAR, FAR);
      applyOffAxis(camRight, pa, pb, pc, eyeR, NEAR, FAR);
    }
  }

  // Redateljski okvir: izrez kadra (zoom + reframe) preko projekcije kamere; sidro
  // se računa iz neizrezane kamere, a zrake ruku iz izrezane (pokazuje se ono što se vidi).
  // Doseg ruke: neutralno ~45 cm ispred glave robota, puni doseg do lica.
  const reach = robot.handReach();
  camMono.updateMatrixWorld();
  director.update(now, dt, handInput.ctx, camMono, camMono.position.distanceTo(reach.target));
  director.apply(camMono);
  if (stereo) {
    director.apply(camLeft);
    director.apply(camRight);
  }

  // Ruke u 3D: zrake iz trenutne kamere, dubina relativna na neutralnu.
  const hand = handInput.update(now, dt, {
    tracker: hands,
    mouse: touch?.active ? touch : mouseHand,
    mouseEvents: touch?.active ? touchEvents : mouseEvents,
    camera: camMono,
    reach,
    override: handOverride,
  });

  robot.update(t, dt, {
    eye: mode === 'orbit' ? camMono.position.toArray() : pose.eye,
    rect,
    cameraMode: mode,
    gazeMode: gazeModes[mode],
    hand,
  });
  markers.update(hand, camMono, dt, robot.displayScale ?? 1);

  // Sjene se računaju jednom po frameu (oba oka i bloom ih dijele).
  renderer.shadowMap.needsUpdate = true;
  profiler.measure('beforeRender', () => robot.beforeRender());
  if (stereo) {
    post.render(camLeft, dt, anaglyph.left);
    post.render(camRight, dt, anaglyph.right);
    anaglyph.combine();
  } else {
    post.render(camMono, dt, null);
  }
  if (!revealed) onRobotFrame(now, frameMs);
  else updateHints(now, dt, source);

  // Test: umjetni trošak framea (provjera dinamičke rezolucije i 30 fps na slabom mobitelu).
  if (testFrameCost) for (const end = performance.now() + testFrameCost; performance.now() < end; );

  // Novi frame kamere ide u worker tek sad, kad je ovaj frame predan GPU-u.
  vision.afterRender();
  profiler.poll();
  debug.tick(now);
  const orbitInfo =
    mode === 'orbit'
      ? `ORBIT az ${orbit.az.toFixed(1)}° el ${(orbit.effectiveEl ?? orbit.el).toFixed(1)}° zoom ${(1 / orbit.zoom).toFixed(2)}×${orbit.calibrating ? ' · kalibriram' : ''}`
      : CAMERA_BADGE[mode];
  debug.draw({ tracker, hands, hand, vision, source, eye: pose.eye, rect, stereo, sceneName: robot.name, quality: `${quality} ${renderer.getPixelRatio().toFixed(2)}×`, orbitInfo });
  panel.showMeasurement(pose.eye, source);
  orbitPanel.showState(mode === 'orbit' ? orbitInfo : mode === 'fixed' ? 'FOLLOW ME: kamera je fiksna (G za LOOK AROUND, M za ORBIT).' : 'Robot je u WINDOW načinu (M za orbit).');
}
renderer.setAnimationLoop(frame);

/** Benchmark: n frameova bez vsynca, sa sinkronizacijom GPU-a na kraju (ms/frame). */
function benchmark(n = 30) {
  renderer.setAnimationLoop(null);
  const gl = renderer.getContext();
  const px = new Uint8Array(4);
  frame();
  gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
  const t0 = performance.now();
  for (let i = 0; i < n; i++) frame();
  gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
  const ms = (performance.now() - t0) / n;
  renderer.setAnimationLoop(frame);
  return +ms.toFixed(2);
}

function setHandOverride(o) {
  if (!o) {
    handOverride = null;
    return;
  }
  const prev = handOverride;
  const logR = Math.log(o.r ?? 0.62);
  const tip = o.tip ?? [0, 0];
  const pinch = o.pinchAt ?? tip;
  const track = prev?.track ?? { id: 'test', label: 'T', simulated: true, pts: { tip: [0, 0, 0], pinch: [0, 0, 0], palm: [0, 0, 0] } };
  if (track.gesture !== (o.gesture ?? 'point')) track.gestureSince = performance.now();
  track.gesture = o.gesture ?? 'point';
  track.spread = o.spread ?? 0;
  track.pinch = track.gesture === 'pinch' ? 1 : 0;
  track.pts.tip = [tip[0], tip[1], logR];
  track.pts.pinch = [pinch[0], pinch[1], logR];
  track.pts.palm = [tip[0], tip[1] - 0.12, logR + 0.05];
  track.distanceCm = 37;
  handOverride = {
    track,
    events: prev?.events ?? [],
    frame: o.frame ? { valid: true, rect: { x0: o.frame[0], y0: o.frame[1], x1: o.frame[2], y1: o.frame[3] }, since: prev?.frame?.valid ? prev.frame.since : performance.now() } : { valid: false },
  };
  if (o.gesture === null || o.gesture === 'away') handOverride.track = null;
}

// Mali API za automatske testove i snimanje (Playwright): window.__ht
window.__ht = {
  setHead: (v) => (headOverride = v ? [...v] : null),
  /**
   * Ruka bez kamere: { tip:[x,y] (NDC), r (udaljenost ruke / glave, 0.62 = neutralno),
   * gesture: 'point'|'pinch'|'open'|'fist'|'none', spread, two?: {rect} }; null vraća kameru/miš.
   */
  setHand: (o) => setHandOverride(o),
  tap: (ndc) => {
    if (!handOverride) setHandOverride({ tip: ndc, gesture: 'point' });
    handOverride.events.push({ type: 'tap', hand: 'test', ndc: [...(ndc ?? handOverride.track.pts.tip)] });
  },
  markers: (on) => markers.toggle(on),
  hand: () => handInput.ctx,
  vision,
  hands,
  tracker,
  setQuality: (q) => setQuality(q),
  setStereo: (b) => (stereo = !!b),
  setCameraMode: (m) => setCameraMode(m),
  /** 'look' (LOOK AROUND) ili 'follow' (FOLLOW ME). */
  setViewMode: (m) => setViewMode(m),
  setGazeMode: (n) => (gazeModes[cameraMode] = n),
  /** Okini zatvarač (treptaj) odmah. */
  blink: () => robot.gaze.blinkNow(),
  hints,
  touch,
  /** Orbit bez glave: { az, el, zoom } (zoom = faktor udaljenosti), null vraća upravljanje glavi. */
  setOrbit: (o) => (orbit.override = o ? { snap: true, ...o } : null),
  orbit,
  state: () => ({
    fps: debug.fps,
    scene: robot.name,
    phase,
    ready: revealed,
    viewMode: viewModeOf(cameraMode),
    mobile: IS_MOBILE,
    halfRate,
    cameraFailed,
    cameraNote: !!cameraNote?.visible,
    cameraMode,
    gazeMode: gazeModes[cameraMode],
    headYawDeg: +THREE.MathUtils.radToDeg(robot.lastGaze?.head.x ?? 0).toFixed(1),
    cross: +robot.cross.toFixed(2),
    quality,
    pixelRatio: renderer.getPixelRatio(),
    drawCalls: renderer.info.render.calls,
    triangles: renderer.info.render.triangles,
  }),
  robot,
  camera: camMono,
  /** Test: umjetni trošak framea u ms (simulacija slabog uređaja). */
  setFrameCost: (ms) => (testFrameCost = ms),
  post,
  benchmark,
  profile: (on) => {
    if (on !== undefined) profiler.enabled = !!on;
    return profiler.report();
  },
  renderer,
  settings,
  scene,
};
