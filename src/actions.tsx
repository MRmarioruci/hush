// Quick actions from outside the app: home-screen widget, long-press shortcuts on the app icon,
// the Quick Settings tile and notification buttons. They all end up as hush://do/<action>.
import { showMonitorMain } from "./monitorView";
import { dialog } from "./components/Dialog";
import { useCallback, useEffect, useRef, useState } from "react";
import { Linking, Platform } from "react-native";
import type { NavigationContainerRefWithCurrent } from "@react-navigation/native";
import * as Notifications from "expo-notifications";
import * as QuickActions from "expo-quick-actions";
import { requestWidgetUpdate } from "react-native-android-widget";
import { HushWidget } from "./widget/HushWidget";
import { writeSnap, type Snap } from "./widget/snap";
import { addPushListener } from "./monitor";
import { onWidgetAction } from "./widget/bus";
import { useSleep } from "./state/sleep";
import { useMonitor } from "./state/monitor";
import { useNaps } from "./state/naps";
import { listenFromOutside, playFromOutside } from "./components/Listen";
import { roomCmd } from "./screens/MonitorScreen";
import { getMyToken, CLIP_SECONDS } from "./monitor";
import { fmtClock, fmtDur } from "./nights";
import { babyLabel, babyLabelIn, getLang, t, tIn, useLang } from "./i18n";

export type Action = "listen" | "listenBg" | "noise" | "asleep" | "woke" | "monitor" | "sleepToggle" | "onit" | "playClip" | "syncClip";

