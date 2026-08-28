/* 1D network units laid over the 2D field: cross-section, interpolate,
   bridge. Section quantities are integrated from the real terrain. */
import * as THREE from "three";
import { G } from "./solver.js";
import { sampleFlow, sampleGround } from "./fields.js";

/* ===================================================== 1D network units ==
   A cross-section unit here does what one does in a 1D model: it integrates
   the flow crossing a line. The difference is that the geometry underneath
   is real 2D terrain rather than surveyed panels, so an interpolate unit can
   be shown against the ground it is pretending to be.                      */
export const SEC_NODES = 72;
export const MAX_UNITS = 18;
const _sfv = { x: 0, z: 0, d: 0 };

export function newProfile() {
  return {
    s: new Float32Array(SEC_NODES), zb: new Float32Array(SEC_NODES),
    d: new Float32Array(SEC_NODES), vn: new Float32Array(SEC_NODES),
    zbAssumed: new Float32Array(SEC_NODES),
    L: 0, A: 0, Q: 0, T: 0, P: 0, ws: NaN, V: 0, R: 0, D: 0, Fr: 0, K: 0,
    nMean: 0.035, bedMin: 0, dmax: 0, vmax: 0, wet: 0,
  };
}
export function roughAt(sim, wx, wz) {
  const n = sim.N;
  const i = Math.max(0, Math.min(n - 1, Math.round((wx / sim.size + 0.5) * (n - 1))));
  const j = Math.max(0, Math.min(n - 1, Math.round((wz / sim.size + 0.5) * (n - 1))));
  return sim.nRough[j * n + i] || 0.035;
}

export function sampleSection(sim, sec, out) {
  const dx = sec.x2 - sec.x1, dz = sec.z2 - sec.z1;
  const L = Math.hypot(dx, dz) || 1;
  const ux = dx / L, uz = dz / L;
  const px = -uz, pz = ux;                     // section normal = flow positive
  const dl = L / (SEC_NODES - 1);
  let A = 0, Q = 0, T = 0, P = 0, wsSum = 0, wsN = 0, nSum = 0;
  let vmax = 0, dmax = 0, bedMin = Infinity, prevZb = 0;
  for (let k = 0; k < SEC_NODES; k++) {
    const t = k / (SEC_NODES - 1);
    const x = sec.x1 + dx * t, z = sec.z1 + dz * t;
    const zb = sampleGround(sim, x, z);
    sampleFlow(sim, x, z, _sfv);
    const d = _sfv.d;
    const vn = _sfv.x * px + _sfv.z * pz;
    out.s[k] = t * L; out.zb[k] = zb; out.d[k] = d; out.vn[k] = vn;
    if (zb < bedMin) bedMin = zb;
    const w = k === 0 || k === SEC_NODES - 1 ? dl * 0.5 : dl;
    A += d * w;
    Q += d * vn * w;
    if (d > 0.005) {
      T += w; wsSum += zb + d; wsN++;
      nSum += roughAt(sim, x, z);
      const av = Math.abs(vn);
      if (av > vmax) vmax = av;
      if (d > dmax) dmax = d;
      if (k > 0) P += Math.sqrt(dl * dl + (zb - prevZb) * (zb - prevZb));
    }
    prevZb = zb;
  }
  out.L = L; out.A = A; out.Q = Q; out.T = T;
  out.P = Math.max(P, T, 1e-6);
  out.ws = wsN ? wsSum / wsN : NaN;
  out.nMean = wsN ? nSum / wsN : 0.035;
  out.V = A > 1e-6 ? Q / A : 0;
  out.R = A / out.P;
  out.D = T > 1e-6 ? A / T : 0;
  out.Fr = out.D > 1e-6 ? Math.abs(out.V) / Math.sqrt(G * out.D) : 0;
  out.K = out.nMean > 0 ? (A * Math.pow(out.R, 2 / 3)) / out.nMean : 0;
  out.bedMin = bedMin === Infinity ? 0 : bedMin;
  out.dmax = dmax; out.vmax = vmax; out.wet = wsN / SEC_NODES;
  return out;
}

