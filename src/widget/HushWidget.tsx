// The home-screen widget (Android). Plain widget primitives only: it's drawn outside the app.
import { FlexWidget, SvgWidget, TextWidget } from "react-native-android-widget";
import type { Snap } from "./snap";

const C = { bg: "#1b1727", card: "#241f33", card2: "#2f2943", cream: "#f5eee3", muted: "#a79fb8", peach: "#f6c7b0", sage: "#a9d6bd", rose: "#f2a597", moon: "#f6e2b0" } as const;
const svg = (path: string, color: string) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${path}</svg>`;
const I = {
  ear: '<path d="M6 8.5a6 6 0 1 1 12 0c0 2.5-1.5 3.6-2.7 4.6-1 .8-1.3 1.6-1.3 2.9a3 3 0 0 1-5.6 1.5"/><path d="M9.5 9a2.5 2.5 0 0 1 5 0c0 1.2-.8 1.8-1.5 2.4"/>',
  play: '<path d="M8 5.5v13l11-6.5z"/>',
  pause: '<path d="M8 6v12M16 6v12"/>',
  moon: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>',
};

type Btn = { label: string; icon: string; on?: boolean; action: string; data?: Record<string, unknown> };

function Button({ b }: { b: Btn }) {
  const fg = b.on ? C.bg : C.cream;
  return (
    <FlexWidget
      clickAction={b.action}
      clickActionData={b.data}
      accessibilityLabel={b.label}
      style={{ flex: 1, height: "match_parent", backgroundColor: b.on ? C.peach : C.card2, borderRadius: 18, flexDirection: "column", alignItems: "center", justifyContent: "center", flexGap: 4, paddingHorizontal: 4 }}
    >
      <SvgWidget svg={svg(b.icon, fg)} style={{ height: 20, width: 20 }} />
      <TextWidget text={b.label} maxLines={1} style={{ fontSize: 12, fontWeight: "700", color: fg }} />
    </FlexWidget>
  );
}

const link = (what: string, extra = "") => ({ action: "OPEN_URI", data: { uri: `hush://do/${what}${extra}` } });

export function HushWidget({ snap }: { snap: Snap | null }) {
  if (!snap) {
    return (
      <FlexWidget clickAction="OPEN_APP" style={{ height: "match_parent", width: "match_parent", backgroundColor: C.card, borderRadius: 24, padding: 16, justifyContent: "center", alignItems: "center" }}>
        <TextWidget text="hush" style={{ fontSize: 22, fontWeight: "700", color: C.moon }} />
      </FlexWidget>
    );
  }
  const L = snap.labels;
  const dot = snap.tone === "cry" ? C.rose : snap.tone === "warn" ? C.peach : snap.tone === "on" ? C.sage : C.muted;
  const remoteNoise = snap.role === "parent" && !!snap.pairedToken && !!snap.myToken;
  const buttons: Btn[] = [];
  if (snap.showListen) buttons.push({ label: L.listen, icon: I.ear, ...link("listen") });
  if (snap.showMonitor) buttons.push({ label: snap.monitorOn ? L.monitorOff : L.monitorOn, icon: I.mic, on: snap.monitorOn, ...link("monitor") });
  if (snap.showNoise) {
    const n = { label: snap.playing ? L.noiseOff : L.noiseOn, icon: snap.playing ? I.pause : I.play, on: snap.playing };
    buttons.push(remoteNoise ? { ...n, action: "noise" } : { ...n, ...link("noise") });
  }
  if (snap.showSleep) buttons.push({ label: snap.asleep ? L.woke : L.asleep, icon: snap.asleep ? I.sun : I.moon, on: false, ...link(snap.asleep ? "woke" : "asleep") });

  return (
    <FlexWidget style={{ height: "match_parent", width: "match_parent", backgroundColor: C.card, borderRadius: 24, padding: 14, flexDirection: "column", flexGap: 10 }}>
      <FlexWidget clickAction="OPEN_APP" style={{ width: "match_parent", flexDirection: "row", alignItems: "center", flexGap: 10 }}>
        <FlexWidget style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: dot }} />
        <FlexWidget style={{ flex: 1, flexDirection: "column" }}>
          <TextWidget text={snap.title} maxLines={1} style={{ fontSize: 16, fontWeight: "700", color: C.cream }} />
          <TextWidget text={snap.pending && Date.now() - snap.pending < 20000 ? "…" : snap.status} maxLines={1} style={{ fontSize: 13, color: dot }} />
          {snap.line ? <TextWidget text={snap.line} maxLines={1} style={{ fontSize: 12, color: C.muted }} /> : <FlexWidget />}
        </FlexWidget>
      </FlexWidget>
      <FlexWidget style={{ flex: 1, width: "match_parent", flexDirection: "row", flexGap: 8 }}>
        {buttons.length ? buttons.map((b, i) => <Button key={i} b={b} />) : <TextWidget text={L.empty} style={{ fontSize: 13, color: C.muted }} />}
      </FlexWidget>
    </FlexWidget>
  );
}
