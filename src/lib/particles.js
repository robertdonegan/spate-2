/* Lagrangian tracers: dropped floats and streakline flow lines. */
import { sampleFlow, sampleGround } from "./fields.js";
import { mulberry32 } from "./math.js";

export const FLOAT_MAX = 96;
export class Floats {
  constructor() {
    this.n = 0;
    this.x = new Float32Array(FLOAT_MAX);
    this.z = new Float32Array(FLOAT_MAX);
    this.y = new Float32Array(FLOAT_MAX);
    this.vx = new Float32Array(FLOAT_MAX);
    this.vz = new Float32Array(FLOAT_MAX);
    this.tint = new Float32Array(FLOAT_MAX * 3);
    this.stuck = new Uint8Array(FLOAT_MAX);
    this.gone = new Uint8Array(FLOAT_MAX);
    this.dist = new Float32Array(FLOAT_MAX);
    this._f = { x: 0, z: 0, d: 0 };
  }
  clear() { this.n = 0; }
  add(x, z, r, g, b) {
    if (this.n >= FLOAT_MAX) return;
    const i = this.n++;
    this.x[i] = x; this.z[i] = z; this.y[i] = 0;
    this.vx[i] = 0; this.vz[i] = 0;
    this.tint[i * 3] = r; this.tint[i * 3 + 1] = g; this.tint[i * 3 + 2] = b;
    this.stuck[i] = 0; this.gone[i] = 0; this.dist[i] = 0;
  }
  update(sim, dtSim, exag) {
    const half = sim.size / 2;
    const f = this._f;
    let steps = Math.min(24, Math.max(1, Math.ceil(dtSim / 0.5)));
    const dt = dtSim / steps;
    for (let i = 0; i < this.n; i++) {
      if (this.gone[i]) continue;
      for (let s = 0; s < steps; s++) {
        sampleFlow(sim, this.x[i], this.z[i], f);
        if (f.d < 0.015) { this.stuck[i] = 1; this.vx[i] *= 0.4; this.vz[i] *= 0.4; break; }
        this.stuck[i] = 0;
        const k = 1 - Math.exp(-dt / 1.1);
        this.vx[i] += (f.x - this.vx[i]) * k;
        this.vz[i] += (f.z - this.vz[i]) * k;
        const ddx = this.vx[i] * dt, ddz = this.vz[i] * dt;
        this.x[i] += ddx; this.z[i] += ddz;
        this.dist[i] += Math.sqrt(ddx * ddx + ddz * ddz);
        if (this.x[i] < -half || this.x[i] > half || this.z[i] < -half || this.z[i] > half) {
          this.gone[i] = 1; break;
        }
      }
      sampleFlow(sim, this.x[i], this.z[i], f);
      this.y[i] = sampleGround(sim, this.x[i], this.z[i]) + f.d * exag;
    }
  }
}

/* ----------------------------------------------------------- flow lines --
   Short-lived streaklines seeded in wet cells. Each keeps a ring buffer of
   recent positions, drawn as a fading trail coloured by speed.           */
export class Streaks {
  constructor(count, trail) {
    this.count = count; this.trail = trail;
    this.px = new Float32Array(count * trail);
    this.py = new Float32Array(count * trail);
    this.pz = new Float32Array(count * trail);
    this.sp = new Float32Array(count * trail);
    this.head = new Int32Array(count);
    this.life = new Float32Array(count);
    this.filled = new Int32Array(count);
    this.rnd = mulberry32(9781);
    this._f = { x: 0, z: 0, d: 0 };
    for (let i = 0; i < count; i++) this.life[i] = -1;
  }
  seed(sim, i) {
    const half = sim.size / 2;
    for (let tries = 0; tries < 24; tries++) {
      const x = (this.rnd() - 0.5) * sim.size;
      const z = (this.rnd() - 0.5) * sim.size;
      sampleFlow(sim, x, z, this._f);
      if (this._f.d > 0.02) {
        const t = this.trail, b = i * t;
        for (let k = 0; k < t; k++) { this.px[b + k] = x; this.pz[b + k] = z; this.py[b + k] = 0; this.sp[b + k] = 0; }
        this.head[i] = 0;
        this.filled[i] = 1;
        this.life[i] = 4 + this.rnd() * 5;
        return true;
      }
      if (x < -half) break;
    }
    this.life[i] = -1;
    return false;
  }
  update(sim, dtSim, exag) {
    const f = this._f, t = this.trail;
    const dt = Math.min(dtSim, 1.2);
    for (let i = 0; i < this.count; i++) {
      if (this.life[i] < 0) { if (this.rnd() < 0.10) this.seed(sim, i); continue; }
      this.life[i] -= dt;
      const b = i * t, hd = this.head[i];
      let x = this.px[b + hd], z = this.pz[b + hd];
      sampleFlow(sim, x, z, f);
      if (f.d < 0.012 || this.life[i] <= 0) { this.life[i] = -1; continue; }
      x += f.x * dt; z += f.z * dt;
      const nh = (hd + 1) % t;
      this.head[i] = nh;
      this.px[b + nh] = x; this.pz[b + nh] = z;
      this.py[b + nh] = sampleGround(sim, x, z) + f.d * exag + 0.02;
      this.sp[b + nh] = Math.sqrt(f.x * f.x + f.z * f.z);
      if (this.filled[i] < t) this.filled[i]++;
    }
  }
  writeGeometry(pos, alp, spd) {
    const t = this.trail;
    let v = 0;
    for (let i = 0; i < this.count; i++) {
      const b = i * t, hd = this.head[i], fill = this.filled[i];
      for (let k = 0; k < t - 1; k++) {
        const i0 = (hd - k + t * 2) % t;
        const i1 = (hd - k - 1 + t * 2) % t;
        const on = this.life[i] > 0 && k < fill - 1;
        const a0 = on ? 1 - k / (t - 1) : 0;
        const a1 = on ? 1 - (k + 1) / (t - 1) : 0;
        pos[v * 3] = this.px[b + i0]; pos[v * 3 + 1] = this.py[b + i0]; pos[v * 3 + 2] = this.pz[b + i0];
        alp[v] = a0; spd[v] = this.sp[b + i0]; v++;
        pos[v * 3] = this.px[b + i1]; pos[v * 3 + 1] = this.py[b + i1]; pos[v * 3 + 2] = this.pz[b + i1];
        alp[v] = a1; spd[v] = this.sp[b + i1]; v++;
      }
    }
    return v;
  }
}
