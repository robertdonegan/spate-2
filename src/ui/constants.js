/* Toolbar, display mode and camera preset definitions. */

export const SPEEDS = [{ v: 1, label: "1×" }, { v: 10, label: "10×" }, { v: 60, label: "60×" }, { v: 300, label: "300×" }, { v: 1800, label: "1800×" }];
export const TOOLS = [
  { id: "orbit", label: "Look" }, { id: "raise", label: "Raise" }, { id: "lower", label: "Lower" },
  { id: "smooth", label: "Smooth" }, { id: "stamp", label: "Stamp" }, { id: "pick", label: "Pick level" },
  { id: "paint", label: "Surface" }, { id: "pour", label: "Pour" }, { id: "drop", label: "Drop float" },
  { id: "section", label: "Section" }, { id: "bridge", label: "Bridge" }, { id: "tunnel", label: "Tunnel" },
];
export const MODES = [
  { value: 0, label: "Natural" }, { value: 1, label: "Depth" }, { value: 2, label: "Velocity" },
  { value: 3, label: "Hazard" }, { value: 4, label: "Max extent" },
];

export const VIEWS = [
  { id: "plan", label: "Plan", phi: 0.05, dist: 300 },
  { id: "oblique", label: "Oblique", phi: 0.72, dist: 330 },
  { id: "low", label: "Ground", phi: 1.34, dist: 250 },
];
