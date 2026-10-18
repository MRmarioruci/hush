// Quick actions from outside the app: home-screen widget, long-press shortcuts on the app icon,
// the Quick Settings tile and notification buttons. They all end up as hush://do/<action>.
import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Linking, Platform } from "react-native";
import type { NavigationContainerRefWithCurrent } from "@react-navigation/native";
import * as Notifications from "expo-notifications";
import * as QuickActions from "expo-quick-actions";
import { requestWidgetUpdate } from "react-native-android-widget";
import { HushWidget } from "./widget/HushWidget";
import { writeSnap, type Snap } from "./widget/snap";
import { onWidgetAction } from "./widget/bus";
import { useSleep } from "./state/sleep";
import { useMonitor } from "./state/monitor";
import { useNaps } from "./state/naps";
import { listenFromOutside, playFromOutside } from "./components/Listen";
import { roomCmd } from "./screens/MonitorScreen";
import { getMyToken, CLIP_SECONDS } from "./monitor";
import { fmtClock } from "./nights";
import { babyLabel, babyLabelIn, getLang, t, tIn, useLang } from "./i18n";

export type Action = "listen" | "listenBg" | "noise" | "asleep" | "woke" | "monitor" | "sleepToggle";

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
  const run = useRef<(a: string) => void>(() => {});
  run.current = (a: string) => {
    switch (a as Action) {
      case "listen":
        go("Monitor");
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
    }
  };
  const joinRef = useRef(mon.join);
  joinRef.current = mon.join;
  const fromUrl = useCallback((url: string | null) => {
    const m = url?.match(/^hush:\/\/do\/(\w+)/);
    if (m) setTimeout(() => run.current(m[1]), 400); // let the app settle first
    // An invite link from another phone in the family.
    if (url?.startsWith("hush://join")) setTimeout(async () => {
      go("Monitor");
      const err = await joinRef.current(url);
      if (err) Alert.alert("hush", err);
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
      if (r.actionIdentifier && r.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) { fromUrl(`hush://do/${r.actionIdentifier}`); return; }
      const d = r.notification.request.content.data as { type?: string; url?: string; at?: number; seconds?: number } | undefined;
      if (d?.type === "clip" && d.url) {
        mon.update({ clip: { url: d.url, at: d.at ?? Date.now(), seconds: d.seconds, got: Date.now() } });
        setTimeout(() => { go("Monitor"); playFromOutside(d.url!); }, 400);
      }
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
  useEffect(() => {
    if (Platform.OS !== "android") return;
    const st = naps.state;
    const asleep = st.asleep;
    let status: string, tone: Snap["tone"], line: string | null = null, title: string;
    if (role === "parent") {
      title = t("remote.phoneOf", { name: mon.targetBaby ? babyLabel(mon.targetBaby) : mon.targetName });
      const fresh = room && Date.now() - (room.got ?? room.at) < 25 * 60_000;
      tone = !room ? "off" : !fresh && room.listening ? "warn" : room.listening ? "on" : "off";
      status = asleep ? t("qa.asleepSince", { time: fmtClock(st.since) }) : !room ? t("remote.noState") : room.listening ? t("remote.listening") : t("remote.notListening");
      line = room ? (room.playing ? t(`sound.${room.sound}`) : t("remote.noiseOff")) : null;
    } else {
      title = role === "nursery" ? t("hero.room", { name: baby }) : "hush";
      tone = mon.status.crying ? "cry" : mon.listening ? "on" : "off";
      status = asleep ? t("qa.asleepSince", { time: fmtClock(st.since) })
        : role === "nursery" ? (mon.listening ? t("remote.listening") : t("remote.notListening"))
        : sleep.playing ? t(`sound.${sleep.soundId}`) : t("remote.noiseOff");
      line = !asleep && st.target && f.naps ? t(st.bedtime ? "nap.bedAround" : "nap.around", { time: fmtClock(st.target) }) : (sleep.playing && role === "nursery" ? t(`sound.${sleep.soundId}`) : null);
    }
    const snap: Snap = {
      role, title, status, tone, line,
      playing: role === "parent" ? !!room?.playing : sleep.playing,
      asleep,
      monitorOn: mon.listening,
      showMonitor: role === "nursery",
      showNoise: role === "parent" ? !!mon.target : f.sounds,
      showSleep: f.naps,
      showListen: role === "parent" && !!mon.target,
      myToken, pairedToken: mon.target ?? undefined,
      // So the widget can tell the other phones about sleep on its own.
      peers: !f.monitor ? [] : mon.members.map((p) => { const L = p.lang ?? getLang(); const name = babyLabelIn(L, mon.m.babyName); return { token: p.token, asleep: tIn(L, "push.asleep", { name, time: "{time}" }), awake: tIn(L, "push.awake", { name, dur: "{dur}" }) }; }),
      roomAsleep: asleep && !naps.fromSound && role === "parent",
      labels: {
        listen: t("qa.listen"), noiseOn: t("qa.noiseOn"), noiseOff: t("qa.noiseOff"),
        asleep: t("qa.asleepShort"), woke: t("qa.wokeShort"), monitorOn: t("qa.monitorOnShort"), monitorOff: t("qa.monitorOffShort"),
        empty: t("qa.empty"), fetching: t("listen.sending"), openApp: t("qa.openApp"), sent: t("qa.sent"),
        working: t("qa.working"), noAnswer: t("remote.noReplyShort"),
      },
    };
    const id = setTimeout(() => {
      writeSnap(snap).then(() => requestWidgetUpdate({ widgetName: "Hush", renderWidget: () => <HushWidget snap={snap} /> })).catch(() => {});
    }, 300);
    return () => clearTimeout(id);
  }, [role, room, naps.state, mon.listening, mon.status.crying, sleep.playing, sleep.soundId, f.naps, f.sounds, mon.target, mon.targetBaby, mon.members, mon.m.clip?.got, room?.got, myToken, baby, lang]); // eslint-disable-line react-hooks/exhaustive-deps

  return null;
}
