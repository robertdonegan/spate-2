/* Design storm: illustrative depth-duration-frequency and profile.
   See data/provenance.js — the DDF coefficients here are placeholders. */

export const AEPS = [
  { label: "50%", ret: "1 in 2", g: 1.0 },
  { label: "20%", ret: "1 in 5", g: 1.28 },
  { label: "10%", ret: "1 in 10", g: 1.48 },
  { label: "3.3%", ret: "1 in 30", g: 1.82 },
  { label: "1%", ret: "1 in 100", g: 2.24 },
  { label: "0.5%", ret: "1 in 200", g: 2.48 },
  { label: "0.1%", ret: "1 in 1000", g: 3.15 },
];
export const DURATIONS = [0.25, 0.5, 1, 2, 3, 6, 12, 24];

export function stormDepthMm(aepIdx, durHr, ccPct) {
  return 12.5 * Math.pow(durHr, 0.48) * AEPS[aepIdx].g * (1 + ccPct / 100);
}
export const SIGMA = 0.15;
export const PEAK_NORM = (() => {
  let s = 0;
  for (let i = 0; i < 400; i++) {
    const t = (i + 0.5) / 400;
    s += Math.exp(-((t - 0.5) * (t - 0.5)) / (2 * SIGMA * SIGMA));
  }
  return 400 / s;
})();
export function profileFactor(tau, peaked) {
  if (!peaked) return 1;
  return PEAK_NORM * Math.exp(-((tau - 0.5) * (tau - 0.5)) / (2 * SIGMA * SIGMA));
}
