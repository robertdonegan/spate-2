/* Horizon-scan ambient occlusion from the heightfield. */

export const AO_DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [0.7, 0.7], [-0.7, -0.7], [0.7, -0.7], [-0.7, 0.7]];
export const AO_STEPS = [1, 2, 4, 8, 16, 26];
export function computeAO(sim) {
  const { N: n, z, dx, ao } = sim;
  for (let j = 0; j < n; j++)
    for (let i = 0; i < n; i++) {
      const a = j * n + i, z0 = z[a];
      let occ = 0;
      for (let d = 0; d < 8; d++) {
        const dxs = AO_DIRS[d][0], dys = AO_DIRS[d][1];
        let best = 0;
        for (let s = 0; s < AO_STEPS.length; s++) {
          const st = AO_STEPS[s];
          let si = Math.round(i + dxs * st), sj = Math.round(j + dys * st);
          if (si < 0) si = 0; else if (si >= n) si = n - 1;
          if (sj < 0) sj = 0; else if (sj >= n) sj = n - 1;
          const slope = (z[sj * n + si] - z0) / (st * dx);
          if (slope > best) best = slope;
        }
        occ += best > 0 ? Math.atan(best * 2.6) / 1.5708 : 0;
      }
      const open = Math.max(0, 1 - (occ / 8) * 0.95);
      ao[a] = open * open;
    }
}
