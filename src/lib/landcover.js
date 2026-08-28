/* Surface types: Manning's n and infiltration rate per cover. */

export const LAND = [
  { name: "Short grass", n: 0.035, inf: 8, col: [0.42, 0.50, 0.31] },
  { name: "Rough pasture", n: 0.06, inf: 12, col: [0.33, 0.41, 0.24] },
  { name: "Dense scrub", n: 0.1, inf: 20, col: [0.21, 0.31, 0.19] },
  { name: "Bare soil", n: 0.025, inf: 15, col: [0.56, 0.45, 0.32] },
  { name: "Paved", n: 0.016, inf: 0.5, col: [0.26, 0.29, 0.32] },
  { name: "Roof", n: 0.02, inf: 0.0, col: [0.48, 0.32, 0.27] },
];
