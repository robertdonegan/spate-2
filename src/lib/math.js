/* Small numeric helpers shared across the simulation. */

export function fbm(x, y) {
  let v = 0, a = 1, f = 1;
  for (let o = 0; o < 5; o++) {
    v += a * Math.sin(x * f * 3.13 + o * 1.7) * Math.cos(y * f * 2.71 + o * 2.31);
    a *= 0.5; f *= 2.07;
  }
  return v;
}
export const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
export const sstep = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
export const gauss = (x, s) => Math.exp(-(x * x) / (2 * s * s));

export function niceStep(x) {
  if (!(x > 0)) return 1;
  const e = Math.pow(10, Math.floor(Math.log10(x)));
  const m = x / e;
  return (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * e;
}

export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
