import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { BODY, C, DISPLAY, Moon, Phone, Sky, Words, clamp, ease, prog } from "./theme";

/* 1 · Bedtime: the moon rises, the name appears. */
export const IntroScene: React.FC = () => {
  const f = useCurrentFrame();
  const rise = prog(f, 0, 70);
  const line = interpolate(f, [10, 30, 62, 76], [0, 1, 1, 0], clamp);
  const name = prog(f, 78, 104);
  return (
    <AbsoluteFill>
      <Sky glowY="55%" />
      <Moon size={300} style={{ left: 810, top: interpolate(rise, [0, 1], [1150, 210]) }} />
      <div
        style={{
          position: "absolute", width: "100%", top: 610, textAlign: "center",
          fontFamily: DISPLAY, fontWeight: 500, fontSize: 84, color: C.cream, opacity: line,
          translate: `0px ${(1 - line) * 20}px`,
        }}
      >
        Bedtime, every night.
      </div>
      <div style={{ position: "absolute", width: "100%", top: 580, textAlign: "center", opacity: name, scale: `${0.94 + 0.06 * name}` }}>
        <div style={{ fontFamily: DISPLAY, fontWeight: 600, fontSize: 190, color: C.cream, letterSpacing: -4, lineHeight: 1 }}>hush</div>
        <div style={{ fontFamily: BODY, fontWeight: 600, fontSize: 48, color: C.muted, marginTop: 18 }}>White noise &amp; baby monitor</div>
      </div>
    </AbsoluteFill>
  );
};

