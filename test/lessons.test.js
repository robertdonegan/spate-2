/**
 * Guard rail for the teaching sequence.
 *
 * Every lesson sets a numeric target. If a change to the solver, the scene or
 * the design rainfall makes one of those targets unreachable, the lesson
 * silently becomes impossible and the learner is left stuck. These tests play
 * each brief the way a competent user would and assert the target is still
 * beatable with headroom.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { LESSONS, ZONE_A, ZONE_B } from "../src/data/lessons.js";
import { runStorm } from "./solver.test.js";

const N = 128;
const zoneMax = (s, Z) => {
  let m = 0;
  for (let j = Z.j0; j <= Z.j1; j++)
    for (let i = Z.i0; i <= Z.i1; i++) { const v = s.hmax[j * N + i]; if (v > m) m = v; }
  return m;
};
const byId = (id) => LESSONS.find((l) => l.id === id);
const setupOf = (id) => byId(id).setup;

test("lesson 1: water gathers deep enough to beat the float target", () => {
  const L = byId("read"), u = L.setup;
  const { s } = runStorm(u.scene, u.aep, u.dur, { outletOnly: true });
  assert.ok(s.maxDepth >= L.target * 1.5,
    `deepest water ${s.maxDepth.toFixed(3)} m must clear the ${L.target} m target with headroom`);
});

test("lesson 2: paving lifts peak outflow past the required margin", () => {
  const L = byId("seal"), u = L.setup;
  const base = runStorm(u.scene, u.aep, u.dur, { outletOnly: true });
  const paved = runStorm(u.scene, u.aep, u.dur, {
    outletOnly: true,
    mutate: (s) => {
      for (let a = 0; a < N * N; a++) if (s.land[a] === 0 || s.land[a] === 1) s.land[a] = 4;
      s.syncLand();
    },
  });
  const gain = paved.peakQ / base.peakQ - 1;
  assert.ok(gain >= L.delta,
    `paving gained ${(gain * 100).toFixed(0)}%, brief asks for ${(L.delta * 100).toFixed(0)}%`);
});

test("lesson 3: excavated storage cuts the peak past the required margin", () => {
  const L = byId("peak"), u = L.setup;
  const base = runStorm(u.scene, u.aep, u.dur, { outletOnly: true });
  const dug = runStorm(u.scene, u.aep, u.dur, {
    outletOnly: true,
    mutate: (s) => {
      for (let j = 56; j < 86; j++) for (let i = 40; i < 92; i++) s.z[j * N + i] -= 2.6;
    },
  });
  const cut = 1 - dug.peakQ / base.peakQ;
  assert.ok(cut >= L.delta,
    `storage cut ${(cut * 100).toFixed(0)}%, brief asks for ${(L.delta * 100).toFixed(0)}%`);
  /* The debrief claims nothing vanished: the outflow missing from the outlet
     should still be standing in the excavation at the end of the run. */
  const missing = base.s.volOut - dug.s.volOut;
  const held = dug.s.storage;
  assert.ok(held > 0.5 * missing,
    `debrief claims the water is still in the hole; missing ${missing.toFixed(0)} m3, held ${held.toFixed(0)} m3`);
  assert.ok(Math.abs(missing - held) / Math.max(missing, 1) < 0.25,
    `missing outflow (${missing.toFixed(0)} m3) and impounded volume (${held.toFixed(0)} m3) should roughly match`);
});

test("lesson 4: added roughness delays the peak past the required margin", () => {
  const L = byId("rough"), u = L.setup;
  const base = runStorm(u.scene, u.aep, u.dur, { outletOnly: true });
  const rough = runStorm(u.scene, u.aep, u.dur, {
    outletOnly: true,
    mutate: (s) => { for (let a = 0; a < N * N; a++) s.nRough[a] *= 2.5; },
  });
  const later = rough.tPeak / base.tPeak - 1;
  assert.ok(later >= L.delta,
    `roughness delayed the peak ${(later * 100).toFixed(0)}%, brief asks for ${(L.delta * 100).toFixed(0)}%`);
});

test("lesson 5: the short storm out-peaks the long one on far less rain", () => {
  const L = byId("intensity"), u = L.setup;
  const slow = runStorm(u.scene, u.aep, u.dur, { outletOnly: true });
  const fast = runStorm(u.scene, u.aep, 0, { outletOnly: true });
  const gain = fast.peakQ / slow.peakQ - 1;
  assert.ok(gain >= L.delta,
    `short storm gained ${(gain * 100).toFixed(0)}%, brief asks for ${(L.delta * 100).toFixed(0)}%`);
  assert.ok(fast.s.volRain < slow.s.volRain,
    "the debrief depends on the short storm delivering less total rain");
});

test("lesson 6: an embankment can protect the village and load the meadow", () => {
  const u = setupOf("move");
  const base = runStorm(u.scene, u.aep, u.dur, { outletOnly: true });
  assert.ok(zoneMax(base.s, ZONE_A) > 0.25,
    "the village must actually flood before an embankment can be the answer");
  const walled = runStorm(u.scene, u.aep, u.dur, {
    outletOnly: true,
    mutate: (s) => {
      for (let j = 84; j < 90; j++) for (let i = 26; i < 104; i++) s.z[j * N + i] += 4.5;
    },
  });
  assert.ok(zoneMax(walled.s, ZONE_A) < 0.25, "village must fall below the pass threshold");
  assert.ok(zoneMax(walled.s, ZONE_B) > 0.30, "meadow must rise above the pass threshold");
});

test("every lesson declares the fields the engine reads", () => {
  for (const L of LESSONS) {
    assert.ok(L.id && L.title && L.brief && L.task && L.debrief, `${L.id} missing copy`);
    assert.ok(["absolute", "compare", "zones"].includes(L.kind), `${L.id} bad kind`);
    if (L.kind === "compare") assert.ok(typeof L.delta === "number" && L.delta > 0);
    if (L.kind === "absolute") assert.ok(typeof L.target === "number");
    assert.ok(L.setup && L.setup.scene, `${L.id} missing scene setup`);
  }
});
