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
          /* long, narrow terraces rather than square huts: a coarser period
             along the street and a finer one across it, with asymmetric
             footprint fractions so each block reads as a rectangle */
          const gu = (u * 14) % 1, gv = (v * 14) % 1;
          const du = Math.min(gu, 1 - gu), dv2 = Math.min(gv, 1 - gv);
          if (du > 0.20 && dv2 > 0.32) { lc = 5; e += 6.0; } else lc = 4;
        }
        z[a] = e; land[a] = lc; h[a] = 0;
      }
    },
  },
  {
    id: "mountain", group: "ready", name: "Mountains", title: "Sub-catchments to a basin",
    blurb: "A jagged alpine range: five knife-edge ridges split the ground into sub-catchments that plunge toward a collecting basin. Build a dam across the outlet, or drive a tunnel through a ridge to run water from one valley to the next.",
    defaults: { aep: 4, dur: 2, peaked: true, openB: true, outletOnly: true, stageOn: false, inflowOn: false, wExag: 3, view: "oblique" },
    build(s) {
      const n = s.N, { z, land, h } = s;
      for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
        const a = j * n + i, u = i / (n - 1), v = j / (n - 1);
        /* overall fall to the south, from a high alpine head down to the basin */
        let e = (1 - v) * 16;
        /* warp the ridge coordinate so the five crests wander like a real
           range instead of sitting on perfectly straight, evenly spaced
           lines; the channel network below still uses the true u so the
           drainage pattern stays clean */
        const warp = fbm(u * 3.2 + 4.1, v * 3.2 - 1.7) * 0.045 + fbm(u * 7.5, v * 7.5) * 0.015;
        const uw = u + warp;
        /* five finger ridges running north-south: the sub-catchment walls.
           A steep exponent carves narrow, knife-edge summits with wide low
           cols between them, and a slow second sine varies each summit's
           height so the skyline reads as jagged peaks rather than a single
           repeating wall. */
        const ridgeShape = Math.pow(Math.abs(Math.sin(uw * Math.PI * 5 + 0.25)), 4.5);
        const summits = 0.5 + 0.5 * Math.sin(uw * Math.PI * 1.7 + 0.8) * Math.sin(uw * Math.PI * 0.6 - 0.4);
        /* a slow along-ridge undulation so no two summits along the same
           crest sit at quite the same height */
        const crestJitter = 0.75 + 0.25 * Math.sin(v * Math.PI * 5.3 + uw * 11.0);
        const ridge = 95 * Math.pow(1 - v, 0.42) * ridgeShape * summits * crestJitter;
        e += ridge;
        /* fine rock texture riding the upper ridges, breaking summits into
           cols, spurs, gullies and crags at three scales so no slope reads
           as a smooth, unbroken face */
        e += fbm(u * 12, v * 12) * 7.0 * sstep(8, 40, ridge);
        e += fbm(u * 28, v * 28) * 3.2 * sstep(10, 45, ridge);
        e += fbm(u * 60, v * 60) * 1.3 * sstep(20, 55, ridge);
        /* a meandering stem channel that gathers every valley toward the basin,
           carved noticeably deeper than before into a real gorge. Ridges
           and rock texture are added above, so a fixed-depth cut can leave
           a sill wherever the wandering channel crosses a tall ridge line —
           blending the invert onto a ridge-free monotonic floor instead of
           subtracting a fixed depth guarantees the bed always keeps falling,
           however tall the terrain either side of it happens to be. */
        const fall = (1 - v) * 16;
        const stem = 0.5 + 0.13 * Math.sin(v * Math.PI * 2.1 + 0.5);
        const ds = Math.abs(u - stem);
        /* the invert weight is a flat-bottomed trapezoid, not a narrow gaussian
           peak: a genuinely smooth, several-cell-wide bed sits fully on the
           monotonic floor (weight 1), with the ridge/rock texture only
           reappearing on the valley walls beyond it. A pure gaussian peaks
           at weight 1 for a single centre cell and lets the noisy terrain
           bleed back in a cell or two either side, leaving a bed of tiny
           grid-scale potholes that trap water into a chain of isolated
           puddles instead of a smoothly flowing streambed. */
        const stemFloor = fall - (16.0 + 11.0 * v);
        e += (stemFloor - e) * (1 - sstep(0.03, 0.09, ds));
        /* two tributaries riding separate valleys down into the stem */
        const trib1 = 0.15 + 0.13 * (1 - v);
        const trib1Floor = fall - 10.0 * (1 - v);
        e += (trib1Floor - e) * (1 - sstep(0.016, 0.045, Math.abs(u - trib1)));
        const trib2 = 0.82 - 0.10 * (1 - v);
        const trib2Floor = fall - 8.0 * (1 - v);
        e += (trib2Floor - e) * (1 - sstep(0.015, 0.042, Math.abs(u - trib2)));
        /* the collecting basin just upstream of the south edge, where a dam
           across the ridge will hold a reservoir back */
        e -= 6.0 * gauss(Math.hypot((u - 0.5) / 0.30, (v - 0.88) / 0.10), 0.95);
        e += fbm(u * 6, v * 6) * 0.8;

        let lc;
        if (e > 60) lc = 3;                     /* bare rock and scree above the treeline */
        else if (ridge > 22) lc = 2;             /* dense scrub on the spurs */
        else if (ridge > 6) lc = 1;              /* grazed slopes */
        else if (ds < 0.06) lc = 3;              /* worn channel bed */
        else lc = 0;                             /* valley floor meadow */

        z[a] = e; land[a] = lc;
        /* the river already threads the full length of the stem, from the
           head of the valley down to the basin, so there is a continuous
           line of water to see rather than one that starts only halfway down */
        h[a] = (ds < 0.035) ? 0.5 : 0;
      }
    },
  },
  {
    id: "confluence", group: "ready", name: "Confluence", title: "Two catchments, one junction",
    blurb: "A west and an east tributary drain their own ground and meet at a single junction before the combined flow leaves south. Run the same storm over both and watch whether the peaks arrive together or miss each other, and how much higher the water sits just below the junction than in either arm above it.",
    defaults: { aep: 4, dur: 2, peaked: true, openB: true, outletOnly: true, stageOn: false, inflowOn: false, wExag: 4, view: "oblique" },
    build(s) {
      const n = s.N, { z, land, h } = s;
      const MERGE = 0.55;
      for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
        const a = j * n + i, u = i / (n - 1), v = j / (n - 1);
        let e = (1 - v) * 18 + fbm(u * 5, v * 5) * 0.5;
        /* the drainage divide between the two upper catchments: a broad
           spur that fades out as the valleys close in on the junction */
        const divide = Math.max(0, 1 - v / MERGE);
        e += 7.0 * divide * gauss((u - 0.5) / 0.16, 1.0);
        let ds, lc;
        if (v < MERGE) {
          /* two separate valleys, each carrying its own tributary in from
             the north edge and swinging toward the junction */
          const t = v / MERGE;
          const chW = 0.20 + 0.30 * t;
          const chE = 0.80 - 0.30 * t;
          const dsW = Math.abs(u - chW), dsE = Math.abs(u - chE);
          ds = Math.min(dsW, dsE);
          e -= 5.5 * gauss(dsW, 0.045) + 5.5 * gauss(dsE, 0.045);
          lc = ds < 0.05 ? 3 : divide > 0.35 && Math.abs(u - 0.5) < 0.18 ? 2 : 1;
        } else {
          /* the combined stem, now carrying both arms toward the outlet */
          const t = (v - MERGE) / (1 - MERGE);
          const chM = 0.5 + 0.05 * Math.sin(t * Math.PI * 2.2 + 0.3);
          ds = Math.abs(u - chM);
          e -= (7.0 + 5.0 * t) * gauss(ds, 0.05);
          lc = ds < 0.06 ? 3 : 0;
        }
        z[a] = e; land[a] = lc;
        /* both arms carry a steady baseflow all the way from their source
           down to the junction, so the confluence reads as two real rivers
           meeting rather than one arm appearing only near the join */
        h[a] = (ds < 0.035) ? 0.4 : 0;
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
        const gu = (u * 8) % 1, gv = (v * 5) % 1;
        const du = Math.min(gu, 1 - gu), dv = Math.min(gv, 1 - gv);
        let lc;
        if (du < 0.10 || dv < 0.10) { lc = 4; e -= 0.13; }
        else if (du > 0.18 && dv > 0.30) { lc = 5; e += 13.0; }
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
          const gu = (((u - 0.08) / 0.36) * 4) % 1, gv = (((v - 0.22) / 0.58) * 7) % 1;
          const du = Math.min(gu, 1 - gu), dv = Math.min(gv, 1 - gv);
          if (du < 0.11 || dv < 0.11) { lc = 4; e -= 0.10; }
          else if (du > 0.20 && dv > 0.32) { lc = 5; e += 13.0; }
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
    id: "culvert", group: "ready", name: "Culvert crossing", title: "A road embankment across the valley",
    blurb: "A meandering reach is crossed by a raised road that carries the water through one narrow bridge opening. Watch the level build up on the upstream side as the flood wave tries to squeeze through the gap, and see how much afflux it takes before the road itself goes under.",
    defaults: { aep: 0, dur: 3, peaked: true, openB: true, stageOn: true, stageLevel: 1.0, inflowOn: true, inflowQ: 60, inflowWave: true, wExag: 3, view: "oblique" },
    build(s) {
      const n = s.N, { z, land, h } = s;
      s.inflowCells = [];
      const XING = 0.56;
      const gapU = 0.5 + 0.14 * Math.sin(XING * Math.PI * 1.6 + 0.4);
      for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
        const a = j * n + i, u = i / (n - 1), v = j / (n - 1);
        const cx = 0.5 + 0.14 * Math.sin(v * Math.PI * 1.6 + 0.4);
        const dist = Math.abs(u - cx);
        const chan = 1 - sstep(0.036, 0.078, dist);
        const fpBase = 2.6 + (1 - v) * 0.5;
        let e = fpBase + fbm(u * 7, v * 7) * 0.18 - 2.0 * chan;
        /* the embanked crossing: a solid causeway across the floodplain,
           open only where a narrow bridge spans the channel itself */
        const atXing = gauss(v - XING, 0.018);
        const gapOpen = sstep(0.045, 0.085, Math.abs(u - gapU));
        e += 3.2 * atXing * gapOpen;
        let lc = chan > 0.6 ? 3 : atXing > 0.5 && gapOpen > 0.5 ? 4 : 1;
        z[a] = e; land[a] = lc;
        const wl = fpBase - 0.6;
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
            const gu = (((u - 0.54) / 0.32) * 3) % 1, gv = (((v - 0.08) / 0.24) * 5) % 1;
            const du = Math.min(gu, 1 - gu), dv = Math.min(gv, 1 - gv);
            if (du < 0.12 || dv < 0.12) { lc = 4; e -= 0.08; }
            else if (du > 0.20 && dv > 0.32) { lc = 5; e += 12.0; }
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
