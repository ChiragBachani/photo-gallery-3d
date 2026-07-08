import * as THREE from 'three';
import { buildGallery } from './layout.js';
import { FirstPersonControls, IS_TOUCH } from './controls.js';
import { PoseTween, Tour } from './tour.js';
import * as ui from './ui.js';

// ── renderer / scene ────────────────────────────────────────────
const app = document.getElementById('app');
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
app.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x050508);
scene.fog = new THREE.FogExp2(0x050508, 0.011);
scene.add(new THREE.AmbientLight(0xffffff, 0.72));

const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 200);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ── state ───────────────────────────────────────────────────────
let mode = 'start'; // 'start' | 'free' | 'tour' | 'focus'
let gallery = null;
let controls = null;
let tour = null;
let focusTween = null;
let focusReturnPose = null;
let shownLookHint = false;

// ── boot ────────────────────────────────────────────────────────
const data = await fetch('gallery-data.json').then((r) => r.json());
gallery = buildGallery(scene, data.photos);

controls = new FirstPersonControls(camera, renderer.domElement, gallery.colliders);
controls.setPose(gallery.spawn);
focusTween = new PoseTween(controls);
tour = new Tour(controls, gallery.tourStops);

// ── texture streaming (first room gates the loading screen) ────
const GATE = Math.min(12, gallery.photos.length);
let loadedGate = 0;
let started = false;
const loader = new THREE.TextureLoader();
{
  const queue = [...gallery.photos];
  let active = 0;
  const pump = () => {
    while (active < 5 && queue.length) {
      const p = queue.shift();
      active++;
      loader.load(p.data.file, (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = 8;
        p.mesh.material.map = tex;
        p.mesh.material.color.setHex(0xffffff);
        p.mesh.material.needsUpdate = true;
        active--; done(p); pump();
      }, undefined, () => { console.error('texture failed:', p.data.file); active--; done(p); pump(); });
    }
  };
  const done = (p) => {
    if (p.index < GATE) {
      loadedGate++;
      ui.setLoadProgress(loadedGate / GATE);
      if (loadedGate >= GATE && !started) { started = true; ui.showStart(IS_TOUCH); }
    }
  };
  pump();
}

// ── mode transitions ────────────────────────────────────────────
function enterFree(withHint = true) {
  mode = 'free';
  ui.hideCTA();
  ui.setMode('free');
  controls.enabled = true;
  if (!IS_TOUCH) {
    controls.requestLock();
    if (withHint && !shownLookHint) {
      shownLookHint = true;
      ui.showHint('Walk with <b>WASD</b> · look with the mouse · click a photo to view it up close');
    }
  } else if (withHint && !shownLookHint) {
    shownLookHint = true;
    ui.showHint('Joystick to walk · drag to look · tap a photo to view it up close');
  }
}

function startTour() {
  mode = 'tour';
  ui.hideCTA();
  ui.setMode('tour');
  controls.enabled = false;
  controls.releaseLock();
  tour.start();
}

function exitTour() {
  tour.stop();
  enterFree();
}

function enterFocus(photo) {
  mode = 'focus';
  ui.setMode('focus');
  controls.enabled = false;
  focusReturnPose = controls.getPose();
  focusTween.start(photo.viewPose, 0.9, () => {
    ui.setCaption(photo.data.caption, `Photo ${photo.index + 1} of ${gallery.photos.length} · click to step back`);
  });
  ui.setCaption(photo.data.caption, `Photo ${photo.index + 1} of ${gallery.photos.length}`);
}

function exitFocus() {
  if (mode !== 'focus') return;
  mode = 'free';
  ui.setMode('free');
  focusTween.start(focusReturnPose, 0.75, () => {
    controls.enabled = true;
  });
}

// ── tour wiring ─────────────────────────────────────────────────
tour.onStop = (stop, n, total) => {
  if (stop.photo) ui.setCaption(stop.photo.data.caption, `${n} of ${total}`);
  else ui.setCaption(null);
};
tour.onEnd = () => {
  ui.setMode('start');
  ui.setCaption(null);
  ui.showCTA();
};

