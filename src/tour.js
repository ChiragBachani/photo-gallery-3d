// Smooth camera-pose tweening plus the guided tour sequencer.

function easeInOut(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
function shortestAngle(a, b) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

// Tweens a pose {x,y,z,yaw,pitch} and writes it into controls each frame.
export class PoseTween {
  constructor(controls) {
    this.controls = controls;
    this.active = false;
  }
  start(to, duration, onDone) {
    this.from = this.controls.getPose();
    this.to = to;
    this.dYaw = shortestAngle(this.from.yaw, to.yaw);
    this.t = 0;
    this.duration = Math.max(0.05, duration);
    this.onDone = onDone || null;
    this.active = true;
  }
  cancel() { this.active = false; }
  update(dt) {
    if (!this.active) return;
    this.t += dt / this.duration;
    const k = easeInOut(Math.min(1, this.t));
    const f = this.from, o = this.to;
    this.controls.setPose({
      x: f.x + (o.x - f.x) * k,
      y: f.y + (o.y - f.y) * k,
      z: f.z + (o.z - f.z) * k,
      yaw: f.yaw + this.dYaw * k,
      pitch: f.pitch + (o.pitch - f.pitch) * k,
    });
    if (this.t >= 1) {
      this.active = false;
      const cb = this.onDone; this.onDone = null;
      cb && cb();
    }
  }
}

export class Tour {
  constructor(controls, stops) {
    this.controls = controls;
    this.stops = stops;
    this.tween = new PoseTween(controls);
    this.running = false;
    this.index = -1;
    this.holdLeft = 0;
    this.onStop = null;  // callback(stop, photoNumber, totalPhotos)
    this.onEnd = null;
    this.totalPhotos = stops.filter((s) => s.photo).length;
  }

  start() {
    this.running = true;
    this.index = -1;
    this.holdLeft = 0;
    this._next();
  }

  stop() {
    this.running = false;
    this.tween.cancel();
  }

  _next() {
    if (!this.running) return;
    this.index++;
    if (this.index >= this.stops.length) {
      this.running = false;
      this.onEnd && this.onEnd();
      return;
    }
    const stop = this.stops[this.index];
    const from = this.controls.getPose();
    const dist = Math.hypot(stop.pose.x - from.x, stop.pose.z - from.z);
    const dur = Math.min(2.4, Math.max(0.9, dist / 5.5));
    this.tween.start(stop.pose, dur, () => {
      this.holdLeft = stop.hold;
      const photoNum = this.stops.slice(0, this.index + 1).filter((s) => s.photo).length;
      this.onStop && this.onStop(stop, photoNum, this.totalPhotos);
      if (stop.isEnd) {
        this.running = false;
        this.onEnd && this.onEnd();
      }
    });
  }

  update(dt) {
    if (!this.running) return;
    if (this.tween.active) { this.tween.update(dt); return; }
    this.holdLeft -= dt;
    if (this.holdLeft <= 0) this._next();
  }
}
