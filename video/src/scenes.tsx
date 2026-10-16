import React from "react";
import { interpolate, useCurrentFrame } from "remotion";
import { BODY, C, DISPLAY, Logo, Phone, Scene, Sfx, Sky, Words, clamp, ease, float, prog, springIn } from "./theme";

/* 1 · The problem: no white noise machine, no baby monitor. */
const Speaker: React.FC = () => (
  <svg width={190} height={190} viewBox="0 0 190 190">
    <rect x={25} y={25} width={140} height={140} rx={46} fill={C.peach} />
    {[0, 1, 2].flatMap((r) => [0, 1, 2].map((c) => <circle key={`${r}${c}`} cx={65 + c * 30} cy={65 + r * 30} r={7} fill="rgba(27,23,39,.25)" />))}
  </svg>
);
const MonitorDevice: React.FC = () => (
  <svg width={190} height={190} viewBox="0 0 190 190">
    <line x1={120} y1={18} x2={120} y2={48} stroke={C.muted} strokeWidth={10} strokeLinecap="round" />
    <rect x={45} y={45} width={100} height={130} rx={30} fill={C.sage} />
    <rect x={62} y={64} width={66} height={50} rx={12} fill="rgba(27,23,39,.22)" />
    <circle cx={95} cy={142} r={13} fill="rgba(27,23,39,.25)" />
  </svg>
);

export const HookScene: React.FC = () => {
  const f = useCurrentFrame();
  const a = springIn(f, 6, 34);
  const b = springIn(f, 40, 68);
  const c = prog(f, 80, 100);
  return (
    <Scene>
      <Sky glowY="40%" />
      <Sfx at={6} name="pop" volume={0.45} />
      <Sfx at={40} name="pop" volume={0.45} />
      <Sfx at={80} name="tick" volume={0.45} />
      <div style={{ position: "absolute", left: 640, top: 150 + float(f, 0, 6), opacity: Math.min(1, a * 1.4), scale: `${0.6 + 0.4 * a}`, rotate: `${-6 + float(f, 1, 1)}deg` }}><Speaker /></div>
      <div style={{ position: "absolute", left: 1090, top: 150 + float(f, 2, 6), opacity: Math.min(1, b * 1.4), scale: `${0.6 + 0.4 * b}`, rotate: `${6 + float(f, 3, 1)}deg` }}><MonitorDevice /></div>
      <div style={{ position: "absolute", width: "100%", top: 440, textAlign: "center" }}>
        <div style={{ fontFamily: DISPLAY, fontWeight: 500, fontSize: 92, lineHeight: 1.2, color: C.cream, opacity: Math.min(1, a * 1.4), translate: `0px ${(1 - a) * 30}px` }}>No white noise machine?</div>
        <div style={{ fontFamily: DISPLAY, fontWeight: 500, fontSize: 92, lineHeight: 1.2, color: C.cream, opacity: Math.min(1, b * 1.4), translate: `0px ${(1 - b) * 30}px` }}>No baby monitor?</div>
        <div style={{ fontFamily: BODY, fontWeight: 700, fontSize: 52, color: C.peach, marginTop: 30, opacity: c, translate: `0px ${(1 - c) * 20}px` }}>No problem.</div>
      </div>
    </Scene>
  );
};

/* 2 · The answer: the moon rises, the name appears. */
export const IntroScene: React.FC = () => {
  const f = useCurrentFrame();
  const rise = prog(f, 0, 60);
  const name = springIn(f, 26, 56);
  const sub = prog(f, 40, 66);
  return (
    <Scene>
      <Sky glowY="55%" />
      <Sfx at={2} name="sparkle" volume={0.45} />
      <Logo size={330} stars={prog(f, 40, 60)} style={{ left: 795, top: interpolate(rise, [0, 1], [1150, 110]) + float(f, 1, 5), rotate: `${interpolate(rise, [0, 1], [-25, 0])}deg` }} />
      <div style={{ position: "absolute", width: "100%", top: 470, textAlign: "center" }}>
        <div style={{ fontFamily: DISPLAY, fontWeight: 600, fontSize: 190, color: C.cream, letterSpacing: -4, lineHeight: 1, opacity: name, scale: `${0.9 + 0.1 * name}` }}>hush</div>
        <div style={{ fontFamily: BODY, fontWeight: 700, fontSize: 56, color: C.peach, marginTop: 28, opacity: sub, translate: `0px ${(1 - sub) * 20}px` }}>
          Your phones are all you need.
        </div>
      </div>
    </Scene>
  );
};