// ── clicks / taps ───────────────────────────────────────────────
const raycaster = new THREE.Raycaster();
const clickables = [...gallery.photoMeshes, gallery.ctaMesh];

function raycastAt(ndcX, ndcY, maxDist) {
  raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), camera);
  const hits = raycaster.intersectObjects(clickables, false);
  if (!hits.length || hits[0].distance > maxDist) return null;
  return hits[0].object;
}

function handleAim(obj) {
  if (!obj) return;
  if (obj === gallery.ctaMesh) {
    controls.enabled = false;
    controls.releaseLock();
    ui.showCTA();
    return;
  }
  const photo = gallery.photos[obj.userData.photoIndex];
  if (photo) enterFocus(photo);
}

if (!IS_TOUCH) {
  document.addEventListener('mousedown', (e) => {
    if (mode === 'focus') { exitFocus(); return; }
    if (mode !== 'free') return;
    if (!controls.locked) return; // the canvas click handler below re-locks
    handleAim(raycastAt(0, 0, 14));
  });
  renderer.domElement.addEventListener('click', () => {
    if (mode === 'free' && !controls.locked) controls.requestLock();
  });
  document.addEventListener('pointerlockchange', () => {
    const locked = document.pointerLockElement === renderer.domElement;
    if (locked) return;
    if (mode === 'focus') { exitFocus(); return; }
    if (mode === 'free' && !ui.els.cta.classList.contains('hidden')) return;
    if (mode === 'free') ui.showHint('Click to look around · press <b>T</b> for the guided tour');
  });
} else {
  let tapStart = null;
  renderer.domElement.addEventListener('touchstart', (e) => {
    if (e.touches.length === 1) {
      tapStart = { x: e.touches[0].clientX, y: e.touches[0].clientY, t: performance.now() };
    } else tapStart = null;
  }, { passive: true });
  renderer.domElement.addEventListener('touchend', (e) => {
    if (!tapStart) return;
    const t = e.changedTouches[0];
    const moved = Math.hypot(t.clientX - tapStart.x, t.clientY - tapStart.y);
    const dt = performance.now() - tapStart.t;
    tapStart = null;
    if (moved > 12 || dt > 400) return;
    if (mode === 'focus') { exitFocus(); return; }
    if (mode !== 'free') return;
    const ndcX = (t.clientX / window.innerWidth) * 2 - 1;
    const ndcY = -(t.clientY / window.innerHeight) * 2 + 1;
    handleAim(raycastAt(ndcX, ndcY, 14));
  });
}

controls.onMoveInput = () => { if (mode === 'focus') exitFocus(); };

document.addEventListener('keydown', (e) => {
  if (e.code === 'KeyT') {
    if (mode === 'tour') exitTour();
    else if (mode === 'free') startTour();
  }
  if (e.code === 'Escape' && mode === 'tour') exitTour();
});

// ── UI buttons ──────────────────────────────────────────────────
ui.els.startTour.addEventListener('click', () => { ui.hideStart(); startTour(); });
ui.els.startExplore.addEventListener('click', () => { ui.hideStart(); enterFree(); });
ui.els.tourBtn.addEventListener('click', () => startTour());
ui.els.exitTourBtn.addEventListener('click', () => exitTour());
ui.els.ctaClose.addEventListener('click', () => enterFree(false));

// ── frame loop ──────────────────────────────────────────────────
// debug/testing handle
window.__gallery = {
  controls, tour, get mode() { return mode; },
  rooms: gallery.roomsMeta,
  teleport: (z, yaw = 0) => controls.setPose({ x: 0, y: 1.7, z, yaw, pitch: 0 }),
  startTour, enterFree,
  focus: (i) => enterFocus(gallery.photos[i]),
  unfocus: () => exitFocus(),
};

const clock = new THREE.Clock();
function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(0.05, clock.getDelta());
  if (mode === 'tour') tour.update(dt);
  focusTween.update(dt);
  controls.update(dt);

  // room chip follows the camera
  const z = controls.pos.z;
  const room = gallery.roomsMeta.find((r) => z <= r.z0 + 0.01 && z >= r.z1 - 0.01);
  ui.setRoomChip(room ? room.title : 'Gallery');

  renderer.render(scene, camera);
}
animate();
