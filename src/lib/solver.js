/* 2D diffusive-wave shallow water on a heightfield.
   Discharge between cells from Manning on the water-surface slope. */
import { LAND } from "./landcover.js";

export const G = 9.80665;
export const P53N = 4096, P53MAX = 8.0;
export const P53 = new Float32Array(P53N + 2);
for (let i = 0; i <= P53N + 1; i++) P53[i] = Math.pow((i * P53MAX) / P53N, 5 / 3);
export function pow53(x) {
  if (x <= 0) return 0;
  if (x >= P53MAX) return Math.pow(x, 5 / 3);
  const f = x * (P53N / P53MAX);
  const i = f | 0;
  return P53[i] + (P53[i + 1] - P53[i]) * (f - i);
}


export class Sim {
  constructor(n, size) {
    this.N = n; this.size = size; this.dx = size / (n - 1);
    const M = n * n;
    this.z = new Float32Array(M);
    this.h = new Float32Array(M);
    this.hmax = new Float32Array(M);
    this.land = new Uint8Array(M);
    this.qx = new Float32Array(M);
    this.qy = new Float32Array(M);
    this.vel = new Float32Array(M);
    this.nRough = new Float32Array(M);
    this.infRate = new Float32Array(M);
    this.ao = new Float32Array(M).fill(1);
    this.h0 = new Float32Array(M);
    this.hr = new Float32Array(M);
    this.hs = new Float32Array(M);
    this.tmpF = new Float32Array(M);
    this.surf = new Float32Array(M);
    this.infScale = 1;
    this.outletOnly = false;
    this.inflowCells = [];
    this.inflowNow = 0;
    this.stageOn = false;
    this.stageLevel = 0;
    this.vol0 = 0;
    this.stageCells = [];
    for (let i = 0; i < n; i++) this.stageCells.push((n - 1) * n + i);
    this.reset();
  }
  syncLand() {
    for (let a = 0; a < this.N * this.N; a++) {
      const L = LAND[this.land[a]];
      this.nRough[a] = L.n;
      this.infRate[a] = L.inf / 3600000;
    }
  }
  reset() {
    this.h.set(this.h0);
    this.hmax.set(this.h0);
    this.hr.set(this.h0);
    this.hs.set(this.h0);
    this.qx.fill(0); this.qy.fill(0); this.vel.fill(0);
    this.t = 0; this.volRain = 0; this.volInf = 0; this.volOut = 0; this.volAdd = 0;
    this.volIn = 0; this.volStage = 0;
    this.outQ = 0; this.rainNow = 0; this.storage = 0; this.wetFrac = 0;
    this.maxDepth = 0; this.maxVel = 0; this.peakOutQ = 0;
  }

