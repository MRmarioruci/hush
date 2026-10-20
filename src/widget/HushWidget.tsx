// The home-screen widget (Android), in the app's circle style: the room as a picture in a round
// circle, the status in colour, round buttons. Drawn outside the app with widget primitives only;
// widgets can't animate, so the Listen loader is a ring the handler redraws as it fills.
// Two sizes: the 4×2 "Hush" and the compact 2×2 "HushSmall" (or any Hush made narrow).
import { FlexWidget, SvgWidget, TextWidget } from "react-native-android-widget";
import type { Scene, Snap, Tone } from "./snap";

const C = { bg: "#221b45", card: "#2e2558", card2: "#3a3070", cream: "#f7f1ff", muted: "#b7aee0", dim: "#8f86bf", peach: "#ffd68c", sage: "#9ee6c4", rose: "#ff9db0", lav: "#c9bfff", deep: "#1e4a39" } as const;
const TONE: Record<Tone, { ink: string; glow: string }> = {
  sage: { ink: C.sage, glow: "158,230,196" },
  rose: { ink: C.rose, glow: "255,157,176" },
  peach: { ink: C.peach, glow: "255,214,140" },
  lav: { ink: C.lav, glow: "201,191,255" },
  muted: { ink: C.muted, glow: "201,191,255" },
};
type Hex = `#${string}`;
const hex = (x: string) => x as Hex;
const TITLE = "Fredoka_600SemiBold";
const BODY = "Quicksand_700Bold";

/* ---------- pictures ---------- */
function baby(state: "asleep" | "awake" | "cry") {
  const face = '<circle cx="40" cy="42" r="16" fill="#ffe1cf"/><ellipse cx="31" cy="48" rx="3.4" ry="2.2" fill="#ff9db0"/><ellipse cx="50" cy="48" rx="3.4" ry="2.2" fill="#ff9db0"/>';
  const eyes = state === "asleep"
    ? `<path d="M32 42q3.5 3.5 7 0M42 42q3.5 3.5 7 0" stroke="#5b4320" stroke-width="2.6" fill="none" stroke-linecap="round"/><path d="M64 20h7l-7 8h7M76 8h5l-5 6h5" stroke="${C.sage}" stroke-width="2.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`
    : state === "cry"
      ? `<path d="M32 40l6 3M49 40l-6 3" stroke="#5b4320" stroke-width="2.6" fill="none" stroke-linecap="round"/><ellipse cx="40.5" cy="50" rx="4" ry="3.4" fill="#5b4320"/><path d="M30 46q-2 5 0 7" stroke="#8fd3ff" stroke-width="2.4" fill="none" stroke-linecap="round"/><path d="M64 18l6-4M66 28h7M63 9l3-6" stroke="${C.rose}" stroke-width="3" stroke-linecap="round"/>`
      : '<circle cx="35" cy="41" r="2.4" fill="#5b4320"/><circle cx="46" cy="41" r="2.4" fill="#5b4320"/><path d="M36 48q4.5 3 9 0" stroke="#5b4320" stroke-width="2.4" fill="none" stroke-linecap="round"/>';
  return `<rect x="10" y="38" width="76" height="36" rx="13" fill="#3e3378"/>${face}${eyes}<path d="M22 56h64v13a6 6 0 0 1-6 6H28a6 6 0 0 1-6-6z" fill="${C.lav}"/>`;
}
/** The big circle: glow rings, the circle, and the picture, as one image. */
function circleSvg(scene: Scene, tone: Tone) {
  const g = TONE[tone].glow;
  const fill = scene === "mic" ? C.sage : C.card;
  let art: string;
  if (scene === "mic") art = `<g transform="translate(30 30) scale(1.83)" fill="none" stroke="${C.bg}" stroke-width="2" stroke-linecap="round"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21"/></g>`;
  else if (scene === "moon") art = `<g transform="translate(26 26) scale(0.4)"><path d="M98 22a58 58 0 1 0 30 78A48 48 0 0 1 98 22z" fill="${C.peach}"/><path d="M50 78q7 6 14 0M78 86q7 6 14 0" stroke="#5b4320" stroke-width="5" fill="none" stroke-linecap="round"/><ellipse cx="48" cy="94" rx="7" ry="4.5" fill="#ff9db0"/><ellipse cx="96" cy="102" rx="7" ry="4.5" fill="#ff9db0"/></g>`;
  else art = `<g transform="translate(19 27) scale(0.8)">${baby(scene)}</g>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 104 104"><circle cx="52" cy="52" r="52" fill="rgba(${g},0.07)"/><circle cx="52" cy="52" r="46" fill="rgba(${g},0.13)"/><circle cx="52" cy="52" r="39" fill="${fill}"/>${art}</svg>`;
}
const LOGO = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 150 150"><path d="M98 22a58 58 0 1 0 30 78A48 48 0 0 1 98 22z" fill="${C.peach}"/><circle cx="124" cy="30" r="9" fill="${C.lav}"/><circle cx="140" cy="56" r="6" fill="${C.lav}"/></svg>`;

