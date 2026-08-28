/* Number and clock formatting for readouts. */

export const f1 = (v) => (Math.abs(v) < 0.05 ? "0.0" : v.toFixed(1));
export const f2 = (v) => v.toFixed(2);
export const f0 = (v) => Math.round(v).toLocaleString();
export function clock(s) {
  const d = Math.floor(s / 86400);
  const hh = String(Math.floor((s % 86400) / 3600)).padStart(2, "0");
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
  const ss = String(Math.floor(s % 60)).padStart(2, "0");
  return (d > 0 ? `${d}d ` : "") + `${hh}:${mm}:${ss}`;
}