  step(dt, rainMs, openB) {
    const { N: n, dx, z, h, qx, qy, vel, nRough, infRate } = this;
    const M = n * n, area = dx * dx, invdx = 1 / dx;
    let infD = 0;
    const rd = rainMs * dt, isc = this.infScale;
    for (let a = 0; a < M; a++) {
      let d = h[a] + rd;
      let loss = infRate[a] * isc * dt;
      if (loss > d) loss = d;
      d -= loss; infD += loss; h[a] = d;
    }
    this.volRain += rd * M * area;
    this.volInf += infD * area;
    this.rainNow = rainMs * 3600000;

    const nIn = this.inflowCells.length;
    if (this.inflowNow > 0 && nIn > 0) {
      const add = (this.inflowNow * dt) / (nIn * area);
      for (let k = 0; k < nIn; k++) h[this.inflowCells[k]] += add;
      this.volIn += this.inflowNow * dt;
    }

    const lim = (0.25 * dx) / dt;
    for (let j = 0; j < n; j++) {
      const row = j * n;
      for (let i = 0; i < n - 1; i++) {
        const a = row + i, b = a + 1;
        const za = z[a], zb = z[b], ha = h[a], hb = h[b];
        const wa = za + ha, wb = zb + hb;
        const hf = (wa > wb ? wa : wb) - (za > zb ? za : zb);
        if (hf > 2e-4) {
          const S = (wa - wb) * invdx;
          const aS = S < 0 ? -S : S;
          let q = (pow53(hf) * Math.sqrt(aS)) / (0.5 * (nRough[a] + nRough[b]));
          if (S < 0) { q = -q; const cap = hb * lim; if (q < -cap) q = -cap; }
          else { const cap = ha * lim; if (q > cap) q = cap; }
          qx[a] = q;
        } else qx[a] = 0;
      }
      qx[row + n - 1] = 0;
    }
    for (let j = 0; j < n - 1; j++) {
      const row = j * n;
      for (let i = 0; i < n; i++) {
        const a = row + i, b = a + n;
        const za = z[a], zb = z[b], ha = h[a], hb = h[b];
        const wa = za + ha, wb = zb + hb;
        const hf = (wa > wb ? wa : wb) - (za > zb ? za : zb);
        if (hf > 2e-4) {
          const S = (wa - wb) * invdx;
          const aS = S < 0 ? -S : S;
          let q = (pow53(hf) * Math.sqrt(aS)) / (0.5 * (nRough[a] + nRough[b]));
          if (S < 0) { q = -q; const cap = hb * lim; if (q < -cap) q = -cap; }
          else { const cap = ha * lim; if (q > cap) q = cap; }
          qy[a] = q;
        } else qy[a] = 0;
      }
    }
    for (let i = 0; i < n; i++) qy[(n - 1) * n + i] = 0;

    for (let j = 0; j < n; j++) {
      const row = j * n;
      for (let i = 0; i < n; i++) {
        const a = row + i;
        const inX = i > 0 ? qx[a - 1] : 0;
        const inY = j > 0 ? qy[a - n] : 0;
        let d = h[a] + dt * (inX - qx[a] + inY - qy[a]) * invdx;
        if (d < 0) d = 0;
        h[a] = d;
        if (d > this.hmax[a]) this.hmax[a] = d;
        if (d > 0.02) {
          const vx = (0.5 * (inX + qx[a])) / d;
          const vy = (0.5 * (inY + qy[a])) / d;
          vel[a] = Math.sqrt(vx * vx + vy * vy);
        } else vel[a] = 0;
      }
    }

    if (openB) {
      let outV = 0;
      const drain = (a) => {
        const d = h[a];
        if (d <= 2e-4) return;
        let q = (pow53(d) * Math.sqrt(d * invdx)) / nRough[a];
        const cap = d * lim;
        if (q > cap) q = cap;
        const dd = q * dt * invdx;
        h[a] = d - dd > 0 ? d - dd : 0;
        outV += q * dx * dt;
      };
      if (this.outletOnly) {
        /* one outlet on the south edge, so the catchment has a single flow
           path worth intercepting instead of leaking off all four sides */
        if (!this.stageOn) for (let i = 0; i < n; i++) drain((n - 1) * n + i);
      } else {
        for (let i = 0; i < n; i++) { drain(i); if (!this.stageOn) drain((n - 1) * n + i); }
        for (let j = 1; j < n - 1; j++) { drain(j * n); drain(j * n + n - 1); }
      }
      this.volOut += outV;
      this.outQ = outV / dt;
      if (this.outQ > this.peakOutQ) this.peakOutQ = this.outQ;
    } else this.outQ = 0;

    if (this.stageOn) {
      const lv = this.stageLevel;
      const sc = this.stageCells;
      let ex = 0;
      for (let k = 0; k < sc.length; k++) {
        const a = sc[k];
        const target = lv - z[a];
        const d = target > 0 ? target : 0;
        ex += d - h[a];
        h[a] = d;
      }
      this.volStage += ex * area;
    }

    this.t += dt;
  }

  stats() {
    const { N: n, h, vel, dx } = this;
    const M = n * n;
    let s = 0, wet = 0, hm = 0, vm = 0;
    for (let a = 0; a < M; a++) {
      const d = h[a];
      s += d;
      if (d > 0.01) wet++;
      if (d > hm) hm = d;
      const v = vel[a];
      if (v > vm) vm = v;
    }
    this.storage = s * dx * dx;
    this.wetFrac = wet / M;
    this.maxDepth = hm;
    this.maxVel = vm;
  }
  balanceError() {
    const gained = this.vol0 + this.volRain + this.volAdd + this.volIn + Math.max(this.volStage, 0);
    if (gained < 1e-6) return 0;
    const resid =
      this.vol0 + this.volRain + this.volAdd + this.volIn + this.volStage -
      this.volInf - this.volOut - this.storage;
    return (resid / gained) * 100;
  }
}