const ICON: Record<string, string> = {
  ear: '<path d="M6 8.5a6 6 0 1 1 12 0c0 2.5-1.5 3.6-2.7 4.6-1 .8-1.3 1.6-1.3 2.9a3 3 0 0 1-5.6 1.5"/><path d="M9.5 9a2.5 2.5 0 0 1 5 0c0 1.2-.8 1.8-1.5 2.4"/>',
  play: '<path d="M8.5 5.5v13l10.5-6.5z" fill="INK"/>',
  pause: '<path d="M8 6v12M16 6v12"/>',
  sun: '<circle cx="12" cy="12" r="3.6"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4"/>',
  moon: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>',
  walk: '<circle cx="13" cy="4.5" r="2"/><path d="M10 21l2-6 3 3v4M9 12l2-4 3 1 2 3h3M11 8l-3 2-1 3"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7"/>',
  retry: '<path d="M20 12a8 8 0 1 1-2.3-5.6"/><path d="M20 4v4h-4"/>',
  stop: '<rect x="7" y="7" width="10" height="10" rx="2.5"/>',
  mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21"/>',
};
type Kind = "sage" | "peach" | "rose" | "plain" | "done";
const KIND: Record<Kind, { bg: string; ink: string; label: string }> = {
  sage: { bg: C.sage, ink: C.deep, label: C.muted },
  peach: { bg: C.peach, ink: C.bg, label: C.muted },
  rose: { bg: C.rose, ink: C.bg, label: C.muted },
  plain: { bg: C.card2, ink: C.cream, label: C.muted },
  done: { bg: C.card2, ink: C.sage, label: C.sage },
};
/** A round button as one image: the circle, the icon and, while working, a ring that fills. */
function roundSvg(icon: string, kind: Kind, ring?: number) {
  const k = KIND[kind];
  const body = ICON[icon].replace(/INK/g, k.ink);
  const r = 27, c = 2 * Math.PI * r;
  const ringSvg = ring == null ? "" : `<circle cx="29" cy="29" r="${r}" fill="none" stroke="${C.card2}" stroke-width="3"/><circle cx="29" cy="29" r="${r}" fill="none" stroke="${C.peach}" stroke-width="3" stroke-linecap="round" stroke-dasharray="${(c * ring).toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 29 29)"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 58 58">${ringSvg}<circle cx="29" cy="29" r="23" fill="${ring != null ? C.card2 : k.bg}"/><g transform="translate(18 18) scale(0.92)" fill="none" stroke="${ring != null ? C.peach : k.ink}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${body}</g></svg>`;
}

/* ---------- which buttons ---------- */
type Btn = { action: string; label: string; icon: string; kind: Kind; ring?: number; dim?: boolean; uri?: string };
/** How far the Listen ring has filled: quick at first, never quite full until the recording comes. */
export const ringAt = (since: number) => Math.min(0.94, 0.08 + 0.86 * (1 - Math.exp(-(Date.now() - since) / 9000)));