export function QuickActionsHub({ nav }: { nav: NavigationContainerRefWithCurrent<Record<string, object | undefined>> }) {
  const sleep = useSleep();
  const mon = useMonitor();
  const naps = useNaps();
  const lang = useLang();
  const f = sleep.s.features;
  const role = f.monitor ? mon.role : null;
  const baby = babyLabel(mon.m.babyName);

  /* ---------- doing things ---------- */
  const go = (screen: string) => { try { if (nav.isReady()) nav.navigate(screen as never); } catch {} };
  /** The Monitor tab, on its main view (not Remote control or the phones list). */
  const goMonitor = () => { go("Monitor"); showMonitorMain(); setTimeout(showMonitorMain, 300); };
  const run = useRef<(a: string) => void>(() => {});
  run.current = (a: string) => {
    switch (a as Action) {
      case "listen":
        goMonitor();
        listenFromOutside(mon.m.clipSeconds ?? CLIP_SECONDS);
        break;
      case "listenBg":
        if (role === "parent" && mon.target) mon.requestClip(mon.m.clipSeconds ?? CLIP_SECONDS);
        break;
      case "noise":
        if (role === "parent" && mon.target) roomCmd(mon.target, mon.room?.playing ? "stop" : "play");
        else sleep.toggle();
        break;
      case "asleep": if (!naps.state.asleep) naps.fellAsleep(); break;
      case "woke": if (naps.state.asleep) naps.wokeUp(); break;
      case "sleepToggle": naps.state.asleep ? naps.wokeUp() : naps.fellAsleep(); break;
      case "monitor": go("Monitor"); mon.toggleListening(); break;
      case "onit": mon.ackCry(); break;
      case "syncClip": mon.syncClip(); break;
      case "playClip": {
        goMonitor();
        const url = mon.syncClip()?.url ?? mon.m.clip?.url;
        if (url) setTimeout(() => playFromOutside(url), 400);
        break;
      }
    }
  };
  const joinRef = useRef(mon.join);
  joinRef.current = mon.join;
  const askRef = useRef(mon.askAllow);
  askRef.current = mon.askAllow;
  const ackRef = useRef(mon.ackCry);
  ackRef.current = mon.ackCry;
  const fromUrl = useCallback((url: string | null) => {
    const m = url?.match(/^hush:\/\/do\/(\w+)/);
    if (m) setTimeout(() => run.current(m[1]), 400); // let the app settle first
    // Tapped "wants to listen in" on this phone.
    if (url?.startsWith("hush://allow-listen")) setTimeout(() => {
      go("Monitor");
      const q = new URLSearchParams(url.split("?")[1] ?? "");
      askRef.current(q.get("who") ?? "", q.get("from") ?? "");
    }, 500);
    // An invite link from another phone in the family.
    if (url?.startsWith("hush://join")) setTimeout(async () => {
      go("Monitor");
      const err = await joinRef.current(url);
      if (err) dialog("hush", err);
    }, 400);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    Linking.getInitialURL().then(fromUrl).catch(() => {});
    const a = Linking.addEventListener("url", (e) => fromUrl(e.url));
    // Long-press shortcuts on the app icon.
    if (QuickActions.initial?.id) fromUrl(`hush://do/${QuickActions.initial.id}`);
    const b = QuickActions.addListener((act) => fromUrl(`hush://do/${act.id}`));
    // Buttons on notifications; tapping a "listen in" clip plays it.
    const onResponse = (r: Notifications.NotificationResponse) => {
      // "I'm on it" on a crying alert: for the room that sent it.
      if (r.actionIdentifier === "onit") {
        const d = r.notification.request.content.data as { from?: string } | undefined;
        ackRef.current(d?.from);
        setTimeout(goMonitor, 400);
        return;
      }
      if (r.actionIdentifier && r.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) { fromUrl(`hush://do/${r.actionIdentifier}`); return; }
      const d = r.notification.request.content.data as { type?: string; url?: string; at?: number; seconds?: number; who?: string; from?: string } | undefined;
      if (d?.type === "allow-listen") { setTimeout(() => { go("Monitor"); askRef.current(d.who ?? "", d.from ?? ""); }, 500); return; }
      if (d?.type === "clip" && d.url) {
        mon.update({ clip: { url: d.url, at: d.at ?? Date.now(), seconds: d.seconds, got: Date.now() } });
        setTimeout(() => { goMonitor(); playFromOutside(d.url!); }, 400);
        return;
      }
      // Crying (and anything else about the baby's room): straight to where the cry and its recording are.
      if (d?.type && ["cry", "clip", "ack", "stopped", "battery"].includes(d.type)) setTimeout(goMonitor, 400);
    };
    const c = Notifications.addNotificationResponseReceivedListener(onResponse);
    let last: Notifications.NotificationResponse | null = null;
    try { if (Platform.OS !== "web") last = Notifications.getLastNotificationResponse(); } catch {}
    if (last && Date.now() - (last.notification.date ?? 0) < 60_000) onResponse(last);
    // Widget buttons, while hush is running.
    // ("listen" from the widget asks for a clip without opening hush; it arrives as a notification.)
    const w = onWidgetAction((act) => run.current(act === "listen" ? "listenBg" : act));
    return () => { a.remove(); b.remove(); c.remove(); w.remove(); };
  }, [fromUrl]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ---------- notification buttons ---------- */
  useEffect(() => {
    if (Platform.OS === "web") return;
    Notifications.setNotificationCategoryAsync("hush-sleep", [
      { identifier: "listen", buttonTitle: t("qa.listen"), options: { opensAppToForeground: true } },
      { identifier: "noise", buttonTitle: t("qa.noiseToggle"), options: { opensAppToForeground: true } },
    ]).catch(() => {});
    Notifications.setNotificationCategoryAsync("hush-cry", [
      { identifier: "onit", buttonTitle: t("ack.button"), options: { opensAppToForeground: true } },
      { identifier: "listen", buttonTitle: t("qa.listen"), options: { opensAppToForeground: true } },
    ]).catch(() => {});
  }, [lang]);

  /* ---------- long-press shortcuts ---------- */
  useEffect(() => {
    if (Platform.OS === "web") return;
    const items: QuickActions.Action[] = [];
    if (role === "parent" && mon.target) items.push({ id: "listen", title: t("qa.listenLong", { name: baby }), icon: Platform.OS === "ios" ? "symbol:ear" : "qa_listen" });
    if (role === "nursery") items.push({ id: "monitor", title: mon.listening ? t("qa.monitorOff") : t("qa.monitorOn"), icon: Platform.OS === "ios" ? "symbol:mic" : "qa_monitor" });
    if (f.sounds || (role === "parent" && mon.target)) items.push({ id: "noise", title: t("qa.noiseToggle"), icon: Platform.OS === "ios" ? "symbol:waveform" : "qa_noise" });
    if (f.naps) items.push({ id: "sleepToggle", title: naps.state.asleep ? t("qa.woke", { name: baby }) : t("qa.asleep", { name: baby }), icon: Platform.OS === "ios" ? (naps.state.asleep ? "symbol:sun.max" : "symbol:moon") : "qa_sleep" });
    QuickActions.setItems(items).catch(() => {});
  }, [role, mon.target, mon.listening, f.sounds, f.naps, naps.state.asleep, baby, lang]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ---------- the home-screen widget (Android) ---------- */
  const [myToken, setMyToken] = useState<string | undefined>(undefined);
  useEffect(() => { if (mon.members.length) getMyToken().then(setMyToken).catch(() => {}); }, [mon.members.length]);
  const room = mon.room;
  // Crying in the baby's room (parent's phone): the last crying alert that arrived.
  const [cryAt, setCryAt] = useState(0);
  useEffect(() => {
    const sub = addPushListener((n) => {
      const d = n.request.content.data as { type?: string; at?: number } | undefined;
      if (d?.type === "cry") setCryAt(Date.now());
    });
    return () => sub.remove();
  }, []);
  // Redraw now and then so times and "crying"/"ready" age out even when nothing else changes.
  const [tick, setTick] = useState(0);
  useEffect(() => { const id = setInterval(() => setTick((x) => x + 1), 60_000); return () => clearInterval(id); }, []);
  useEffect(() => {
    if (Platform.OS !== "android") return;
    const now = Date.now();
    const st = naps.state;
    const asleep = st.asleep;
    const L = { listen: t("qa.listen"), noiseOn: t("qa.noiseOn"), noiseOff: t("qa.noiseOff"), asleep: t("qa.asleepShort"), woke: t("qa.wokeShort"), monitorOn: t("qa.monitorOnShort"), monitorOff: t("qa.monitorOffShort"),
      empty: t("qa.empty"), fetching: t("listen.sending"), openApp: t("qa.openApp"), sent: t("qa.sent"), working: t("qa.working"), noAnswer: t("remote.noReplyShort"),
      onit: t("ack.button"), onitDone: t("w.onit"), play: t("w.play"), retry: t("w.retry"), listening: t("w.listening"), arrives: t("w.arrives"),
      ready: t("w.ready", { time: "{time}" }), readyShort: t("w.readyShort"), readyLine: t("w.readyLine", { s: "{s}" }), playing: t("w.playing"), stop: t("w.stop") };
    let title: string, status: string, line: string | null = null, short: string, scene: Snap["scene"], tone: Snap["tone"];
    let crying = false, ackBy: string | null = null, fetching: Snap["fetching"] = null, clipReady = false, noAnswer = false;
    if (role === "parent") {
      const rb = mon.targetBaby ? babyLabel(mon.targetBaby) : baby;
      const roomName = mon.targetName || t("rt.otherPhone");
      title = t("hero.room", { name: rb });
      const fresh = room && now - (room.got ?? room.at) < 25 * 60_000;
      const ack = mon.ack && now < mon.ack.until ? mon.ack : null;
      crying = !!cryAt && now - cryAt < 10 * 60_000;
      ackBy = ack ? (ack.who === "me" ? "" : ack.who) : null;
      const asked = mon.clipAsked;
      const clip = mon.m.clip;
      const got = !!clip && (clip.got ?? clip.at) >= asked && asked > 0;
      if (asked && !got && now - asked < 30_000) fetching = { at: asked };
      noAnswer = !!asked && !got && now - asked >= 30_000 && now - asked < 5 * 60_000;
      clipReady = !!clip?.url && now - (clip.got ?? clip.at) < 10 * 60_000;
      const extra = room ? [room.playing ? t(`sound.${room.sound}`) : t("remote.noiseOff"), room.battery != null && room.battery >= 0 ? `${room.battery}%` : null].filter(Boolean).join(" · ") : null;
      if (crying && ack) { status = ack.who === "me" ? t("ack.you") : t("ack.other", { who: ack.who }); short = status; tone = "lav"; scene = "cry"; line = t("w.cryingSince", { time: fmtClock(cryAt) }); }
      else if (crying) { status = t("w.cryingSince", { time: fmtClock(cryAt) }); short = t("w.crying"); tone = "rose"; scene = "cry"; line = extra; }
      else if (fetching) { status = t("w.recording", { s: mon.m.clipSeconds ?? CLIP_SECONDS }); short = status; tone = "peach"; scene = asleep ? "asleep" : "awake"; line = t("w.asking", { name: roomName }); }
      else if (noAnswer) { status = t("w.noAnswer", { name: roomName }); short = t("w.noAnswerShort"); tone = "peach"; scene = "awake"; line = room ? t("w.lastHeard", { time: fmtClock(room.got ?? room.at) }) : null; }
      else if (clipReady) { status = t("w.ready", { time: fmtClock(clip!.got ?? clip!.at) }); short = t("w.readyShort"); tone = "sage"; scene = asleep ? "asleep" : "awake"; line = t("w.readyLine", { s: clip!.seconds ?? CLIP_SECONDS }); }
      else {
        scene = asleep ? "asleep" : "awake";
        tone = !room ? "muted" : !fresh && room.listening ? "peach" : room.listening ? "sage" : "muted";
        status = asleep ? t("qa.asleepSince", { time: fmtClock(st.since) }) : !room ? t("remote.noState") : room.listening ? t("remote.listening") : t("remote.notListening");
        short = status;
        line = extra;
      }
    } else if (role === "nursery") {
      title = t("hero.room", { name: baby });
      scene = mon.listening ? "mic" : asleep ? "asleep" : "awake";
      tone = mon.status.crying ? "rose" : mon.listening ? "sage" : "muted";
      const since = mon.listening ? (mon.room?.listenSince || null) : null;
      status = mon.status.crying ? t("w.crying") : mon.listening ? (asleep ? t("qa.asleepSince", { time: fmtClock(st.since) }) : t("remote.listening")) : t("remote.notListening");
      short = status;
      const names = mon.members.map((p) => p.name.trim()).filter(Boolean).join(", ");
      line = mon.listening ? (names ? t("w.alertsTo", { names }) : null) : sleep.playing ? t(`sound.${sleep.soundId}`) : null;
      void since;
    } else {
      title = baby;
      scene = asleep ? "asleep" : "moon";
      tone = sleep.playing ? "peach" : asleep ? "sage" : "muted";
      status = asleep ? t("qa.asleepSince", { time: fmtClock(st.since) }) : sleep.playing ? t(`sound.${sleep.soundId}`) : t("remote.noiseOff");
      short = status;
      line = !asleep && st.target && f.naps ? t(st.bedtime ? "nap.bedAround" : "nap.around", { time: fmtClock(st.target) }) : null;
    }
    const snap: Snap = {
      role, title, status, line, short, scene, tone,
      playing: role === "parent" ? !!room?.playing : sleep.playing,
      asleep,
      monitorOn: mon.listening,
      showMonitor: role === "nursery",
      showNoise: role === "parent" ? !!mon.target : f.sounds,
      showSleep: f.naps,
      showListen: role === "parent" && !!mon.target,
      crying, ackBy, fetching, clipReady, noAnswer,
      clipUrl: role === "parent" ? mon.m.clip?.url : undefined, clipGot: mon.m.clip?.got, clipSeconds: mon.m.clip?.seconds,
      myToken, myName: mon.m.myName.trim(), pairedToken: mon.target ?? undefined,
      // So the widget can tell the other phones about sleep on its own.
      peers: !f.monitor ? [] : mon.members.map((p) => { const Lg = p.lang ?? getLang(); const name = babyLabelIn(Lg, mon.m.babyName); return { token: p.token, asleep: tIn(Lg, "push.asleep", { name, time: "{time}" }), awake: tIn(Lg, "push.awake", { name, dur: "{dur}" }) }; }),
      roomAsleep: asleep && !naps.fromSound && role === "parent",
      labels: L,
    };
    const id = setTimeout(() => {
      writeSnap(snap).then(() => {
        requestWidgetUpdate({ widgetName: "Hush", renderWidget: (w) => <HushWidget snap={snap} small={w.width < 220} /> }).catch(() => {});
        requestWidgetUpdate({ widgetName: "HushSmall", renderWidget: () => <HushWidget snap={snap} small /> }).catch(() => {});
      }).catch(() => {});
    }, 300);
    // While a recording is on its way, redraw so the ring keeps filling (and turns into Ready / No answer).
    const again = fetching ? setTimeout(() => setTick((x) => x + 1), 1500) : undefined;
    return () => { clearTimeout(id); if (again) clearTimeout(again); };
  }, [role, room, naps.state, mon.listening, mon.status.crying, sleep.playing, sleep.soundId, f.naps, f.sounds, mon.target, mon.targetBaby, mon.targetName, mon.members, mon.m.clip?.got, mon.clipAsked, mon.ack, cryAt, room?.got, myToken, baby, lang, tick]); // eslint-disable-line react-hooks/exhaustive-deps

  return null;
}
