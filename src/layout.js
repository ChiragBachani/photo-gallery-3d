// Builds the entire museum: themed rooms in a line along -Z, photos hung in
// left/right pairs down each room, wall colliders, text signage, and the
// ordered list of tour stops.

import * as THREE from 'three';

const W = 15;            // room width (x)
const H = 5;             // wall height
const DOOR_W = 3.2;      // doorway opening width
const DOOR_H = 3.4;      // doorway opening height
const PAIR_SPACING = 3.4;
const EYE = 1.7;         // camera height
const PHOTO_Y = 2.0;     // photo center height

export const ROOMS = [
  {
    key: 'recognized', title: 'Recognized Works',
    blurb: 'Images honored by juries, publications, and institutions — including work featured by NASA and the BBC.',
    theme: { wall: 0x15151f, floor: 0x261e15, ceil: 0x0c0c12, lights: [0xffd9a0], intensity: 46, dark: true },
  },
  {
    key: 'astro', title: 'Astrophotography',
    blurb: 'Deep-sky and nightscape work — eclipses, meteor showers, and the Milky Way from dark skies around the world.',
    theme: { wall: 0x0a0e1e, floor: 0x090b13, ceil: 0x04050a, lights: [0x8fa8ff, 0xffd9a0], intensity: 32, dark: true, stars: true },
  },
  {
    key: 'concerts', title: 'Concerts',
    blurb: 'Artists, energy, and stage light — shot from the pit.',
    theme: { wall: 0x170e1e, floor: 0x110a15, ceil: 0x090510, lights: [0xff2d95, 0xffb03a], intensity: 38, dark: true },
  },
  {
    key: 'travel', title: 'Travel',
    blurb: 'Six countries, one camera bag — New Zealand, Australia, Kenya, Tanzania, Israel, and Jordan.',
    theme: { wall: 0xe9ddc4, floor: 0x8a6f4d, ceil: 0xf2ecdc, lights: [0xfff1d6], intensity: 80, bright: true },
  },
  {
    key: 'portraits', title: 'Portraits',
    blurb: 'Headshots and senior pictures — clean, confident portraits for professionals, performers, and grads.',
    theme: { wall: 0xf1f1f1, floor: 0xd8d4cc, ceil: 0xffffff, lights: [0xffffff], intensity: 85, bright: true },
  },
  {
    key: 'culture', title: 'Indian Culture in America',
    blurb: 'A personal documentary series on heritage and celebration.',
    theme: { wall: 0x471119, floor: 0x2a0d10, ceil: 0x2c0a0e, lights: [0xffb45e, 0xd4af37], intensity: 46, dark: true },
  },
];

// ── canvas text helper ──────────────────────────────────────────
function makeTextPlane(lines, worldWidth, opts = {}) {
  const pad = 40;
  const cw = 1024;
  const ctx0 = document.createElement('canvas').getContext('2d');
  let y = pad;
  for (const l of lines) y += l.size + (l.gap || 18);
  const ch = y + pad - 18;
  const canvas = document.createElement('canvas');
  canvas.width = cw; canvas.height = ch;
  const ctx = canvas.getContext('2d');
  if (opts.bg) { ctx.fillStyle = opts.bg; ctx.fillRect(0, 0, cw, ch); }
  if (opts.border) { ctx.strokeStyle = opts.border; ctx.lineWidth = 4; ctx.strokeRect(6, 6, cw - 12, ch - 12); }
  ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  let cy = pad;
  for (const l of lines) {
    ctx.fillStyle = l.color || '#f4efe6';
    ctx.font = `${l.weight || 400} ${l.size}px ${l.serif ? 'Georgia, serif' : '-apple-system, Helvetica, Arial, sans-serif'}`;
    if (l.spacing) {
      // manual letterspacing, auto-shrunk to fit the canvas
      const text = l.text.toUpperCase();
      let size = l.size, spacing = l.spacing, total = Infinity;
      for (let tries = 0; tries < 8 && total > cw - 70; tries++) {
        ctx.font = `${l.weight || 400} ${size}px ${l.serif ? 'Georgia, serif' : 'Helvetica, Arial, sans-serif'}`;
        total = 0;
        for (const c of text) total += ctx.measureText(c).width + spacing;
        if (total > cw - 70) { size *= 0.92; spacing *= 0.92; }
      }
      let x = (cw - total + spacing) / 2;
      for (const c of text) { ctx.fillText(c, x + ctx.measureText(c).width / 2, cy); x += ctx.measureText(c).width + spacing; }
    } else {
      ctx.fillText(l.text, cw / 2, cy, cw - pad * 2);
    }
    cy += l.size + (l.gap || 18);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: !opts.bg, toneMapped: false });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(worldWidth, worldWidth * ch / cw), mat);
  return mesh;
}

