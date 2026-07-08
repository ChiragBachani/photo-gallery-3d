// First-person controls: pointer-lock mouse look + WASD on desktop,
// virtual joystick + drag-look on touch devices. Axis-separated circle
// collision against wall boxes gives natural wall sliding.

import * as THREE from 'three';

const RADIUS = 0.35;
const WALK = 4.0;
const RUN = 7.0;

export const IS_TOUCH = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

export class FirstPersonControls {
  constructor(camera, dom, colliders) {
    this.camera = camera;
    this.dom = dom;
    this.colliders = colliders;
    this.enabled = false;
    this.locked = false;
    this.yaw = 0;
    this.pitch = 0;
    this.pos = new THREE.Vector3(0, 1.7, -2.4);
    this.keys = {};
    this.joy = { active: false, id: null, x: 0, y: 0 };
    this.lookTouch = { id: null, lastX: 0, lastY: 0 };
    this.onLockChange = null; // callback(locked)
    this.onMoveInput = null;  // callback() — any movement key/joystick (used to exit focus)

    this._bind();
  }

  _bind() {
    document.addEventListener('keydown', (e) => {
      this.keys[e.code] = true;
      if (this.enabled && ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
        this.onMoveInput && this.onMoveInput();
      }
    });
    document.addEventListener('keyup', (e) => { this.keys[e.code] = false; });

    if (!IS_TOUCH) {
      document.addEventListener('pointerlockchange', () => {
        this.locked = document.pointerLockElement === this.dom;
        this.onLockChange && this.onLockChange(this.locked);
      });
      document.addEventListener('mousemove', (e) => {
        if (!this.locked || !this.enabled) return;
        this.yaw -= e.movementX * 0.0022;
        this.pitch -= e.movementY * 0.0022;
        this.pitch = Math.max(-1.35, Math.min(1.35, this.pitch));
      });
    } else {
      this._bindTouch();
    }
  }

  _bindTouch() {
    const joyEl = document.getElementById('joystick');
    const thumb = document.getElementById('joy-thumb');
    joyEl.style.display = 'block';

    const joyCenter = () => {
      const r = joyEl.getBoundingClientRect();
      return { cx: r.left + r.width / 2, cy: r.top + r.height / 2, rad: r.width / 2 };
    };

    joyEl.addEventListener('touchstart', (e) => {
      e.preventDefault();
      const t = e.changedTouches[0];
      this.joy.active = true; this.joy.id = t.identifier;
      this._joyMove(t, joyCenter(), thumb);
    }, { passive: false });

    joyEl.addEventListener('touchmove', (e) => {
      e.preventDefault();
      for (const t of e.changedTouches) {
        if (t.identifier === this.joy.id) this._joyMove(t, joyCenter(), thumb);
      }
    }, { passive: false });

    const joyEnd = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === this.joy.id) {
          this.joy.active = false; this.joy.id = null; this.joy.x = 0; this.joy.y = 0;
          thumb.style.transform = 'translate(-50%,-50%)';
        }
      }
    };
    joyEl.addEventListener('touchend', joyEnd);
    joyEl.addEventListener('touchcancel', joyEnd);

    // look: any touch that starts on the canvas (not the joystick)
    this.dom.addEventListener('touchstart', (e) => {
      for (const t of e.changedTouches) {
        if (this.lookTouch.id === null && t.identifier !== this.joy.id) {
          this.lookTouch.id = t.identifier;
          this.lookTouch.lastX = t.clientX; this.lookTouch.lastY = t.clientY;
        }
      }
    }, { passive: true });
    this.dom.addEventListener('touchmove', (e) => {
      if (!this.enabled) return;
      for (const t of e.changedTouches) {
        if (t.identifier === this.lookTouch.id) {
          this.yaw -= (t.clientX - this.lookTouch.lastX) * 0.0045;
          this.pitch -= (t.clientY - this.lookTouch.lastY) * 0.0045;
          this.pitch = Math.max(-1.35, Math.min(1.35, this.pitch));
          this.lookTouch.lastX = t.clientX; this.lookTouch.lastY = t.clientY;
        }
      }
    }, { passive: true });
    const lookEnd = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === this.lookTouch.id) this.lookTouch.id = null;
      }
    };
    this.dom.addEventListener('touchend', lookEnd);
    this.dom.addEventListener('touchcancel', lookEnd);
  }

  _joyMove(t, c, thumb) {
    let dx = (t.clientX - c.cx) / (c.rad - 10);
    let dy = (t.clientY - c.cy) / (c.rad - 10);
    const len = Math.hypot(dx, dy);
    if (len > 1) { dx /= len; dy /= len; }
    this.joy.x = dx; this.joy.y = dy;
    thumb.style.transform = `translate(calc(-50% + ${dx * (c.rad - 26)}px), calc(-50% + ${dy * (c.rad - 26)}px))`;
    if ((Math.abs(dx) > 0.15 || Math.abs(dy) > 0.15) && this.onMoveInput) this.onMoveInput();
  }

  requestLock() {
    if (!IS_TOUCH && document.pointerLockElement !== this.dom) {
      this.dom.requestPointerLock();
    }
  }
  releaseLock() {
    if (!IS_TOUCH && document.pointerLockElement === this.dom) document.exitPointerLock();
  }

  setPose(p) {
    this.pos.set(p.x, p.y, p.z);
    this.yaw = p.yaw; this.pitch = p.pitch;
    this.apply();
  }
  getPose() {
    return { x: this.pos.x, y: this.pos.y, z: this.pos.z, yaw: this.yaw, pitch: this.pitch };
  }

  _hits(x, z) {
    for (const b of this.colliders) {
      const cx = Math.max(b.minX, Math.min(x, b.maxX));
      const cz = Math.max(b.minZ, Math.min(z, b.maxZ));
      const dx = x - cx, dz = z - cz;
      if (dx * dx + dz * dz < RADIUS * RADIUS) return true;
    }
    return false;
  }

  update(dt) {
    if (!this.enabled) { this.apply(); return; }
    let f = 0, s = 0;
    if (this.keys['KeyW'] || this.keys['ArrowUp']) f += 1;
    if (this.keys['KeyS'] || this.keys['ArrowDown']) f -= 1;
    if (this.keys['KeyA'] || this.keys['ArrowLeft']) s -= 1;
    if (this.keys['KeyD'] || this.keys['ArrowRight']) s += 1;
    if (this.joy.active) { f += -this.joy.y; s += this.joy.x; }
    const len = Math.hypot(f, s);
    if (len > 0.001) {
      f /= Math.max(1, len); s /= Math.max(1, len);
      const speed = (this.keys['ShiftLeft'] || this.keys['ShiftRight']) ? RUN : WALK;
      const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
      // forward is (-sin, -cos) in xz; right is (cos, -sin)
      const dx = (-sin * f + cos * s) * speed * dt;
      const dz = (-cos * f - sin * s) * speed * dt;
      if (!this._hits(this.pos.x + dx, this.pos.z)) this.pos.x += dx;
      if (!this._hits(this.pos.x, this.pos.z + dz)) this.pos.z += dz;
    }
    this.apply();
  }

  apply() {
    this.camera.position.copy(this.pos);
    this.camera.quaternion.setFromEuler(new THREE.Euler(this.pitch, this.yaw, 0, 'YXZ'));
  }
}