/* 2 · Calm sounds. */
const SOUNDS = ["Womb", "Shush", "Brown", "Pink", "White", "Ocean"];
export const SoundsScene: React.FC = () => {
  const f = useCurrentFrame();
  const p = prog(f, 0, 34);
  return (
    <AbsoluteFill>
      <Sky glowX="25%" glowY="40%" />
      <Phone
        src="home.png"
        style={{ left: 250, top: 120 + (1 - p) * 140, opacity: p, rotate: `${(1 - p) * -6}deg` }}
      />
      <Words title="Calm white noise" sub="Six gentle sounds that keep playing with the screen off." style={{ left: 860, top: 300, width: 900 }} />
      <div style={{ position: "absolute", left: 860, top: 640, display: "flex", gap: 18, flexWrap: "wrap", width: 900 }}>
        {SOUNDS.map((s, i) => {
          const q = prog(f, 40 + i * 6, 64 + i * 6);
          return (
            <div
              key={s}
              style={{
                fontFamily: BODY, fontWeight: 700, fontSize: 38, color: i === 0 ? C.bg : C.cream,
                background: i === 0 ? C.peach : C.card, borderRadius: 99, padding: "16px 34px",
                opacity: q, scale: `${0.8 + 0.2 * q}`,
              }}
            >
              {s}
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

/* 3 · Never too loud: a level that settles at 50 dB at the crib. */
export const SafeScene: React.FC = () => {
  const f = useCurrentFrame();
  const p = prog(f, 0, 30);
  const db = interpolate(f, [20, 80], [30, 50], { ...clamp, easing: ease });
  const arc = (db - 30) / 40; // 30..70 dB scale
  const R = 200, cx = 260, cy = 250;
  const pt = (a: number) => [cx + R * Math.cos(Math.PI * (1 - a)), cy - R * Math.sin(Math.PI * (1 - a))];
  const [ex, ey] = pt(arc);
  const [lx, ly] = pt(0.5);
  return (
    <AbsoluteFill>
      <Sky glowX="75%" glowY="40%" />
      <Words title="Never too loud" sub="Tell hush how far the crib is. It keeps the sound under 50 dB there." style={{ left: 150, top: 200, width: 860 }} />
      <svg width={520} height={330} style={{ position: "absolute", left: 230, top: 600, opacity: p }}>
        <path d={`M ${cx - R} ${cy} A ${R} ${R} 0 0 1 ${cx + R} ${cy}`} stroke={C.card} strokeWidth={30} fill="none" strokeLinecap="round" />
        <path d={`M ${cx - R} ${cy} A ${R} ${R} 0 0 1 ${ex} ${ey}`} stroke={C.sage} strokeWidth={30} fill="none" strokeLinecap="round" />
        <line x1={lx} y1={ly - 34} x2={lx} y2={ly + 34} stroke={C.rose} strokeWidth={6} strokeLinecap="round" />
        <text x={cx} y={cy - 30} textAnchor="middle" fill={C.cream} style={{ fontFamily: DISPLAY, fontSize: 120, fontWeight: 500 }}>
          {Math.round(db)}
        </text>
        <text x={cx} y={cy + 40} textAnchor="middle" fill={C.muted} style={{ fontFamily: BODY, fontSize: 36, fontWeight: 700 }}>
          dB at the crib
        </text>
      </svg>
      <Phone src="sounds.png" style={{ left: 1250, top: 120 + (1 - p) * 140, opacity: p, rotate: `${(1 - p) * 6}deg` }} />
    </AbsoluteFill>
  );
};

/* 4 · Smart volume: the curve draws itself, then a cry bumps it back up. */
export const SmartScene: React.FC = () => {
  const f = useCurrentFrame();
  const draw = prog(f, 20, 120);
  const W = 1400, H = 380, x0 = 260, y0 = 560;
  const y = (db: number) => y0 + H - ((db - 40) / 12) * H;
  // 50 dB hold, ease to 44, cry bump, settle.
  const pts: [number, number][] = [];
  for (let i = 0; i <= 200; i++) {
    const u = i / 200;
    let db = 50;
    if (u > 0.22) db = 50 - 6 * Math.min(1, (u - 0.22) / 0.3) ** 0.8;
    const bump = Math.exp(-(((u - 0.7) / 0.035) ** 2));
    db = Math.max(db, db + 5.2 * bump);
    pts.push([x0 + u * W, y(db)]);
  }
  const shown = pts.slice(0, Math.max(2, Math.round(draw * pts.length)));
  const d = shown.map(([a, b], i) => `${i ? "L" : "M"} ${a.toFixed(1)} ${b.toFixed(1)}`).join(" ");
  const [hx, hy] = shown[shown.length - 1];
  const cry = prog(f, 100, 118) * (1 - prog(f, 150, 165));
  const label = (txt: string, x: number, at: number) => (
    <div style={{ position: "absolute", left: x, top: y0 + H + 40, fontFamily: BODY, fontWeight: 700, fontSize: 36, color: C.muted, opacity: prog(f, at, at + 20) }}>{txt}</div>
  );
  return (
    <AbsoluteFill>
      <Sky />
      <Words title="Smart volume" sub="Eases down as your baby settles. Turns back up if they cry." align="center" style={{ left: 160, right: 160, top: 120 }} />
      <svg width={1920} height={1080} style={{ position: "absolute", inset: 0 }}>
        {[50, 44].map((v) => (
          <g key={v}>
            <line x1={x0} x2={x0 + W} y1={y(v)} y2={y(v)} stroke={C.card} strokeWidth={3} strokeDasharray="10 12" />
            <text x={x0 - 30} y={y(v) + 14} textAnchor="end" fill={C.muted} style={{ fontFamily: BODY, fontSize: 36, fontWeight: 700 }}>{v} dB</text>
          </g>
        ))}
        <path d={`${d} L ${hx} ${y0 + H} L ${x0} ${y0 + H} Z`} fill="rgba(246,199,176,.10)" />
        <path d={d} stroke={C.peach} strokeWidth={9} fill="none" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx={hx} cy={hy} r={16} fill={C.peach} />
      </svg>
      {label("Falling asleep", x0, 40)}
      {label("Sound asleep", x0 + W * 0.42, 70)}
      <div
        style={{
          position: "absolute", left: x0 + W * 0.7 + 50, top: y(55.5) - 30, fontFamily: BODY, fontWeight: 700, fontSize: 38,
          color: C.bg, background: C.rose, borderRadius: 99, padding: "12px 30px", opacity: cry, scale: `${0.85 + 0.15 * cry}`,
        }}
      >
        Crying
      </div>
    </AbsoluteFill>
  );
};

/* 5 · Monitor: ripples leave the baby's phone, an alert lands on the parent's. */
export const MonitorScene: React.FC = () => {
  const f = useCurrentFrame();
  const p = prog(f, 0, 30);
  const alert = prog(f, 96, 116);
  return (
    <AbsoluteFill>
      <Sky glowY="60%" />
      <Words title="Two phones. One monitor." sub="Leave one by the crib. Get an alert on yours when your baby cries." align="center" style={{ left: 160, right: 160, top: 70 }} />
      {/* ripples */}
      {[0, 1, 2, 3].map((i) => {
        const t = ((f - 30 - i * 16) % 64) / 64;
        const on = f > 30 + i * 16 && f < 150;
        return (
          <div
            key={i}
            style={{
              position: "absolute", left: 615 - 30, top: 620, width: 60, height: 60, borderRadius: "50%",
              border: `5px solid ${C.sage}`, opacity: on ? (1 - t) * 0.8 : 0, scale: `${1 + t * 6}`,
            }}
          />
        );
      })}
      <Phone src="monitor.png" width={290} style={{ left: 470, top: 330 + (1 - p) * 120, opacity: p, rotate: "-4deg" }} />
      <Phone src="parent.png" width={290} style={{ left: 1160, top: 330 + (1 - p) * 120, opacity: p, rotate: "4deg" }}>
        <div
          style={{
            position: "absolute", left: 14, right: 14, top: 14 + (1 - alert) * -140, opacity: alert,
            background: "rgba(245,238,227,.97)", borderRadius: 26, padding: "18px 20px", display: "flex", gap: 14, alignItems: "center",
            boxShadow: "0 12px 40px rgba(0,0,0,.4)",
          }}
        >
          <div style={{ width: 46, height: 46, borderRadius: 14, background: C.bg, display: "grid", placeItems: "center" }}>
            <div style={{ width: 22, height: 22, borderRadius: "50%", background: C.moon }} />
          </div>
          <div>
            <div style={{ fontFamily: BODY, fontWeight: 700, fontSize: 18, color: "#6f6680" }}>hush · now</div>
            <div style={{ fontFamily: BODY, fontWeight: 700, fontSize: 23, color: C.bg, whiteSpace: "nowrap" }}>Leo is crying</div>
          </div>
        </div>
      </Phone>
      <div style={{ position: "absolute", left: 330, width: 570, top: 975, textAlign: "center", fontFamily: BODY, fontWeight: 700, fontSize: 34, color: C.muted, opacity: p }}>Baby's room</div>
      <div style={{ position: "absolute", left: 1020, width: 570, top: 975, textAlign: "center", fontFamily: BODY, fontWeight: 700, fontSize: 34, color: C.muted, opacity: p }}>Your phone</div>
    </AbsoluteFill>
  );
};

/* 6 · Nights: the month and the week, side by side. */
export const NightsScene: React.FC = () => {
  const f = useCurrentFrame();
  const a = prog(f, 0, 30);
  const b = prog(f, 14, 44);
  return (
    <AbsoluteFill>
      <Sky glowX="70%" glowY="50%" />
      <Words title="Watch the nights get calmer" sub="Every night on a timeline, with weekly and monthly trends." style={{ left: 150, top: 300, width: 820 }} />
      <Phone src="week.png" width={380} style={{ left: 1040, top: 150 + (1 - a) * 140, opacity: a, rotate: "-5deg" }} />
      <Phone src="month.png" width={380} style={{ left: 1390, top: 110 + (1 - b) * 140, opacity: b, rotate: "4deg" }} />
    </AbsoluteFill>
  );
};

/* 7 · Private, then the end card. */
export const OutroScene: React.FC = () => {
  const f = useCurrentFrame();
  const lines = ["No account.", "No ads.", "Sound never leaves the phone."];
  const out = 1 - prog(f, 66, 80);
  const end = prog(f, 80, 108);
  return (
    <AbsoluteFill>
      <Sky glowY="45%" />
      <div style={{ position: "absolute", width: "100%", top: 340, textAlign: "center", opacity: out }}>
        {lines.map((l, i) => {
          const q = prog(f, 4 + i * 14, 26 + i * 14);
          return (
            <div key={l} style={{ fontFamily: DISPLAY, fontWeight: 500, fontSize: 96, lineHeight: 1.3, color: i === 2 ? C.peach : C.cream, opacity: q, translate: `0px ${(1 - q) * 24}px` }}>
              {l}
            </div>
          );
        })}
      </div>
      <div style={{ opacity: end }}>
        <Moon size={230} style={{ left: 845, top: 190, scale: `${0.9 + 0.1 * end}` }} />
        <div style={{ position: "absolute", width: "100%", top: 500, textAlign: "center" }}>
          <div style={{ fontFamily: DISPLAY, fontWeight: 600, fontSize: 170, color: C.cream, letterSpacing: -4, lineHeight: 1 }}>hush</div>
          <div style={{ fontFamily: BODY, fontWeight: 600, fontSize: 48, color: C.muted, marginTop: 18 }}>White noise &amp; baby monitor</div>
          <div style={{ display: "inline-block", marginTop: 50, fontFamily: BODY, fontWeight: 700, fontSize: 40, color: C.bg, background: C.peach, borderRadius: 99, padding: "18px 46px" }}>
            Free on Google Play
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};
