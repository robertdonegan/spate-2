import React, { useRef, useEffect, useState, useCallback } from "react";
import * as THREE from "three";

import { T, MONO, SANS } from "./ui/tokens.js";
import { Eyebrow, Panel, Seg, Slider, Stat, NavBtn, btn, toggleBtn } from "./ui/atoms.jsx";
import { f0, f1, f2, clock } from "./ui/format.js";
import { SPEEDS, TOOLS, MODES, VIEWS } from "./ui/constants.js";

import { LAND } from "./lib/landcover.js";
import { AEPS, DURATIONS, PEAK_NORM, stormDepthMm, profileFactor } from "./lib/rainfall.js";
import { Sim, G } from "./lib/solver.js";
import { N, SIZE, RAIN_H, buildGrid, buildSkirt } from "./lib/grid.js";
import { smoothField, fieldNormals, sampleFlow, sampleGround } from "./lib/fields.js";
import { niceStep, mulberry32 } from "./lib/math.js";
import { computeAO } from "./lib/occlusion.js";
import { SCENES, loadScene } from "./lib/scenes.js";
import { Floats, Streaks, FLOAT_MAX } from "./lib/particles.js";
import { buildVegGeometry } from "./lib/vegetation.js";
import {
  SEC_NODES, MAX_UNITS, newProfile, sampleSection, assumedProfile,
  buildBridgeGeometry, applyPiers, removePiers, bridgeHydraulics,
} from "./lib/units1d.js";
import {
  SKY_VS, SKY_FS, TERRAIN_VS, TERRAIN_FS, SKIRT_VS, SKIRT_FS,
  POST_VS, POST_FS, WATER_VS, WATER_FS, RAIN_VS, RAIN_FS,
  VEG_VS, VEG_FS, STREAK_VS, STREAK_FS, FLOAT_VS, FLOAT_FS,
} from "./render/shaders.js";
import { PROV_STATUS, PROVENANCE } from "./data/provenance.js";
import { LESSONS, ZONE_A, ZONE_B } from "./data/lessons.js";

