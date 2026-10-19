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
        if (s.peers?.length && s.myToken) await post(s.peers.map((p) => ({ to: p.token, title: "hush", body: p.asleep.replace("{time}", clock(now)), priority: "high", channelId: "hush-info-2", categoryId: "hush-sleep", tag: `hush-sleep-${s.myToken!.slice(-12)}`, collapseId: `hush-sleep-${s.myToken!.slice(-12)}`, data: { type: "sleep", asleep: true, since: now, from: s.myToken, _id: `w${now}${p.token.slice(-4)}` } })));
        return { ...s, asleep: true, status: s.labels.asleep };
      }
      if (action === "woke") {
        if (open) {
          await endSleep(now);
          if (s.peers?.length && s.myToken) await post(s.peers.map((p) => ({ to: p.token, title: "hush", body: p.awake.replace("{dur}", dur((now - open.from) / 60000)), priority: "high", channelId: "hush-info-2", tag: `hush-sleep-${s.myToken!.slice(-12)}`, collapseId: `hush-sleep-${s.myToken!.slice(-12)}`, data: { type: "sleep", asleep: false, since: now, from: s.myToken, _id: `w${now}${p.token.slice(-4)}` } })));
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

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
// Commands the baby's phone answers; the loader stays until its reply updates hush (or 20 s).
const REMOTE = new Set(["noise", "listen"]);

export async function widgetTaskHandler({ widgetAction: event, clickAction, renderWidget }: WidgetTaskHandlerProps) {
  let snap = await readSnap();
  const draw = (s: Snap | null) => renderWidget(<HushWidget snap={s} />);
  if (event === "WIDGET_CLICK" && clickAction && snap && clickAction !== "OPEN_APP" && clickAction !== "NOOP") {
    // 1. Show the loader on that button right away.
    const at = Date.now();
    snap = { ...snap, busy: { action: clickAction, at }, note: undefined };
    await writeSnap(snap);
    draw(snap);

    if (widgetAction(clickAction)) {
      // 2a. The running app does it, and rewrites the widget (without the loader) when it's done.
      const remote = REMOTE.has(clickAction) && snap.role === "parent";
      const until = at + (remote ? 20000 : 6000);
      while (Date.now() < until) {
        await sleep(1200);
        const cur = await readSnap();
        if (cur && !cur.busy) { draw(cur); return; }
      }
      const cur = (await readSnap()) ?? snap;
      snap = { ...cur, busy: undefined, note: { text: remote ? snap.labels.noAnswer : snap.labels.sent, at: Date.now() } };
    } else {
      // 2b. hush isn't running: the widget does what it can itself.
      snap = { ...(await standalone(clickAction, snap)), busy: undefined };
    }
    await writeSnap(snap);
  }
  if (event !== "WIDGET_DELETED") draw(snap);
}
