import { test } from "node:test";
import assert from "node:assert/strict";
import { Sim, G } from "../src/lib/solver.js";
import { loadScene } from "../src/lib/scenes.js";
import { computeAO } from "../src/lib/occlusion.js";
import { smoothField, fieldNormals } from "../src/lib/fields.js";
import { DURATIONS, stormDepthMm, profileFactor } from "../src/lib/rainfall.js";

const N = 128, SIZE = 256;

/** Run a storm to completion and return the closing state. */
export function runStorm(sceneId, aep, dur, { outletOnly = false, mutate } = {}) {
  const s = new Sim(N, SIZE);
  loadScene(s, sceneId);
  s.outletOnly = outletOnly;
  s.reset();
  if (mutate) mutate(s);
  const durS = DURATIONS[dur] * 3600;
  const mean = stormDepthMm(aep, DURATIONS[dur], 0) / 1000 / durS;
  let peakQ = 0, tPeak = 0, steps = 0;
  while (s.t < durS * 1.25 && steps < 300000) {
    const hm = Math.max(s.maxDepth, 0.015);
    let dt = (0.62 * s.dx) / Math.sqrt(G * hm);
    if (dt > 1.5) dt = 1.5;
    s.step(dt, s.t < durS ? mean * profileFactor(s.t / durS, true) : 0, true);
    steps++;
    if (s.outQ > peakQ) { peakQ = s.outQ; tPeak = s.t; }
    if (steps % 40 === 0) s.stats();
  }
  s.stats();
  return { s, peakQ, tPeak: tPeak / 60, steps };
}

test("mass balance closes on every ready-made scene", () => {
  for (const scene of ["teaching", "pluvial", "fluvial"]) {
    const { s } = runStorm(scene, 4, 1);
    assert.ok(Math.abs(s.balanceError()) < 0.05,
      `${scene}: balance error ${s.balanceError().toFixed(4)}% should be under 0.05%`);
  }
});

test("depth and velocity fields stay finite and non-negative", () => {
  const { s } = runStorm("teaching", 6, 1, { outletOnly: true });
  for (let a = 0; a < N * N; a++) {
    assert.ok(Number.isFinite(s.h[a]), `depth at ${a} is not finite`);
    assert.ok(s.h[a] >= 0, `depth at ${a} is negative`);
    assert.ok(Number.isFinite(s.vel[a]), `velocity at ${a} is not finite`);
  }
});

test("single-outlet drainage keeps water inside the other three edges", () => {
  const { s } = runStorm("teaching", 4, 1, { outletOnly: true });
  assert.ok(s.volOut > 0, "some water should leave through the outlet");
  const { s: open } = runStorm("teaching", 4, 1, { outletOnly: false });
  assert.ok(open.volOut > s.volOut,
    "draining all four edges should shed more water than one outlet");
});

test("render smoothing conserves volume and flattens isolated spikes", () => {
  const src = new Float32Array(N * N);
  const dst = new Float32Array(N * N);
  const tmp = new Float32Array(N * N);
  for (let a = 0; a < N * N; a++) src[a] = a % 37 === 0 ? 0.35 : 0;
  const total = src.reduce((x, y) => x + y, 0);
  for (const passes of [1, 2, 3]) {
    smoothField(N, src, dst, tmp, passes);
    const sum = dst.reduce((x, y) => x + y, 0);
    assert.ok(Math.abs(sum - total) / total < 1e-4, "volume must be preserved");
  }
  smoothField(N, src, dst, tmp, 2);
  let peak = 0;
  for (const v of dst) if (v > peak) peak = v;
  assert.ok(peak < 0.20, `two passes should cut a 0.35 m spike well below it, got ${peak}`);
});

test("field normals are unit length and point upwards", () => {
  const surf = new Float32Array(N * N);
  for (let j = 0; j < N; j++)
    for (let i = 0; i < N; i++) surf[j * N + i] = Math.sin(i * 0.2) * 2 + Math.cos(j * 0.15) * 3;
  const out = new Float32Array(N * N * 3);
  fieldNormals(N, 2.016, surf, out);
  for (let a = 0; a < N * N; a++) {
    const x = out[a * 3], y = out[a * 3 + 1], z = out[a * 3 + 2];
    assert.ok(Math.abs(Math.hypot(x, y, z) - 1) < 1e-3, "normal must be unit length");
    assert.ok(y > 0, "normal must point up");
  }
});

test("ambient occlusion stays in range and darkens obstructed ground", () => {
  const s = new Sim(N, SIZE);
  loadScene(s, "pluvial");
  computeAO(s);
  let lo = 2, hi = -1;
  for (let a = 0; a < N * N; a++) {
    assert.ok(Number.isFinite(s.ao[a]));
    if (s.ao[a] < lo) lo = s.ao[a];
    if (s.ao[a] > hi) hi = s.ao[a];
  }
  assert.ok(lo >= 0 && hi <= 1, "occlusion must be within 0 to 1");
  assert.ok(lo < 0.8, `built-up ground should show real occlusion, min was ${lo.toFixed(3)}`);
});
