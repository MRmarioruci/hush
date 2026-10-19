// Nap timing state: all known sleeps (any phone), the sleep in progress, and the next-nap guess.
// Also keeps the "nap due soon" reminder scheduled on this phone, and tells the paired phones
// when the baby falls asleep, wakes up, or white noise starts on the baby's phone.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AppState, Platform } from "react-native";
import * as Notifications from "expo-notifications";
import { deleteSleep, endSleep, loadNights, openSleep, startSleep, type Night, type Sleep } from "../nights";
import { napState, type NapState } from "../naps";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { INFO_CHANNEL, addPushListener, getMyToken, sendData, sendPush } from "../monitor";
import { babyLabel, babyLabelIn, getLang, t, tIn, useLang, type Lang } from "../i18n";
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
  /** A sleep that has gone on far longer than makes sense (someone forgot "woke up"), and a guess
   * of when it really ended (white noise turned off, monitor stopped). */
  stale: { since: number; guess: number | null } | null;
  /** End the sleep at a given time. */
  wokeAt: (at: number) => Promise<string | null>;
  /** "Still asleep": stop asking for a while. */
  stillAsleep: () => void;
};

const Ctx = createContext<NapsCtx | null>(null);
export const useNaps = () => useContext(Ctx)!;
const REMINDER = "nap-reminder";
const PEER = "hush:peerSleep";
const ACK = "hush:stillAsleepAt";
/** What a paired phone last said: asleep since when, or awake. */
type PeerSleep = { asleep: boolean; since: number; at: number; from: string };

const durIn = (L: Lang, min: number) => {
  const m = Math.round(min);
  return m < 60 ? tIn(L, "dur.min", { m }) : tIn(L, "dur.hm", { h: Math.floor(m / 60), mm: String(m % 60).padStart(2, "0") });
};
const clockIn = (L: Lang, ms: number) => new Date(ms).toLocaleTimeString(L, { hour: "numeric", minute: "2-digit" });

