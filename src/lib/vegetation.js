/* Scattered planting, merged into one geometry and weighted by cover. */
import * as THREE from "three";
import { mulberry32 } from "./math.js";

export const VEG_BUSH = new THREE.IcosahedronGeometry(1, 0).toNonIndexed();
export const VEG_TREE = new THREE.ConeGeometry(0.66, 2.0, 6, 1).toNonIndexed();
export const VEG_WEIGHT = [0.18, 0.5, 1.0, 0.05, 0, 0];

export function buildVegGeometry(sim, count, seed) {
  const rnd = mulberry32(seed);
  const n = sim.N, size = sim.size;
  const bp = VEG_BUSH.attributes.position.array, bn = VEG_BUSH.attributes.normal.array;
  const tp = VEG_TREE.attributes.position.array, tn = VEG_TREE.attributes.normal.array;
  const pos = [], nrm = [], col = [], sway = [];
  let placed = 0, guard = 0;
  while (placed < count && guard++ < count * 24) {
    const gx = rnd() * (n - 1), gz = rnd() * (n - 1);
    const a = Math.round(gz) * n + Math.round(gx);
    const w = VEG_WEIGHT[sim.land[a]] || 0;
    if (w <= 0 || rnd() > w) continue;
    const wx = (gx / (n - 1) - 0.5) * size;
    const wz = (gz / (n - 1) - 0.5) * size;
    const wy = sim.z[a];
    const isTree = rnd() < 0.26;
    const src = isTree ? tp : bp, srcN = isTree ? tn : bn;
    const sc = isTree ? 1.5 + rnd() * 2.2 : 0.7 + rnd() * 1.5;
    const sy = isTree ? sc * (1.1 + rnd() * 0.5) : sc * (0.55 + rnd() * 0.35);
    const ang = rnd() * Math.PI * 2, ca = Math.cos(ang), sa = Math.sin(ang);
    const baseY = isTree ? sy : sy * 0.55;
    const shade = 0.72 + rnd() * 0.5;
    const g = isTree ? 0.30 + rnd() * 0.12 : 0.36 + rnd() * 0.16;
    const r = g * (0.52 + rnd() * 0.22), bl = g * (0.34 + rnd() * 0.2);
    const vc = src.length / 3;
    for (let k = 0; k < vc; k++) {
      const lx = src[k * 3] * sc, ly = src[k * 3 + 1] * sy, lz = src[k * 3 + 2] * sc;
      pos.push(wx + lx * ca - lz * sa, wy + ly + baseY * 0.5, wz + lx * sa + lz * ca);
      const nx = srcN[k * 3], ny = srcN[k * 3 + 1], nz = srcN[k * 3 + 2];
      nrm.push(nx * ca - nz * sa, ny, nx * sa + nz * ca);
      col.push(r * shade, g * shade, bl * shade);
      sway.push(Math.max(0, (src[k * 3 + 1] + 1) * 0.5));
    }
    placed++;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute("aNrm", new THREE.BufferAttribute(new Float32Array(nrm), 3));
  g.setAttribute("aCol", new THREE.BufferAttribute(new Float32Array(col), 3));
  g.setAttribute("aSway", new THREE.BufferAttribute(new Float32Array(sway), 1));
  g.computeBoundingSphere();
  return g;
}