export default function SandboxHydraulics() {
  const mount = useRef(null);
  const [glErr, setGlErr] = useState(null);
  const chartRef = useRef(null);
  const simRef = useRef(null);
  const three = useRef({});
  const cfgRef = useRef(null);
  const navRef = useRef({});
  const rsRef = useRef(null);
  const samples = useRef({ list: [], every: 20, next: 0 });
  const labelRefs = useRef({});
  const floatsRef = useRef(null);
  const unitsRef = useRef({ list: [], prof: {}, seq: 0, dirty: false });
  const unitApi = useRef({});
  const historyApi = useRef({});
  const syncUnitsRef = useRef(() => {});
  const syncTunnelsRef = useRef(() => {});
  const dropRef = useRef(null);
  const seedRef = useRef(null);
  const clearRef = useRef(null);
  const viewportRef = useRef(null);
  const historyRef = useRef({ undo: [], redo: [] });
  const [histInfo, setHistInfo] = useState({ canUndo: false, canRedo: false });

  const reduced = typeof window !== "undefined" &&
    window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const [cfg, setCfg] = useState({
    playing: false, speed: 60, tool: "orbit", brush: 16, strength: 0.55, landIdx: 4,
    mode: 0, aep: 4, dur: 2, cc: 0, peaked: true, infScale: 1, roughScale: 1,
    openB: true, contours: true, wExag: 4, showRain: !reduced, scene: "mountain",
    smooth: 2, levels: true, veg: true, flowLines: false, vScale: 1.6, outletOnly: false,
    units: true, secSpan: 8, secSoffit: 4, secPiers: 1, tunDiam: 6,
    floatShape: "duck", floatSize: 4.2, stampZ: 2, capOn: false,
    stageOn: false, stageLevel: 1.4, inflowOn: false, inflowQ: 90, inflowWave: true,
    tilt: 0.2, tiltFocus: 0.56, tiltBand: 0.34,
  });
  const [ro, setRo] = useState({
    t: 0, rain: 0, storage: 0, inf: 0, out: 0, outQ: 0, maxD: 0, maxV: 0,
    wet: 0, err: 0, achieved: 0, volRain: 0, volAdd: 0, heading: 0,
  });
  const [lev, setLev] = useState({ ground: 0, stage: 0, max: 0, d: 0, dmax: 0 });
  const [narrow, setNarrow] = useState(() => typeof window !== "undefined" && window.innerWidth < 940);
  const [openRail, setOpenRail] = useState(null);
  const [showHelp, setShowHelp] = useState(false);
  const [showProv, setShowProv] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const [units, setUnits] = useState([]);
  const [selUnit, setSelUnit] = useState(null);
  const [unitRead, setUnitRead] = useState(null);
  const secCanvas = useRef(null);
  const [dropMsg, setDropMsg] = useState("");
  const [lsn, setLsn] = useState({ on: false, idx: 0, phase: "baseline", base: null, passed: false, value: 0, target: 0, prog: 0, sub: "" });
  const lsnRef = useRef({ on: false, idx: 0, phase: "baseline", base: null, passed: false });
  const trackRef = useRef({ peakQ: 0, tPeak: 0, hazBest: 0, zoneA: 0, zoneB: 0, floatDepth: 0 });

  useEffect(() => { cfgRef.current = cfg; }, [cfg]);
  useEffect(() => { lsnRef.current = { on: lsn.on, idx: lsn.idx, phase: lsn.phase, base: lsn.base, passed: lsn.passed }; }, [lsn]);
  const set = useCallback((patch) => setCfg((c) => ({ ...c, ...patch })), []);

  const storm = { depth: stormDepthMm(cfg.aep, DURATIONS[cfg.dur], cfg.cc), dur: DURATIONS[cfg.dur] };
  storm.mean = storm.depth / storm.dur;
  storm.peak = storm.mean * (cfg.peaked ? PEAK_NORM : 1);
  const durLabel = storm.dur < 1 ? `${storm.dur * 60} min` : `${storm.dur} h`;
  const activeScene = SCENES.find((s) => s.id === cfg.scene) || SCENES[0];

  const resetStorm = useCallback(() => {
    const s = simRef.current;
    if (!s) return;
    s.reset();
    s.stats();
    samples.current = { list: [], every: 20, next: 0 };
    trackRef.current = { peakQ: 0, tPeak: 0, hazBest: 0, zoneA: 0, zoneB: 0, floatDepth: 0 };
    setCfg((c) => ({ ...c, playing: false }));
    drawChart();
  }, []);

  const applyScene = useCallback((id) => {
    const s = simRef.current;
    if (!s) return;
    const sc = loadScene(s, id);
    computeAO(s);
    rsRef.current = null;
    refreshTerrainGeometry();
    refreshTerrainStatic();
    if (three.current.rebuildVeg) three.current.rebuildVeg(700);
    samples.current = { list: [], every: 20, next: 0 };
    clearHistory();
    setCfg((c) => ({ ...c, scene: id, playing: false, ...sc.defaults }));
    if (three.current.setView) three.current.setView(sc.defaults.view || "oblique");
    drawChart();
  }, []);

  /* ------------------------------------------------------------- three */
  useEffect(() => {
    const sim = new Sim(N, SIZE);
    loadScene(sim, "mountain");
    computeAO(sim);
    simRef.current = sim;

    const el = mount.current;
    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    } catch (err) {
      setGlErr((err && err.message) ? err.message : String(err));
      return;
    }
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    renderer.setPixelRatio(dpr);
    renderer.setClearColor(new THREE.Color(T.chassis));
    el.appendChild(renderer.domElement);
    renderer.domElement.style.display = "block";
    renderer.domElement.style.touchAction = "none";
    /* setSize(..., false) leaves CSS size alone, so the buffer's dpr-scaled pixel
       dimensions would otherwise lay the element out at dpr x the container and
       spill over the right rail. Pin it to the mount instead. */
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";

    const scene = new THREE.Scene();
    const cam = new THREE.PerspectiveCamera(42, 1, 0.5, 5000);
    const SUN = new THREE.Vector3(0.48, 0.62, 0.34).normalize();

    const cc = {
      theta: -Math.PI * 0.5, phi: 0.72, dist: 330,
      tTheta: -Math.PI * 0.5, tPhi: 0.72, tDist: 330,
      tx: 0, ty: 3, tz: 0, dx: 0, dy: 3, dz: 0,
    };
    const clampCam = () => {
      cc.tPhi = Math.max(0.02, Math.min(1.5, cc.tPhi));
      cc.tDist = Math.max(35, Math.min(900, cc.tDist));
      const lim = SIZE * 0.85;
      cc.dx = Math.max(-lim, Math.min(lim, cc.dx));
      cc.dz = Math.max(-lim, Math.min(lim, cc.dz));
    };
    const stepCam = (k) => {
      cc.theta += (cc.tTheta - cc.theta) * k;
      cc.phi += (cc.tPhi - cc.phi) * k;
      cc.dist += (cc.tDist - cc.dist) * k;
      cc.tx += (cc.dx - cc.tx) * k;
      cc.ty += (cc.dy - cc.ty) * k;
      cc.tz += (cc.dz - cc.tz) * k;
      const sp = Math.sin(cc.phi), cp = Math.cos(cc.phi);
      cam.position.set(
        cc.tx + cc.dist * sp * Math.cos(cc.theta),
        cc.ty + cc.dist * cp,
        cc.tz + cc.dist * sp * Math.sin(cc.theta)
      );
      cam.lookAt(cc.tx, cc.ty, cc.tz);
    };
    const setView = (id) => {
      const v = VIEWS.find((x) => x.id === id) || VIEWS[1];
      cc.tPhi = v.phi; cc.tDist = v.dist;
    };
    const resetView = () => {
      cc.tTheta = -Math.PI * 0.5; cc.tPhi = 0.72; cc.tDist = 330;
      cc.dx = 0; cc.dy = 3; cc.dz = 0;
    };

    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(2200, 32, 20),
      new THREE.ShaderMaterial({
        vertexShader: SKY_VS, fragmentShader: SKY_FS, side: THREE.BackSide, depthWrite: false,
        uniforms: {
          uTop: { value: new THREE.Color(0.055, 0.115, 0.185) },
          uHorizon: { value: new THREE.Color(0.175, 0.215, 0.225) },
          uBottom: { value: new THREE.Color(0.035, 0.052, 0.062) },
          uSunDir: { value: SUN.clone() },
          uStorm: { value: 0 },
        },
      })
    );
    sky.frustumCulled = false;
    scene.add(sky);

    const tGeo = buildGrid(N, SIZE);
    tGeo.setAttribute("aCol", new THREE.BufferAttribute(new Float32Array(N * N * 3), 3));
    tGeo.setAttribute("aAO", new THREE.BufferAttribute(new Float32Array(N * N).fill(1), 1));
    tGeo.setAttribute("aWet", new THREE.BufferAttribute(new Float32Array(N * N), 1));
    tGeo.setAttribute("aNrm", new THREE.BufferAttribute(new Float32Array(N * N * 3), 3));
    const tMat = new THREE.ShaderMaterial({
      vertexShader: TERRAIN_VS, fragmentShader: TERRAIN_FS,
      extensions: { derivatives: true },
      uniforms: {
        uSunDir: { value: SUN.clone() },
        uSunCol: { value: new THREE.Color(1.02, 0.90, 0.74) },
        uSkyCol: { value: new THREE.Color(0.30, 0.40, 0.50) },
        uGroundCol: { value: new THREE.Color(0.16, 0.15, 0.13) },
        uCam: { value: new THREE.Vector3() },
        uContour: { value: 1.0 },
        uContourOn: { value: 1.0 },
        uStorm: { value: 0 },
      },
    });
    const terrain = new THREE.Mesh(tGeo, tMat);
    scene.add(terrain);

    const BASE_Y = -26;
    const skGeo = buildSkirt(N, SIZE, BASE_Y);
    const skMat = new THREE.ShaderMaterial({
      vertexShader: SKIRT_VS, fragmentShader: SKIRT_FS,
      side: THREE.DoubleSide, extensions: { derivatives: true },
      uniforms: {
        uSunDir: { value: SUN.clone() },
        uSunCol: { value: new THREE.Color(1.02, 0.90, 0.74) },
        uBase: { value: BASE_Y }, uSpan: { value: 30 },
      },
    });
    const skirt = new THREE.Mesh(skGeo, skMat);
    scene.add(skirt);

    const rt = new THREE.WebGLRenderTarget(2, 2, {
      minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, format: THREE.RGBAFormat,
    });
    const wGeo = buildGrid(N, SIZE);
    wGeo.setAttribute("aDepth", new THREE.BufferAttribute(new Float32Array(N * N), 1));
    wGeo.setAttribute("aVel", new THREE.BufferAttribute(new Float32Array(N * N), 1));
    wGeo.setAttribute("aNrm", new THREE.BufferAttribute(new Float32Array(N * N * 3), 3));
    const wMat = new THREE.ShaderMaterial({
      vertexShader: WATER_VS, fragmentShader: WATER_FS,
      transparent: true, depthWrite: false, extensions: { derivatives: true },
      polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
      uniforms: {
        uScene: { value: rt.texture },
        uRes: { value: new THREE.Vector2(2, 2) },
        uSunDir: { value: SUN.clone() },
        uSunCol: { value: new THREE.Color(1.02, 0.90, 0.74) },
        uSkyCol: { value: new THREE.Color(0.34, 0.46, 0.56) },
        uCam: { value: new THREE.Vector3() },
        uExt: { value: new THREE.Vector3(2.2, 0.75, 0.42) },
        uTint: { value: new THREE.Color(0.055, 0.30, 0.36) },
        uTime: { value: 0 }, uRain: { value: 0 },
        uDScale: { value: 0.8 }, uVScale: { value: 2.0 },
        uStorm: { value: 0 }, uMode: { value: 0 },
      },
    });
    const water = new THREE.Mesh(wGeo, wMat);
    water.renderOrder = 2;
    scene.add(water);

    const RAIN_N = 7000;
    const rGeo = new THREE.BufferGeometry();
    {
      const pos = new Float32Array(RAIN_N * 4 * 3);
      const cor = new Float32Array(RAIN_N * 4 * 2);
      const rnd = new Float32Array(RAIN_N * 4);
      const ridx = new Uint32Array(RAIN_N * 6);
      for (let d = 0; d < RAIN_N; d++) {
        const sx = (Math.random() - 0.5) * SIZE * 1.3;
        const sy = Math.random() * RAIN_H;
        const sz = (Math.random() - 0.5) * SIZE * 1.3;
        const rr = Math.random();
        for (let k = 0; k < 4; k++) {
          const v = d * 4 + k;
          pos[v * 3] = sx; pos[v * 3 + 1] = sy; pos[v * 3 + 2] = sz;
          cor[v * 2] = k === 0 || k === 3 ? -1 : 1;
          cor[v * 2 + 1] = k < 2 ? 1 : -1;
          rnd[v] = rr;
        }
        const b = d * 4;
        ridx[d * 6] = b; ridx[d * 6 + 1] = b + 1; ridx[d * 6 + 2] = b + 2;
        ridx[d * 6 + 3] = b; ridx[d * 6 + 4] = b + 2; ridx[d * 6 + 5] = b + 3;
      }
      rGeo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      rGeo.setAttribute("aCorner", new THREE.BufferAttribute(cor, 2));
      rGeo.setAttribute("aRnd", new THREE.BufferAttribute(rnd, 1));
      rGeo.setIndex(new THREE.BufferAttribute(ridx, 1));
    }
    const rMat = new THREE.ShaderMaterial({
      vertexShader: RAIN_VS, fragmentShader: RAIN_FS,
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
      uniforms: {
        uTime: { value: 0 }, uH: { value: RAIN_H }, uFrac: { value: 0 },
        uLen: { value: 1.5 }, uWid: { value: 0.055 },
        uRight: { value: new THREE.Vector3(1, 0, 0) },
        uCol: { value: new THREE.Color(0.80, 0.88, 0.94) },
        uOpacity: { value: 0.42 },
      },
    });
    const rain = new THREE.Mesh(rGeo, rMat);
    rain.frustumCulled = false;
    rain.renderOrder = 4;
    scene.add(rain);

    const outlineGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-SIZE / 2, 0, -SIZE / 2), new THREE.Vector3(SIZE / 2, 0, -SIZE / 2),
      new THREE.Vector3(SIZE / 2, 0, SIZE / 2), new THREE.Vector3(-SIZE / 2, 0, SIZE / 2),
      new THREE.Vector3(-SIZE / 2, 0, -SIZE / 2),
    ]);
    const outline = new THREE.Line(outlineGeo, new THREE.LineBasicMaterial({ color: new THREE.Color(T.rule) }));
    outline.position.y = -0.2;
    scene.add(outline);

    const ringGeo = new THREE.RingGeometry(0.93, 1.0, 72);
    ringGeo.rotateX(-Math.PI / 2);
    const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({
      color: new THREE.Color(T.signal), transparent: true, opacity: 0.9, depthTest: false,
    }));
    ring.visible = false;
    ring.renderOrder = 6;
    scene.add(ring);

    /* ---- 1D units: section markers and bridge structures ------------- */
    const structMat = new THREE.ShaderMaterial({
      vertexShader: VEG_VS, fragmentShader: VEG_FS,
      uniforms: {
        uSunDir: { value: SUN.clone() },
        uSunCol: { value: new THREE.Color(1.02, 0.90, 0.74) },
        uSkyCol: { value: new THREE.Color(0.30, 0.40, 0.50) },
        uGroundCol: { value: new THREE.Color(0.16, 0.15, 0.13) },
        uStorm: { value: 0 }, uTime: { value: 0 },
      },
    });
    let bridges = new THREE.Mesh(new THREE.BufferGeometry(), structMat);
    bridges.frustumCulled = false;
    scene.add(bridges);

    const SEC_VERTS = MAX_UNITS * (SEC_NODES * 2 + 40);
    const secGeo = new THREE.BufferGeometry();
    secGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(SEC_VERTS * 3), 3));
    secGeo.setAttribute("aCol", new THREE.BufferAttribute(new Float32Array(SEC_VERTS * 3), 3));
    const secMat = new THREE.ShaderMaterial({
      vertexShader: "attribute vec3 aCol; varying vec3 vC; void main(){ vC = aCol; gl_Position = projectionMatrix * viewMatrix * vec4(position,1.0); }",
      fragmentShader: "precision highp float; varying vec3 vC; void main(){ gl_FragColor = vec4(vC, 1.0); }",
      transparent: true, depthTest: false, depthWrite: false,
    });
    const secLines = new THREE.LineSegments(secGeo, secMat);
    secLines.frustumCulled = false;
    secLines.renderOrder = 7;
    scene.add(secLines);

    const COL_RIVER = [0.42, 0.86, 0.94], COL_INTERP = [0.82, 0.68, 0.24], COL_BR = [0.95, 0.60, 0.26],
          COL_TUN = [0.85, 0.45, 0.90];
    function writeSectionLines(sim, units, profiles) {
      const pos = secGeo.attributes.position.array;
      const col = secGeo.attributes.aCol.array;
      let v = 0;
      const put = (x1, y1, z1, x2, y2, z2, c) => {
        if (v + 2 > SEC_VERTS) return;
        pos[v * 3] = x1; pos[v * 3 + 1] = y1; pos[v * 3 + 2] = z1;
        col[v * 3] = c[0]; col[v * 3 + 1] = c[1]; col[v * 3 + 2] = c[2]; v++;
        pos[v * 3] = x2; pos[v * 3 + 1] = y2; pos[v * 3 + 2] = z2;
        col[v * 3] = c[0]; col[v * 3 + 1] = c[1]; col[v * 3 + 2] = c[2]; v++;
      };
      for (let ui = 0; ui < units.length; ui++) {
        const u = units[ui];
        const pr = profiles[u.id];
        if (!pr) continue;
        const c = u.kind === "bridge" ? COL_BR : u.kind === "interp" ? COL_INTERP : u.kind === "tunnel" ? COL_TUN : COL_RIVER;
        const dx = u.x2 - u.x1, dz = u.z2 - u.z1;
        const step = u.kind === "interp" ? 2 : 1;
        for (let k = 0; k < SEC_NODES - step; k += step) {
          if (u.kind === "interp" && (k / step) % 2 === 1) continue;
          const t0 = k / (SEC_NODES - 1), t1 = (k + step) / (SEC_NODES - 1);
          put(u.x1 + dx * t0, pr.zb[k] + 0.10, u.z1 + dz * t0,
              u.x1 + dx * t1, pr.zb[k + step] + 0.10, u.z1 + dz * t1, c);
        }
        if (u.kind === "tunnel") {
          /* draw the portal rings so the two ends read clearly */
          const rr = (u.diam || 6) / 2;
          for (let k = 0; k < 12; k++) {
            const a0 = (k / 12) * Math.PI * 2, a1 = ((k + 1) / 12) * Math.PI * 2;
            put(u.x1 + Math.cos(a0) * rr, pr.zb[0] + 0.10, u.z1 + Math.sin(a0) * rr,
                u.x1 + Math.cos(a1) * rr, pr.zb[0] + 0.10, u.z1 + Math.sin(a1) * rr, c);
            put(u.x2 + Math.cos(a0) * rr, pr.zb[SEC_NODES - 1] + 0.10, u.z2 + Math.sin(a0) * rr,
                u.x2 + Math.cos(a1) * rr, pr.zb[SEC_NODES - 1] + 0.10, u.z2 + Math.sin(a1) * rr, c);
          }
          continue;
        }
        for (let k = 0; k < SEC_NODES; k += 8) {
          const t = k / (SEC_NODES - 1);
          put(u.x1 + dx * t, pr.zb[k] + 0.10, u.z1 + dz * t,
              u.x1 + dx * t, pr.zb[k] + 1.05, u.z1 + dz * t, c);
        }
        if (isFinite(pr.ws) && pr.wet > 0.02) {
          put(u.x1, pr.ws, u.z1, u.x2, pr.ws, u.z2, [0.62, 0.95, 1.0]);
        }
      }
      secGeo.setDrawRange(0, v);
      secGeo.attributes.position.needsUpdate = true;
      secGeo.attributes.aCol.needsUpdate = true;
    }

    /* ---- vegetation, flow lines and floats ---------------------------- */
    const vegMat = new THREE.ShaderMaterial({
      vertexShader: VEG_VS, fragmentShader: VEG_FS,
      uniforms: {
        uSunDir: { value: SUN.clone() },
        uSunCol: { value: new THREE.Color(1.02, 0.90, 0.74) },
        uSkyCol: { value: new THREE.Color(0.30, 0.40, 0.50) },
        uGroundCol: { value: new THREE.Color(0.16, 0.15, 0.13) },
        uStorm: { value: 0 }, uTime: { value: 0 },
      },
    });
    let veg = new THREE.Mesh(new THREE.BufferGeometry(), vegMat);
    veg.frustumCulled = false;
    scene.add(veg);
    const rebuildVeg = (count) => {
      const g = buildVegGeometry(simRef.current, count, 4242);
      veg.geometry.dispose();
      veg.geometry = g;
    };

    const STREAK_N = 380, STREAK_T = 10;
    const streaks = new Streaks(STREAK_N, STREAK_T);
    const stVerts = STREAK_N * (STREAK_T - 1) * 2;
    const stGeo = new THREE.BufferGeometry();
    stGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(stVerts * 3), 3));
    stGeo.setAttribute("aAlpha", new THREE.BufferAttribute(new Float32Array(stVerts), 1));
    stGeo.setAttribute("aSpd", new THREE.BufferAttribute(new Float32Array(stVerts), 1));
    const stMat = new THREE.ShaderMaterial({
      vertexShader: STREAK_VS, fragmentShader: STREAK_FS,
      transparent: true, depthWrite: false,
      uniforms: {
        uR0: { value: new THREE.Color(0.16, 0.44, 0.54) },
        uR1: { value: new THREE.Color(0.35, 0.80, 0.88) },
        uR2: { value: new THREE.Color(0.94, 0.62, 0.24) },
        uR3: { value: new THREE.Color(0.99, 0.95, 0.80) },
        uVScale: { value: 1.6 }, uOpacity: { value: 0.9 },
      },
    });
    const streakLines = new THREE.LineSegments(stGeo, stMat);
    streakLines.frustumCulled = false;
    streakLines.renderOrder = 3;
    scene.add(streakLines);

    const floats = new Floats();
    floatsRef.current = floats;
    const flGeo = new THREE.BufferGeometry();
    flGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(FLOAT_MAX * 3), 3));
    flGeo.setAttribute("aTint", new THREE.BufferAttribute(new Float32Array(FLOAT_MAX * 3), 3));
    flGeo.setAttribute("aStuck", new THREE.BufferAttribute(new Float32Array(FLOAT_MAX), 1));
    const flMat = new THREE.ShaderMaterial({
      vertexShader: FLOAT_VS, fragmentShader: FLOAT_FS,
      transparent: true, depthWrite: false,
      uniforms: { uSize: { value: 4.2 }, uProj: { value: 400 }, uShape: { value: 1 } },
    });
    const floatPts = new THREE.Points(flGeo, flMat);
    floatPts.frustumCulled = false;
    floatPts.renderOrder = 5;
    scene.add(floatPts);

    /* ---- blueprint level gauge ------------------------------------------
       A section staff at the near edge with three datum lines: ground,
       current water surface, and the highest surface reached. Lines are
       drawn at TRUE elevations, so when vertical exaggeration is on the
       drawn water sits above the stage line — annotated, as on a section. */
    /* The gauge sits on whichever domain edge is currently facing the
       camera, so the datum lines always land on a visible side face rather
       than vanishing round the back. */
    const EDGES = [
      { id: "N", nx: 0, nz: -1 }, { id: "S", nx: 0, nz: 1 },
      { id: "W", nx: -1, nz: 0 }, { id: "E", nx: 1, nz: 0 },
    ];
    const gauge = { a: 0, x: 0, z: 0, ax: 0, az: 0, bx: 0, bz: 0, edge: "N" };
    const pickEdge = () => {
      const vx = cam.position.x, vz = cam.position.z;
      const len = Math.hypot(vx, vz) || 1;
      let best = EDGES[0], bd = -2;
      for (const e of EDGES) {
        const d = (e.nx * vx + e.nz * vz) / len;
        if (d > bd) { bd = d; best = e; }
      }
      const half = SIZE / 2, over = 12;
      if (best.id === "N" || best.id === "S") {
        const j = best.id === "N" ? 0 : N - 1;
        gauge.a = j * N + (N >> 1);
        gauge.z = (j / (N - 1) - 0.5) * SIZE;
        gauge.x = 0;
        gauge.ax = -half - over; gauge.az = gauge.z;
        gauge.bx = half + over; gauge.bz = gauge.z;
      } else {
        const i = best.id === "W" ? 0 : N - 1;
        gauge.a = (N >> 1) * N + i;
        gauge.x = (i / (N - 1) - 0.5) * SIZE;
        gauge.z = 0;
        gauge.ax = gauge.x; gauge.az = -half - over;
        gauge.bx = gauge.x; gauge.bz = half + over;
      }
      gauge.edge = best.id;
    };

    const mkDatum = (hex, dashed) => {
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(6), 3));
      const m = dashed
        ? new THREE.LineDashedMaterial({ color: new THREE.Color(hex), dashSize: 3.4, gapSize: 2.6, depthTest: false, transparent: true, opacity: 0.95 })
        : new THREE.LineBasicMaterial({ color: new THREE.Color(hex), depthTest: false, transparent: true, opacity: 0.95 });
      const l = new THREE.Line(g, m);
      l.frustumCulled = false;
      l.renderOrder = 8;
      return l;
    };
    const dGround = mkDatum(T.buff, false);
    const dStage = mkDatum(T.water, false);
    const dMax = mkDatum(T.signal, true);

    const STAFF_H = 5.0;
    const staffGeo = new THREE.BufferGeometry();
    {
      const pts = [];
      pts.push(0, 0, 0, 0, STAFF_H, 0);
      for (let y = 0; y <= STAFF_H + 1e-6; y += 0.25) {
        const major = Math.abs(y - Math.round(y)) < 1e-6;
        const len = major ? 3.0 : 1.4;
        pts.push(0, y, 0, -len, y, 0);
      }
      staffGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(pts), 3));
    }
    const staff = new THREE.LineSegments(staffGeo, new THREE.LineBasicMaterial({
      color: new THREE.Color(T.ink), depthTest: false, transparent: true, opacity: 0.5,
    }));
    staff.frustumCulled = false;
    staff.renderOrder = 8;

    const levels = new THREE.Group();
    levels.add(dGround, dStage, dMax, staff);
    levels.visible = true;
    scene.add(levels);

    const setDatum = (line, y, dashed) => {
      const p = line.geometry.attributes.position.array;
      p[0] = gauge.ax; p[1] = y; p[2] = gauge.az;
      p[3] = gauge.bx; p[4] = y; p[5] = gauge.bz;
      line.geometry.attributes.position.needsUpdate = true;
      line.geometry.computeBoundingSphere();
      if (dashed) line.computeLineDistances();
    };

    const rtPost = new THREE.WebGLRenderTarget(2, 2, {
      minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, format: THREE.RGBAFormat,
    });
    const postMat = new THREE.ShaderMaterial({
      vertexShader: POST_VS, fragmentShader: POST_FS, depthTest: false, depthWrite: false,
      uniforms: {
        uTex: { value: null },
        uTexel: { value: new THREE.Vector2(0, 0) },
        uAmount: { value: 0 }, uFocus: { value: 0.56 }, uBand: { value: 0.34 },
        uVignette: { value: 0 }, uSat: { value: 1 }, uFinal: { value: 0 },
      },
    });
    const postScene = new THREE.Scene();
    const postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    postScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), postMat));

    three.current = { renderer, scene, cam, tGeo, wGeo, skGeo, tMat, wMat, cc, setView, resetView, rebuildVeg, floats, streaks, rebuildBridges: () => { const g = buildBridgeGeometry(simRef.current, unitsRef.current.list); bridges.geometry.dispose(); bridges.geometry = g; } };
    rebuildVeg(700);
    refreshTerrainGeometry();
    refreshTerrainStatic();
    stepCam(1);

    /* ------------------------------------------------------ interaction */
    const ray = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    let drag = null, last = { x: 0, y: 0 }, pending = null, aoTimer = null, pinchDist = 0;
    const pointers = new Map();

    const hit = (cx, cy) => {
      const r = renderer.domElement.getBoundingClientRect();
      ndc.x = ((cx - r.left) / r.width) * 2 - 1;
      ndc.y = -((cy - r.top) / r.height) * 2 + 1;
      ray.setFromCamera(ndc, cam);
      const is = ray.intersectObject(terrain, false);
      return is.length ? is[0].point : null;
    };
    const panBy = (px, py) => {
      const k = cc.dist * 0.0016;
      const fx = Math.cos(cc.theta), fz = Math.sin(cc.theta);
      const rx = -fz, rz = fx;
      cc.dx += (rx * -px + fx * py) * k;
      cc.dz += (rz * -px + fz * py) * k;
      clampCam();
    };

    const onDown = (e) => {
      renderer.domElement.setPointerCapture?.(e.pointerId);
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 2) {
        const p = [...pointers.values()];
        pinchDist = Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y);
        drag = "pinch";
        pending = null;
        return;
      }
      const c = cfgRef.current;
      last = { x: e.clientX, y: e.clientY };
      if (e.button === 1 || e.button === 2 || e.altKey) drag = "pan";
      else if (c.tool === "orbit" || e.shiftKey) drag = "orbit";
      else {
        drag = "tool";
        const p = hit(e.clientX, e.clientY);
        if (p) {
          if (c.tool === "pick") {
            const lv = Math.round(sampleGround(simRef.current, p.x, p.z) * 100) / 100;
            setCfg((k) => ({ ...k, stampZ: lv, tool: "stamp" }));
            drag = null;
          } else if (c.tool === "drop") {
            dropFloat(p.x, p.z);
            drag = null;
          } else if (c.tool === "section" || c.tool === "bridge" || c.tool === "tunnel") {
            drawUnit = { x1: p.x, z1: p.z, x2: p.x, z2: p.z, kind: c.tool };
            drag = "unit";
          } else { pushHistory(); pending = { x: p.x, z: p.z }; }
        }
      }
    };
    const onMove = (e) => {
      if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (drag === "pinch" && pointers.size === 2) {
        const p = [...pointers.values()];
        const d = Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y);
        cc.tDist *= 1 + (pinchDist - d) * 0.004;
        pinchDist = d;
        clampCam();
        return;
      }
      const dx = e.clientX - last.x, dy = e.clientY - last.y;
      if (drag === "orbit") {
        last = { x: e.clientX, y: e.clientY };
        cc.tTheta -= dx * 0.0062;
        cc.tPhi -= dy * 0.0048;
        clampCam();
      } else if (drag === "pan") {
        last = { x: e.clientX, y: e.clientY };
        panBy(dx, dy);
      } else if (drag === "unit") {
        const p = hit(e.clientX, e.clientY);
        if (p && drawUnit) { drawUnit.x2 = p.x; drawUnit.z2 = p.z; }
      } else if (drag === "tool") {
        const p = hit(e.clientX, e.clientY);
        if (p) pending = { x: p.x, z: p.z };
      } else {
        const c = cfgRef.current;
        if (c.tool !== "orbit") {
          const p = hit(e.clientX, e.clientY);
          if (p) {
            ring.position.set(p.x, p.y + 0.4, p.z);
            ring.scale.set(c.brush, 1, c.brush);
            ring.visible = true;
          } else ring.visible = false;
        } else ring.visible = false;
      }
    };
    const onUp = (e) => {
      pointers.delete(e.pointerId);
      if (drag === "unit" && drawUnit) {
        const L = Math.hypot(drawUnit.x2 - drawUnit.x1, drawUnit.z2 - drawUnit.z1);
        if (L > 6) addUnit(drawUnit.kind, drawUnit.x1, drawUnit.z1, drawUnit.x2, drawUnit.z2);
        drawUnit = null;
      }
      if (pointers.size === 0) drag = null;
      if (pending) { pending = null; scheduleAO(); }
    };
    const onWheel = (e) => {
      e.preventDefault();
      cc.tDist *= 1 + Math.sign(e.deltaY) * 0.1;
      clampCam();
    };
    const onLeave = () => { ring.visible = false; };
    const dom = renderer.domElement;
    dom.addEventListener("pointerdown", onDown);
    dom.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    dom.addEventListener("wheel", onWheel, { passive: false });
    dom.addEventListener("pointerleave", onLeave);
    dom.addEventListener("contextmenu", (e) => e.preventDefault());

    function scheduleAO() {
      if (aoTimer) clearTimeout(aoTimer);
      aoTimer = setTimeout(() => {
        computeAO(simRef.current);
        refreshTerrainStatic();
      }, 170);
    }

    const keys = new Set();
    const onKeyDown = (e) => {
      const tag = e.target && e.target.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      keys.add(e.code);
      if (e.code === "Space") { e.preventDefault(); setCfg((c) => ({ ...c, playing: !c.playing })); }
      if (e.code === "Digit0") resetView();
      if (e.code === "Digit1") setView("plan");
      if (e.code === "Digit2") setView("oblique");
      if (e.code === "Digit3") setView("low");
      if ((e.metaKey || e.ctrlKey) && e.code === "KeyZ") {
        e.preventDefault();
        if (e.shiftKey) doRedo(); else doUndo();
      } else if ((e.metaKey || e.ctrlKey) && e.code === "KeyY") {
        e.preventDefault();
        doRedo();
      }
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].indexOf(e.code) >= 0) e.preventDefault();
    };
    const onKeyUp = (e) => keys.delete(e.code);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);

    function applyKeys(dtms) {
      const k = Math.min(dtms / 16, 4);
      const pan = 7 * k, rot = 0.022 * k, zoom = 0.014 * k;
      if (keys.has("KeyW") || keys.has("ArrowUp")) panBy(0, pan);
      if (keys.has("KeyS") || keys.has("ArrowDown")) panBy(0, -pan);
      if (keys.has("KeyA") || keys.has("ArrowLeft")) panBy(pan, 0);
      if (keys.has("KeyD") || keys.has("ArrowRight")) panBy(-pan, 0);
      if (keys.has("KeyQ")) cc.tTheta -= rot;
      if (keys.has("KeyE")) cc.tTheta += rot;
      if (keys.has("KeyR")) cc.tPhi -= rot;
      if (keys.has("KeyF")) cc.tPhi += rot;
      if (keys.has("Equal") || keys.has("NumpadAdd")) cc.tDist *= 1 - zoom;
      if (keys.has("Minus") || keys.has("NumpadSubtract")) cc.tDist *= 1 + zoom;
      const nv = navRef.current;
      if (nv.rotL) cc.tTheta -= rot * 1.7;
      if (nv.rotR) cc.tTheta += rot * 1.7;
      if (nv.tiltU) cc.tPhi -= rot * 1.7;
      if (nv.tiltD) cc.tPhi += rot * 1.7;
      if (nv.zoomIn) cc.tDist *= 1 - zoom * 1.7;
      if (nv.zoomOut) cc.tDist *= 1 + zoom * 1.7;
      clampCam();
    }

    function applyBrush(wx, wz, dtSec) {
      const s = simRef.current, c = cfgRef.current;
      const cell = SIZE / (N - 1);
      const gi = (wx / SIZE + 0.5) * (N - 1);
      const gj = (wz / SIZE + 0.5) * (N - 1);
      const r = c.brush / cell;
      const i0 = Math.max(0, Math.floor(gi - r)), i1 = Math.min(N - 1, Math.ceil(gi + r));
      const j0 = Math.max(0, Math.floor(gj - r)), j1 = Math.min(N - 1, Math.ceil(gj + r));
      const amt = c.strength * dtSec * 22;
      let tz = false, tc = false;
      for (let j = j0; j <= j1; j++)
        for (let i = i0; i <= i1; i++) {
          const d = Math.hypot(i - gi, j - gj) / r;
          if (d > 1) continue;
          const w = Math.pow(Math.cos((d * Math.PI) / 2), 1.6);
          const a = j * N + i;
          if (c.tool === "raise") {
            let nz = s.z[a] + amt * w;
            if (c.capOn && nz > c.stampZ) nz = Math.max(s.z[a], c.stampZ);
            s.z[a] = nz; tz = true;
          }
          else if (c.tool === "lower") {
            let nz = s.z[a] - amt * w;
            if (c.capOn && nz < -c.stampZ) nz = Math.min(s.z[a], -c.stampZ);
            s.z[a] = nz; tz = true;
          }
          else if (c.tool === "stamp") {
            s.z[a] += (c.stampZ - s.z[a]) * Math.min(1, w * dtSec * 7);
            tz = true;
          }
          else if (c.tool === "smooth") {
            const il = Math.max(0, i - 1), ir = Math.min(N - 1, i + 1);
            const jt = Math.max(0, j - 1), jb = Math.min(N - 1, j + 1);
            const avg = (s.z[j * N + il] + s.z[j * N + ir] + s.z[jt * N + i] + s.z[jb * N + i]) * 0.25;
            s.z[a] += (avg - s.z[a]) * Math.min(1, w * dtSec * 9);
            tz = true;
          } else if (c.tool === "paint") { if (w > 0.32) { s.land[a] = c.landIdx; tc = true; } }
          else if (c.tool === "pour") {
            const add = amt * w * 0.012;
            s.h[a] += add;
            s.volAdd += add * s.dx * s.dx;
          }
        }
      if (tz) refreshTerrainGeometry();
      if (tc) { s.syncLand(); rsRef.current = null; refreshTerrainStatic(); }
    }

    const DUCK_TINTS = [
      [2.70, 0.26, 1.75], [0.18, 2.45, 2.35], [1.55, 2.70, 0.22],
      [2.80, 1.05, 0.12], [2.40, 0.24, 0.58], [1.10, 0.50, 2.80],
    ];
    let dropSeq = 0;
    function dropFloat(x, z) {
      const t = DUCK_TINTS[dropSeq++ % DUCK_TINTS.length];
      floats.add(x, z, t[0], t[1], t[2]);
    }
    let drawUnit = null;
    function addUnit(kind, x1, z1, x2, z2) {
      const U = unitsRef.current;
      if (U.list.length >= MAX_UNITS) return;
      pushHistory();
      const c = cfgRef.current;
      const id = "u" + ++U.seq;
      const mid = sampleGround(simRef.current, (x1 + x2) / 2, (z1 + z2) / 2);
      const u = kind === "bridge"
        ? { id, kind: "bridge", name: "Bridge " + U.seq, x1, z1, x2, z2,
            span: c.secSpan, soffit: mid + c.secSoffit, deck: 0.7, piers: c.secPiers, pierW: 1.6, delta: null }
        : kind === "tunnel"
        ? { id, kind: "tunnel", name: "Tunnel " + U.seq, x1, z1, x2, z2,
            diam: c.tunDiam }
        : { id, kind: "river", name: "Section " + U.seq, x1, z1, x2, z2 };
      U.list.push(u);
      U.prof[id] = newProfile();
      if (kind === "bridge") { applyPiers(simRef.current, u); refreshTerrainGeometry(); }
      if (kind === "tunnel") syncTunnels(simRef.current, U.list);
      U.dirty = true;
      syncUnits();
    }
    function syncUnits() {
      const U = unitsRef.current;
      setUnits(U.list.map((u) => ({ id: u.id, kind: u.kind, name: u.name })));
    }
    function syncTunnels(sim, units) {
      if (!sim) return;
      sim.resetTunnels();
      for (const u of units) {
        if (u.kind !== "tunnel") continue;
        const r = Math.max(0.5, (u.diam || 6) / 2 / sim.dx);
        sim.addTunnel(u.x1, u.z1, u.x2, u.z2, r);
      }
    }
    syncUnitsRef.current = syncUnits;
    syncTunnelsRef.current = syncTunnels;
    unitApi.current = {
      addInterp() {
        const U = unitsRef.current;
        const riv = U.list.filter((u) => u.kind === "river");
        if (riv.length < 2 || U.list.length >= MAX_UNITS - 2) return 0;
        const a = riv[riv.length - 2], b = riv[riv.length - 1];
        let made = 0;
        for (const t of [0.33, 0.66]) {
          if (U.list.length >= MAX_UNITS) break;
          const id = "u" + ++U.seq;
          U.list.push({
            id, kind: "interp", name: "Interp " + U.seq, pa: a.id, pb: b.id, t,
            x1: a.x1 + (b.x1 - a.x1) * t, z1: a.z1 + (b.z1 - a.z1) * t,
            x2: a.x2 + (b.x2 - a.x2) * t, z2: a.z2 + (b.z2 - a.z2) * t,
          });
          U.prof[id] = newProfile();
          made++;
        }
        syncUnits();
        return made;
      },
      remove(id) {
        const U = unitsRef.current;
        const i = U.list.findIndex((u) => u.id === id);
        if (i < 0) return;
        pushHistory();
        const u = U.list[i];
        if (u.kind === "bridge") { removePiers(simRef.current, u); refreshTerrainGeometry(); }
        U.list.splice(i, 1);
        delete U.prof[id];
        U.list = U.list.filter((x) => x.kind !== "interp" || (U.prof[x.pa] && U.prof[x.pb]));
        syncTunnels(simRef.current, U.list);
        U.dirty = true;
        syncUnits();
      },
      clear() {
        const U = unitsRef.current;
        if (!U.list.length) return;
        pushHistory();
        for (const u of U.list) if (u.kind === "bridge") removePiers(simRef.current, u);
        refreshTerrainGeometry();
        U.list = []; U.prof = {}; U.dirty = true;
        syncTunnels(simRef.current, U.list);
        syncUnits();
      },
      editBridge(id, patch) {
        const U = unitsRef.current;
        const u = U.list.find((x) => x.id === id);
        if (!u || u.kind !== "bridge") return;
        removePiers(simRef.current, u);
        Object.assign(u, patch);
        applyPiers(simRef.current, u);
        refreshTerrainGeometry();
        U.dirty = true;
      },
      editTunnel(id, patch) {
        const U = unitsRef.current;
        const u = U.list.find((x) => x.id === id);
        if (!u || u.kind !== "tunnel") return;
        Object.assign(u, patch);
        syncTunnels(simRef.current, U.list);
        U.dirty = true;
      },
      read(id) {
        const U = unitsRef.current;
        const u = U.list.find((x) => x.id === id);
        if (!u) return null;
        const pr = U.prof[id];
        if (!pr) return null;
        let br = null;
        if (u.kind === "bridge") {
          const dx = u.x2 - u.x1, dz = u.z2 - u.z1, L = Math.hypot(dx, dz) || 1;
          const ox = (-dz / L) * (u.span * 1.6), oz = (dx / L) * (u.span * 1.6);
          const pu = sampleSection(simRef.current, { x1: u.x1 - ox, z1: u.z1 - oz, x2: u.x2 - ox, z2: u.z2 - oz }, newProfile());
          const pd = sampleSection(simRef.current, { x1: u.x1 + ox, z1: u.z1 + oz, x2: u.x2 + ox, z2: u.z2 + oz }, newProfile());
          br = bridgeHydraulics(simRef.current, u, pu, pr, pd);
        }
        return { u, pr, br };
      },
    };

    dropRef.current = dropFloat;
    seedRef.current = (count) => {
      const s2 = simRef.current;
      let placed = 0, guard = 0;
      const rnd = mulberry32(1337 + floats.n);
      while (placed < count && guard++ < 4000) {
        const x = (rnd() - 0.5) * SIZE * 0.9;
        const z = (rnd() - 0.5) * SIZE * 0.9;
        const f = { x: 0, z: 0, d: 0 };
        sampleFlow(s2, x, z, f);
        if (f.d > 0.02) { dropFloat(x, z); placed++; }
      }
      return placed;
    };
    clearRef.current = () => floats.clear();

    /* ---------------------------------------------------------- loop */
    let raf = 0, lastT = performance.now(), lastUI = 0, achieved = 0, clockT = 0;
    let lastLevelUI = 0, lastAdv = 0;
    const tmpV = new THREE.Vector3();

    const resize = () => {
      const w = el.clientWidth, h = el.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h, false);
      cam.aspect = w / h;
      cam.updateProjectionMatrix();
      const bw = Math.max(2, Math.floor(w * dpr)), bh = Math.max(2, Math.floor(h * dpr));
      rt.setSize(bw, bh);
      rtPost.setSize(bw, bh);
      wMat.uniforms.uRes.value.set(bw, bh);
      flMat.uniforms.uProj.value = h / (2 * Math.tan((cam.fov * Math.PI) / 360));
      postMat.userData.bw = bw;
      postMat.userData.bh = bh;
    };
    resize();
    const roObs = new ResizeObserver(resize);
    roObs.observe(el);

    function rainAt(t, c) {
      const durS = DURATIONS[c.dur] * 3600;
      if (t >= durS) return 0;
      const meanMs = stormDepthMm(c.aep, DURATIONS[c.dur], c.cc) / 1000 / durS;
      return meanMs * profileFactor(t / durS, c.peaked);
    }
    function inflowAt(t, c) {
      if (!c.inflowOn) return 0;
      if (!c.inflowWave) return c.inflowQ;
      const span = DURATIONS[c.dur] * 3600 * 1.7;
      const base = c.inflowQ * 0.12;
      const tau = t / span;
      if (tau > 1.4) return base;
      return base + (c.inflowQ - base) * Math.exp(-Math.pow((tau - 0.46) / 0.17, 2));
    }

    function frame(now) {
      raf = requestAnimationFrame(frame);
      const wall = Math.min((now - lastT) / 1000, 0.06);
      lastT = now;
      clockT += wall;
      const c = cfgRef.current;
      const s = simRef.current;

      applyKeys(wall * 1000);
      stepCam(0.16);
      if (pending) applyBrush(pending.x, pending.z, wall);

      s.infScale = c.infScale;
      s.outletOnly = !!c.outletOnly;
      if (rsRef.current !== c.roughScale) {
        rsRef.current = c.roughScale;
        for (let a = 0; a < N * N; a++) s.nRough[a] = LAND[s.land[a]].n * c.roughScale;
      }

      if (c.playing) {
        const target = wall * c.speed;
        let adv = 0, guard = 0;
        const t0 = performance.now();
        while (adv < target && guard++ < 4000) {
          const hm = Math.max(s.maxDepth, 0.015);
          let dt = (0.62 * s.dx) / Math.sqrt(G * hm);
          if (dt > 1.5) dt = 1.5;
          if (dt > target - adv) dt = target - adv;
          if (dt <= 1e-4) break;
          s.stageOn = c.stageOn;
          s.stageLevel = c.stageLevel;
          s.inflowNow = inflowAt(s.t, c);
          s.step(dt, rainAt(s.t, c), c.openB);
          adv += dt;
          if (performance.now() - t0 > 11) break;
        }
        achieved = wall > 0 ? adv / wall : 0;
        lastAdv = adv;
        s.stats();
        const S = samples.current;
        if (s.t >= S.next) {
          S.next = s.t + S.every;
          S.list.push({ t: s.t, r: s.rainNow, q: s.outQ, st: s.storage });
          if (S.list.length > 700) { S.list = S.list.filter((_, i) => i % 2 === 0); S.every *= 2; }
        }
      }

      const wp = wGeo.attributes.position.array;
      const wd = wGeo.attributes.aDepth.array;
      const wv = wGeo.attributes.aVel.array;
      const wn = wGeo.attributes.aNrm.array;
      const twet = tGeo.attributes.aWet.array;
      const src = c.mode === 4 ? s.hmax : s.h;
      const ex = c.wExag;

      /* Render-only filtering. The solver keeps its raw cell values; this
         only decides what the surface looks like. Temporal easing kills the
         frame-to-frame flicker as cells wet and dry, the blur turns the
         cell staircase into a continuous surface. */
      const ease = 1 - Math.exp(-wall / 0.06);
      const hr = s.hr;
      for (let a = 0; a < N * N; a++) hr[a] += (src[a] - hr[a]) * ease;
      smoothField(N, hr, s.hs, s.tmpF, c.smooth);

      /* Roofs shed rain and never pond, but the blur above happily leaks a
         neighbouring flooded street's depth up onto a dry rooftop cell —
         at ×3-6 exaggeration that phantom film reads as the flood washing
         clean over the building. Buildings are solid: clamp their surface
         back to bare, dry roof so the water stops at the wall instead of
         floating above it. */
      const hs = s.hs, land = s.land, surf = s.surf;
      for (let a = 0; a < N * N; a++) if (land[a] === 5) hs[a] = 0;
      for (let a = 0; a < N * N; a++) surf[a] = s.z[a] + hs[a] * ex;
      fieldNormals(N, s.dx, surf, wn);

      for (let a = 0; a < N * N; a++) {
        wp[a * 3 + 1] = surf[a];
        wd[a] = hs[a];
        wv[a] = s.vel[a];
        twet[a] = Math.min(1, s.hmax[a] * 26);
      }
      wGeo.attributes.position.needsUpdate = true;
      wGeo.attributes.aDepth.needsUpdate = true;
      wGeo.attributes.aVel.needsUpdate = true;
      wGeo.attributes.aNrm.needsUpdate = true;
      tGeo.attributes.aWet.needsUpdate = true;

      /* ---- vegetation, flow lines, floats ---- */
      veg.visible = !!c.veg;
      vegMat.uniforms.uTime.value = clockT;

      const simAdv = c.playing ? lastAdv : 0;
      streakLines.visible = !!c.flowLines;
      if (c.flowLines) {
        streaks.update(s, simAdv > 0 ? simAdv : wall * 0.9, ex);
        const sp = stGeo.attributes.position.array;
        const sa = stGeo.attributes.aAlpha.array;
        const ss = stGeo.attributes.aSpd.array;
        streaks.writeGeometry(sp, sa, ss);
        stGeo.attributes.position.needsUpdate = true;
        stGeo.attributes.aAlpha.needsUpdate = true;
        stGeo.attributes.aSpd.needsUpdate = true;
        stMat.uniforms.uVScale.value = c.vScale;
      }

      floatPts.visible = floats.n > 0;
      if (floats.n > 0) {
        if (simAdv > 0) floats.update(s, simAdv, ex, wall);
        const fp = flGeo.attributes.position.array;
        const ft = flGeo.attributes.aTint.array;
        const fs = flGeo.attributes.aStuck.array;
        let live = 0;
        for (let i = 0; i < floats.n; i++) {
          if (floats.gone[i]) continue;
          fp[live * 3] = floats.rx[i];
          fp[live * 3 + 1] = floats.ry[i] + 0.6;
          fp[live * 3 + 2] = floats.rz[i];
          ft[live * 3] = floats.tint[i * 3];
          ft[live * 3 + 1] = floats.tint[i * 3 + 1];
          ft[live * 3 + 2] = floats.tint[i * 3 + 2];
          fs[live] = floats.stuck[i];
          live++;
        }
        flGeo.setDrawRange(0, live);
        flGeo.attributes.position.needsUpdate = true;
        flGeo.attributes.aTint.needsUpdate = true;
        flGeo.attributes.aStuck.needsUpdate = true;
        flMat.uniforms.uShape.value = c.floatShape === "duck" ? 1 : 0;
        flMat.uniforms.uSize.value = c.floatSize;
      }

      /* ---- level gauge ---- */
      levels.visible = !!c.levels;
      if (c.levels) {
        pickEdge();
        const gz = s.z[gauge.a];
        const hNow = s.h[gauge.a];
        const hMax = s.hmax[gauge.a];
        setDatum(dGround, gz, false);
        setDatum(dStage, gz + hNow, false);
        setDatum(dMax, gz + hMax, true);
        dStage.visible = hNow > 0.0005;
        dMax.visible = hMax > 0.0005;
        staff.position.set(gauge.x, gz, gauge.z);

        /* Anchor the labels to whichever end of the line projects furthest
           right, then push them apart vertically so 30 mm of stage
           difference is still two readable rows, with a leader back to the
           true position. */
        const lab = labelRefs.current;
        const host = lab.ground && lab.ground.parentNode;
        if (host) {
          const W = host.clientWidth, H = host.clientHeight;
          const proj = (x, y, z) => {
            tmpV.set(x, y, z).project(cam);
            return { x: (tmpV.x * 0.5 + 0.5) * W, y: (-tmpV.y * 0.5 + 0.5) * H, ok: tmpV.z <= 1 };
          };
          const pa = proj(gauge.ax, gz, gauge.az);
          const pb = proj(gauge.bx, gz, gauge.bz);
          const useB = pb.x >= pa.x;
          const ex = useB ? gauge.bx : gauge.ax;
          const ez = useB ? gauge.bz : gauge.az;
          const rows = [
            { k: "ground", y: gz, show: true },
            { k: "stage", y: gz + hNow, show: hNow > 0.0005 },
            { k: "max", y: gz + hMax, show: hMax > 0.0005 },
          ].map((r) => {
            const q = proj(ex, r.y, ez);
            return { ...r, sx: q.x, sy: q.y, ok: q.ok, ty: q.y };
          });
          const live = rows.filter((r) => r.show && r.ok).sort((a, b) => a.ty - b.ty);
          const GAP = 30;
          for (let i = 1; i < live.length; i++)
            if (live[i].ty - live[i - 1].ty < GAP) live[i].ty = live[i - 1].ty + GAP;
          const shift = live.length ? Math.max(0, live[live.length - 1].ty - (H - 24)) : 0;
          for (const r of live) r.ty -= shift;
          const leads = [];
          for (const r of rows) {
            const el = lab[r.k];
            if (!el) continue;
            if (!r.show || !r.ok) { el.style.opacity = "0"; continue; }
            el.style.opacity = "1";
            el.style.transform = `translate(${(r.sx + 16).toFixed(1)}px, ${r.ty.toFixed(1)}px) translateY(-50%)`;
            leads.push({ k: r.k, x1: r.sx, y1: r.sy, x2: r.sx + 14, y2: r.ty });
          }
          const svg = lab.leaders;
          if (svg) {
            for (const L of leads) {
              const ln = svg.querySelector(`[data-k="${L.k}"]`);
              if (ln) {
                ln.setAttribute("d", `M${L.x1.toFixed(1)} ${L.y1.toFixed(1)} L${(L.x1 + 7).toFixed(1)} ${L.y1.toFixed(1)} L${L.x2.toFixed(1)} ${L.y2.toFixed(1)}`);
                ln.setAttribute("opacity", "0.75");
              }
            }
            for (const r of rows) {
              if (r.show && r.ok) continue;
              const ln = svg.querySelector(`[data-k="${r.k}"]`);
              if (ln) ln.setAttribute("opacity", "0");
            }
          }
        }
        if (now - lastLevelUI > 160) {
          lastLevelUI = now;
          setLev({ ground: gz, stage: gz + hNow, max: gz + hMax, d: hNow, dmax: hMax });
        }
      }

      const stormAmt = Math.min(1, s.rainNow / 45);
      sky.material.uniforms.uStorm.value = stormAmt;
      sky.position.copy(cam.position);
      tMat.uniforms.uStorm.value = stormAmt;
      tMat.uniforms.uCam.value.copy(cam.position);
      tMat.uniforms.uContourOn.value = c.contours ? 1 : 0;
      wMat.uniforms.uMode.value = c.mode;
      wMat.uniforms.uCam.value.copy(cam.position);
      wMat.uniforms.uTime.value = clockT;
      wMat.uniforms.uRain.value = s.rainNow;
      wMat.uniforms.uStorm.value = stormAmt;
      rMat.uniforms.uTime.value = clockT;
      rMat.uniforms.uFrac.value = Math.min(1, s.rainNow / 55);
      rMat.uniforms.uRight.value.setFromMatrixColumn(cam.matrixWorld, 0);

      const rainOn = c.showRain && s.rainNow > 0.05;
      const ringWas = ring.visible;

      if (c.mode === 0) {
        water.visible = false;
        rain.visible = false;
        ring.visible = false;
        const flWas = floatPts.visible, stWas = streakLines.visible, lvWas = levels.visible;
        floatPts.visible = false; streakLines.visible = false; levels.visible = false;
        const scWas = secLines.visible; secLines.visible = false;
        renderer.setRenderTarget(rt);
        renderer.render(scene, cam);
        renderer.setRenderTarget(null);
        water.visible = true;
        ring.visible = ringWas;
        floatPts.visible = flWas; streakLines.visible = stWas; levels.visible = lvWas;
        secLines.visible = scWas;
      }
      rain.visible = rainOn;

      const tilt = c.tilt;
      if (tilt > 0.01) {
        const bw = postMat.userData.bw || 2, bh = postMat.userData.bh || 2;
        const px = tilt * 15;
        renderer.setRenderTarget(rtPost);
        renderer.render(scene, cam);
        postMat.uniforms.uAmount.value = px;
        postMat.uniforms.uFocus.value = c.tiltFocus;
        postMat.uniforms.uBand.value = c.tiltBand;
        postMat.uniforms.uVignette.value = tilt * 0.34;
        postMat.uniforms.uSat.value = 1 + tilt * 0.14;
        postMat.uniforms.uTex.value = rtPost.texture;
        postMat.uniforms.uTexel.value.set(1 / bw, 0);
        postMat.uniforms.uFinal.value = 0;
        renderer.setRenderTarget(rt);
        renderer.render(postScene, postCam);
        postMat.uniforms.uTex.value = rt.texture;
        postMat.uniforms.uTexel.value.set(0, 1 / bh);
        postMat.uniforms.uFinal.value = 1;
        renderer.setRenderTarget(null);
        renderer.render(postScene, postCam);
      } else {
        renderer.setRenderTarget(null);
        renderer.render(scene, cam);
      }

      /* ---- 1D units ---- */
      {
        const U = unitsRef.current;
        let tunCount = 0;
        for (const u of U.list) {
          if (!U.prof[u.id]) U.prof[u.id] = newProfile();
          sampleSection(s, u, U.prof[u.id]);
          if (u.kind === "interp" && u.pa && u.pb) {
            const pa = U.prof[u.pa], pb = U.prof[u.pb];
            if (pa && pb) assumedProfile(pa, pb, u.t, U.prof[u.id].zbAssumed);
          }
          if (u.kind === "tunnel") tunCount++;
        }
        /* keep the solver's conduit list in step with the drawn tunnels */
        if (tunCount > 0) syncTunnels(s, U.list);
        secLines.visible = c.units && U.list.length > 0;
        bridges.visible = c.units;
        structMat.uniforms.uTime.value = clockT;
        if (secLines.visible) writeSectionLines(s, U.list, U.prof);
        if (U.dirty) {
          U.dirty = false;
          const g = buildBridgeGeometry(s, U.list);
          bridges.geometry.dispose();
          bridges.geometry = g;
        }
      }

      /* ---- lesson trackers ---- */
      const LR = lsnRef.current;
      if (LR.on) {
        const tk = trackRef.current;
        if (s.outQ > tk.peakQ) { tk.peakQ = s.outQ; tk.tPeak = s.t; }
        const les = LESSONS[LR.idx];
        if (les.metric === "hazBest") {
          for (let a = 0; a < N * N; a++) {
            const d = s.h[a];
            if (d > 0.02 && d <= 0.25) {
              const hr = d * (s.vel[a] + 0.5);
              if (hr > tk.hazBest) tk.hazBest = hr;
            }
          }
        }
        if (les.kind === "zones") {
          let za = 0, zb = 0;
          for (let j = ZONE_A.j0; j <= ZONE_A.j1; j++)
            for (let i = ZONE_A.i0; i <= ZONE_A.i1; i++) { const v = s.hmax[j * N + i]; if (v > za) za = v; }
          for (let j = ZONE_B.j0; j <= ZONE_B.j1; j++)
            for (let i = ZONE_B.i0; i <= ZONE_B.i1; i++) { const v = s.hmax[j * N + i]; if (v > zb) zb = v; }
          tk.zoneA = za; tk.zoneB = zb;
        }
        if (les.metric === "floatDepth" && floats.n > 0) {
          const ff = { x: 0, z: 0, d: 0 };
          let tot = 0, cnt = 0;
          for (let i = 0; i < floats.n; i++) {
            if (floats.gone[i]) continue;
            sampleFlow(s, floats.x[i], floats.z[i], ff);
            tot += ff.d; cnt++;
          }
          tk.floatDepth = cnt ? tot / cnt : 0;
        }
      }

      if (now - lastUI > 130) {
        lastUI = now;
        let heading = ((cc.theta * 180) / Math.PI + 90) % 360;
        if (heading < 0) heading += 360;
        setRo({
          t: s.t, rain: s.rainNow, storage: s.storage, inf: s.volInf, out: s.volOut,
          outQ: s.outQ, maxD: s.maxDepth, maxV: s.maxVel, wet: s.wetFrac,
          err: s.balanceError(), achieved, volRain: s.volRain, volAdd: s.volAdd, heading,
          volIn: s.volIn, volStage: s.volStage, vol0: s.vol0, inflowNow: s.inflowNow,
        });
        drawChart();
        if (lsnRef.current.on) evaluateLesson(s, cfgRef.current, trackRef.current, floats);
      }
    }
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      roObs.disconnect();
      if (aoTimer) clearTimeout(aoTimer);
      dom.removeEventListener("pointerdown", onDown);
      dom.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      dom.removeEventListener("wheel", onWheel);
      dom.removeEventListener("pointerleave", onLeave);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      rt.dispose(); rtPost.dispose(); renderer.dispose();
      tGeo.dispose(); wGeo.dispose(); rGeo.dispose(); skGeo.dispose();
      if (dom.parentNode) dom.parentNode.removeChild(dom);
    };
    // eslint-disable-next-line
  }, []);

  function evaluateLesson(sim, c, tk, floats) {
    const st = lsnRef.current;
    const les = LESSONS[st.idx];
    const durS = DURATIONS[c.dur] * 3600;
    const runDone = sim.t >= durS * 1.15;
    let value = 0, target = 0, prog = 0, ok = false, sub = "";

    if (les.kind === "zones") {
      const a = tk.zoneA, b = tk.zoneB;
      ok = a < 0.25 && b > 0.30;
      value = a; target = 0.25;
      prog = Math.min(1, (a < 0.25 ? 0.5 : 0) + (b > 0.30 ? 0.5 : 0));
      sub = "Village " + f2(a) + " m " + (a < 0.25 ? "protected" : "still flooding") +
            "  \u00b7  Meadow " + f2(b) + " m " + (b > 0.30 ? "taking it instead" : "not yet loaded");
    } else if (les.kind === "absolute") {
      value = les.metric === "floatDepth" ? tk.floatDepth : tk[les.metric];
      target = les.target;
      ok = value >= target;
      if (les.metric === "floatDepth") {
        const live = floats ? floats.n : 0;
        if (live < 3) { ok = false; sub = "Drop " + (3 - live) + " more float" + (3 - live === 1 ? "" : "s") + " first."; }
        else if (!runDone) sub = "Now run the storm through to the end.";
        else sub = "Storm complete.";
      }
      prog = target > 0 ? Math.min(1, value / target) : 0;
    } else {
      const cur = les.metric === "tPeak" ? tk.tPeak / 60 : tk[les.metric];
      value = cur;
      if (st.base == null) {
        target = 0;
        sub = runDone ? "Baseline complete. Recording it now." : "Run the storm through to the end to set your baseline.";
        if (runDone && cur > 0) {
          setLsn((L) => ({ ...L, base: cur, phase: "option" }));
          return;
        }
      } else {
        target = les.better === "higher" ? st.base * (1 + les.delta) : st.base * (1 - les.delta);
        ok = les.better === "higher" ? cur >= target && runDone : cur <= target && cur > 0 && runDone;
        const moved = st.base > 0 ? ((cur - st.base) / st.base) * 100 : 0;
        sub = "Baseline " + f2(st.base) + " " + les.unit + "  \u00b7  now " + f2(cur) + " " + les.unit +
              "  \u00b7  " + (moved >= 0 ? "+" : "") + moved.toFixed(0) + "%" +
              (runDone ? "" : "  \u00b7  run still going");
        const need = les.delta * 100;
        prog = Math.min(1, Math.abs(moved) / need) * (les.better === "higher" ? (moved > 0 ? 1 : 0) : (moved < 0 ? 1 : 0));
      }
    }
    setLsn((L) => (
      L.value === value && L.prog === prog && L.sub === sub && L.passed === (L.passed || ok)
        ? L : { ...L, value, target, prog, sub, passed: L.passed || ok }
    ));
  }

  const startLesson = useCallback((idx) => {
    const les = LESSONS[idx];
    setLsn({ on: true, idx, phase: "baseline", base: null, passed: false, value: 0, target: 0, prog: 0, sub: "" });
    trackRef.current = { peakQ: 0, tPeak: 0, hazBest: 0, zoneA: 0, zoneB: 0, floatDepth: 0 };
    if (les.setup) {
      if (les.setup.scene) applyScene(les.setup.scene);
      setCfg((c) => ({ ...c, ...les.setup, playing: false }));
    }
    if (clearRef.current) clearRef.current();
    const sim = simRef.current;
    if (sim) { sim.reset(); sim.stats(); }
    samples.current = { list: [], every: 20, next: 0 };
    drawChart();
    // eslint-disable-next-line
  }, [applyScene]);

  /* ------------------------------------------------------------ history */
  const HISTORY_MAX = 30;
  function snapshotState() {
    const s = simRef.current;
    return {
      z: s.z.slice(),
      land: s.land.slice(),
      h: s.h.slice(),
      units: JSON.parse(JSON.stringify(unitsRef.current.list)),
      prof: JSON.parse(JSON.stringify(unitsRef.current.prof)),
      seq: unitsRef.current.seq,
    };
  }
  function restoreState(snap) {
    const s = simRef.current;
    if (!s || !snap) return;
    s.z.set(snap.z);
    s.land.set(snap.land);
    s.h.set(snap.h);
    s.syncLand();
    const U = unitsRef.current;
    U.list = JSON.parse(JSON.stringify(snap.units));
    U.prof = JSON.parse(JSON.stringify(snap.prof));
    U.seq = snap.seq;
    U.dirty = true;
    syncUnitsRef.current();
    syncTunnelsRef.current(s, U.list);
    rsRef.current = null;
    computeAO(s);
    refreshTerrainGeometry();
    refreshTerrainStatic();
    if (three.current.rebuildVeg) three.current.rebuildVeg(700);
    if (three.current.rebuildBridges) three.current.rebuildBridges();
  }
  function pushHistory() {
    const h = historyRef.current;
    h.undo.push(snapshotState());
    if (h.undo.length > HISTORY_MAX) h.undo.shift();
    h.redo = [];
    setHistInfo({ canUndo: h.undo.length > 0, canRedo: false });
  }
  function clearHistory() {
    historyRef.current = { undo: [], redo: [] };
    setHistInfo({ canUndo: false, canRedo: false });
  }
  function doUndo() {
    const h = historyRef.current;
    if (!h.undo.length) return;
    const prev = h.undo.pop();
    h.redo.push(snapshotState());
    if (h.redo.length > HISTORY_MAX) h.redo.shift();
    restoreState(prev);
    setHistInfo({ canUndo: h.undo.length > 0, canRedo: h.redo.length > 0 });
  }
  function doRedo() {
    const h = historyRef.current;
    if (!h.redo.length) return;
    const next = h.redo.pop();
    h.undo.push(snapshotState());
    if (h.undo.length > HISTORY_MAX) h.undo.shift();
    restoreState(next);
    setHistInfo({ canUndo: h.undo.length > 0, canRedo: h.redo.length > 0 });
  }
  historyApi.current = { undo: doUndo, redo: doRedo };

  function refreshTerrainGeometry() {
    const s = simRef.current, g = three.current.tGeo, sk = three.current.skGeo;
    if (!s || !g) return;
    const p = g.attributes.position.array;
    for (let a = 0; a < N * N; a++) p[a * 3 + 1] = s.z[a];
    g.attributes.position.needsUpdate = true;
    g.computeBoundingSphere();

    fieldNormals(N, s.dx, s.z, g.attributes.aNrm.array);
    g.attributes.aNrm.needsUpdate = true;

    /* Contour interval follows the relief, so a 30 m hill doesn't get
       thirty rings and a flat plain still gets useful lines. */
    let lo = Infinity, hi = -Infinity;
    for (let a = 0; a < N * N; a++) { const v = s.z[a]; if (v < lo) lo = v; if (v > hi) hi = v; }
    s.relief = hi - lo;
    s.zMin = lo; s.zMax = hi;
    const iv = niceStep(Math.max(0.25, (hi - lo) / 16));
    s.contourIv = iv;
    if (three.current.tMat) three.current.tMat.uniforms.uContour.value = iv;
    if (sk) {
      const sp = sk.attributes.position.array, map = sk.userData.map;
      for (let k = 0; k < map.length; k++) sp[k * 2 * 3 + 1] = s.z[map[k]];
      sk.attributes.position.needsUpdate = true;
      sk.computeBoundingSphere();
    }
  }
  function refreshTerrainStatic() {
    const s = simRef.current, g = three.current.tGeo;
    if (!s || !g) return;
    const c = g.attributes.aCol.array, ao = g.attributes.aAO.array;
    for (let a = 0; a < N * N; a++) {
      const col = LAND[s.land[a]].col;
      c[a * 3] = col[0]; c[a * 3 + 1] = col[1]; c[a * 3 + 2] = col[2];
      ao[a] = s.ao[a];
    }
    g.attributes.aCol.needsUpdate = true;
    g.attributes.aAO.needsUpdate = true;
  }

  /* --------------------------------------------------------------- chart */
  function drawChart() {
    const cv = chartRef.current;
    if (!cv) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = cv.clientWidth, h = cv.clientHeight;
    if (!w || !h) return;
    if (cv.width !== w * dpr || cv.height !== h * dpr) { cv.width = w * dpr; cv.height = h * dpr; }
    const g = cv.getContext("2d");
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);
    g.fillStyle = T.panel;
    g.fillRect(0, 0, w, h);

    const list = samples.current.list;
    const padL = 44, padR = 48;
    const split = Math.round(h * 0.42);
    g.strokeStyle = T.ruleSoft;
    g.lineWidth = 1;
    g.beginPath(); g.moveTo(padL, split + 0.5); g.lineTo(w - padR, split + 0.5); g.stroke();

    if (list.length < 2) {
      g.textAlign = "center";
      g.fillStyle = T.dim;
      g.font = `11px ${SANS}`;
      g.fillText("Run storm to record the rainfall and the outflow it produces.", w / 2, h / 2 + 4);
      return;
    }

    const tMax = Math.max(list[list.length - 1].t, 60);
    let rMax = 1, qMax = 0.05;
    for (const s of list) { if (s.r > rMax) rMax = s.r; if (s.q > qMax) qMax = s.q; }
    const X = (t) => padL + (t / tMax) * (w - padL - padR);

    g.fillStyle = "rgba(79,195,217,0.55)";
    const bw = Math.max(1, (w - padL - padR) / list.length - 0.4);
    for (const s of list) {
      const bh = (s.r / rMax) * (split - 14);
      if (bh > 0.4) g.fillRect(X(s.t) - bw / 2, 0, bw, bh);
    }

    g.beginPath();
    g.moveTo(X(list[0].t), h - 14);
    for (const s of list) g.lineTo(X(s.t), h - 14 - (s.q / qMax) * (h - split - 20));
    g.lineTo(X(list[list.length - 1].t), h - 14);
    g.closePath();
    g.fillStyle = "rgba(232,133,58,0.16)";
    g.fill();
    g.beginPath();
    list.forEach((s, i) => {
      const x = X(s.t), y = h - 14 - (s.q / qMax) * (h - split - 20);
      i ? g.lineTo(x, y) : g.moveTo(x, y);
    });
    g.strokeStyle = T.signal;
    g.lineWidth = 1.4;
    g.stroke();

    const px = X(list[list.length - 1].t);
    g.strokeStyle = "rgba(226,234,237,0.35)";
    g.lineWidth = 1;
    g.beginPath(); g.moveTo(px + 0.5, 0); g.lineTo(px + 0.5, h - 12); g.stroke();

    g.font = `9px ${MONO}`;
    g.textAlign = "right";
    g.fillStyle = T.water; g.fillText(rMax.toFixed(0), padL - 6, 11);
    g.fillStyle = T.dim; g.fillText("mm/hr", padL - 6, 22);
    g.fillStyle = T.signal; g.fillText(qMax.toFixed(1), padL - 6, split + 14);
    g.fillStyle = T.dim; g.fillText("m³/s", padL - 6, split + 25);
    g.textAlign = "left"; g.fillText("0", padL, h - 3);
    g.textAlign = "right"; g.fillText(clock(tMax), w - padR, h - 3);
  }

  useEffect(() => {
    if (!selUnit) { setUnitRead(null); return; }
    const t = setInterval(() => {
      const r = unitApi.current.read && unitApi.current.read(selUnit);
      if (!r) { setUnitRead(null); return; }
      const { u, pr, br } = r;
      setUnitRead({
        kind: u.kind, name: u.name, L: pr.L, A: pr.A, Q: pr.Q, T: pr.T, P: pr.P,
        ws: pr.ws, V: pr.V, R: pr.R, D: pr.D, Fr: pr.Fr, K: pr.K, nMean: pr.nMean,
        bedMin: pr.bedMin, dmax: pr.dmax, wet: pr.wet,
        soffit: u.soffit, deck: u.deck, piers: u.piers, span: u.span, pierW: u.pierW, br,
      });
      drawSection(pr, u);
    }, 220);
    return () => clearInterval(t);
    // eslint-disable-next-line
  }, [selUnit]);

  function drawSection(pr, u) {
    const cv = secCanvas.current;
    if (!cv) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = cv.clientWidth, h = cv.clientHeight;
    if (!w || !h) return;
    if (cv.width !== w * dpr || cv.height !== h * dpr) { cv.width = w * dpr; cv.height = h * dpr; }
    const g = cv.getContext("2d");
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);
    g.fillStyle = T.panel2;
    g.fillRect(0, 0, w, h);
    const padL = 34, padR = 8, padT = 10, padB = 16;
    let lo = Infinity, hi = -Infinity;
    for (let k = 0; k < SEC_NODES; k++) {
      const zb = pr.zb[k], top = zb + pr.d[k];
      if (zb < lo) lo = zb; if (top > hi) hi = top;
      if (u.kind === "interp") { const za = pr.zbAssumed[k]; if (za < lo) lo = za; if (za > hi) hi = za; }
    }
    if (u.kind === "bridge") { hi = Math.max(hi, u.soffit + u.deck + 0.4); }
    if (!(hi > lo)) { hi = lo + 1; }
    const pad = (hi - lo) * 0.12 + 0.05;
    lo -= pad; hi += pad;
    const X = (i) => padL + (pr.s[i] / (pr.L || 1)) * (w - padL - padR);
    const Y = (v) => padT + (1 - (v - lo) / (hi - lo)) * (h - padT - padB);

    /* water body */
    if (pr.wet > 0.01) {
      g.beginPath();
      let started = false;
      for (let k = 0; k < SEC_NODES; k++) {
        const yTop = Y(pr.zb[k] + pr.d[k]);
        if (!started) { g.moveTo(X(k), yTop); started = true; } else g.lineTo(X(k), yTop);
      }
      for (let k = SEC_NODES - 1; k >= 0; k--) g.lineTo(X(k), Y(pr.zb[k]));
      g.closePath();
      g.fillStyle = "rgba(79,195,217,0.28)";
      g.fill();
      if (isFinite(pr.ws)) {
        g.strokeStyle = T.water; g.lineWidth = 1.2;
        g.beginPath(); g.moveTo(padL, Y(pr.ws)); g.lineTo(w - padR, Y(pr.ws)); g.stroke();
      }
    }
    /* what a 1D interpolate would assume */
    if (u.kind === "interp") {
      g.setLineDash([3, 3]);
      g.strokeStyle = T.buff; g.lineWidth = 1.2;
      g.beginPath();
      for (let k = 0; k < SEC_NODES; k++) { const x = X(k), y = Y(pr.zbAssumed[k]); k ? g.lineTo(x, y) : g.moveTo(x, y); }
      g.stroke();
      g.setLineDash([]);
    }
    /* ground */
    g.strokeStyle = T.ink; g.lineWidth = 1.4;
    g.beginPath();
    for (let k = 0; k < SEC_NODES; k++) { const x = X(k), y = Y(pr.zb[k]); k ? g.lineTo(x, y) : g.moveTo(x, y); }
    g.stroke();
    /* panel markers */
    g.strokeStyle = "rgba(226,234,237,0.4)"; g.lineWidth = 1;
    for (let k = 0; k < SEC_NODES; k += 8) {
      g.beginPath(); g.moveTo(X(k), Y(pr.zb[k])); g.lineTo(X(k), Y(pr.zb[k]) - 5); g.stroke();
    }
    /* bridge deck and soffit */
    if (u.kind === "bridge") {
      g.fillStyle = "rgba(232,133,58,0.30)";
      g.fillRect(padL, Y(u.soffit + u.deck), w - padL - padR, Math.max(2, Y(u.soffit) - Y(u.soffit + u.deck)));
      g.strokeStyle = T.signal; g.lineWidth = 1.2;
      g.beginPath(); g.moveTo(padL, Y(u.soffit)); g.lineTo(w - padR, Y(u.soffit)); g.stroke();
      g.font = `8px ${MONO}`; g.fillStyle = T.signal; g.textAlign = "left";
      g.fillText("soffit", padL + 3, Y(u.soffit) - 3);
    }
    /* axis */
    g.font = `8.5px ${MONO}`; g.fillStyle = T.dim; g.textAlign = "right";
    g.fillText(hi.toFixed(1), padL - 5, padT + 7);
    g.fillText(lo.toFixed(1), padL - 5, h - padB + 2);
    g.textAlign = "left";
    g.fillText("0", padL, h - 3);
    g.textAlign = "right";
    g.fillText(pr.L.toFixed(0) + " m", w - padR, h - 3);
  }

  useEffect(() => {
    const f = () => { setNarrow(window.innerWidth < 940); drawChart(); };
    f();
    window.addEventListener("resize", f);
    return () => window.removeEventListener("resize", f);
  }, []);

  /* --------------------------------------------------------------- rails */
  const railStyle = (side) => ({
    width: 292, background: T.panel,
    borderRight: side === "left" ? `1px solid ${T.rule}` : undefined,
    borderLeft: side === "right" ? `1px solid ${T.rule}` : undefined,
    overflowY: "auto", flexShrink: 0, position: "relative", zIndex: 20,
    ...(narrow ? { position: "absolute", top: 0, bottom: 0, [side]: 0, zIndex: 20, boxShadow: "0 0 40px rgba(0,0,0,0.55)" } : {}),
  });
  const balTone = Math.abs(ro.err) < 1 ? T.good : Math.abs(ro.err) < 5 ? T.buff : T.bad;

  const LeftRail = (
    <div style={railStyle("left")} className="sh-scroll">
      <div style={{ padding: "14px 14px 4px" }}>
        <Eyebrow style={{ color: T.signal }}>Sandbox hydraulics</Eyebrow>
        <div style={{ font: `500 15px/1.25 ${SANS}`, color: T.ink, letterSpacing: "-0.01em", marginTop: 6 }}>
          Sculpt ground. Set the surface. Watch the rain find its way out.
        </div>
        <button className="sh-btn" onClick={() => (lsn.on ? setLsn((L) => ({ ...L, on: false })) : startLesson(0))}
          style={{ ...btn(false), width: "100%", marginTop: 10, borderColor: T.signal, color: lsn.on ? T.ink : T.signal, background: lsn.on ? T.panel2 : "transparent" }}>
          {lsn.on ? "Leave the lessons" : "Start the lessons"}
        </button>
        <button className="sh-btn" onClick={() => setShowProv(true)}
          style={{ ...btn(false), width: "100%", marginTop: 6, borderColor: T.buff, color: T.buff }}>
          Where these numbers come from
        </button>
      </div>

      <Panel title="Scene" note={`${SIZE} × ${SIZE} m · ${N}²`}>
        <div style={{ font: `400 9.5px/1 ${SANS}`, color: T.dim, marginBottom: 5, letterSpacing: "0.09em", textTransform: "uppercase" }}>Ready to run</div>
        <Seg items={SCENES.filter((s) => s.group === "ready").map((s) => ({ value: s.id, label: s.name }))}
          value={cfg.scene} onChange={applyScene} cols={4} />
        <div style={{ height: 9 }} />
        <div style={{ font: `400 9.5px/1 ${SANS}`, color: T.dim, marginBottom: 5, letterSpacing: "0.09em", textTransform: "uppercase" }}>Sandbox</div>
        <Seg items={SCENES.filter((s) => s.group === "sandbox").map((s) => ({ value: s.id, label: s.name }))}
          value={cfg.scene} onChange={applyScene} cols={4} />
        <div style={{ marginTop: 11, padding: "9px 10px", background: T.panel2, border: `1px solid ${T.rule}`, borderRadius: 2 }}>
          <div style={{ font: `500 11.5px/1.3 ${SANS}`, color: T.ink, marginBottom: 4 }}>{activeScene.title}</div>
          <div style={{ font: `400 10px/1.5 ${SANS}`, color: T.muted }}>{activeScene.blurb}</div>
        </div>
      </Panel>

      <Panel title="Sculpt">
        <Seg items={TOOLS.map((t) => ({ value: t.id, label: t.label }))} value={cfg.tool}
          onChange={(v) => set({ tool: v })} cols={3} />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginTop: 8 }}>
          <button className="sh-btn" onClick={() => historyApi.current.undo && historyApi.current.undo()}
            disabled={!histInfo.canUndo} title="Undo (Ctrl/Cmd+Z)"
            style={{ ...btn(false), padding: "7px 6px", opacity: histInfo.canUndo ? 1 : 0.4, cursor: histInfo.canUndo ? "pointer" : "default" }}>
            Undo
          </button>
          <button className="sh-btn" onClick={() => historyApi.current.redo && historyApi.current.redo()}
            disabled={!histInfo.canRedo} title="Redo (Ctrl/Cmd+Shift+Z)"
            style={{ ...btn(false), padding: "7px 6px", opacity: histInfo.canRedo ? 1 : 0.4, cursor: histInfo.canRedo ? "pointer" : "default" }}>
            Redo
          </button>
        </div>
        <div style={{ height: 12 }} />
        <Slider label="Brush radius" value={cfg.brush} min={4} max={60} step={1} unit="m" onChange={(v) => set({ brush: v })} />
        <Slider label="Brush strength" value={cfg.strength} min={0.1} max={1.5} step={0.05} onChange={(v) => set({ strength: v })} fmt={f2} />
        <Slider label="Stamp level" value={cfg.stampZ} min={-10} max={40} step={0.25} unit="m" onChange={(v) => set({ stampZ: v })} fmt={f2} />
        <button className="sh-btn" onClick={() => set({ capOn: !cfg.capOn })} style={{ ...toggleBtn(cfg.capOn), width: "100%", marginBottom: 8 }}>
          {cfg.capOn ? "Raise and lower stop at stamp level" : "Raise and lower are unlimited"}
        </button>
        <div style={{ font: `400 9.5px/1.45 ${SANS}`, color: T.dim, marginBottom: 4 }}>
          Stamp flattens whatever you drag over to the stamp level, so you can build plateaus,
          embankments and benches at a known height. Pick level takes the height from the ground
          you click and switches to Stamp.
        </div>
      </Panel>

      <Panel title="Surface" note="Manning's n · loss rate">
        <div style={{ display: "grid", gap: 3 }}>
          {LAND.map((L, i) => {
            const on = i === cfg.landIdx;
            return (
              <button key={L.name} className="sh-btn" onClick={() => set({ landIdx: i, tool: "paint" })}
                style={{
                  display: "flex", alignItems: "center", gap: 8, padding: "6px 8px",
                  background: on ? T.panel2 : "transparent", border: `1px solid ${on ? T.signal : T.rule}`,
                  borderRadius: 2, cursor: "pointer", textAlign: "left",
                }}>
                <span style={{ width: 11, height: 11, borderRadius: 1, flexShrink: 0,
                  background: `rgb(${L.col.map((c) => Math.round(c * 255 * 1.3)).join(",")})` }} />
                <span style={{ font: `400 11px/1 ${SANS}`, color: T.ink, flex: 1 }}>{L.name}</span>
                <span style={{ font: `400 10px/1 ${MONO}`, color: T.muted }}>n {L.n.toFixed(3)}</span>
                <span style={{ font: `400 10px/1 ${MONO}`, color: T.dim, width: 44, textAlign: "right" }}>{L.inf} mm/h</span>
              </button>
            );
          })}
        </div>
        <div style={{ height: 12 }} />
        <Slider label="Roughness multiplier" value={cfg.roughScale} min={0.4} max={2.5} step={0.05} unit="× n" onChange={(v) => set({ roughScale: v })} fmt={f2} />
        <Slider label="Infiltration multiplier" value={cfg.infScale} min={0} max={3} step={0.05} unit="× loss" onChange={(v) => set({ infScale: v })} fmt={f2} />
      </Panel>

      <Panel title="Floats and flow" note="tracers">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 3, marginBottom: 8 }}>
          <button className="sh-btn" onClick={() => { const n = seedRef.current && seedRef.current(24); if (!n) setDropMsg("No water yet — run the storm first."); else setDropMsg(n + " dropped on the water."); }}
            style={{ ...btn(false), padding: "7px 6px" }}>Scatter 24</button>
          <button className="sh-btn" onClick={() => { clearRef.current && clearRef.current(); setDropMsg(""); }}
            style={{ ...btn(false), padding: "7px 6px" }}>Clear floats</button>
        </div>
        <Seg items={[{ value: "duck", label: "Ducks" }, { value: "ball", label: "Balls" }]} value={cfg.floatShape} onChange={(v) => set({ floatShape: v })} />
        <div style={{ height: 10 }} />
        <Slider label="Float size on screen" value={cfg.floatSize} min={1.5} max={8} step={0.25} onChange={(v) => set({ floatSize: v })} fmt={f1} />
        <div style={{ font: `400 9.5px/1.45 ${SANS}`, color: T.dim, marginBottom: 10 }}>
          Drawn far larger than life so they read at this scale. They drift with the flow on a
          short drag lag and go dim when they strand in water under 15 mm.
          {dropMsg ? " " + dropMsg : ""}
        </div>
        <button className="sh-btn" onClick={() => set({ flowLines: !cfg.flowLines })} style={{ ...toggleBtn(cfg.flowLines), width: "100%" }}>
          {cfg.flowLines ? "Flow lines on" : "Flow lines off"}
        </button>
        {cfg.flowLines && (
          <div style={{ marginTop: 10 }}>
            <Slider label="Colour ramp tops out at" value={cfg.vScale} min={0.2} max={4} step={0.1} unit="m/s" onChange={(v) => set({ vScale: v })} fmt={f1} />
          </div>
        )}
      </Panel>

      <Panel title="Scenery">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 3 }}>
          <button className="sh-btn" onClick={() => set({ veg: !cfg.veg })} style={toggleBtn(cfg.veg)}>
            {cfg.veg ? "Planting on" : "Planting off"}
          </button>
          <button className="sh-btn" onClick={() => three.current.rebuildVeg && three.current.rebuildVeg(700)} style={btn(false)}>
            Replant
          </button>
        </div>
        <div style={{ font: `400 9.5px/1.45 ${SANS}`, color: T.dim, marginTop: 8 }}>
          Scattered by land cover, so scrub gets dense, pasture gets sparse and paved gets nothing.
          Replant after sculpting to settle it back onto the new ground.
        </div>
      </Panel>

      <Panel title="Design rainfall" note="illustrative DDF">
        <div style={{ font: `400 10.5px/1 ${SANS}`, color: T.muted, marginBottom: 6 }}>Annual exceedance probability</div>
        <Seg items={AEPS.map((a, i) => ({ value: i, label: a.label }))} value={cfg.aep} onChange={(v) => set({ aep: v })} cols={4} />
        <div style={{ font: `400 9.5px/1 ${MONO}`, color: T.dim, margin: "6px 0 10px" }}>{AEPS[cfg.aep].ret} year event</div>
        <div style={{ font: `400 10.5px/1 ${SANS}`, color: T.muted, marginBottom: 6 }}>Storm duration</div>
        <Seg items={DURATIONS.map((d, i) => ({ value: i, label: d < 1 ? `${d * 60}m` : `${d}h` }))} value={cfg.dur} onChange={(v) => set({ dur: v })} cols={4} />
        <div style={{ height: 12 }} />
        <Seg items={[{ value: false, label: "Uniform" }, { value: true, label: "Centre-peaked" }]} value={cfg.peaked} onChange={(v) => set({ peaked: v })} />
        <div style={{ height: 12 }} />
        <Slider label="Climate change uplift" value={cfg.cc} min={0} max={50} step={5} unit="%" onChange={(v) => set({ cc: v })} />
        <div style={{ background: T.panel2, border: `1px solid ${T.rule}`, borderRadius: 2, padding: "9px 10px" }}>
          <Stat label="Total depth" value={f1(storm.depth)} unit="mm" tone={T.water} />
          <Stat label="Mean intensity" value={f1(storm.mean)} unit="mm/h" />
          <Stat label="Peak intensity" value={f1(storm.peak)} unit="mm/h" />
          <div style={{ font: `400 9.5px/1.45 ${SANS}`, color: T.dim, marginTop: 6 }}>
            Depths come from a placeholder curve with a realistic shape, not FEH. Swap in real DDF
            tables before anyone quotes a number from this.
          </div>
        </div>
      </Panel>

      <Panel title="Water in and out">
        <div style={{ font: `400 10.5px/1 ${SANS}`, color: T.muted, marginBottom: 6 }}>Edges</div>
        <Seg items={[{ value: true, label: "Open — water leaves" }, { value: false, label: "Walled" }]} value={cfg.openB} onChange={(v) => set({ openB: v })} />

        <div style={{ height: 14 }} />
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
          <span style={{ font: `400 10.5px/1 ${SANS}`, color: T.muted, flex: 1 }}>Upstream inflow</span>
          <button className="sh-btn" onClick={() => set({ inflowOn: !cfg.inflowOn })} style={toggleBtn(cfg.inflowOn)}>
            {cfg.inflowOn ? "On" : "Off"}
          </button>
        </div>
        {cfg.inflowOn && (
          <>
            <Slider label="Peak discharge" value={cfg.inflowQ} min={5} max={500} step={5} unit="m³/s" onChange={(v) => set({ inflowQ: v })} />
            <Seg items={[{ value: false, label: "Steady" }, { value: true, label: "Flood wave" }]} value={cfg.inflowWave} onChange={(v) => set({ inflowWave: v })} />
            <div style={{ font: `400 9.5px/1.45 ${SANS}`, color: T.dim, marginTop: 7 }}>
              Enters through the channel at the northern edge. A flood wave rises and falls around the storm, arriving a little after the rain.
            </div>
          </>
        )}

        <div style={{ height: 14 }} />
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
          <span style={{ font: `400 10.5px/1 ${SANS}`, color: T.muted, flex: 1 }}>Downstream water level</span>
          <button className="sh-btn" onClick={() => set({ stageOn: !cfg.stageOn })} style={toggleBtn(cfg.stageOn)}>
            {cfg.stageOn ? "On" : "Off"}
          </button>
        </div>
        {cfg.stageOn && (
          <>
            <Slider label="Held at" value={cfg.stageLevel} min={-2} max={7} step={0.1} unit="m AOD" onChange={(v) => set({ stageLevel: v })} fmt={f1} />
            <div style={{ font: `400 9.5px/1.45 ${SANS}`, color: T.dim, marginTop: -4 }}>
              The southern edge is held at this level. Use it as a tailwater for a river, or wind it up for a coastal surge.
            </div>
          </>
        )}
      </Panel>
    </div>
  );

  const RightRail = (
    <div style={railStyle("right")} className="sh-scroll">
      <Panel title="View">
        <Seg items={MODES} value={cfg.mode} onChange={(v) => set({ mode: v })} cols={3} />
        <div style={{ height: 10 }} />
        <div style={{ font: `400 10px/1.5 ${SANS}`, color: T.dim }}>
          {cfg.mode === 0 && "Light refracts through the water and is absorbed with depth, so shallow flow shows the ground beneath it."}
          {cfg.mode === 1 && "Water surface shaded by depth, 0 to 0.8 m."}
          {cfg.mode === 2 && "Depth-averaged speed, 0 to 2 m/s."}
          {cfg.mode === 3 && "Hazard rating d × (v + 0.5): green low, amber significant, red extreme."}
          {cfg.mode === 4 && "The deepest water each cell has seen — the flood outline you would map."}
        </div>
        <div style={{ height: 12 }} />
        <Slider label="Water shown at" value={cfg.wExag} min={1} max={20} step={1} unit="× depth" onChange={(v) => set({ wExag: v })} />
        <div style={{ font: `400 9.5px/1.45 ${SANS}`, color: T.dim, marginTop: -4, marginBottom: 11 }}>
          Height only, so thin sheet flow stays visible. The numbers and colours are the real depths.
        </div>
        <Slider label="Surface smoothing" value={cfg.smooth} min={0} max={4} step={1}
          unit={cfg.smooth === 0 ? "raw cells" : "passes"} onChange={(v) => set({ smooth: v })} />
        <div style={{ font: `400 9.5px/1.45 ${SANS}`, color: T.dim, marginTop: -4, marginBottom: 11 }}>
          Drawing only. The solver, the gauges and the hydrograph all use the raw cell values.
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 3 }}>
          <button className="sh-btn" onClick={() => set({ contours: !cfg.contours })} style={toggleBtn(cfg.contours)}>
            {cfg.contours ? "Contours on" : "Contours off"}
          </button>
          <button className="sh-btn" onClick={() => set({ showRain: !cfg.showRain })} style={toggleBtn(cfg.showRain)}>
            {cfg.showRain ? "Rainfall on" : "Rainfall off"}
          </button>
          <button className="sh-btn" onClick={() => set({ levels: !cfg.levels })} style={toggleBtn(cfg.levels)}>
            {cfg.levels ? "Levels on" : "Levels off"}
          </button>
        </div>
      </Panel>

      {cfg.levels && (
        <Panel title="Section at edge" note="true elevations">
          <Stat label="Ground" value={f2(lev.ground)} unit="m" tone={T.buff} />
          <Stat label="Water surface" value={lev.d > 0.0005 ? f2(lev.stage) : "—"} unit="m" tone={T.water} />
          <Stat label="Highest surface" value={lev.dmax > 0.0005 ? f2(lev.max) : "—"} unit="m" tone={T.signal} />
          <div style={{ marginTop: 6, paddingTop: 7, borderTop: `1px solid ${T.ruleSoft}` }}>
            <Stat label="Depth now" value={f2(lev.d)} unit="m" />
            <Stat label="Depth at peak" value={f2(lev.dmax)} unit="m" />
          </div>
          <div style={{ font: `400 9.5px/1.45 ${SANS}`, color: T.dim, marginTop: 6 }}>
            Datum lines sit at true elevation. Staff ticks are 0.25 m, long ticks every metre.
            {cfg.wExag > 1 && ` The drawn water is at ×${cfg.wExag} vertical exaggeration, so it rides above the stage line.`}
          </div>
        </Panel>
      )}

      <Panel title="Tilt-shift" note={cfg.tilt < 0.01 ? "off" : "on"}>
        <Slider label="Blur strength" value={cfg.tilt} min={0} max={1} step={0.05} onChange={(v) => set({ tilt: v })} fmt={f2} />
        {cfg.tilt > 0.01 && (
          <>
            <Slider label="Focus line" value={cfg.tiltFocus} min={0.1} max={0.9} step={0.02} onChange={(v) => set({ tiltFocus: v })} fmt={f2} />
            <Slider label="Sharp band" value={cfg.tiltBand} min={0.08} max={0.9} step={0.02} onChange={(v) => set({ tiltBand: v })} fmt={f2} />
          </>
        )}
        <div style={{ font: `400 9.5px/1.45 ${SANS}`, color: T.dim }}>
          Blurs above and below a sharp horizontal band, which reads as a physical model on a table.
          Set the strength to zero to turn the whole pass off.
        </div>
      </Panel>

      <Panel title="1D network units" note={units.length + " / " + MAX_UNITS}>
        <div style={{ font: `400 10px/1.5 ${SANS}`, color: T.dim, marginBottom: 9 }}>
          Pick the Section, Bridge or Tunnel tool and drag a line across the channel. A section
          integrates the flow crossing it, exactly as a 1D unit does, but from real 2D ground. A
          tunnel carries water between its two portals, straight through the ridge or dam between.
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 3, marginBottom: 8 }}>
          <button className="sh-btn" onClick={() => { const n = unitApi.current.addInterp && unitApi.current.addInterp(); setDropMsg(n ? n + " interpolates added." : "Place two sections first."); }}
            style={{ ...btn(false), padding: "7px 6px" }}>Interpolate</button>
          <button className="sh-btn" onClick={() => { unitApi.current.clear && unitApi.current.clear(); setSelUnit(null); }}
            style={{ ...btn(false), padding: "7px 6px" }}>Clear units</button>
        </div>
        {units.length === 0 ? (
          <div style={{ font: `400 10px/1.5 ${MONO}`, color: T.dim }}>No units placed.</div>
        ) : (
          <div style={{ display: "grid", gap: 2 }}>
            {units.map((u) => {
              const on = u.id === selUnit;
              const col = u.kind === "bridge" ? T.signal : u.kind === "interp" ? T.buff : u.kind === "tunnel" ? "#C077E8" : T.water;
              return (
                <div key={u.id} style={{ display: "flex", gap: 3 }}>
                  <button className="sh-btn" onClick={() => setSelUnit(on ? null : u.id)}
                    style={{
                      flex: 1, display: "flex", alignItems: "center", gap: 7, padding: "6px 8px",
                      background: on ? T.panel2 : "transparent", border: `1px solid ${on ? col : T.rule}`,
                      borderRadius: 2, cursor: "pointer", textAlign: "left",
                    }}>
                    <span style={{ width: 8, height: 8, borderRadius: 1, background: col, flexShrink: 0 }} />
                    <span style={{ font: `400 10.5px/1 ${SANS}`, color: T.ink }}>{u.name}</span>
                  </button>
                  <button className="sh-btn" onClick={() => { unitApi.current.remove && unitApi.current.remove(u.id); if (selUnit === u.id) setSelUnit(null); }}
                    style={{ ...btn(false), padding: "6px 8px", font: `500 11px/1 ${MONO}` }}>&times;</button>
                </div>
              );
            })}
          </div>
        )}
        <div style={{ height: 10 }} />
        <button className="sh-btn" onClick={() => set({ units: !cfg.units })} style={{ ...toggleBtn(cfg.units), width: "100%" }}>
          {cfg.units ? "Units shown" : "Units hidden"}
        </button>
      </Panel>

      {selUnit && unitRead && (
        <Panel title={unitRead.kind === "bridge" ? "Bridge unit" : unitRead.kind === "interp" ? "Interpolate unit" : unitRead.kind === "tunnel" ? "Tunnel" : "Cross-section unit"} note={unitRead.name}>
          <canvas ref={secCanvas} style={{ display: "block", width: "100%", height: 116, border: `1px solid ${T.rule}`, borderRadius: 2 }} />
          {unitRead.kind === "interp" && (
            <div style={{ font: `400 9.5px/1.45 ${SANS}`, color: T.buff, marginTop: 7 }}>
              Dashed line is the bed a 1D interpolate assumes by blending its two neighbours. Solid
              line is the ground actually there. The gap between them is interpolation error.
            </div>
          )}
          {unitRead.kind === "tunnel" && (
            <div style={{ font: `400 9.5px/1.45 ${SANS}`, color: "#C077E8", marginTop: 7 }}>
              The conduit carries water between the two outlined portals, letting it pass straight
              through a ridge, embankment or dam that the terrain itself would hold back. Flow runs
              from the higher water level to the lower at an orifice-like speed.
            </div>
          )}
          <div style={{ marginTop: 10 }}>
            <Stat label="Flow through section" value={f2(unitRead.Q)} unit="m3/s" tone={T.signal} />
            <Stat label="Water level" value={isFinite(unitRead.ws) ? f2(unitRead.ws) : "dry"} unit="m" tone={T.water} />
            <Stat label="Bed level (invert)" value={f2(unitRead.bedMin)} unit="m" tone={T.buff} />
            <Stat label="Flow area A" value={f2(unitRead.A)} unit="m2" />
            <Stat label="Top width T" value={f1(unitRead.T)} unit="m" />
            <Stat label="Wetted perimeter P" value={f1(unitRead.P)} unit="m" />
            <Stat label="Hydraulic radius R" value={f2(unitRead.R)} unit="m" />
            <Stat label="Mean velocity V" value={f2(unitRead.V)} unit="m/s" />
            <Stat label="Froude number" value={f2(unitRead.Fr)} unit="" tone={unitRead.Fr > 1 ? T.bad : T.ink} />
            <Stat label="Conveyance K" value={f0(unitRead.K)} unit="" />
            <Stat label="Section mean n" value={unitRead.nMean.toFixed(3)} unit="" />
          </div>
          <div style={{ font: `400 9.5px/1.45 ${SANS}`, color: T.dim, marginTop: 6, paddingTop: 7, borderTop: `1px solid ${T.ruleSoft}` }}>
            A, T and P integrated across {SEC_NODES} nodes. R = A/P, Fr = V over root gD with D = A/T,
            K = A R^(2/3) / n. Two sections on the same channel only carry the same Q at steady state; while storage is filling or draining they will not agree, which is the thing a 1D model has to assume away.{unitRead.Fr > 1 ? " Fr above 1 is supercritical, which this solver handles poorly." : ""}
          </div>

          {unitRead.kind === "bridge" && unitRead.br && (
            <div style={{ marginTop: 11, paddingTop: 10, borderTop: `1px solid ${T.rule}` }}>
              <Eyebrow style={{ marginBottom: 8 }}>Structure</Eyebrow>
              <Slider label="Soffit level" value={unitRead.soffit} min={unitRead.bedMin} max={unitRead.bedMin + 12} step={0.1} unit="m"
                onChange={(v) => unitApi.current.editBridge(selUnit, { soffit: v })} fmt={f2} />
              <Slider label="Deck thickness" value={unitRead.deck} min={0.2} max={2.5} step={0.1} unit="m"
                onChange={(v) => unitApi.current.editBridge(selUnit, { deck: v })} fmt={f1} />
              <Slider label="Deck width along flow" value={unitRead.span} min={3} max={30} step={1} unit="m"
                onChange={(v) => unitApi.current.editBridge(selUnit, { span: v })} />
              <Slider label="Piers in the channel" value={unitRead.piers} min={0} max={5} step={1} unit=""
                onChange={(v) => unitApi.current.editBridge(selUnit, { piers: v })} />
              <Slider label="Pier width" value={unitRead.pierW} min={0.8} max={8} step={0.2} unit="m"
                onChange={(v) => unitApi.current.editBridge(selUnit, { pierW: v })} fmt={f1} />
              <div style={{ marginTop: 4 }}>
                <Stat label="Opening area" value={f2(unitRead.br.Ab)} unit="m2" />
                <Stat label="Blockage of upstream area" value={f1(unitRead.br.blockage * 100)} unit="%" tone={unitRead.br.blockage > 0.4 ? T.bad : T.ink} />
                <Stat label="Soffit clearance" value={f2(unitRead.br.clearance)} unit="m" tone={unitRead.br.drowned ? T.bad : T.good} />
                <Stat label="Contraction coeff Kc" value={f2(unitRead.br.Kc)} unit="" />
                <Stat label="Expansion coeff Ke" value={f2(unitRead.br.Ke)} unit="" />
                <Stat label="Contraction loss" value={f2(unitRead.br.dHc)} unit="m" tone={T.signal} />
                <Stat label="Expansion loss" value={f2(unitRead.br.dHe)} unit="m" tone={T.signal} />
                <Stat label="Total face loss" value={f2(unitRead.br.dHc + unitRead.br.dHe)} unit="m" tone={T.signal} />
              </div>
              <div style={{ font: `400 9.5px/1.5 ${SANS}`, color: T.bad, marginTop: 7 }}>
                Read this carefully. The piers are real: they are pushed into the bed and the 2D
                solver routes around them. The deck is not. Nothing here models pressure or orifice
                flow once the soffit drowns, and the losses above are what a 1D bridge unit would
                apply at these faces, computed from geometry and reported for comparison. They are
                not fed back into the water you can see.
              </div>
              <div style={{ font: `400 9.5px/1.5 ${SANS}`, color: T.dim, marginTop: 5 }}>
                Kc and Ke are scaled off the blockage ratio between 0.10 to 0.50 and 0.30 to 1.00,
                which spans the usual published range. Losses are K times the velocity head
                difference across the face.
              </div>
            </div>
          )}

          {unitRead.kind === "tunnel" && (
            <div style={{ marginTop: 11, paddingTop: 10, borderTop: `1px solid ${T.rule}` }}>
              <Eyebrow style={{ marginBottom: 8 }}>Conduit</Eyebrow>
              <Slider label="Portal diameter" value={unitRead.u && unitRead.u.diam !== undefined ? unitRead.u.diam : 6} min={2} max={16} step={0.5} unit="m"
                onChange={(v) => unitApi.current.editTunnel(selUnit, { diam: v })} fmt={f1} />
              <div style={{ font: `400 9.5px/1.5 ${SANS}`, color: T.dim, marginTop: 5 }}>
                The conduit is real to the solver: each step it moves water from the higher portal to
                the lower one at an orifice speed. Place one portal in the water behind the ridge or
                dam and the other somewhere lower on the far side, and the stored depth will drive it.
              </div>
            </div>
          )}
        </Panel>
      )}

      <Panel title="Live gauges">
        <Stat label="Elapsed" value={clock(ro.t)} unit="" />
        <Stat label="Rain falling now" value={f1(ro.rain)} unit="mm/h" tone={T.water} />
        {cfg.inflowOn && <Stat label="Inflow now" value={f1(ro.inflowNow || 0)} unit="m³/s" tone={T.water} />}
        <Stat label="Deepest water" value={f2(ro.maxD)} unit="m" />
        <Stat label="Fastest flow" value={f2(ro.maxV)} unit="m/s" />
        <Stat label="Ground under water" value={f1(ro.wet * 100)} unit="%" />
        <Stat label="Leaving the domain" value={f2(ro.outQ)} unit="m³/s" tone={T.signal} />
      </Panel>

      <Panel title="Where the water went" note="m³">
        {ro.vol0 > 1 && <Stat label="There at the start" value={f0(ro.vol0)} unit="m³" />}
        <Stat label="Fell as rain" value={f0(ro.volRain)} unit="m³" tone={T.water} />
        {cfg.inflowOn && <Stat label="Came in upstream" value={f0(ro.volIn)} unit="m³" tone={T.water} />}
        {cfg.stageOn && (
          <Stat label={ro.volStage >= 0 ? "In over the downstream edge" : "Out over the downstream edge"}
            value={f0(Math.abs(ro.volStage))} unit="m³" tone={T.signal} />
        )}
        {ro.volAdd > 1 && <Stat label="Poured by hand" value={f0(ro.volAdd)} unit="m³" />}
        <Stat label="Soaked into the ground" value={f0(ro.inf)} unit="m³" />
        <Stat label="Ran off the edge" value={f0(ro.out)} unit="m³" tone={T.signal} />
        <Stat label="Still lying on the surface" value={f0(ro.storage)} unit="m³" />
        <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px solid ${T.ruleSoft}` }}>
          <Stat label="Mass balance error" value={f2(ro.err)} unit="%" tone={balTone} />
          <div style={{ font: `400 9.5px/1.45 ${SANS}`, color: T.dim }}>
            Everything in should equal everything out plus what is still on the ground. Drift past
            about 1% means the timestep is too coarse for how fast the water is moving.
          </div>
        </div>
      </Panel>
    </div>
  );

  return (
    <div className="sh-root" style={{
      position: "relative", width: "100%", display: "flex",
      background: T.chassis, color: T.ink, fontFamily: SANS, overflow: "hidden",
    }}>
      {glErr && (
        <div style={{
          position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center",
          padding: 32, background: T.chassis, textAlign: "center",
        }}>
          <div style={{ maxWidth: 520, lineHeight: 1.6, color: T.ink }}>
            <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>WebGL is not available here</div>
            <div style={{ fontSize: 13, color: T.muted }}>
              This sandbox needs a WebGL-capable browser to draw the terrain. Enable hardware
              acceleration in your browser settings (or try another browser), then reload the page.
            </div>
            <div style={{ fontSize: 11, color: T.dim, marginTop: 10, wordBreak: "break-word" }}>{glErr}</div>
          </div>
        </div>
      )}
      <style>{`
        .sh-root{height:100vh;height:100dvh;max-height:100dvh}
        .sh-scroll::-webkit-scrollbar{width:8px}
        .sh-scroll::-webkit-scrollbar-thumb{background:${T.rule};border-radius:4px}
        .sh-scroll::-webkit-scrollbar-track{background:transparent}
        .sh-btn:focus-visible{outline:2px solid ${T.signal};outline-offset:1px}
        .sh-range{-webkit-appearance:none;appearance:none;width:100%;height:2px;background:${T.rule};border-radius:2px;outline:none}
        .sh-range:focus-visible{outline:2px solid ${T.signal};outline-offset:4px}
        .sh-range::-webkit-slider-thumb{-webkit-appearance:none;width:12px;height:12px;border-radius:50%;background:${T.ink};cursor:pointer;border:2px solid ${T.chassis}}
        .sh-range::-moz-range-thumb{width:12px;height:12px;border-radius:50%;background:${T.ink};cursor:pointer;border:2px solid ${T.chassis}}
      `}</style>

      {(!narrow || openRail === "left") && LeftRail}

      <div style={{ flex: "1 1 0", display: "flex", flexDirection: "column", minWidth: 0, minHeight: 0 }}>
        <div style={{ flex: "1 1 0", position: "relative", minHeight: 0 }}>
          <div ref={mount} style={{ position: "absolute", inset: 0, overflow: "hidden" }} />

          {lsn.on && (() => {
            const les = LESSONS[lsn.idx];
            const pct = Math.round(lsn.prog * 100);
            return (
              <div style={{
                position: "absolute", top: 14, left: 14, width: 336, zIndex: 13,
                background: "rgba(20,31,39,0.94)", border: `1px solid ${lsn.passed ? T.good : T.rule}`,
                borderRadius: 3, boxShadow: "0 10px 34px rgba(0,0,0,0.5)", overflow: "hidden",
              }}>
                <div style={{ padding: "12px 14px 13px" }}>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                    <Eyebrow style={{ color: lsn.passed ? T.good : T.signal }}>
                      Lesson {lsn.idx + 1} of {LESSONS.length}
                    </Eyebrow>
                    <span style={{ marginLeft: "auto", font: `400 9.5px/1 ${MONO}`, color: T.dim }}>
                      {lsn.passed ? "passed" : les.kind === "compare" ? (lsn.base == null ? "baseline run" : "option run") : "in progress"}
                    </span>
                  </div>
                  <div style={{ font: `500 14px/1.3 ${SANS}`, color: T.ink, marginTop: 7, letterSpacing: "-0.01em" }}>{les.title}</div>
                  <div style={{ font: `400 11px/1.55 ${SANS}`, color: T.muted, marginTop: 6 }}>{les.brief}</div>
                  <div style={{ font: `400 11px/1.55 ${SANS}`, color: T.ink, marginTop: 9, paddingLeft: 9, borderLeft: `2px solid ${T.signal}` }}>{les.task}</div>
                </div>

                <div style={{ padding: "10px 14px 12px", borderTop: `1px solid ${T.ruleSoft}`, background: "rgba(0,0,0,0.16)" }}>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                    <span style={{ font: `400 10px/1.2 ${SANS}`, color: T.muted, flex: 1 }}>{les.label}</span>
                    <span style={{ font: `500 12px/1 ${MONO}`, color: lsn.passed ? T.good : T.ink, fontVariantNumeric: "tabular-nums" }}>
                      {les.metric === "tPeak" ? f1(lsn.value) : f2(lsn.value)}
                    </span>
                    {lsn.target > 0 && (
                      <span style={{ font: `400 10px/1 ${MONO}`, color: T.dim }}>/ {f2(lsn.target)} {les.unit}</span>
                    )}
                  </div>
                  <div style={{ height: 3, background: T.rule, borderRadius: 2, marginTop: 8, overflow: "hidden" }}>
                    <div style={{ width: pct + "%", height: "100%", background: lsn.passed ? T.good : T.signal, transition: "width 200ms linear" }} />
                  </div>
                  {lsn.sub && <div style={{ font: `400 9.5px/1.5 ${MONO}`, color: T.dim, marginTop: 7 }}>{lsn.sub}</div>}
                </div>

                {lsn.passed && (
                  <div style={{ padding: "12px 14px 13px", borderTop: `1px solid ${T.good}`, background: "rgba(95,191,143,0.08)" }}>
                    <Eyebrow style={{ color: T.good }}>What that showed</Eyebrow>
                    <div style={{ font: `400 11px/1.6 ${SANS}`, color: T.ink, marginTop: 7 }}>{les.debrief}</div>
                  </div>
                )}

                <div style={{ display: "flex", gap: 4, padding: "9px 14px 12px", borderTop: `1px solid ${T.ruleSoft}` }}>
                  <button className="sh-btn" disabled={lsn.idx === 0} onClick={() => startLesson(lsn.idx - 1)}
                    style={{ ...btn(false), opacity: lsn.idx === 0 ? 0.35 : 1, padding: "6px 9px" }}>Back</button>
                  <button className="sh-btn" onClick={() => setShowHint((v) => !v)} style={{ ...btn(showHint), padding: "6px 9px" }}>Hint</button>
                  <button className="sh-btn" onClick={() => startLesson(lsn.idx)} style={{ ...btn(false), padding: "6px 9px" }}>Restart</button>
                  <button className="sh-btn" disabled={lsn.idx === LESSONS.length - 1}
                    onClick={() => startLesson(lsn.idx + 1)}
                    style={{
                      ...btn(false), marginLeft: "auto", padding: "6px 11px",
                      background: lsn.passed ? T.signal : "transparent",
                      color: lsn.passed ? T.chassis : T.muted,
                      borderColor: lsn.passed ? T.signal : T.rule,
                      opacity: lsn.idx === LESSONS.length - 1 ? 0.35 : 1,
                    }}>Next</button>
                </div>
                {showHint && (
                  <div style={{ padding: "10px 14px 12px", borderTop: `1px solid ${T.ruleSoft}`, font: `400 10.5px/1.6 ${SANS}`, color: T.muted, background: "rgba(0,0,0,0.16)" }}>
                    {les.hint}
                  </div>
                )}
              </div>
            );
          })()}

          {/* datum labels, positioned by projecting the 3D level lines */}
          <div ref={viewportRef} style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden", zIndex: 11 }}>
            {cfg.levels && (
              <svg ref={(el) => (labelRefs.current.leaders = el)}
                style={{ position: "absolute", inset: 0, width: "100%", height: "100%", overflow: "visible" }}>
                <path data-k="ground" fill="none" stroke={T.buff} strokeWidth="1" opacity="0" />
                <path data-k="stage" fill="none" stroke={T.water} strokeWidth="1" opacity="0" />
                <path data-k="max" fill="none" stroke={T.signal} strokeWidth="1" strokeDasharray="3 2" opacity="0" />
              </svg>
            )}
            {cfg.levels && [
              ["ground", "Ground", T.buff, f2(lev.ground) + " m"],
              ["stage", "Water", T.water, f2(lev.stage) + " m"],
              ["max", "Max", T.signal, f2(lev.max) + " m"],
            ].map(([k, name, col, val]) => (
              <div key={k} ref={(el) => (labelRefs.current[k] = el)}
                style={{
                  position: "absolute", top: 0, left: 0, opacity: 0,
                  display: "flex", alignItems: "center", gap: 6,
                  padding: "3px 7px", whiteSpace: "nowrap",
                  background: "rgba(14,21,25,0.82)", border: `1px solid ${col}`,
                  borderRadius: 2, transition: "opacity 120ms linear",
                }}>
                <span style={{ font: `600 8.5px/1 ${SANS}`, letterSpacing: "0.13em", textTransform: "uppercase", color: col }}>{name}</span>
                <span style={{ font: `500 11px/1 ${MONO}`, color: T.ink, fontVariantNumeric: "tabular-nums" }}>{val}</span>
              </div>
            ))}
          </div>

          {/* transport, top centre */}
          <div style={{ position: "absolute", top: 14, left: 0, right: 0, display: "flex", justifyContent: "center", pointerEvents: "none", zIndex: 12 }}>
            <div style={{
              pointerEvents: "auto", display: "flex", alignItems: "stretch", gap: 6, padding: 6,
              background: "rgba(20,31,39,0.93)", border: `1px solid ${T.rule}`, borderRadius: 3,
              boxShadow: "0 8px 28px rgba(0,0,0,0.5)",
            }}>
              <button className="sh-btn" onClick={() => set({ playing: !cfg.playing })}
                style={{
                  font: `600 12px/1 ${SANS}`, padding: "9px 18px", minWidth: 104,
                  background: cfg.playing ? T.panel2 : T.signal, color: cfg.playing ? T.ink : T.chassis,
                  border: `1px solid ${cfg.playing ? T.rule : T.signal}`, borderRadius: 2, cursor: "pointer",
                }}>
                {cfg.playing ? "Pause" : "Run storm"}
              </button>
              <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", padding: "0 10px", minWidth: 124 }}>
                <span style={{ font: `500 14px/1.15 ${MONO}`, color: T.ink, fontVariantNumeric: "tabular-nums" }}>{clock(ro.t)}</span>
                <span style={{ font: `400 9px/1.3 ${SANS}`, color: T.dim, letterSpacing: "0.04em" }}>
                  {AEPS[cfg.aep].label} AEP · {durLabel} storm
                </span>
              </div>
              <button className="sh-btn" onClick={resetStorm}
                style={{
                  font: `500 11.5px/1 ${SANS}`, padding: "9px 14px", background: "transparent",
                  color: T.muted, border: `1px solid ${T.rule}`, borderRadius: 2, cursor: "pointer",
                }}>
                Reset storm
              </button>
            </div>
          </div>

          {/* navigation */}
          <div style={{ position: "absolute", right: 14, bottom: 14, zIndex: 12, display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 5 }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 30px)", gap: 3 }}>
              <span />
              <NavBtn navRef={navRef} flag="tiltU" title="Tilt up">▲</NavBtn>
              <span />
              <NavBtn navRef={navRef} flag="rotL" title="Rotate left">◀</NavBtn>
              <button className="sh-btn" title="Reset view (0)" aria-label="Reset view"
                onClick={() => three.current.resetView && three.current.resetView()}
                style={{
                  width: 30, height: 30, display: "grid", placeItems: "center", padding: 0,
                  background: "rgba(27,41,50,0.9)", border: `1px solid ${T.rule}`, borderRadius: 2, cursor: "pointer",
                }}>
                <span style={{ display: "block", transform: `rotate(${ro.heading}deg)`, font: `600 11px/1 ${MONO}`, color: T.signal }}>N</span>
              </button>
              <NavBtn navRef={navRef} flag="rotR" title="Rotate right">▶</NavBtn>
              <span />
              <NavBtn navRef={navRef} flag="tiltD" title="Tilt down">▼</NavBtn>
              <span />
            </div>
            <div style={{ display: "flex", gap: 3 }}>
              <NavBtn navRef={navRef} flag="zoomOut" title="Zoom out">−</NavBtn>
              <NavBtn navRef={navRef} flag="zoomIn" title="Zoom in">+</NavBtn>
            </div>
            <div style={{ display: "flex", gap: 3 }}>
              {VIEWS.map((v, i) => (
                <button key={v.id} className="sh-btn" title={`${v.label} view (${i + 1})`}
                  onClick={() => three.current.setView && three.current.setView(v.id)}
                  style={{
                    font: `500 10px/1 ${SANS}`, padding: "6px 8px", background: "rgba(27,41,50,0.9)",
                    color: T.muted, border: `1px solid ${T.rule}`, borderRadius: 2, cursor: "pointer",
                  }}>
                  {v.label}
                </button>
              ))}
            </div>
          </div>

          {/* controls help */}
          <div style={{ position: "absolute", left: 14, bottom: 14, zIndex: 12 }}>
            <button className="sh-btn" onClick={() => setShowHelp((v) => !v)}
              style={{
                font: `500 10.5px/1 ${SANS}`, padding: "6px 10px", background: "rgba(27,41,50,0.9)",
                color: T.muted, border: `1px solid ${T.rule}`, borderRadius: 2, cursor: "pointer",
              }}>
              {showHelp ? "Hide controls" : "Controls"}
            </button>
            {showHelp && (
              <div style={{
                marginTop: 6, width: 246, padding: "10px 12px", background: "rgba(20,31,39,0.95)",
                border: `1px solid ${T.rule}`, borderRadius: 3, font: `400 10px/1.7 ${SANS}`, color: T.muted,
              }}>
                {[
                  ["Drag", "Use the selected tool"],
                  ["Shift + drag", "Orbit"],
                  ["Right / middle drag", "Pan"],
                  ["Wheel or pinch", "Zoom"],
                  ["W A S D", "Pan"],
                  ["Q E", "Rotate"],
                  ["R F", "Tilt"],
                  ["+ −", "Zoom"],
                  ["1 2 3", "Plan, oblique, ground"],
                  ["0", "Reset view"],
                  ["Space", "Run or pause"],
                ].map(([k, v]) => (
                  <div key={k} style={{ display: "flex", gap: 10 }}>
                    <span style={{ font: `500 10px/1.7 ${MONO}`, color: T.ink, width: 100, flexShrink: 0 }}>{k}</span>
                    <span>{v}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* bottom bar */}
        <div style={{
          display: "flex", alignItems: "center", gap: 10, padding: "8px 12px",
          borderTop: `1px solid ${T.rule}`, background: T.panel, flexWrap: "wrap", flexShrink: 0,
        }}>
          {narrow && (
            <button className="sh-btn" onClick={() => setOpenRail(openRail === "left" ? null : "left")} style={btn(openRail === "left")}>Setup</button>
          )}
          <span style={{ font: `600 9px/1 ${SANS}`, letterSpacing: "0.14em", textTransform: "uppercase", color: T.dim }}>Speed</span>
          <div style={{ display: "flex", gap: 3 }}>
            {SPEEDS.map((s) => (
              <button key={s.v} className="sh-btn" onClick={() => set({ speed: s.v })}
                style={{ ...btn(cfg.speed === s.v), padding: "6px 9px", font: `500 10.5px/1 ${MONO}` }}>
                {s.label}
              </button>
            ))}
          </div>
          <div style={{ font: `400 9.5px/1.3 ${MONO}`, color: T.dim, minWidth: 104 }}>
            running at {ro.achieved < 1 ? ro.achieved.toFixed(1) : Math.round(ro.achieved)}×
          </div>
        </div>

        <div style={{ borderTop: `1px solid ${T.rule}`, background: T.panel, position: "relative", flexShrink: 0 }}>
          <div style={{
            position: "absolute", top: 6, left: 48, font: `600 9px/1 ${SANS}`, letterSpacing: "0.15em",
            textTransform: "uppercase", color: T.dim, pointerEvents: "none", zIndex: 2,
          }}>
            Rainfall ↓ &nbsp;·&nbsp; Outflow ↑
          </div>
          <canvas ref={chartRef} style={{ display: "block", width: "100%", height: narrow ? 100 : 132 }} />
        </div>
      </div>

      {RightRail}

      {showProv && (
        <div onClick={() => setShowProv(false)}
          style={{ position: "absolute", inset: 0, zIndex: 40, background: "rgba(6,10,12,0.72)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div onClick={(e) => e.stopPropagation()} className="sh-scroll"
            style={{ width: "min(760px, 100%)", maxHeight: "100%", overflowY: "auto", background: T.panel, border: `1px solid ${T.rule}`, borderRadius: 3, boxShadow: "0 20px 60px rgba(0,0,0,0.6)" }}>
            <div style={{ padding: "18px 20px 14px", borderBottom: `1px solid ${T.rule}`, position: "sticky", top: 0, background: T.panel, zIndex: 1 }}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 16 }}>
                <div style={{ flex: 1 }}>
                  <Eyebrow style={{ color: T.buff }}>Provenance</Eyebrow>
                  <div style={{ font: `500 17px/1.3 ${SANS}`, color: T.ink, letterSpacing: "-0.01em", marginTop: 7 }}>
                    Where every number in this model comes from
                  </div>
                  <div style={{ font: `400 11.5px/1.6 ${SANS}`, color: T.muted, marginTop: 8, maxWidth: 560 }}>
                    Nothing here is calibrated. Two things are published formulas, some are typical
                    values lifted from the literature, and the rest are placeholders I invented so
                    the thing would run. The difference matters, so it is labelled.
                  </div>
                </div>
                <button className="sh-btn" onClick={() => setShowProv(false)} style={{ ...btn(false), flexShrink: 0 }}>Close</button>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 14 }}>
                {Object.keys(PROV_STATUS).map((k) => (
                  <span key={k} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ width: 8, height: 8, borderRadius: 1, background: PROV_STATUS[k].col }} />
                    <span style={{ font: `400 10px/1 ${SANS}`, color: T.muted }}>{PROV_STATUS[k].label}</span>
                  </span>
                ))}
              </div>
            </div>
            <div>
              {PROVENANCE.map((r) => {
                const st = PROV_STATUS[r.status];
                return (
                  <div key={r.param} style={{ padding: "14px 20px", borderBottom: `1px solid ${T.ruleSoft}` }}>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
                      <span style={{ font: `500 13px/1.3 ${SANS}`, color: T.ink }}>{r.param}</span>
                      <span style={{ font: `600 8.5px/1 ${SANS}`, letterSpacing: "0.12em", textTransform: "uppercase", color: st.col, border: `1px solid ${st.col}`, borderRadius: 2, padding: "3px 6px" }}>
                        {st.label}
                      </span>
                      <span style={{ font: `400 10.5px/1 ${MONO}`, color: T.muted, marginLeft: "auto" }}>{r.used}</span>
                    </div>
                    <div style={{ font: `400 11px/1.65 ${SANS}`, color: T.muted, marginTop: 7 }}>{r.source}</div>
                    <div style={{ font: `400 11px/1.65 ${SANS}`, color: r.status === "placeholder" ? T.bad : T.dim, marginTop: 4 }}>{r.caveat}</div>
                    {r.url ? (
                      <a href={r.url} target="_blank" rel="noreferrer noopener"
                        style={{ display: "inline-flex", alignItems: "center", gap: 6, marginTop: 8, font: `500 10.5px/1.4 ${SANS}`, color: T.water, textDecoration: "none", borderBottom: `1px solid ${T.rule}`, paddingBottom: 2 }}>
                        {r.urlLabel}
                        <span style={{ font: `400 10px/1 ${MONO}`, color: T.dim }}>&#8599;</span>
                      </a>
                    ) : (
                      <div style={{ marginTop: 8, font: `400 10px/1.4 ${SANS}`, color: T.dim, fontStyle: "italic" }}>
                        No source to link to. This one is mine.
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <div style={{ padding: "14px 20px 18px", font: `400 10.5px/1.65 ${SANS}`, color: T.dim }}>
              The solver itself is verified in one respect only: mass balance closes to under
              0.003% across every preset. That says the arithmetic is sound. It says nothing about
              whether the answers resemble the real world, which would need calibration against
              gauged events.
            </div>
          </div>
        </div>
      )}

      {narrow && openRail && (
        <div onClick={() => setOpenRail(null)} style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 15 }} />
      )}
    </div>
  );
}
