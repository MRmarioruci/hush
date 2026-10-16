import { loadFont } from "@remotion/fonts";
import { Audio } from "@remotion/media";
import React from "react";
import {
  AbsoluteFill,
  Easing,
  Img,
  interpolate,
  random,
  staticFile,
  useCurrentFrame,
} from "remotion";

export const C = {
  bg: "#1b1727",
  bg2: "#2f2747",
  card: "#241f33",
  cream: "#f5eee3",
  muted: "#a79fb8",
  peach: "#f6c7b0",
  rose: "#f2a597",
  sage: "#a9d6bd",
  moon: "#f6e2b0",
  moonDeep: "#e4c483",
};

export const DISPLAY = "Fredoka";
export const BODY = "Nunito";

loadFont({ family: DISPLAY, url: staticFile("Fredoka_500Medium.ttf"), weight: "500" });
loadFont({ family: DISPLAY, url: staticFile("Fredoka_600SemiBold.ttf"), weight: "600" });
loadFont({ family: BODY, url: staticFile("Nunito_600SemiBold.ttf"), weight: "600" });
loadFont({ family: BODY, url: staticFile("Nunito_700Bold.ttf"), weight: "700" });

export const ease = Easing.bezier(0.16, 1, 0.3, 1);
export const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

/** 0 → 1 between two frames with the house ease. */
export const prog = (frame: number, a: number, b: number) =>
  interpolate(frame, [a, b], [0, 1], { ...clamp, easing: ease });

/** Night sky: soft gradient and slowly twinkling stars. */
export const Sky: React.FC<{ glowX?: string; glowY?: string }> = ({ glowX = "50%", glowY = "0%" }) => {
  const frame = useCurrentFrame();
  const stars = Array.from({ length: 70 }, (_, i) => ({
    x: random(`x${i}`) * 100,
    y: random(`y${i}`) * 100,
    s: 1.5 + random(`s${i}`) * 3,
    p: random(`p${i}`) * Math.PI * 2,
  }));
  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(110% 90% at ${glowX} ${glowY}, ${C.bg2} 0%, ${C.bg} 62%)`,
      }}
    >
      {stars.map((st, i) => (
        <div
          key={i}
          style={{
            position: "absolute",
            left: `${st.x}%`,
            top: `${st.y}%`,
            width: st.s,
            height: st.s,
            borderRadius: "50%",
            background: C.cream,
            opacity: 0.25 + 0.35 * (0.5 + 0.5 * Math.sin(frame / 22 + st.p)),
          }}
        />
      ))}
    </AbsoluteFill>
  );
};

/** A phone showing one of the app's screens. Height is twice the width, like the screenshots. */
export const Phone: React.FC<{
  src: string;
  width?: number;
  style?: React.CSSProperties;
  children?: React.ReactNode;
}> = ({ src, width = 420, style, children }) => (
  <div
    style={{
      position: "absolute",
      width,
      height: width * 2 + 28,
      padding: 14,
      borderRadius: width * 0.13,
      background: "#2a2440",
      boxShadow: "0 40px 120px rgba(0,0,0,.55), inset 0 0 0 2px rgba(255,255,255,.07)",
      ...style,
    }}
  >
    <div style={{ position: "relative", width: "100%", height: "100%", borderRadius: width * 0.1, overflow: "hidden" }}>
      <Img src={staticFile(src)} style={{ width: "100%", display: "block" }} />
      {children}
    </div>
  </div>
);

/** Big headline plus a supporting line, revealed with a gentle rise. */
export const Words: React.FC<{
  title: string;
  sub?: string;
  at?: number;
  style?: React.CSSProperties;
  align?: "left" | "center";
}> = ({ title, sub, at = 8, style, align = "left" }) => {
  const frame = useCurrentFrame();
  const a = prog(frame, at, at + 24);
  const b = prog(frame, at + 10, at + 36);
  return (
    <div style={{ position: "absolute", textAlign: align, ...style }}>
      <div
        style={{
          fontFamily: DISPLAY,
          fontWeight: 500,
          fontSize: 96,
          lineHeight: 1.05,
          color: C.cream,
          letterSpacing: -1,
          opacity: a,
          translate: `0px ${(1 - a) * 30}px`,
        }}
      >
        {title}
      </div>
      {sub && (
        <div
          style={{
            fontFamily: BODY,
            fontWeight: 600,
            fontSize: 44,
            lineHeight: 1.35,
            color: C.muted,
            marginTop: 26,
            opacity: b,
            translate: `0px ${(1 - b) * 24}px`,
          }}
        >
          {sub}
        </div>
      )}
    </div>
  );
};

/** The hush moon: a soft glowing disc with a few craters. */
export const Moon: React.FC<{ size: number; style?: React.CSSProperties }> = ({ size, style }) => (
  <div
    style={{
      position: "absolute",
      width: size,
      height: size,
      borderRadius: "50%",
      background: `radial-gradient(circle at 38% 32%, #fbf0d2, ${C.moon} 45%, ${C.moonDeep})`,
      boxShadow: `0 0 ${size * 0.5}px rgba(246,226,176,.35), 0 0 0 ${size * 0.14}px rgba(255,255,255,.03)`,
      ...style,
    }}
  >
    {[
      [0.22, 0.2, 0.24],
      [0.62, 0.58, 0.1],
      [0.28, 0.66, 0.14],
    ].map(([x, y, s], i) => (
      <div
        key={i}
        style={{
          position: "absolute",
          left: x * size,
          top: y * size,
          width: s * size,
          height: s * size,
          borderRadius: "50%",
          background: "rgba(200,170,110,.32)",
        }}
      />
    ))}
  </div>
);

/** Entrance with a soft overshoot, for things that pop in. */
export const springIn = (frame: number, a: number, b: number) =>
  interpolate(frame, [a, b], [0, 1], { ...clamp, easing: Easing.spring({ damping: 14 }) });

/** Gentle idle float so nothing on screen is ever fully still. */
export const float = (frame: number, seed = 0, amp = 7) => Math.sin(frame / 28 + seed) * amp;

/** A small sound effect at a frame inside the current scene. */
export const Sfx: React.FC<{ at: number; name: string; volume?: number }> = ({ at, name, volume = 0.5 }) => (
  <Audio from={at} src={staticFile(`sfx-${name}.wav`)} volume={volume} />
);

/** Scene wrapper: a very slow push-in, like a camera drifting closer. */
export const Scene: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const frame = useCurrentFrame();
  return <AbsoluteFill style={{ scale: `${1 + frame * 0.00028}` }}>{children}</AbsoluteFill>;
};

/** The hush logo: the app icon's crescent with two small stars, softly glowing. */
export const Logo: React.FC<{ size: number; stars?: number; style?: React.CSSProperties }> = ({ size, stars = 1, style }) => (
  <div style={{ position: "absolute", width: size, height: size, ...style }}>
    <svg width={size} height={size} viewBox="0 0 1024 1024" style={{ position: "absolute", inset: 0, overflow: "visible", filter: `drop-shadow(0 0 ${size * 0.08}px rgba(246,226,176,.45))` }}>
      <path fill={C.moon} d="M600 210a330 330 0 1 0 214 520A270 270 0 0 1 600 210z" />
      <circle cx={760} cy={300} r={22} fill={C.peach} opacity={stars} />
      <circle cx={830} cy={420} r={12} fill={C.peach} opacity={0.8 * stars} />
    </svg>
  </div>
);