export function NapsProvider({ children }: { children: ReactNode }) {
  const { s, starts, playing, stop, soundId, lastStop } = useSleep();
  const mon = useMonitor();
  const lang = useLang();
  const [nights, setNights] = useState<Night[]>([]);
  const [openFrom, setOpenFrom] = useState<number | null>(null);
  const [soundSleep, setSoundSleep] = useState<string | null>(null); // id of a sleep the sound started
  const [now, setNow] = useState(Date.now());
  const [peer, setPeer] = useState<PeerSleep | null>(null);
  const savePeer = useCallback((p: PeerSleep | null) => {
    setPeer(p);
    AsyncStorage.setItem(PEER, JSON.stringify(p)).catch(() => {});
  }, []);
  useEffect(() => { AsyncStorage.getItem(PEER).then((r) => r && setPeer(JSON.parse(r))).catch(() => {}); }, []);

  const reload = useCallback(() => {
    loadNights().then(setNights).catch(() => {});
    openSleep().then((o) => { setOpenFrom(o?.from ?? null); if (!o) setSoundSleep(null); }).catch(() => {});
    setNow(Date.now());
  }, []);
  useEffect(reload, [reload, mon.nightsVersion, mon.listening]);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    // Coming back to hush: pick up "asleep / awake" notifications that arrived meanwhile.
    const catchUp = () => Notifications.getPresentedNotificationsAsync().then((list) => {
      const last = list
        .map((n) => ({ d: n.request.content.data as { type?: string; asleep?: boolean; since?: number; from?: string } | undefined, at: n.date }))
        .filter((x) => x.d?.type === "sleep" && typeof x.d.asleep === "boolean" && x.d.from)
        .sort((a, b) => b.at - a.at)[0];
      if (last) setPeer((cur) => {
        if (cur && cur.at >= last.at) return cur;
        const next = { asleep: !!last.d!.asleep, since: last.d!.since ?? last.at, at: last.at, from: last.d!.from! };
        AsyncStorage.setItem(PEER, JSON.stringify(next)).catch(() => {});
        return next;
      });
    }).catch(() => {});
    catchUp();
    const sub = AppState.addEventListener("change", (st) => { if (st === "active") { reload(); catchUp(); } });
    return () => { clearInterval(id); sub.remove(); };
  }, [reload]);

  const sleeps = useMemo(() => nights.flatMap((n) => n.sleeps ?? [])
    .filter((x, i, all) => all.findIndex((y) => y.from === x.from && y.to === x.to) === i) // a sleep across midnight is in two days
    .sort((a, b) => a.from - b.from), [nights]);

  // "Woke up" ends the sleep but never the monitor, so remember when the baby woke while it listens.
  const [listenStart, setListenStart] = useState(0);
  const [awakeAt, setAwakeAt] = useState(0);
  useEffect(() => { setListenStart(mon.listening ? Date.now() : 0); setAwakeAt(0); }, [mon.listening]);

  // Asleep: logged on this phone, or this baby's phone is listening, or the baby's phone says so.
  const monitorAsleep = s.features.monitor && mon.listening && !(awakeAt > listenStart);
  const room = mon.room;
  const roomAsleep = s.features.monitor && !mon.listening && !!room?.listening && now - (room?.at ?? 0) < 45 * 60_000
    // …unless the baby's phone said "woke up" after it started listening
    && !(peer && !peer.asleep && peer.at > (room?.listenSince ?? 0));
  // A paired phone said the baby fell asleep (and hasn't said awake since).
  const peerAsleep = !!peer?.asleep && now - peer.at < 16 * 3600_000;
  const since = openFrom
    ?? (monitorAsleep || roomAsleep ? (sleeps.filter((x) => x.to >= now - 3 * 60_000).at(-1)?.from ?? mon.room?.at ?? now) : null)
    ?? (peerAsleep ? peer!.since : null);
  const state = useMemo(() => napState(sleeps, s.birthday, since, now), [sleeps, s.birthday, since, now]);

  /* ---------- telling the paired phones ---------- */

  // The other phones in the family.
  const peers = useCallback((): { token: string; lang: Lang }[] => {
    if (!s.features.monitor) return [];
    return mon.members.map((p) => ({ token: p.token, lang: p.lang ?? getLang() }));
  }, [mon.members, s.features.monitor]);

  /** A visible notification on each paired phone, in that phone's language. */
  const notify = useCallback(async (kind: "asleep" | "asleepSound" | "awake" | "soundOn", at: number, extra: { dur?: number; skip?: string } = {}) => {
    const list = peers().filter((p) => p.token !== extra.skip);
    if (!list.length) return;
    let me = "";
    try { me = await getMyToken(); } catch {}
    const data = { type: "sleep", asleep: kind !== "awake" && kind !== "soundOn" ? true : kind === "awake" ? false : undefined, since: at, from: me };
    // Notifications off: the other phones still update their state, silently.
    if (!s.notifyOthers) {
      if (kind !== "soundOn") sendData(list.map((p) => p.token), data).catch(() => {});
      return;
    }
    // A phone that's listening is in the baby's room: no notification sound there, just the update.
    const inRoom = (tok: string) => mon.rooms.some((r) => r.token === tok);
    const quiet = list.filter((p) => inRoom(p.token));
    if (quiet.length && kind !== "soundOn") sendData(quiet.map((p) => p.token), data).catch(() => {});
    for (const p of list.filter((x) => !inRoom(x.token))) {
      const L = p.lang;
      const body = tIn(L, `push.${kind}`, {
        name: babyLabelIn(L, mon.m.babyName),
        time: clockIn(L, at),
        dur: durIn(L, extra.dur ?? 0),
        sound: tIn(L, `sound.${soundId}`),
      });
      // Parents get buttons on it (listen, white noise); see src/actions.tsx.
      sendPush([p.token], body, data, "hush", undefined, kind === "awake" ? undefined : "hush-sleep").catch(() => {});
    }
  }, [peers, s.notifyOthers, mon.m.babyName, mon.rooms, soundId]);

  const fellAsleep = useCallback(async () => {
    const at = Date.now();
    await startSleep(at);
    reload();
    notify("asleep", at);
    return null;
  }, [reload, notify]);

  /** `skip`: the phone that asked (it already knows). Never turns the baby monitor off. */
  const wakeUp = useCallback(async (skip?: string, at = Date.now()) => {
    const slept = state.asleep ? (at - state.since) / 60_000 : 0;
    const who = skip ? (mon.members.find((p) => p.token === skip)?.name || t("stop.otherPhone")) : undefined;
    // White noise is for sleeping; stop it when the baby is up.
    if (playing && Date.now() - at < 5 * 60_000) stop("woke", who);
    // Asleep only because another phone said so: ask that phone to end its sleep.
    if (!openFrom && !monitorAsleep && peerAsleep && peer) {
      let me = "";
      try { me = await getMyToken(); } catch {}
      sendData([peer.from], { type: "cmd", cmd: "woke", from: me }).catch(() => {});
      savePeer({ ...peer, asleep: false, at });
      return null;
    }
    if (openFrom) await endSleep(at);
    if (mon.listening) setAwakeAt(at); // the monitor keeps listening; this sleep is over
    reload();
    if (state.asleep) notify("awake", at, { dur: slept, skip });
    if (peer?.asleep) savePeer({ ...peer, asleep: false, at });
    return mon.listening ? t("nap.stillListening") : null;
  }, [mon, reload, playing, stop, openFrom, monitorAsleep, peerAsleep, peer, savePeer, state, notify]);
  const wokeUp = useCallback(() => wakeUp(), [wakeUp]);
  const wokeAt = useCallback((at: number) => wakeUp(undefined, Math.min(Date.now(), Math.max(at, state.asleep ? state.since + 60_000 : at))), [wakeUp, state]);

  // A sleep that can't still be going on: over 14 h from an evening start, over 4 h from a daytime one.
  const [ack, setAck] = useState(0); // "still asleep" pressed at
  useEffect(() => { AsyncStorage.getItem(ACK).then((v) => v && setAck(Number(v) || 0)).catch(() => {}); }, []);
  const stillAsleep = useCallback(() => { const at = Date.now(); setAck(at); AsyncStorage.setItem(ACK, String(at)).catch(() => {}); }, []);
  let stale: NapsCtx["stale"] = null;
  if (state.asleep) {
    const h = new Date(state.since).getHours();
    const limit = (h >= 17 || h < 5 ? 14 : 4) * 3600_000;
    const asked = ack > state.since ? ack : 0;
    if (now - state.since > limit && (!asked || now - asked > limit / 3)) {
      // The first sign it ended: white noise turned off, or the monitor stopped, after it began.
      const signs = [lastStop, mon.lastStop]
        .filter((x): x is NonNullable<typeof x> => !!x && x.at > state.since + 20 * 60_000 && x.why !== "interrupted" && x.why !== "system")
        .map((x) => x.at)
        .sort((a, b) => a - b);
      stale = { since: state.since, guess: signs[0] ?? null };
    }
  }

  // Messages from the paired phones: "asleep / awake", and "the baby woke up" from the other side.
  const wakeRef = useRef(wakeUp);
  wakeRef.current = wakeUp;
  useEffect(() => {
    const sub = addPushListener((n) => {
      const d = n.request.content.data as { type?: string; asleep?: boolean; since?: number; from?: string; cmd?: string } | undefined;
      if (!d?.from || !peers().some((p) => p.token === d.from)) return;
      if (d.type === "sleep" && typeof d.asleep === "boolean") {
        savePeer({ asleep: d.asleep, since: d.since ?? Date.now(), at: Date.now(), from: d.from });
      } else if (d.type === "cmd" && d.cmd === "woke") {
        wakeRef.current(d.from);
        Notifications.dismissNotificationAsync(n.request.identifier).catch(() => {});
      }
    });
    return () => sub.remove();
  }, [peers, savePeer]);

  // Starting a sound usually means it's sleep time: start a sleep (with an undo on Home).
  useEffect(() => {
    if (!starts) return;
    const at = Date.now();
    if (!s.features.naps || !s.soundStartsSleep || state.asleep) {
      // Just the sound: worth telling the parents when it's the baby's phone.
      if (mon.listening) notify("soundOn", at);
      return;
    }
    (async () => {
      await startSleep(at);
      const o = await openSleep();
      setSoundSleep(o?.id ?? null);
      reload();
      notify("asleepSound", at);
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

  return <Ctx.Provider value={{ nights, sleeps, state, fellAsleep, wokeUp, reload, fromSound: !!soundSleep && openFrom != null, undoSound, stale, wokeAt, stillAsleep }}>{children}</Ctx.Provider>;
}
