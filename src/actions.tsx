// Quick actions from outside the app: home-screen widget, long-press shortcuts on the app icon,
// the Quick Settings tile and notification buttons. They all end up as hush://do/<action>.
import { useCallback, useEffect, useRef } from "react";
import { Linking, Platform } from "react-native";
import type { NavigationContainerRefWithCurrent } from "@react-navigation/native";
import * as Notifications from "expo-notifications";
import * as QuickActions from "expo-quick-actions";
import { requestWidgetUpdate } from "react-native-android-widget";
import { HushWidget } from "./widget/HushWidget";
import { writeSnap, type Snap } from "./widget/snap";
import { useSleep } from "./state/sleep";
import { useMonitor } from "./state/monitor";
import { useNaps } from "./state/naps";
import { listenFromOutside } from "./components/Listen";
import { roomCmd } from "./screens/MonitorScreen";
import { getMyToken, CLIP_SECONDS } from "./monitor";
import { fmtClock } from "./nights";
import { babyLabel, t, useLang } from "./i18n";

export type Action = "listen" | "noise" | "asleep" | "woke" | "monitor" | "sleepToggle";

export function QuickActionsHub({ nav }: { nav: NavigationContainerRefWithCurrent<Record<string, object | undefined>> }) {
  const sleep = useSleep();
  const mon = useMonitor();
  const naps = useNaps();
  const lang = useLang();
  const f = sleep.s.features;
  const role = f.monitor ? mon.m.role : null;
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
      case "noise":
        if (role === "parent" && mon.m.pairedToken) roomCmd(mon.m.pairedToken, mon.m.room?.playing ? "stop" : "play");
        else sleep.toggle();
        break;
      case "asleep": if (!naps.state.asleep) naps.fellAsleep(); break;
      case "woke": if (naps.state.asleep) naps.wokeUp(); break;
      case "sleepToggle": naps.state.asleep ? naps.wokeUp() : naps.fellAsleep(); break;
      case "monitor": go("Monitor"); mon.toggleListening(); break;
    }
  };
  const fromUrl = useCallback((url: string | null) => {
    const m = url?.match(/^hush:\/\/do\/(\w+)/);
    if (m) setTimeout(() => run.current(m[1]), 400); // let the app settle first
  }, []);

  useEffect(() => {
    Linking.getInitialURL().then(fromUrl).catch(() => {});
    const a = Linking.addEventListener("url", (e) => fromUrl(e.url));
    // Long-press shortcuts on the app icon.
    if (QuickActions.initial?.id) fromUrl(`hush://do/${QuickActions.initial.id}`);
    const b = QuickActions.addListener((act) => fromUrl(`hush://do/${act.id}`));
    // Buttons on notifications.
    const c = Notifications.addNotificationResponseReceivedListener((r) => {
      if (r.actionIdentifier && r.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) fromUrl(`hush://do/${r.actionIdentifier}`);
    });
    return () => { a.remove(); b.remove(); c.remove(); };
  }, [fromUrl]);

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
    if (role === "parent" && mon.m.pairedToken) items.push({ id: "listen", title: t("qa.listenLong", { name: baby }), icon: Platform.OS === "ios" ? "symbol:ear" : "qa_listen" });
    if (role === "nursery") items.push({ id: "monitor", title: mon.listening ? t("qa.monitorOff") : t("qa.monitorOn"), icon: Platform.OS === "ios" ? "symbol:mic" : "qa_monitor" });
    if (f.sounds || (role === "parent" && mon.m.pairedToken)) items.push({ id: "noise", title: t("qa.noiseToggle"), icon: Platform.OS === "ios" ? "symbol:waveform" : "qa_noise" });
    if (f.naps) items.push({ id: "sleepToggle", title: naps.state.asleep ? t("qa.woke", { name: baby }) : t("qa.asleep", { name: baby }), icon: Platform.OS === "ios" ? (naps.state.asleep ? "symbol:sun.max" : "symbol:moon") : "qa_sleep" });
    QuickActions.setItems(items).catch(() => {});
  }, [role, mon.m.pairedToken, mon.listening, f.sounds, f.naps, naps.state.asleep, baby, lang]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ---------- the home-screen widget (Android) ---------- */
  const myToken = useRef<string | undefined>(undefined);
  useEffect(() => { if (role === "parent") getMyToken().then((x) => { myToken.current = x; }).catch(() => {}); }, [role]);
  const room = mon.m.room;
  useEffect(() => {
    if (Platform.OS !== "android") return;
    const st = naps.state;
    const asleep = st.asleep;
    let status: string, tone: Snap["tone"], line: string | null = null, title: string;
    if (role === "parent") {
      title = t("remote.phoneOf", { name: babyLabel(mon.m.pairedWith ?? mon.m.babyName) });
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
      showNoise: role === "parent" ? !!mon.m.pairedToken : f.sounds,
      showSleep: f.naps,
      showListen: role === "parent" && !!mon.m.pairedToken,
      myToken: myToken.current, pairedToken: mon.m.pairedToken ?? undefined,
      labels: {
        listen: t("qa.listen"), noiseOn: t("qa.noiseOn"), noiseOff: t("qa.noiseOff"),
        asleep: t("qa.asleepShort"), woke: t("qa.wokeShort"), monitorOn: t("qa.monitorOnShort"), monitorOff: t("qa.monitorOffShort"),
        empty: t("qa.empty"),
      },
    };
    const id = setTimeout(() => {
      writeSnap(snap).then(() => requestWidgetUpdate({ widgetName: "Hush", renderWidget: () => <HushWidget snap={snap} /> })).catch(() => {});
    }, 300);
    return () => clearTimeout(id);
  }, [role, room, naps.state, mon.listening, mon.status.crying, sleep.playing, sleep.soundId, f.naps, f.sounds, mon.m.pairedToken, mon.m.pairedWith, baby, lang]); // eslint-disable-line react-hooks/exhaustive-deps

  return null;
}