function buttonsOf(s: Snap): Btn[] {
  const L = s.labels;
  const busy = s.busy && Date.now() - s.busy.at < 35_000 ? s.busy.action : null;
  const fetching = s.fetching && Date.now() - s.fetching.at < 35_000 ? s.fetching.at : busy === "listen" ? s.busy!.at : null;
  const noise: Btn = { action: "noise", label: s.playing ? L.noiseOff : L.noiseOn, icon: s.playing ? "pause" : "play", kind: s.playing ? "peach" : "plain" };
  const sleep: Btn = { action: s.asleep ? "woke" : "asleep", label: s.asleep ? L.woke : L.asleep, icon: s.asleep ? "sun" : "moon", kind: "plain" };
  let list: Btn[] = [];
  if (s.role === "parent" && s.showListen) {
    const listen: Btn = fetching != null
      ? { action: "NOOP", label: L.listening, icon: "ear", kind: "plain", ring: ringAt(fetching) }
      : { action: "listen", label: L.listen, icon: "ear", kind: "sage" };
    if (s.crying && s.ackBy == null) list = [{ action: "onit", label: L.onit, icon: "walk", kind: "rose" }, listen, noise];
    else if (s.crying) list = [{ action: "NOOP", label: L.onitDone, icon: "check", kind: "done" }, listen, noise];
    else if (fetching == null && s.noAnswer) list = [{ action: "listen", label: L.retry, icon: "retry", kind: "peach" }, noise, sleep];
    else if (fetching == null && s.clipReady) list = [{ action: "OPEN_URI", uri: "hush://do/playClip", label: L.play, icon: "play", kind: "sage" }, noise, sleep];
    else list = [listen, noise, sleep];
    if (fetching != null) list = list.map((b) => (b.icon === "ear" ? b : { ...b, dim: true }));
  } else if (s.role === "nursery") {
    list = [noise, sleep, { action: "monitor", label: s.monitorOn ? L.monitorOff : L.monitorOn, icon: s.monitorOn ? "stop" : "mic", kind: s.monitorOn ? "plain" : "sage" }];
  } else {
    list = [s.showNoise ? noise : null, s.showSleep ? sleep : null].filter((b): b is Btn => !!b);
  }
  if (!s.showNoise) list = list.filter((b) => b.action !== "noise");
  if (!s.showSleep) list = list.filter((b) => b.action !== "woke" && b.action !== "asleep");
  // A button that's working (not Listen, which has its ring): an hourglass ring too.
  return list.slice(0, 3).map((b) => (busy && busy !== "listen" && b.action === busy ? { ...b, label: L.working, ring: ringAt(s.busy!.at), action: "NOOP" } : b));
}

function click(b: Btn) {
  if (b.dim || b.action === "NOOP") return { clickAction: "NOOP" };
  if (b.uri) return { clickAction: "OPEN_URI", clickActionData: { uri: b.uri } };
  return { clickAction: b.action };
}

/* ---------- the two sizes ---------- */
function Round({ b }: { b: Btn }) {
  const k = KIND[b.kind];
  return (
    <FlexWidget {...click(b)} accessibilityLabel={b.label} style={{ flex: 1, flexDirection: "column", alignItems: "center", flexGap: 3 }}>
      <SvgWidget svg={roundSvg(b.icon, b.dim ? "plain" : b.kind, b.ring)} style={{ width: 50, height: 50 }} />
      <TextWidget text={b.label} maxLines={1} truncate="END" style={{ fontSize: 11.5, fontFamily: BODY, color: hex(b.ring != null ? C.peach : b.dim ? C.dim : k.label) }} />
    </FlexWidget>
  );
}

function statusOf(s: Snap) {
  return s.note && Date.now() - s.note.at < 60_000 ? { text: s.note.text, tone: "peach" as Tone } : { text: s.status, tone: s.tone };
}

