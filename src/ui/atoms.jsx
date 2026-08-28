/* Panel furniture. */
import React, { useEffect } from "react";
import { T, MONO, SANS } from "./tokens.js";

export const Eyebrow = ({ children, style }) => (
  <div style={{ font: `600 9.5px/1 ${SANS}`, letterSpacing: "0.16em", textTransform: "uppercase", color: T.dim, ...style }}>
    {children}
  </div>
);

export function Panel({ title, note, children }) {
  return (
    <section style={{ borderTop: `1px solid ${T.ruleSoft}`, padding: "13px 14px 15px" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 10 }}>
        <Eyebrow>{title}</Eyebrow>
        {note && <span style={{ font: `400 9.5px/1 ${MONO}`, color: T.dim, marginLeft: "auto" }}>{note}</span>}
      </div>
      {children}
    </section>
  );
}

export function Seg({ items, value, onChange, cols }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: `repeat(${cols || items.length}, 1fr)`, gap: 3 }}>
      {items.map((it) => {
        const v = it.value !== undefined ? it.value : it;
        const on = v === value;
        return (
          <button key={String(v)} onClick={() => onChange(v)} className="sh-btn"
            style={{
              font: `500 10.5px/1 ${SANS}`, padding: "7px 4px",
              color: on ? T.chassis : T.muted, background: on ? T.signal : T.panel2,
              border: `1px solid ${on ? T.signal : T.rule}`, borderRadius: 2, cursor: "pointer",
              whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
            }}>
            {it.label !== undefined ? it.label : String(v)}
          </button>
        );
      })}
    </div>
  );
}

export function Slider({ label, value, min, max, step, unit, onChange, fmt }) {
  return (
    <label style={{ display: "block", marginBottom: 11 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
        <span style={{ font: `400 11px/1 ${SANS}`, color: T.muted }}>{label}</span>
        <span style={{ font: `500 11px/1 ${MONO}`, color: T.ink }}>
          {fmt ? fmt(value) : value}<span style={{ color: T.dim }}>{unit ? " " + unit : ""}</span>
        </span>
      </div>
      <input type="range" className="sh-range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))} />
    </label>
  );
}

export function Stat({ label, value, unit, tone }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 6 }}>
      <span style={{ font: `400 10.5px/1.2 ${SANS}`, color: T.muted, flex: 1 }}>{label}</span>
      <span style={{ font: `500 12px/1 ${MONO}`, color: tone || T.ink, fontVariantNumeric: "tabular-nums" }}>{value}</span>
      <span style={{ font: `400 9.5px/1 ${MONO}`, color: T.dim, width: 34 }}>{unit}</span>
    </div>
  );
}

/* Nav button: holds a flag in navRef while pressed */
export function NavBtn({ navRef, flag, title, children }) {
  const on = (e) => { if (e) e.preventDefault(); navRef.current[flag] = true; };
  const off = () => { navRef.current[flag] = false; };
  useEffect(() => off, []);
  return (
    <button className="sh-btn" title={title} aria-label={title}
      onPointerDown={on} onPointerUp={off} onPointerLeave={off} onPointerCancel={off} onBlur={off}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") on(); }} onKeyUp={off}
      style={{
        width: 30, height: 30, display: "grid", placeItems: "center", padding: 0,
        font: `500 12px/1 ${MONO}`, color: T.ink, background: "rgba(27,41,50,0.9)",
        border: `1px solid ${T.rule}`, borderRadius: 2, cursor: "pointer",
      }}>
      {children}
    </button>
  );
}

export function btn(on) {
  return {
    font: `500 11px/1 ${SANS}`, padding: "7px 11px",
    background: on ? T.panel2 : "transparent", color: on ? T.ink : T.muted,
    border: `1px solid ${T.rule}`, borderRadius: 2, cursor: "pointer",
  };
}
export function toggleBtn(on) {
  return {
    font: `500 10.5px/1 ${SANS}`, padding: "7px 4px",
    background: on ? T.panel2 : "transparent", color: on ? T.ink : T.muted,
    border: `1px solid ${T.rule}`, borderRadius: 2, cursor: "pointer",
  };
}
