// Draws the widget and handles its buttons without opening hush (headless JS on Android).
// When hush is running, the app does the action (it can play sound and use the mic). When it
// isn't, the widget does what it can on its own: commands to the baby's phone, logging sleep.
import type { WidgetTaskHandlerProps } from "react-native-android-widget";
import { HushWidget } from "./HushWidget";
import { readSnap, writeSnap, type Snap } from "./snap";
import { widgetAction } from "./bus";
import { endSleep, openSleep, startSleep } from "../nights";

const PUSH = "https://exp.host/--/api/v2/push/send";
const post = (messages: object[]) => fetch(PUSH, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify(messages) }).catch(() => null);
const cmd = (s: Snap, c: Record<string, unknown>) =>
  s.pairedToken && s.myToken ? post([{ to: s.pairedToken, priority: "high", _contentAvailable: true, data: { type: "cmd", from: s.myToken, _id: `w${Date.now()}`, ...c } }]) : Promise.resolve(null);
const clock = (ms: number) => new Date(ms).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
const dur = (min: number) => (min < 60 ? `${Math.round(min)} min` : `${Math.floor(min / 60)}h ${String(Math.round(min % 60)).padStart(2, "0")}m`);

async function standalone(action: string, s: Snap): Promise<Snap> {
  const now = Date.now();
  const note = (text: string) => ({ ...s, note: { text, at: now } });
  switch (action) {
    case "noise":
      if (s.role === "parent" && s.pairedToken) { await cmd(s, { cmd: s.playing ? "stop" : "play" }); return { ...note(s.labels.sent), playing: !s.playing, pending: now }; }
      return note(s.labels.openApp); // playing sound needs hush open
    case "listen":
      if (s.role === "parent" && s.pairedToken) { await cmd(s, { cmd: "clip", seconds: 10 }); return note(s.labels.fetching); } // the clip arrives as a notification
      return note(s.labels.openApp);
    case "asleep":
    case "woke": {
      const open = await openSleep();
      if (action === "asleep" && !open) {
        await startSleep(now);
        if (s.peers?.length && s.myToken) await post(s.peers.map((p) => ({ to: p.token, title: "hush", body: p.asleep.replace("{time}", clock(now)), priority: "high", channelId: "cry-alerts", categoryId: "hush-sleep", data: { type: "sleep", asleep: true, since: now, from: s.myToken, _id: `w${now}${p.token.slice(-4)}` } })));
        return { ...s, asleep: true, status: s.labels.asleep };
      }
      if (action === "woke") {
        if (open) {
          await endSleep(now);
          if (s.peers?.length && s.myToken) await post(s.peers.map((p) => ({ to: p.token, title: "hush", body: p.awake.replace("{dur}", dur((now - open.from) / 60000)), priority: "high", channelId: "cry-alerts", data: { type: "sleep", asleep: false, since: now, from: s.myToken, _id: `w${now}${p.token.slice(-4)}` } })));
        } else if (s.roomAsleep) {
          await cmd(s, { cmd: "woke" }); // the baby's phone ends its sleep
        }
        return { ...s, asleep: false, status: s.labels.woke };
      }
      return s;
    }
    case "monitor":
      return note(s.labels.openApp); // the microphone can only start with hush open
  }
  return s;
}

export async function widgetTaskHandler({ widgetAction: event, clickAction, renderWidget }: WidgetTaskHandlerProps) {
  let snap = await readSnap();
  if (event === "WIDGET_CLICK" && clickAction && snap) {
    if (clickAction === "OPEN_APP") { /* handled by the system */ }
    else if (widgetAction(clickAction)) {
      // The running app does it and redraws the widget; show a hint meanwhile.
      snap = { ...snap, note: { text: snap.labels.sent, at: Date.now() } };
    } else {
      snap = await standalone(clickAction, snap);
    }
    await writeSnap(snap);
  }
  if (event !== "WIDGET_DELETED") renderWidget(<HushWidget snap={snap} />);
}