/* 3 · Calm sounds. */
const SOUNDS = ["Womb", "Shush", "Brown", "Pink", "White", "Ocean"];
export const SoundsScene: React.FC = () => {
  const f = useCurrentFrame();
  const p = springIn(f, 0, 36);
  return (
    <Scene>
      <Sky glowX="25%" glowY="40%" />
      <Sfx at={0} name="whoosh" volume={0.35} />
      {SOUNDS.map((s, i) => <Sfx key={s} at={40 + i * 6} name="tick" volume={0.32} />)}
      <Phone src="home.png" style={{ left: 250, top: 120 + (1 - p) * 140 + float(f), opacity: Math.min(1, p * 1.4), rotate: `${(1 - p) * -6 + float(f, 2, 0.6)}deg` }} />
      <Words title="Calm white noise" sub="Six gentle sounds that keep playing with the screen off." style={{ left: 860, top: 300, width: 900 }} />
      <div style={{ position: "absolute", left: 860, top: 640, display: "flex", gap: 18, flexWrap: "wrap", width: 900 }}>
        {SOUNDS.map((s, i) => {
          const q = springIn(f, 40 + i * 6, 62 + i * 6);
          return (
            <div
              key={s}
              style={{
                fontFamily: BODY, fontWeight: 700, fontSize: 38, color: i === 0 ? C.bg : C.cream,
                background: i === 0 ? C.peach : C.card, borderRadius: 99, padding: "16px 34px",
                opacity: Math.min(1, q * 1.5), scale: `${0.6 + 0.4 * q}`, translate: `0px ${float(f, i, 3)}px`,
              }}
            >
              {s}
            </div>
          );
        })}
      </div>
    </Scene>
  );
};

/* 4 · Never too loud: a level that settles at 50 dB at the crib. */
export const SafeScene: React.FC = () => {
  const f = useCurrentFrame();
  const p = springIn(f, 0, 36);
  const db = interpolate(f, [20, 80], [30, 50], { ...clamp, easing: ease });
  const arc = (db - 30) / 40;
  const R = 200, cx = 260, cy = 250;
  const pt = (a: number) => [cx + R * Math.cos(Math.PI * (1 - a)), cy - R * Math.sin(Math.PI * (1 - a))];
  const [ex, ey] = pt(arc);
  const [lx, ly] = pt(0.5);
  const settle = springIn(f, 78, 100);
  return (
    <Scene>
      <Sky glowX="75%" glowY="40%" />
      <Sfx at={0} name="whoosh" volume={0.3} />
      <Sfx at={80} name="chime" volume={0.22} />
      <Words title="Never too loud" sub="Tell hush how far the crib is. It keeps the sound under 50 dB there." style={{ left: 150, top: 200, width: 860 }} />
      <svg width={520} height={330} style={{ position: "absolute", left: 230, top: 600, opacity: Math.min(1, p * 1.4), scale: `${1 + 0.04 * settle * (1 - prog(f, 100, 130))}` }}>
        <path d={`M ${cx - R} ${cy} A ${R} ${R} 0 0 1 ${cx + R} ${cy}`} stroke={C.card} strokeWidth={30} fill="none" strokeLinecap="round" />
        <path d={`M ${cx - R} ${cy} A ${R} ${R} 0 0 1 ${ex} ${ey}`} stroke={C.sage} strokeWidth={30} fill="none" strokeLinecap="round" />
        <line x1={lx} y1={ly - 34} x2={lx} y2={ly + 34} stroke={C.rose} strokeWidth={6} strokeLinecap="round" />
        <text x={cx} y={cy - 30} textAnchor="middle" fill={C.cream} style={{ fontFamily: DISPLAY, fontSize: 120, fontWeight: 500 }}>{Math.round(db)}</text>
        <text x={cx} y={cy + 40} textAnchor="middle" fill={C.muted} style={{ fontFamily: BODY, fontSize: 36, fontWeight: 700 }}>dB at the crib</text>
      </svg>
      <Phone src="sounds.png" style={{ left: 1250, top: 120 + (1 - p) * 140 + float(f, 1), opacity: Math.min(1, p * 1.4), rotate: `${(1 - p) * 6 + float(f, 3, 0.6)}deg` }} />
    </Scene>
  );
};

