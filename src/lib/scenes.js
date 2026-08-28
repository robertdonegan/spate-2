/* Ready-made catchments. */
import { fbm, gauss, sstep } from "./math.js";

export const SCENES = [
  {
    id: "teaching", group: "ready", name: "Catchment", title: "One valley, one outlet",
    blurb: "A grazed valley falling south to a single outlet, with a meadow on the floor and a village in the hollow below it. Built for the lessons: everything that lands here has to leave through one gap.",
    defaults: { aep: 4, dur: 1, peaked: true, openB: true, outletOnly: true, stageOn: false, inflowOn: false, wExag: 5, view: "oblique" },
    build(s) {
      const n = s.N, { z, land, h } = s;
      for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
        const a = j * n + i, u = i / (n - 1), v = j / (n - 1);
        const cx = (u - 0.5) * 2;
        let e = (1 - v) * 17 + 10 * cx * cx + fbm(u * 5, v * 5) * 0.45;
        const dMeadow = Math.hypot((u - 0.50) / 0.24, (v - 0.52) / 0.12);
        e -= 1.7 * gauss(dMeadow, 0.85);
        const dVill = Math.hypot((u - 0.51) / 0.18, (v - 0.80) / 0.13);
        e -= 3.1 * gauss(dVill, 0.85);
        e -= 3.4 * gauss(Math.hypot((u - 0.5) / 0.13, Math.max(0, 0.99 - v) / 0.07), 0.9);
        let lc = 0;
        if (dMeadow < 1.05) lc = 1;
        if (dVill < 1.05) {
          const gu = (u * 14) % 1, gv = (v * 14) % 1;
          const du = Math.min(gu, 1 - gu), dv2 = Math.min(gv, 1 - gv);
          if (du > 0.26 && dv2 > 0.26) { lc = 5; e += 2.6; } else lc = 4;
        }
        z[a] = e; land[a] = lc; h[a] = 0;
      }
    },
  },
  {
    id: "pluvial", group: "ready", name: "Pluvial", title: "Suburban block",
    blurb: "Almost flat and mostly sealed. Rain cannot soak away, so the streets become the drainage network and the low corners fill first.",
    defaults: { aep: 4, dur: 1, peaked: true, openB: true, stageOn: false, inflowOn: false, wExag: 6, view: "oblique" },
    build(s) {
      const n = s.N, { z, land, h } = s;
      for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
        const a = j * n + i, u = i / (n - 1), v = j / (n - 1);
        let e = (1 - v) * 0.95 + fbm(u * 6, v * 6) * 0.09;
        e -= 0.42 * gauss(Math.hypot(u - 0.30, v - 0.64), 0.075);
        e -= 0.34 * gauss(Math.hypot(u - 0.72, v - 0.33), 0.065);
        const gu = (u * 6) % 1, gv = (v * 6) % 1;
        const du = Math.min(gu, 1 - gu), dv = Math.min(gv, 1 - gv);
        let lc;
        if (du < 0.10 || dv < 0.10) { lc = 4; e -= 0.13; }
        else if (du > 0.24 && dv > 0.24) { lc = 5; e += 3.6; }
        else lc = 0;
        z[a] = e; land[a] = lc; h[a] = 0;
      }
    },
  },
  {
    id: "fluvial", group: "ready", name: "Fluvial", title: "Meandering reach",
    blurb: "A river already flowing through its own floodplain. Raise the inflow and watch which bend gives way first.",
    defaults: { aep: 0, dur: 3, peaked: true, openB: true, stageOn: true, stageLevel: 1.0, inflowOn: true, inflowQ: 45, inflowWave: true, wExag: 3, view: "oblique" },
    build(s) {
      const n = s.N, { z, land, h } = s;
      s.inflowCells = [];
      for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
        const a = j * n + i, u = i / (n - 1), v = j / (n - 1);
        const cx = 0.5 + 0.20 * Math.sin(v * Math.PI * 2.0 + 0.6);
        const dist = Math.abs(u - cx);
        const chan = 1 - sstep(0.038, 0.085, dist);
        const fpBase = 2.0 + (1 - v) * 0.6;
        const e = fpBase + fbm(u * 7, v * 7) * 0.20 - 2.2 * chan;
        z[a] = e;
        land[a] = chan > 0.6 ? 3 : dist < 0.15 ? 1 : fbm(u * 11, v * 11) > 0.3 ? 2 : 1;
        const wl = fpBase - 0.9;
        h[a] = e < wl ? wl - e : 0;
        if (j < 8 && chan > 0.45) s.inflowCells.push(a);
      }
    },
  },
  {
    id: "overtop", group: "ready", name: "Overtopping", title: "Town behind the levee",
    blurb: "A raised bank protects the town until the flood wave tops it. Watch which street the water reaches first, and how long it takes to get there.",
    defaults: { aep: 0, dur: 3, peaked: true, openB: true, stageOn: true, stageLevel: 1.0, inflowOn: true, inflowQ: 240, inflowWave: true, wExag: 3, view: "oblique" },
    build(s) {
      const n = s.N, { z, land, h } = s;
      s.inflowCells = [];
      for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
        const a = j * n + i, u = i / (n - 1), v = j / (n - 1);
        const cx = 0.60 + 0.075 * Math.sin(v * Math.PI * 1.5);
        const dist = Math.abs(u - cx);
        const chan = 1 - sstep(0.040, 0.080, dist);
        const fpBase = 2.0 + (1 - v) * 0.5;
        let e = fpBase + fbm(u * 7, v * 7) * 0.15 - 2.2 * chan;
        e += 1.0 * gauss(dist - 0.098, 0.022);
        let lc = chan > 0.6 ? 3 : Math.abs(dist - 0.098) < 0.035 ? 0 : 1;
        if (u > 0.08 && u < 0.44 && v > 0.22 && v < 0.80) {
          e -= 0.05;
          const gu = (((u - 0.08) / 0.36) * 5) % 1, gv = (((v - 0.22) / 0.58) * 5) % 1;
          const du = Math.min(gu, 1 - gu), dv = Math.min(gv, 1 - gv);
          if (du < 0.11 || dv < 0.11) { lc = 4; e -= 0.10; }
          else if (du > 0.25 && dv > 0.25) { lc = 5; e += 3.4; }
          else lc = 0;
        }
        z[a] = e; land[a] = lc;
        const wl = fpBase - 0.8;
        h[a] = e < wl ? wl - e : 0;
        if (j < 8 && chan > 0.45) s.inflowCells.push(a);
      }
    },
  },
  {
    id: "coastal", group: "ready", name: "Coastal", title: "Dune and hinterland",
    blurb: "Low ground behind a dune ridge with saddles in it. Raise the sea for a surge, add rainfall, and the two arrive together.",
    defaults: { aep: 4, dur: 3, peaked: true, openB: true, stageOn: true, stageLevel: 1.4, inflowOn: false, wExag: 3, view: "oblique" },
    build(s) {
      const n = s.N, { z, land, h } = s;
      const SEA = 1.4;
      for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
        const a = j * n + i, u = i / (n - 1), v = j / (n - 1);
        const nz = fbm(u * 6, v * 6);
        let e, lc;
        if (v > 0.80) { e = -1.1 - 3.2 * ((v - 0.80) / 0.20) + nz * 0.18; lc = 3; }
        else if (v > 0.70) { e = 1.7 - 2.8 * ((v - 0.70) / 0.10) + nz * 0.16; lc = 3; }
        else {
          const swell = Math.pow(Math.sin(u * Math.PI * 3.1 + 0.7) * 0.5 + 0.5, 1.4);
          const dune = 3.2 * (0.32 + 0.78 * swell) * gauss(v - 0.655, 0.032);
          e = 2.30 - 0.55 * sstep(0.62, 0.0, v) + dune + nz * 0.16;
          e -= 0.80 * gauss(v - 0.28, 0.018);
          lc = dune > 0.9 ? 3 : 1;
          if (u > 0.54 && u < 0.86 && v > 0.08 && v < 0.32) {
            const gu = (((u - 0.54) / 0.32) * 4) % 1, gv = (((v - 0.08) / 0.24) * 3) % 1;
            const du = Math.min(gu, 1 - gu), dv = Math.min(gv, 1 - gv);
            if (du < 0.12 || dv < 0.12) { lc = 4; e -= 0.08; }
            else if (du > 0.26 && dv > 0.26) { lc = 5; e += 3.2; }
            else lc = 0;
          }
        }
        z[a] = e; land[a] = lc;
        h[a] = v > 0.66 && e < SEA ? SEA - e : 0;
      }
    },
  },
  {
    id: "valley", group: "sandbox", name: "Valley", title: "Open valley",
    blurb: "A clean V-shaped catchment falling to the south. Good for sculpting from.",
    defaults: { aep: 4, dur: 2, openB: true, stageOn: false, inflowOn: false, wExag: 4, view: "oblique" },
    build(s) {
      const n = s.N, { z, land, h } = s;
      for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
        const a = j * n + i, x = i / (n - 1) - 0.5, y = j / (n - 1) - 0.5;
        z[a] = 14 * Math.pow(Math.abs(x) * 2, 1.7) + (0.5 - y) * 6 + fbm(x * 4, y * 4) * 0.5;
        land[a] = Math.abs(x) < 0.09 ? 3 : Math.abs(x) > 0.34 ? 2 : 0;
        h[a] = 0;
      }
    },
  },
  {
    id: "bowl", group: "sandbox", name: "Basin", title: "Closed basin",
    blurb: "Nothing leaves except by soaking in. The clearest way to see infiltration doing its work.",
    defaults: { aep: 4, dur: 2, openB: false, stageOn: false, inflowOn: false, wExag: 4, view: "oblique" },
    build(s) {
      const n = s.N, { z, land, h } = s;
      for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
        const a = j * n + i, x = i / (n - 1) - 0.5, y = j / (n - 1) - 0.5;
        z[a] = 22 * (x * x + y * y) + fbm(x * 4, y * 4) * 0.4;
        land[a] = x * x + y * y < 0.03 ? 3 : 1;
        h[a] = 0;
      }
    },
  },
  {
    id: "hill", group: "sandbox", name: "Hillslope", title: "Uniform hillslope",
    blurb: "One constant gradient, one surface type. The textbook case for testing what roughness alone does.",
    defaults: { aep: 2, dur: 3, openB: true, stageOn: false, inflowOn: false, wExag: 6, view: "oblique" },
    build(s) {
      const n = s.N, { z, land, h } = s;
      for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
        const a = j * n + i, x = i / (n - 1) - 0.5, y = j / (n - 1) - 0.5;
        z[a] = (0.5 - y) * 14 + fbm(x * 4, y * 4) * 0.6;
        land[a] = y > 0.2 ? 1 : 0;
        h[a] = 0;
      }
    },
  },
  {
    id: "flat", group: "sandbox", name: "Flat plain", title: "Blank plain",
    blurb: "Near level ground and nothing else. Start here if you want to sculpt your own catchment.",
    defaults: { aep: 4, dur: 1, openB: true, stageOn: false, inflowOn: false, wExag: 8, view: "oblique" },
    build(s) {
      const n = s.N, { z, land, h } = s;
      for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
        const a = j * n + i, x = i / (n - 1) - 0.5, y = j / (n - 1) - 0.5;
        z[a] = fbm(x * 4, y * 4) * 0.25;
        land[a] = 0; h[a] = 0;
      }
    },
  },
];

export function loadScene(sim, id) {
  const sc = SCENES.find((s) => s.id === id) || SCENES[0];
  sim.inflowCells = [];
  sim.reset();
  sc.build(sim);
  sim.syncLand();
  sim.h0.set(sim.h);
  let v0 = 0;
  for (let a = 0; a < sim.N * sim.N; a++) v0 += sim.h[a];
  sim.vol0 = v0 * sim.dx * sim.dx;
  sim.stats();
  return sc;
}
