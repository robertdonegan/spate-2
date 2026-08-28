/* Domain size and the render meshes for bed and skirt. */
import * as THREE from "three";

export const N = 128;
export const SIZE = 256;
export const RAIN_H = 78;

export function buildGrid(n, size) {
  const g = new THREE.BufferGeometry();
  const pos = new Float32Array(n * n * 3);
  for (let j = 0; j < n; j++)
    for (let i = 0; i < n; i++) {
      const a = (j * n + i) * 3;
      pos[a] = (i / (n - 1) - 0.5) * size;
      pos[a + 1] = 0;
      pos[a + 2] = (j / (n - 1) - 0.5) * size;
    }
  const idx = new Uint32Array((n - 1) * (n - 1) * 6);
  let k = 0;
  for (let j = 0; j < n - 1; j++)
    for (let i = 0; i < n - 1; i++) {
      const a = j * n + i, b = a + 1, c = a + n, d = c + 1;
      idx[k++] = a; idx[k++] = c; idx[k++] = b;
      idx[k++] = b; idx[k++] = c; idx[k++] = d;
    }
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  return g;
}

/* Sides and base of the block, so the model sits on solid ground */
export function buildSkirt(n, size, baseY) {
  const g = new THREE.BufferGeometry();
  const pos = new Float32Array((n * 4 * 2 + 4) * 3);
  const map = new Int32Array(n * 4);
  const px = (k) => (k / (n - 1) - 0.5) * size;
  const edge = [
    (k) => [k, 0], (k) => [k, n - 1], (k) => [0, k], (k) => [n - 1, k],
  ];
  let vi = 0;
  for (let e = 0; e < 4; e++)
    for (let k = 0; k < n; k++) {
      const ij = edge[e](k), i = ij[0], j = ij[1];
      const x = px(i), zz = px(j);
      map[e * n + k] = j * n + i;
      pos[vi * 3] = x; pos[vi * 3 + 1] = 0; pos[vi * 3 + 2] = zz; vi++;
      pos[vi * 3] = x; pos[vi * 3 + 1] = baseY; pos[vi * 3 + 2] = zz; vi++;
    }
  const b = vi;
  const hs = size / 2;
  const corners = [[-hs, -hs], [hs, -hs], [hs, hs], [-hs, hs]];
  for (let k = 0; k < 4; k++) {
    pos[vi * 3] = corners[k][0]; pos[vi * 3 + 1] = baseY; pos[vi * 3 + 2] = corners[k][1]; vi++;
  }
  const idx = [];
  for (let e = 0; e < 4; e++)
    for (let k = 0; k < n - 1; k++) {
      const t0 = (e * n + k) * 2, b0 = t0 + 1, t1 = (e * n + k + 1) * 2, b1 = t1 + 1;
      idx.push(t0, b0, t1, t1, b0, b1);
    }
  idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setIndex(new THREE.BufferAttribute(new Uint32Array(idx), 1));
  g.userData.map = map;
  g.userData.baseY = baseY;
  return g;
}