/* 5 · Smart volume: the curve draws itself, then a cry bumps it back up. */
export const SmartScene: React.FC = () => {
  const f = useCurrentFrame();
  const draw = interpolate(f, [20, 125], [0, 1], { ...clamp, easing: ease });
  const W = 1400, H = 380, x0 = 260, y0 = 560;
  const y = (db: number) => y0 + H - ((db - 40) / 12) * H;
  const pts: [number, number][] = [];
  for (let i = 0; i <= 240; i++) {
    const u = i / 240;
    let db = 50;
    if (u > 0.22) db = 50 - 6 * Math.min(1, (u - 0.22) / 0.3) ** 0.8;
    db = db + 5.2 * Math.exp(-(((u - 0.7) / 0.035) ** 2));
    pts.push([x0 + u * W, y(db)]);
  }
  const shown = pts.slice(0, Math.max(2, Math.round(draw * pts.length)));
  const d = shown.map(([a, b], i) => `${i ? "L" : "M"} ${a.toFixed(1)} ${b.toFixed(1)}`).join(" ");
  const [hx, hy] = shown[shown.length - 1];
  const cry = springIn(f, 96, 116) * (1 - prog(f, 150, 165));
  const label = (txt: string, x: number, at: number) => {
    const q = prog(f, at, at + 22);
    return <div style={{ position: "absolute", left: x, top: y0 + H + 40, fontFamily: BODY, fontWeight: 700, fontSize: 36, color: C.muted, opacity: q, translate: `${(1 - q) * -16}px 0px` }}>{txt}</div>;
  };
  return (
    <Scene>
      <Sky />
      <Sfx at={20} name="whoosh" volume={0.25} />
      <Sfx at={97} name="pop" volume={0.5} />
      <Words title="Smart volume" sub="Eases down as your baby settles. Turns back up if they cry." align="center" style={{ left: 160, right: 160, top: 120 }} />
      <svg width={1920} height={1080} style={{ position: "absolute", inset: 0 }}>
        {[50, 44].map((v) => (
          <g key={v} opacity={prog(f, 6, 26)}>
            <line x1={x0} x2={x0 + W} y1={y(v)} y2={y(v)} stroke={C.card} strokeWidth={3} strokeDasharray="10 12" />
            <text x={x0 - 30} y={y(v) + 14} textAnchor="end" fill={C.muted} style={{ fontFamily: BODY, fontSize: 36, fontWeight: 700 }}>{v} dB</text>
          </g>
        ))}
        <path d={`${d} L ${hx} ${y0 + H} L ${x0} ${y0 + H} Z`} fill="rgba(246,199,176,.10)" />
        <path d={d} stroke={C.peach} strokeWidth={9} fill="none" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx={hx} cy={hy} r={16 + 3 * Math.sin(f / 6)} fill={C.peach} />
      </svg>
      {label("Falling asleep", x0, 40)}
      {label("Sound asleep", x0 + W * 0.42, 72)}
      <div style={{ position: "absolute", left: x0 + W * 0.7 + 50, top: y(55.5) - 30, fontFamily: BODY, fontWeight: 700, fontSize: 38, color: C.bg, background: C.rose, borderRadius: 99, padding: "12px 30px", opacity: Math.min(1, cry * 1.4), scale: `${0.7 + 0.3 * cry}` }}>
        Crying
      </div>
    </Scene>
  );
};

/* 6 · Monitor: ripples leave the baby's phone, an alert lands on the parent's. */
export const MonitorScene: React.FC = () => {
  const f = useCurrentFrame();
  const a = springIn(f, 0, 36);
  const b = springIn(f, 10, 46);
  const alert = springIn(f, 100, 124);
  return (
    <Scene>
      <Sky glowY="60%" />
      <Sfx at={0} name="whoosh" volume={0.3} />
      {[36, 60, 84].map((t) => <Sfx key={t} at={t} name="ripple" volume={0.35} />)}
      <Sfx at={100} name="chime" volume={0.5} />
      <Words title="Any phone is a baby monitor" sub="Leave one by the crib. Get an alert on yours, over Wi-Fi or mobile data." align="center" style={{ left: 140, right: 140, top: 70 }} />
      {[0, 1, 2, 3].map((i) => {
        const t = ((f - 30 - i * 16) % 64) / 64;
        const on = f > 30 + i * 16 && f < 150;
        return <div key={i} style={{ position: "absolute", left: 585, top: 620, width: 60, height: 60, borderRadius: "50%", border: `5px solid ${C.sage}`, opacity: on ? (1 - t) * 0.8 : 0, scale: `${1 + t * 6}` }} />;
      })}
      <Phone src="monitor.png" width={290} style={{ left: 470, top: 330 + (1 - a) * 120 + float(f, 0, 5), opacity: Math.min(1, a * 1.4), rotate: `${-4 + float(f, 1, 0.5)}deg` }} />
      <Phone src="parent.png" width={290} style={{ left: 1160, top: 330 + (1 - b) * 120 + float(f, 2, 5), opacity: Math.min(1, b * 1.4), rotate: `${4 + float(f, 3, 0.5)}deg`, scale: `${1 + 0.03 * alert * (1 - prog(f, 124, 150))}` }}>
        <div style={{ position: "absolute", left: 14, right: 14, top: 14 + (1 - alert) * -140, opacity: Math.min(1, alert * 1.5), background: "rgba(245,238,227,.97)", borderRadius: 26, padding: "18px 20px", display: "flex", gap: 14, alignItems: "center", boxShadow: "0 12px 40px rgba(0,0,0,.4)" }}>
          <div style={{ width: 46, height: 46, borderRadius: 14, background: C.bg, display: "grid", placeItems: "center" }}>
            <div style={{ width: 22, height: 22, borderRadius: "50%", background: C.moon }} />
          </div>
          <div>
            <div style={{ fontFamily: BODY, fontWeight: 700, fontSize: 18, color: "#6f6680" }}>hush · now</div>
            <div style={{ fontFamily: BODY, fontWeight: 700, fontSize: 23, color: C.bg, whiteSpace: "nowrap" }}>Leo is crying</div>
          </div>
        </div>
      </Phone>
      <div style={{ position: "absolute", left: 330, width: 570, top: 975, textAlign: "center", fontFamily: BODY, fontWeight: 700, fontSize: 34, color: C.muted, opacity: prog(f, 20, 44) }}>Baby's room</div>
      <div style={{ position: "absolute", left: 1020, width: 570, top: 975, textAlign: "center", fontFamily: BODY, fontWeight: 700, fontSize: 34, color: C.muted, opacity: prog(f, 30, 54) }}>Your phone</div>
    </Scene>
  );
};