/* What a 1D interpolate unit assumes: a straight blend of its two
   neighbours' panels, indifferent to the ground actually there. */
export function assumedProfile(pA, pB, t, out) {
  for (let k = 0; k < SEC_NODES; k++) out[k] = pA.zb[k] * (1 - t) + pB.zb[k] * t;
}

/* ------------------------------------------------------------- bridge ---- */
export const CUBE_P = [], CUBE_N = [];
{
  const faces = [
    [[1, 0, 0], [[1, -1, -1], [1, 1, -1], [1, 1, 1], [1, -1, 1]]],
    [[-1, 0, 0], [[-1, -1, 1], [-1, 1, 1], [-1, 1, -1], [-1, -1, -1]]],
    [[0, 1, 0], [[-1, 1, -1], [-1, 1, 1], [1, 1, 1], [1, 1, -1]]],
    [[0, -1, 0], [[-1, -1, 1], [-1, -1, -1], [1, -1, -1], [1, -1, 1]]],
    [[0, 0, 1], [[-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]]],
    [[0, 0, -1], [[-1, 1, -1], [1, 1, -1], [1, -1, -1], [-1, -1, -1]]],
  ];
  for (const [nrm, q] of faces) {
    const tri = [q[0], q[1], q[2], q[0], q[2], q[3]];
    for (const v of tri) { CUBE_P.push(v[0] * 0.5, v[1] * 0.5, v[2] * 0.5); CUBE_N.push(nrm[0], nrm[1], nrm[2]); }
  }
}
export function pushBox(pos, nrm, col, cx, cy, cz, sx, sy, sz, ca, sa, c) {
  for (let k = 0; k < 36; k++) {
    const lx = CUBE_P[k * 3] * sx, ly = CUBE_P[k * 3 + 1] * sy, lz = CUBE_P[k * 3 + 2] * sz;
    pos.push(cx + lx * ca - lz * sa, cy + ly, cz + lx * sa + lz * ca);
    const nx = CUBE_N[k * 3], ny = CUBE_N[k * 3 + 1], nz = CUBE_N[k * 3 + 2];
    nrm.push(nx * ca - nz * sa, ny, nx * sa + nz * ca);
    col.push(c[0], c[1], c[2]);
  }
}
export function buildBridgeGeometry(sim, units) {
  const pos = [], nrm = [], col = [], sway = [];
  const DECK = [0.40, 0.41, 0.44], PIER = [0.52, 0.50, 0.47], PARAPET = [0.60, 0.58, 0.54];
  for (const u of units) {
    if (u.kind !== "bridge") continue;
    const dx = u.x2 - u.x1, dz = u.z2 - u.z1;
    const L = Math.hypot(dx, dz) || 1;
    const ang = Math.atan2(dz, dx), ca = Math.cos(ang), sa = Math.sin(ang);
    const mx = (u.x1 + u.x2) / 2, mz = (u.z1 + u.z2) / 2;
    const yDeck = u.soffit + u.deck / 2;
    pushBox(pos, nrm, col, mx, yDeck, mz, L, u.deck, u.span, ca, sa, DECK);
    pushBox(pos, nrm, col, mx, u.soffit + u.deck + 0.45, mz, L, 0.9, 0.32, ca, sa, PARAPET);
    const off = (u.span / 2) - 0.16;
    for (const sgn of [-1, 1]) {
      const px = mx - sa * off * sgn, pz = mz + ca * off * sgn;
      pushBox(pos, nrm, col, px, u.soffit + u.deck + 0.45, pz, L, 0.9, 0.32, ca, sa, PARAPET);
    }
    const np = Math.max(0, u.piers | 0);
    for (let i = 0; i < np; i++) {
      const t = (i + 1) / (np + 1);
      const px = u.x1 + dx * t, pz = u.z1 + dz * t;
      const bed = sampleGround(sim, px, pz);
      const hgt = Math.max(0.4, u.soffit - bed);
      pushBox(pos, nrm, col, px, bed + hgt / 2, pz, u.pierW, hgt, u.span * 0.82, ca, sa, PIER);
    }
    for (const end of [0, 1]) {
      const px = end ? u.x2 : u.x1, pz = end ? u.z2 : u.z1;
      const bed = sampleGround(sim, px, pz);
      const hgt = Math.max(0.5, u.soffit + u.deck - bed);
      pushBox(pos, nrm, col, px, bed + hgt / 2, pz, 2.2, hgt, u.span, ca, sa, PIER);
    }
  }
  for (let i = 0; i < pos.length / 3; i++) sway.push(0);
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute("aNrm", new THREE.BufferAttribute(new Float32Array(nrm), 3));
  g.setAttribute("aCol", new THREE.BufferAttribute(new Float32Array(col), 3));
  g.setAttribute("aSway", new THREE.BufferAttribute(new Float32Array(sway), 1));
  g.computeBoundingSphere();
  return g;
}