// word-wrap helper for blurbs
function wrap(text, max = 34) {
  const words = text.split(' ');
  const out = []; let line = '';
  for (const w of words) {
    if ((line + ' ' + w).trim().length > max) { out.push(line.trim()); line = w; }
    else line += ' ' + w;
  }
  if (line.trim()) out.push(line.trim());
  return out;
}

// ── main builder ────────────────────────────────────────────────
export function buildGallery(scene, photoData) {
  const colliders = [];
  const photoMeshes = [];   // raycast targets
  const photos = [];        // { mesh, group, data, viewPose }
  const roomsMeta = [];     // { key, title, z0, z1 }
  const tourStops = [];

  const byRoom = {};
  for (const p of photoData) (byRoom[p.room] ||= []).push(p);

  // room depths from photo counts
  let z0 = 0;
  const roomDims = ROOMS.map((r) => {
    const n = (byRoom[r.key] || []).length;
    const pairs = Math.ceil(n / 2);
    const depth = pairs * PAIR_SPACING + 4.6;
    const dim = { ...r, n, pairs, depth, z0, z1: z0 - depth };
    z0 -= depth;
    return dim;
  });

  const wallMat = (color) => new THREE.MeshStandardMaterial({ color, roughness: 0.95, metalness: 0 });
  const frameMat = new THREE.MeshStandardMaterial({ color: 0x181818, roughness: 0.55, metalness: 0.25 });
  const matteMat = new THREE.MeshBasicMaterial({ color: 0xf2eee4, toneMapped: false });
  const lightBarMat = new THREE.MeshBasicMaterial({ color: 0xffe6b8, toneMapped: false });

  function addBoxWall(w, h, d, x, y, z, material) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    m.position.set(x, y, z);
    scene.add(m);
    return m;
  }
  function addCollider(minX, maxX, minZ, maxZ) { colliders.push({ minX, maxX, minZ, maxZ }); }

  let photoIndex = 0;

  for (let k = 0; k < roomDims.length; k++) {
    const room = roomDims[k];
    const t = room.theme;
    const { z0, z1, depth } = room;
    const zc = z0 - depth / 2;
    roomsMeta.push({ key: room.key, title: room.title, z0, z1 });

    // floor & ceiling
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, depth), new THREE.MeshStandardMaterial({ color: t.floor, roughness: 0.75, metalness: 0.05 }));
    floor.rotation.x = -Math.PI / 2; floor.position.set(0, 0, zc); scene.add(floor);
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(W, depth), new THREE.MeshStandardMaterial({ color: t.ceil, roughness: 1 }));
    ceil.rotation.x = Math.PI / 2; ceil.position.set(0, H, zc); scene.add(ceil);

    // side walls (planes facing inward)
    const wm = wallMat(t.wall);
    const left = new THREE.Mesh(new THREE.PlaneGeometry(depth, H), wm);
    left.rotation.y = Math.PI / 2; left.position.set(-W / 2, H / 2, zc); scene.add(left);
    const right = new THREE.Mesh(new THREE.PlaneGeometry(depth, H), wm);
    right.rotation.y = -Math.PI / 2; right.position.set(W / 2, H / 2, zc); scene.add(right);
    addCollider(-W / 2 - 0.2, -W / 2 + 0.05, z1, z0);
    addCollider(W / 2 - 0.05, W / 2 + 0.2, z1, z0);

    // entry wall (solid, first room only)
    if (k === 0) {
      addBoxWall(W, H, 0.3, 0, H / 2, 0.15, wm);
      addCollider(-W / 2, W / 2, -0.05, 0.3);
    }

    // exit wall: doorway divider, or solid final wall
    const isLast = k === roomDims.length - 1;
    if (isLast) {
      addBoxWall(W, H, 0.3, 0, H / 2, z1 - 0.15, wm);
      addCollider(-W / 2, W / 2, z1 - 0.3, z1 + 0.05);
    } else {
      const segW = (W - DOOR_W) / 2;
      addBoxWall(segW, H, 0.3, -(DOOR_W / 2 + segW / 2), H / 2, z1, wm);
      addBoxWall(segW, H, 0.3, DOOR_W / 2 + segW / 2, H / 2, z1, wm);
      addBoxWall(DOOR_W, H - DOOR_H, 0.3, 0, DOOR_H + (H - DOOR_H) / 2, z1, wm);
      addCollider(-W / 2, -DOOR_W / 2, z1 - 0.2, z1 + 0.2);
      addCollider(DOOR_W / 2, W / 2, z1 - 0.2, z1 + 0.2);

      // room name above doorway (faces the approaching visitor, normal +z)
      const next = roomDims[k + 1];
      const namePlate = makeTextPlane(
        [{ text: next.title, size: 64, spacing: 26, color: '#e8e2d4', serif: true }],
        k === 0 ? 5 : 6, {}
      );
      namePlate.position.set(0, k === 0 ? 3.78 : 4.15, z1 + 0.17);
      scene.add(namePlate);
      if (k === 0) {
        const brand = makeTextPlane(
          [{ text: 'Chirag Bachani', size: 86, spacing: 34, color: '#d4af37', serif: true }], 6.6, {});
        brand.position.set(0, 4.5, z1 + 0.17);
        scene.add(brand);
      }
    }

    // entrance-side signage inside this room (placard with title + blurb)
    const placardLines = [
      { text: room.title, size: 46, color: '#d4af37', serif: true, gap: 26 },
      ...wrap(room.blurb).map((ln) => ({ text: ln, size: 26, color: '#d9d4c8', gap: 10 })),
    ];
    const placard = makeTextPlane(placardLines, 2.0, { bg: 'rgba(12,11,16,0.92)', border: 'rgba(212,175,55,0.6)' });
    placard.position.set(W / 2 - 2.4, 1.95, z0 - 0.17 - (k === 0 ? 0.15 : 0));
    placard.rotation.y = Math.PI;
    scene.add(placard);

    // brand wall behind spawn (entry wall interior, first room)
    if (k === 0) {
      const back = makeTextPlane([
        { text: 'Chirag Bachani', size: 82, spacing: 30, color: '#d4af37', serif: true, gap: 30 },
        { text: 'Award-winning photography · Chicago & Dallas', size: 30, color: '#b9b3c8', gap: 22 },
        { text: 'As featured by NASA · BBC · Sky & Telescope · EarthSky', size: 26, color: '#8d86a0' },
      ], 9, {});
      back.position.set(0, 3.1, -0.02);
      back.rotation.y = Math.PI;
      scene.add(back);
    }

    // lights
    const nL = t.lights.length;
    const count = t.bright ? 3 : 2;
    for (let i = 0; i < count; i++) {
      const col = t.lights[i % nL];
      const lz = z0 - depth * ((i + 1) / (count + 1));
      const lx = t.bright ? 0 : (i % 2 === 0 ? -3.2 : 3.2);
      const pl = new THREE.PointLight(col, t.intensity, depth * 1.4, 1.8);
      pl.position.set(lx, 4.1, lz);
      scene.add(pl);
    }

    // bright rooms: emissive skylight strips
    if (t.bright) {
      for (let i = 0; i < Math.floor(depth / 8); i++) {
        const strip = new THREE.Mesh(new THREE.PlaneGeometry(6, 3.2), new THREE.MeshBasicMaterial({ color: 0xfff8ea, toneMapped: false }));
        strip.rotation.x = Math.PI / 2;
        strip.position.set(0, H - 0.02, z0 - 4.5 - i * 8);
        scene.add(strip);
      }
    }

    // astro: star-field ceiling
    if (t.stars) {
      const N = 900;
      const pos = new Float32Array(N * 3);
      for (let i = 0; i < N; i++) {
        pos[i * 3] = (Math.random() - 0.5) * (W - 1);
        pos[i * 3 + 1] = H - 0.15 - Math.random() * 0.6;
        pos[i * 3 + 2] = z0 - 0.5 - Math.random() * (depth - 1);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      const stars = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xcfdcff, size: 0.045, sizeAttenuation: true, transparent: true, opacity: 0.9, toneMapped: false }));
      scene.add(stars);
    }

    // bench in the middle of longer rooms
    if (depth > 18) {
      const bench = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.45, 0.65), new THREE.MeshStandardMaterial({ color: t.dark ? 0x2a2530 : 0x6b5b43, roughness: 0.6 }));
      bench.position.set(0, 0.225, zc);
      scene.add(bench);
      addCollider(-1.2, 1.2, zc - 0.33, zc + 0.33);
    }

    // ── photos: left/right pairs walking down the room ──
    const roomPhotos = byRoom[room.key] || [];
    let prevSection = null;
    const sectionZs = {};
    for (let i = 0; i < roomPhotos.length; i++) {
      const data = roomPhotos[i];
      const pair = Math.floor(i / 2);
      const side = i % 2 === 0 ? -1 : 1; // -1 left wall, +1 right wall
      const pz = z0 - 2.8 - pair * PAIR_SPACING;

      // size: landscape ~2.3 wide, portrait ~2.3 tall
      const ar = data.w / data.h;
      let pw, ph;
      if (ar >= 1) { pw = Math.min(2.5, 2.3); ph = pw / ar; }
      else { ph = 2.3; pw = ph * ar; if (pw > 2.0) { pw = 2.0; ph = pw / ar; } }

      const group = new THREE.Group();
      group.position.set(side * (W / 2 - 0.02), PHOTO_Y, pz);
      group.rotation.y = side === -1 ? Math.PI / 2 : -Math.PI / 2;

      const frame = new THREE.Mesh(new THREE.BoxGeometry(pw + 0.34, ph + 0.34, 0.055), frameMat);
      frame.position.z = 0.03;
      const matte = new THREE.Mesh(new THREE.PlaneGeometry(pw + 0.22, ph + 0.22), matteMat);
      matte.position.z = 0.062;
      const photoMesh = new THREE.Mesh(
        new THREE.PlaneGeometry(pw, ph),
        new THREE.MeshBasicMaterial({ color: 0x1d1c22, toneMapped: false })
      );
      photoMesh.position.z = 0.068;
      photoMesh.userData.photoIndex = photoIndex;
      group.add(frame, matte, photoMesh);

      // picture light bar in dark rooms
      if (t.dark) {
        const bar = new THREE.Mesh(new THREE.BoxGeometry(pw * 0.55, 0.045, 0.09), lightBarMat);
        bar.position.set(0, ph / 2 + 0.32, 0.1);
        group.add(bar);
      }
      scene.add(group);

      // view pose (standing in front of the photo)
      const normal = new THREE.Vector3(-side, 0, 0); // into the room
      const center = new THREE.Vector3(side * (W / 2 - 0.02), PHOTO_Y, pz);
      const d = Math.min(4.1, Math.max(2.7, Math.max(pw, ph) * 1.5));
      const vp = center.clone().addScaledVector(normal, d);
      vp.y = EYE;
      const look = lookPose(vp, center);
      const viewPose = { x: vp.x, y: EYE, z: vp.z, yaw: look.yaw, pitch: look.pitch };

      photos.push({ mesh: photoMesh, group, data, viewPose, index: photoIndex });
      photoMeshes.push(photoMesh);

      // section label bookkeeping
      if (data.section) (sectionZs[data.section] ||= []).push(pz);
      if (data.section && data.section !== prevSection) prevSection = data.section;

      photoIndex++;
    }

    // section labels (travel destinations, portraits subsections)
    for (const [section, zs] of Object.entries(sectionZs)) {
      const mid = zs.reduce((a, b) => a + b, 0) / zs.length;
      for (const side of [-1, 1]) {
        const label = makeTextPlane([{ text: section, size: 54, spacing: 22, color: t.bright ? '#6b5b3e' : '#d4af37', serif: true }], 3.2, {});
        label.position.set(side * (W / 2 - 0.03), 3.65, mid);
        label.rotation.y = side === -1 ? Math.PI / 2 : -Math.PI / 2;
        scene.add(label);
      }
    }
  }

  // ── CTA wall panel at the very end ──
  const last = roomDims[roomDims.length - 1];
  const cta = makeTextPlane([
    { text: 'Like what you see?', size: 78, color: '#f4efe6', serif: true, gap: 34 },
    { text: "Let's create something worth framing.", size: 36, color: '#d4af37', gap: 30 },
    { text: 'chiragbachaniphotography@gmail.com', size: 30, color: '#c9c3d8', gap: 14 },
    { text: 'Instagram · @chiragbphoto', size: 30, color: '#c9c3d8', gap: 30 },
    { text: '· walk up and tap this wall to get in touch ·', size: 24, color: '#8d86a0' },
  ], 6.4, { bg: 'rgba(14,10,14,0.94)', border: 'rgba(212,175,55,0.7)' });
  cta.position.set(0, 2.35, last.z1 + 0.32);
  scene.add(cta);
  const ctaMesh = cta;

  // ── tour stops: doorway pass-throughs + every photo, then the CTA ──
  let roomOfPhoto = (p) => roomDims.find((r) => r.key === p.data.room);
  let currentRoomKey = null;
  for (const p of photos) {
    const r = roomOfPhoto(p);
    if (r.key !== currentRoomKey) {
      currentRoomKey = r.key;
      if (r.z0 !== 0) {
        // pass through the doorway into this room
        tourStops.push({ pose: { x: 0, y: EYE, z: r.z0, yaw: 0, pitch: 0 }, hold: 0.25, photo: null });
      }
    }
    tourStops.push({ pose: p.viewPose, hold: 2.4, photo: p });
  }
  const ctaPose = lookPose(new THREE.Vector3(0, EYE, last.z1 + 5.2), new THREE.Vector3(0, 2.3, last.z1));
  tourStops.push({ pose: { x: 0, y: EYE, z: last.z1 + 5.2, yaw: ctaPose.yaw, pitch: ctaPose.pitch }, hold: 2.0, photo: null, isEnd: true });

  const spawn = { x: 0, y: EYE, z: -2.4, yaw: 0, pitch: 0 };
  return { colliders, photos, photoMeshes, roomsMeta, tourStops, spawn, ctaMesh, endZ: last.z1 };
}

// yaw/pitch for a camera at `pos` looking at `target` (YXZ euler order)
export function lookPose(pos, target) {
  const dx = target.x - pos.x, dy = target.y - pos.y, dz = target.z - pos.z;
  const hl = Math.hypot(dx, dz);
  return { yaw: Math.atan2(-dx, -dz), pitch: Math.atan2(dy, hl) };
}
