// Nap timing state: all known sleeps (any phone), the sleep in progress, and the next-nap guess.
// Also keeps the "nap due soon" reminder scheduled on this phone.
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { AppState, Platform } from "react-native";
import * as Notifications from "expo-notifications";
import { deleteSleep, endSleep, loadNights, openSleep, startSleep, type Night, type Sleep } from "../nights";
import { napState, type NapState } from "../naps";
import { INFO_CHANNEL } from "../monitor";
import { babyLabel, t, useLang } from "../i18n";
import { useMonitor } from "./monitor";
import { useSleep } from "./sleep";

type NapsCtx = {
  nights: Night[];
  sleeps: Sleep[];
  state: NapState;
  /** Mark asleep / awake. On the baby's phone with the monitor on, this starts or stops listening. */
  fellAsleep: () => Promise<string | null>;
  wokeUp: () => Promise<string | null>;
  reload: () => void;
  /** The sleep in progress was started by the sound; undo removes it. */
  fromSound: boolean;
  undoSound: () => Promise<void>;
};

const Ctx = createContext<NapsCtx | null>(null);
export const useNaps = () => useContext(Ctx)!;
const REMINDER = "nap-reminder";

export function NapsProvider({ children }: { children: ReactNode }) {
  const { s, starts, playing, toggle } = useSleep();
  const mon = useMonitor();
  const lang = useLang();
  const [nights, setNights] = useState<Night[]>([]);
  const [openFrom, setOpenFrom] = useState<number | null>(null);
  const [soundSleep, setSoundSleep] = useState<string | null>(null); // id of a sleep the sound started
  const [now, setNow] = useState(Date.now());

  const reload = useCallback(() => {
    loadNights().then(setNights).catch(() => {});
    openSleep().then((o) => { setOpenFrom(o?.from ?? null); if (!o) setSoundSleep(null); }).catch(() => {});
    setNow(Date.now());
  }, []);
  useEffect(reload, [reload, mon.nightsVersion, mon.listening]);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    const sub = AppState.addEventListener("change", (st) => st === "active" && reload());
    return () => { clearInterval(id); sub.remove(); };
  }, [reload]);

  const sleeps = useMemo(() => nights.flatMap((n) => n.sleeps ?? [])
    .filter((x, i, all) => all.findIndex((y) => y.from === x.from && y.to === x.to) === i) // a sleep across midnight is in two days
    .sort((a, b) => a.from - b.from), [nights]);

  // Asleep: logged on this phone, or this baby's phone is listening, or the baby's phone says so.
  const monitorAsleep = s.features.monitor && mon.m.role === "nursery" && mon.listening;
  const roomAsleep = s.features.monitor && mon.m.role === "parent" && !!mon.m.room?.listening && now - (mon.m.room?.at ?? 0) < 45 * 60_000;
  const since = openFrom ?? (monitorAsleep || roomAsleep ? (sleeps.filter((x) => x.to >= now - 3 * 60_000).at(-1)?.from ?? mon.m.room?.at ?? now) : null);
  const state = useMemo(() => napState(sleeps, s.birthday, since, now), [sleeps, s.birthday, since, now]);

  const useMonitorForSleep = s.features.monitor && mon.m.role === "nursery" && mon.m.parents.length > 0;
  const fellAsleep = useCallback(async () => {
    if (useMonitorForSleep && !mon.listening) { const note = await mon.toggleListening(); reload(); return note; }
    await startSleep();
    reload();
    return null;
  }, [useMonitorForSleep, mon, reload]);
  const wokeUp = useCallback(async () => {
    if (playing) toggle(); // white noise is for sleeping; stop it when the baby is up
    if (useMonitorForSleep && mon.listening) { const note = await mon.toggleListening(); setTimeout(reload, 1500); return note; }
    await endSleep();
    reload();
    return null;
  }, [useMonitorForSleep, mon, reload, playing, toggle]);

  // Starting a sound usually means it's sleep time: start a sleep (with an undo on Home).
  useEffect(() => {
    if (!starts || !s.features.naps || !s.soundStartsSleep || state.asleep) return;
    (async () => {
      await startSleep();
      const o = await openSleep();
      setSoundSleep(o?.id ?? null);
      reload();
    })().catch(() => {});
  }, [starts]); // eslint-disable-line react-hooks/exhaustive-deps
  const undoSound = useCallback(async () => {
    if (soundSleep) await deleteSleep(soundSleep);
    setSoundSleep(null);
    reload();
  }, [soundSleep, reload]);

  // "Nap due soon": 10 minutes before the sweet spot opens.
  useEffect(() => {
    if (Platform.OS === "web") return;
    (async () => {
      await Notifications.cancelScheduledNotificationAsync(REMINDER).catch(() => {});
      if (!s.features.naps || !s.napReminders || state.asleep || !state.sweet) return;
      const at = state.sweet[0] - 10 * 60_000;
      if (at <= Date.now() + 30_000) return;
      const name = babyLabel(mon.m.babyName);
      await Notifications.scheduleNotificationAsync({
        identifier: REMINDER,
        content: { title: "hush", body: t(state.bedtime ? "nap.reminderBed" : "nap.reminder", { name }), data: { type: "nap-reminder" } },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: new Date(at), channelId: INFO_CHANNEL },
      }).catch(() => {});
    })();
  }, [s.features.naps, s.napReminders, state.asleep, state.asleep ? 0 : state.sweet?.[0], lang]); // eslint-disable-line react-hooks/exhaustive-deps

  return <Ctx.Provider value={{ nights, sleeps, state, fellAsleep, wokeUp, reload, fromSound: !!soundSleep && openFrom != null, undoSound }}>{children}</Ctx.Provider>;
}