/* Piers are the only part the 2D solver sees: they go into the bed as
   obstructions. The deck is drawn but not hydraulically active. */
export function applyPiers(sim, u) {
  removePiers(sim, u);
  const delta = [];
  const dx = u.x2 - u.x1, dz = u.z2 - u.z1;
  const np = Math.max(0, u.piers | 0);
  const n = sim.N;
  for (let i = 0; i < np; i++) {
    const t = (i + 1) / (np + 1);
    const px = u.x1 + dx * t, pz = u.z1 + dz * t;
    const gi = (px / sim.size + 0.5) * (n - 1), gj = (pz / sim.size + 0.5) * (n - 1);
    const r = Math.max(1, (u.pierW * 0.5) / sim.dx);
    const rz = Math.max(1, (u.span * 0.41) / sim.dx);
    const rad = Math.max(r, rz);
    for (let j = Math.floor(gj - rad); j <= Math.ceil(gj + rad); j++)
      for (let ii = Math.floor(gi - rad); ii <= Math.ceil(gi + rad); ii++) {
        if (ii < 0 || j < 0 || ii >= n || j >= n) continue;
        if (Math.hypot(ii - gi, j - gj) > rad) continue;
        const a = j * n + ii;
        const want = u.soffit;
        if (sim.z[a] < want) { delta.push(a, sim.z[a]); sim.z[a] = want; }
      }
  }
  u.delta = delta;
}
export function removePiers(sim, u) {
  if (!u.delta) return;
  for (let k = 0; k < u.delta.length; k += 2) sim.z[u.delta[k]] = u.delta[k + 1];
  u.delta = null;
}

/* Contraction and expansion at the bridge faces: the coefficients a 1D
   bridge unit would apply, computed from the geometry it actually has. */
export function bridgeHydraulics(sim, u, pUp, pOpen, pDown) {
  const A1 = pUp.A, Ab = pOpen.A, A2 = pDown.A;
  const blockage = A1 > 1e-6 ? Math.max(0, 1 - Ab / A1) : 0;
  const V1 = pUp.V, Vb = pOpen.V, V2 = pDown.V;
  const Kc = 0.10 + 0.40 * Math.min(1, blockage / 0.6);
  const Ke = 0.30 + 0.70 * Math.min(1, blockage / 0.6);
  const dHc = (Kc * Math.abs(Vb * Vb - V1 * V1)) / (2 * G);
  const dHe = (Ke * Math.abs(Vb * Vb - V2 * V2)) / (2 * G);
  const ws = isFinite(pOpen.ws) ? pOpen.ws : pOpen.bedMin;
  const clearance = u.soffit - ws;
  return { A1, Ab, A2, blockage, V1, Vb, V2, Kc, Ke, dHc, dHe, clearance, drowned: clearance < 0 };
}
