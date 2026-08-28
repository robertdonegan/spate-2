import { test } from "node:test";
import assert from "node:assert/strict";
import { Sim, G } from "../src/lib/solver.js";
import { loadScene } from "../src/lib/scenes.js";
import {
  SEC_NODES, newProfile, sampleSection, assumedProfile,
  applyPiers, removePiers, buildBridgeGeometry, bridgeHydraulics,
} from "../src/lib/units1d.js";

const N = 128, SIZE = 256;
const sec = (x1, z1, x2, z2) => ({ x1, z1, x2, z2 });

test("section integration reproduces an analytic rectangular channel", () => {
  const s = new Sim(N, SIZE);
  loadScene(s, "fluvial");
  s.reset();
  for (let a = 0; a < N * N; a++) { s.z[a] = 0; s.h[a] = 0.5; }
  const p = sampleSection(s, sec(-100, 0, 100, 0), newProfile());
  assert.ok(Math.abs(p.A - 100) < 1e-3, `area ${p.A} should be 100 m2`);
  assert.ok(Math.abs(p.T - 200) < 1e-6, `top width ${p.T} should be 200 m`);
  assert.ok(Math.abs(p.R - 0.5) < 1e-3, `hydraulic radius ${p.R} should be 0.5 m`);
});

test("section quantities satisfy their defining identities", () => {
  const s = new Sim(N, SIZE);
  loadScene(s, "fluvial");
  s.reset();
  for (let k = 0; k < 400; k++) {
    const hm = Math.max(s.maxDepth, 0.015);
    s.step(Math.min(1.5, (0.62 * s.dx) / Math.sqrt(G * hm)), 2e-5, true);
    if (k % 40 === 0) s.stats();
  }
  s.stats();
  const p = sampleSection(s, sec(-120, 0, 120, 0), newProfile());
  assert.ok(p.A > 0, "section should be wet");
  assert.ok(Math.abs(p.V - p.Q / p.A) < 1e-9, "V must equal Q/A");
  assert.ok(Math.abs(p.R - p.A / p.P) < 1e-9, "R must equal A/P");
  assert.ok(Math.abs(p.Fr - Math.abs(p.V) / Math.sqrt(G * (p.A / p.T))) < 1e-9,
    "Fr must equal V over root gD");
  assert.ok(Math.abs(p.K - (p.A * Math.pow(p.R, 2 / 3)) / p.nMean) < 1e-6,
    "K must equal A R^(2/3) / n");
});

test("an interpolate unit misreads ground it cannot see", () => {
  const s = new Sim(N, SIZE);
  loadScene(s, "fluvial");
  s.reset();
  const a = sampleSection(s, sec(-120, -60, 120, -60), newProfile());
  const b = sampleSection(s, sec(-120, 60, 120, 60), newProfile());
  const mid = sampleSection(s, sec(-120, 0, 120, 0), newProfile());
  const assumed = new Float32Array(SEC_NODES);
  assumedProfile(a, b, 0.5, assumed);
  let worst = 0;
  for (let k = 0; k < SEC_NODES; k++) worst = Math.max(worst, Math.abs(assumed[k] - mid.zb[k]));
  assert.ok(worst > 0.1,
    "blending two sections 120 m apart should visibly disagree with the real bed");
  assert.ok(Number.isFinite(worst));
});

test("bridge piers obstruct the bed and restore it exactly on removal", () => {
  const s = new Sim(N, SIZE);
  loadScene(s, "fluvial");
  s.reset();
  const before = Float32Array.from(s.z);
  const u = {
    id: "b1", kind: "bridge", x1: -40, z1: 0, x2: 40, z2: 0,
    span: 10, soffit: s.z[64 * N + 64] + 3, deck: 0.7, piers: 3, pierW: 4, delta: null,
  };
  applyPiers(s, u);
  let raised = 0;
  for (let a = 0; a < N * N; a++) if (s.z[a] !== before[a]) raised++;
  assert.ok(raised > 0, "piers must raise some bed cells");
  applyPiers(s, u);
  applyPiers(s, u);
  removePiers(s, u);
  for (let a = 0; a < N * N; a++)
    assert.equal(s.z[a], before[a], `bed cell ${a} not restored exactly`);
});

test("bridge geometry and hydraulics produce finite numbers", () => {
  const s = new Sim(N, SIZE);
  loadScene(s, "fluvial");
  s.reset();
  const u = {
    id: "b1", kind: "bridge", x1: -40, z1: 0, x2: 40, z2: 0,
    span: 10, soffit: s.z[64 * N + 64] + 3, deck: 0.7, piers: 2, pierW: 2, delta: null,
  };
  applyPiers(s, u);
  const g = buildBridgeGeometry(s, [u]);
  const pos = g.attributes.position.array;
  assert.ok(pos.length > 0, "bridge should produce geometry");
  for (let i = 0; i < pos.length; i++) assert.ok(Number.isFinite(pos[i]));
  const open = sampleSection(s, sec(u.x1, u.z1, u.x2, u.z2), newProfile());
  const up = sampleSection(s, sec(u.x1, -13, u.x2, -13), newProfile());
  const dn = sampleSection(s, sec(u.x1, 13, u.x2, 13), newProfile());
  const h = bridgeHydraulics(s, u, up, open, dn);
  for (const k of ["blockage", "Kc", "Ke", "dHc", "dHe", "clearance"])
    assert.ok(Number.isFinite(h[k]), `${k} must be finite`);
  assert.ok(h.Kc >= 0.10 && h.Kc <= 0.50, "Kc must stay in its published range");
  assert.ok(h.Ke >= 0.30 && h.Ke <= 1.00, "Ke must stay in its published range");
});