/* 7 · Nights: the month and the week, side by side. */
export const NightsScene: React.FC = () => {
  const f = useCurrentFrame();
  const a = springIn(f, 0, 36);
  const b = springIn(f, 14, 50);
  return (
    <Scene>
      <Sky glowX="70%" glowY="50%" />
      <Sfx at={0} name="whoosh" volume={0.3} />
      <Sfx at={16} name="whoosh" volume={0.2} />
      <Words title="Watch the nights get calmer" sub="Every night on a timeline, with weekly and monthly trends." style={{ left: 150, top: 300, width: 820 }} />
      <Phone src="week.png" width={380} style={{ left: 1040, top: 150 + (1 - a) * 140 + float(f, 0, 6), opacity: Math.min(1, a * 1.4), rotate: `${-5 + float(f, 1, 0.5)}deg` }} />
      <Phone src="month.png" width={380} style={{ left: 1390, top: 110 + (1 - b) * 140 + float(f, 2, 6), opacity: Math.min(1, b * 1.4), rotate: `${4 + float(f, 3, 0.5)}deg` }} />
    </Scene>
  );
};

/* 8 · The promise, then the end card. */
export const OutroScene: React.FC = () => {
  const f = useCurrentFrame();
  const lines = ["No subscription.", "No extra device.", "Just the phones you already have."];
  const out = 1 - prog(f, 82, 96);
  const end = springIn(f, 96, 126);
  return (
    <Scene>
      <Sky glowY="45%" />
      {lines.map((_, i) => <Sfx key={i} at={6 + i * 16} name="pop" volume={0.42} />)}
      <Sfx at={96} name="swell" volume={0.55} />
      <div style={{ position: "absolute", width: "100%", top: 330, textAlign: "center", opacity: out, translate: `0px ${(1 - out) * -30}px` }}>
        {lines.map((l, i) => {
          const q = springIn(f, 6 + i * 16, 30 + i * 16);
          return (
            <div key={l} style={{ fontFamily: DISPLAY, fontWeight: 500, fontSize: 96, lineHeight: 1.3, color: i === 2 ? C.peach : C.cream, opacity: Math.min(1, q * 1.4), translate: `0px ${(1 - q) * 30}px` }}>
              {l}
            </div>
          );
        })}
      </div>
      <div style={{ opacity: Math.min(1, end * 1.3) }}>
        <Logo size={280} stars={prog(f, 110, 130)} style={{ left: 820, top: 120 + float(f, 0, 5), scale: `${0.85 + 0.15 * end}` }} />
        <div style={{ position: "absolute", width: "100%", top: 470, textAlign: "center", scale: `${0.94 + 0.06 * end}` }}>
          <div style={{ fontFamily: DISPLAY, fontWeight: 600, fontSize: 170, color: C.cream, letterSpacing: -4, lineHeight: 1 }}>hush</div>
          <div style={{ fontFamily: BODY, fontWeight: 600, fontSize: 48, color: C.muted, marginTop: 18 }}>White noise &amp; baby monitor, wherever you sleep</div>
          <div style={{ display: "inline-block", marginTop: 50, fontFamily: BODY, fontWeight: 700, fontSize: 40, color: C.bg, background: C.peach, borderRadius: 99, padding: "18px 46px" }}>
            Get it on Google Play
          </div>
          <div style={{ fontFamily: BODY, fontWeight: 600, fontSize: 36, color: C.muted, marginTop: 26, opacity: prog(f, 118, 140) }}>Try the baby monitor free for 4 days</div>
        </div>
      </div>
    </Scene>
  );
};
