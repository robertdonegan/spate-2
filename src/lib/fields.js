/* Field sampling and render-only filtering.
   Nothing in here feeds back into the solver. */

export function smoothField(n, src, dst, tmp, passes) {
  if (passes <= 0) { dst.set(src); return; }
  let cur = src;
  for (let p = 0; p < passes; p++) {
    for (let j = 0; j < n; j++) {
      const row = j * n;
      for (let i = 0; i < n; i++) {
        const c = cur[row + i];
        const l = i > 0 ? cur[row + i - 1] : c;
        const r = i < n - 1 ? cur[row + i + 1] : c;
        tmp[row + i] = 0.25 * l + 0.5 * c + 0.25 * r;
      }
    }
    for (let j = 0; j < n; j++) {
      const row = j * n;
      const up = j > 0 ? row - n : row;
      const dn = j < n - 1 ? row + n : row;
      for (let i = 0; i < n; i++) {
        dst[row + i] = 0.25 * tmp[up + i] + 0.5 * tmp[row + i] + 0.25 * tmp[dn + i];
      }
    }
    cur = dst;
  }
}

/* Central-difference vertex normals from a height field, so shading is
   interpolated across the surface rather than flat per triangle. */
export function fieldNormals(n, dx, surf, out) {
  for (let j = 0; j < n; j++) {
    const row = j * n;
    const up = j > 0 ? row - n : row;
    const dn = j < n - 1 ? row + n : row;
    for (let i = 0; i < n; i++) {
      const a = row + i;
      const l = surf[row + (i > 0 ? i - 1 : i)];
      const r = surf[row + (i < n - 1 ? i + 1 : i)];
      const u = surf[up + i];
      const d = surf[dn + i];
      const nx = l - r, ny = 2 * dx, nz = u - d;
      const len = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
      out[a * 3] = nx / len;
      out[a * 3 + 1] = ny / len;
      out[a * 3 + 2] = nz / len;
    }
  }
}

export function sampleFlow(sim, wx, wz, out) {
  const n = sim.N, size = sim.size;
  const gx = (wx / size + 0.5) * (n - 1);
  const gz = (wz / size + 0.5) * (n - 1);
  out.x = 0; out.z = 0; out.d = 0;
  if (!(gx >= 0 && gz >= 0 && gx <= n - 1 && gz <= n - 1)) return;
  const i0 = Math.min(n - 2, Math.floor(gx));
  const j0 = Math.min(n - 2, Math.floor(gz));
  const fx = gx - i0, fz = gz - j0;
  let vx = 0, vz = 0, dd = 0;
  for (let dj = 0; dj < 2; dj++) {
    for (let di = 0; di < 2; di++) {
      const i = i0 + di, j = j0 + dj;
      const w = (di ? fx : 1 - fx) * (dj ? fz : 1 - fz);
      if (w <= 0) continue;
      const a = j * n + i;
      const d = sim.h[a];
      dd += d * w;
      if (d > 0.004) {
        const inX = i > 0 ? sim.qx[a - 1] : 0;
        const inY = j > 0 ? sim.qy[a - n] : 0;
        vx += (w * 0.5 * (inX + sim.qx[a])) / d;
        vz += (w * 0.5 * (inY + sim.qy[a])) / d;
      }
    }
  }
  out.x = vx; out.z = vz; out.d = dd;
}
export function sampleGround(sim, wx, wz) {
  const n = sim.N, size = sim.size;
  const gx = Math.min(n - 1, Math.max(0, (wx / size + 0.5) * (n - 1)));
  const gz = Math.min(n - 1, Math.max(0, (wz / size + 0.5) * (n - 1)));
  const i0 = Math.min(n - 2, Math.floor(gx)), j0 = Math.min(n - 2, Math.floor(gz));
  const fx = gx - i0, fz = gz - j0;
  const a = j0 * n + i0;
  const z00 = sim.z[a], z10 = sim.z[a + 1], z01 = sim.z[a + n], z11 = sim.z[a + n + 1];
  return (z00 * (1 - fx) + z10 * fx) * (1 - fz) + (z01 * (1 - fx) + z11 * fx) * fz;
}