function Big({ s }: { s: Snap }) {
  const st = statusOf(s);
  const btns = buttonsOf(s);
  return (
    <FlexWidget style={{ height: "match_parent", width: "match_parent", backgroundColor: C.bg, borderRadius: 30, paddingHorizontal: 14, paddingVertical: 12, flexDirection: "row", alignItems: "center", flexGap: 12 }}>
      <FlexWidget clickAction="OPEN_APP" style={{ width: 100, height: 100 }}>
        <SvgWidget svg={circleSvg(s.scene, s.tone)} style={{ width: 100, height: 100 }} />
      </FlexWidget>
      <FlexWidget style={{ flex: 1, height: "match_parent", flexDirection: "column" }}>
        <FlexWidget clickAction="OPEN_APP" style={{ width: "match_parent", flexDirection: "column" }}>
          <FlexWidget style={{ width: "match_parent", flexDirection: "row", alignItems: "center", flexGap: 6 }}>
            <FlexWidget style={{ flex: 1 }}><TextWidget text={s.title} maxLines={1} truncate="END" style={{ fontSize: 16.5, fontFamily: TITLE, color: C.cream }} /></FlexWidget>
            <SvgWidget svg={LOGO} style={{ width: 15, height: 15 }} />
            <TextWidget text="hush" style={{ fontSize: 13, fontFamily: TITLE, color: C.peach }} />
          </FlexWidget>
          <TextWidget text={st.text} maxLines={1} truncate="END" style={{ fontSize: 13.5, fontFamily: BODY, color: hex(TONE[st.tone].ink) }} />
          {s.line ? <TextWidget text={s.line} maxLines={1} truncate="END" style={{ fontSize: 12, fontFamily: BODY, color: C.dim }} /> : <FlexWidget />}
        </FlexWidget>
        <FlexWidget style={{ flex: 1 }} />
        <FlexWidget style={{ width: "match_parent", flexDirection: "row" }}>
          {btns.length ? btns.map((b, i) => <Round key={i} b={b} />) : <TextWidget text={s.labels.empty} style={{ fontSize: 13, fontFamily: BODY, color: C.muted }} />}
        </FlexWidget>
      </FlexWidget>
    </FlexWidget>
  );
}

function Small({ s }: { s: Snap }) {
  const st = statusOf(s);
  const b = buttonsOf(s)[0];
  const k = b ? KIND[b.dim ? "plain" : b.kind] : null;
  return (
    <FlexWidget style={{ height: "match_parent", width: "match_parent", backgroundColor: C.bg, borderRadius: 30, padding: 12, flexDirection: "column", alignItems: "center" }}>
      <FlexWidget clickAction="OPEN_APP" style={{ width: "match_parent", flex: 1, flexDirection: "column", alignItems: "center", justifyContent: "center", flexGap: 6 }}>
        <SvgWidget svg={circleSvg(s.scene, s.tone)} style={{ width: 74, height: 74 }} />
        <TextWidget text={s.note && Date.now() - s.note.at < 60_000 ? s.note.text : s.short} maxLines={1} truncate="END" style={{ fontSize: 12.5, fontFamily: BODY, color: hex(TONE[st.tone].ink), textAlign: "center" }} />
      </FlexWidget>
      {b && k ? (
        <FlexWidget {...click(b)} accessibilityLabel={b.label} style={{ width: "match_parent", height: 36, borderRadius: 18, backgroundColor: hex(b.ring != null ? C.card2 : k.bg), flexDirection: "row", alignItems: "center", justifyContent: "center", flexGap: 6 }}>
          <SvgWidget svg={`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="${b.ring != null ? C.peach : k.ink}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${ICON[b.icon].replace(/INK/g, b.ring != null ? C.peach : k.ink)}</svg>`} style={{ width: 16, height: 16 }} />
          <TextWidget text={b.ring != null ? `${b.label} ${Math.round(b.ring * 100)}%` : b.label} maxLines={1} truncate="END" style={{ fontSize: 12.5, fontFamily: BODY, color: hex(b.ring != null ? C.peach : k.ink) }} />
        </FlexWidget>
      ) : <FlexWidget />}
    </FlexWidget>
  );
}

export function HushWidget({ snap, small }: { snap: Snap | null; small?: boolean }) {
  if (!snap || !snap.labels?.onit) {
    return (
      <FlexWidget clickAction="OPEN_APP" style={{ height: "match_parent", width: "match_parent", backgroundColor: C.bg, borderRadius: 30, padding: 16, justifyContent: "center", alignItems: "center", flexDirection: "row", flexGap: 8 }}>
        <SvgWidget svg={LOGO} style={{ width: 26, height: 26 }} />
        <TextWidget text="hush" style={{ fontSize: 22, fontFamily: TITLE, color: C.peach }} />
      </FlexWidget>
    );
  }
  return small ? <Small s={snap} /> : <Big s={snap} />;
}
