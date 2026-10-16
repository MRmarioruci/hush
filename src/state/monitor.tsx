// The baby monitor: listening state, settings and pairing. Independent of the white noise,
// so both can run at once and neither stops the other.
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { AppState, Platform } from "react-native";
import { cryDetector, type CryStatus } from "../../modules/hush-native/src";
import { addEvents, deviceId, fmtDur, lastSleep, ownNights, packNights, saveReceivedNights, unpackNights, type HushEvent } from "../nights";
import * as Notifications from "expo-notifications";
import { loadStops, saveStops, type Stop, type StopWhy } from "../stops";
import { CLIP_SECONDS, INFO_CHANNEL, newClip, storageBucket, sendData, MONITOR_DEFAULTS, addPushListener, hasMic, pairRequest, sendPush, THRESHOLDS, askMicAndNotifications, loadMonitor, saveMonitor, type MonitorSettings, setupAlertChannel, getMyToken, sendDataMany } from "../monitor";
import { babyLabel, babyLabelIn, getLang, t, tIn, useLang } from "../i18n";
import { useUnlock } from "./unlock";

type Monitor = {
  m: MonitorSettings;
  update: (patch: Partial<MonitorSettings>) => void;
  listening: boolean;
  /** Parent's phone: ask the baby's phone for a few seconds of sound. Returns when it was asked. */
  requestClip: (seconds?: number) => Promise<number>;
  /** Why listening last stopped (null while it hasn't). */
  lastStop: Stop | null;
  status: CryStatus;
  lastCry: number | null;
  toggleListening: () => Promise<string | null>;
  baby: string;
  /** Bumps whenever night data changes, so the Nights screen can reload. */
  nightsVersion: number;
  /** Last moment crying was heard on this phone. */
  cryHeardAt: number | null;
  /** Smart white noise asks for the mic here, so it can react to crying even when the monitor is off. */
  setSoundWantsMic: (want: boolean) => void;
  micOn: boolean;
  /** Share this phone's sleep days with the connected phones and ask for theirs. Returns how many phones. */
  syncSleep: (force?: boolean) => Promise<number>;
  lastSync: number;
};

const Ctx = createContext<Monitor | null>(null);
export const useMonitor = () => useContext(Ctx)!;

export function MonitorProvider({ children }: { children: ReactNode }) {
  const [m, setM] = useState<MonitorSettings>(MONITOR_DEFAULTS);
  const unlock = useUnlock();
  useEffect(() => { loadMonitor().then(setM); }, []);
  const update = useCallback((patch: Partial<MonitorSettings>) => {
    setM((prev) => {
      const next = { ...prev, ...patch };
      saveMonitor(next);
      return next;
    });
  }, []);

  const baby = babyLabel(m.babyName);
  const tokens = m.parents.map((p) => p.token);
  // "listening" is the baby monitor switch. The mic also runs when smart white noise wants it.
  const [listening, setListeningRaw] = useState(() => cryDetector?.isListening() ?? false);
  const [lastStop, setLastStop] = useState<Stop | null>(null);
  // Every change of the switch goes through here, so a stop always has a reason.
  const setListening = useCallback((on: boolean, why: StopWhy = "you", detail?: string) => {
    setListeningRaw((was) => {
      if (was && !on) {
        const stop: Stop = { at: Date.now(), why, detail };
        setLastStop(stop);
        saveStops({ listen: stop, wasListening: false });
      } else if (on) saveStops({ wasListening: true });
      return on;
    });
  }, []);
  useEffect(() => {
    loadStops().then((st) => {
      // hush was listening last time, but isn't any more: the phone closed it.
      if (st.wasListening && cryDetector && !cryDetector.isListening()) {
        const stop: Stop = { at: Date.now(), why: "system" };
        saveStops({ listen: stop, wasListening: false });
        setLastStop(stop);
      } else setLastStop(st.listen ?? null);
    });
    // The switch says on, but the listener isn't running: the phone stopped it.
    const check = () => { if (cryDetector && !cryDetector.isListening()) setListeningRaw((on) => { if (on) { const stop: Stop = { at: Date.now(), why: "system" }; setLastStop(stop); saveStops({ listen: stop, wasListening: false }); } return false; }); };
    const app = AppState.addEventListener("change", (st) => st === "active" && setTimeout(check, 1500));
    return () => app.remove();
  }, []);
  const [soundWantsMic, setSoundWantsMic] = useState(false);
  const [micOn, setMicOn] = useState(() => cryDetector?.isListening() ?? false);
  const [status, setStatus] = useState<CryStatus>({});
  const [lastCry, setLastCry] = useState<number | null>(null);
  const [cryHeardAt, setCryHeardAt] = useState<number | null>(null);

  // Native alerts and the "listening" notification use the app's language.
  const lang = useLang();
  useEffect(() => {
    setupAlertChannel().catch(() => {}); // channel names follow the language; also creates new channels after updates
    cryDetector?.setTexts({
      crying: t("push.crying", { name: baby }),
      still: t("push.still", { name: baby }),
      lowBattery: t("push.lowBattery", { name: baby, pct: "{pct}" }),
      stopped: t("push.stopped", { name: baby }),
      listenTitle: t("push.listenTitle"),
      listenText: t("push.listenText", { name: baby }),
    });
  }, [lang, baby]);

  // Each parent gets alerts in their own phone's language.
  useEffect(() => {
    cryDetector?.setTargets(m.parents.map((p) => {
      const L = p.lang ?? getLang();
      const name = babyLabelIn(L, m.babyName);
      return {
        token: p.token,
        crying: tIn(L, "push.crying", { name }),
        still: tIn(L, "push.still", { name }),
        lowBattery: tIn(L, "push.lowBattery", { name, pct: "{pct}" }),
        stopped: tIn(L, "push.stopped", { name }),
        name: p.name,
        listenReady: tIn(L, "listen.ready", { name, s: "{s}" }),
        listenOff: tIn(L, "listen.off", { name }),
        listenNotListening: tIn(L, "listen.notListening", { name }),
        listenFailed: tIn(L, "listen.failed", { name }),
      };
    }));
  }, [m.parents, m.babyName, lang]);
  useEffect(() => {
    cryDetector?.setListen(!!m.allowListen, storageBucket() ?? "", t("listen.nowHere", { who: "{who}", s: "{s}" }));
  }, [m.allowListen, lang]);

  useEffect(() => {
    cryDetector?.configure(THRESHOLDS[m.sensitivity], m.babyName.trim(), tokens, m.alertAfter);
  }, [m.sensitivity, m.alertAfter, m.babyName, tokens.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!cryDetector) return;
    const a = cryDetector.onStatus((st) => {
      setStatus(st);
      if (st.crying) setCryHeardAt(Date.now());
      if (st.error) { setListening(false, "error", st.error); setMicOn(false); }
    });
    const b = cryDetector.onCry((e) => setLastCry(e.at));
    return () => { a.remove(); b.remove(); };
  }, []);

  /* ---------- night stats ---------- */
  const [nightsVersion, setNightsVersion] = useState(0);
  // Move whatever the native listener logged into the app's storage.
  const syncEvents = useCallback(async () => {
    const raw = cryDetector?.takeEvents() ?? "";
    const list = raw.split("\n").filter(Boolean).flatMap((line) => {
      try { return [JSON.parse(line) as HushEvent]; } catch { return []; }
    });
    if (list.length) {
      await addEvents(list);
      setNightsVersion((v) => v + 1);
    }
  }, []);
  useEffect(() => {
    syncEvents();
    const app = AppState.addEventListener("change", (st) => st === "active" && syncEvents());
    const id = setInterval(syncEvents, 60_000);
    return () => { app.remove(); clearInterval(id); };
  }, [syncEvents]);

  // Baby's phone: when a sleep ends (a night, or a nap of 30 min or more), send parents a summary.
  const sendNightSummary = useCallback(async () => {
    const cur = mRef.current;
    const to = cur.parents.map((p) => p.token);
    if (!to.length) return;
    const last = await lastSleep();
    if (!last) return;
    const { sleep, days } = last;
    if (Date.now() - sleep.to > 5 * 60_000 || sleep.to - sleep.from < 30 * 60_000) return;
    const kind = sleep.kind === "night" ? "night" : "nap";
    const data = packNights(days, cur.babyName.trim(), await deviceId());
    // One message per language, so every parent reads it in their own.
    const langs = [...new Set(cur.parents.map((p) => p.lang ?? getLang()))];
    for (const L of langs) {
      const label = babyLabelIn(L, cur.babyName);
      const body = sleep.cries === 0
        ? tIn(L, `push.${kind}0`, { name: label })
        : tIn(L, `push.${kind}`, { name: label, count: sleep.cries, dur: fmtDur(sleep.cryMin) });
      sendPush(cur.parents.filter((p) => (p.lang ?? getLang()) === L).map((p) => p.token), body, data);
    }
  }, []);

  // Baby's phone: a parent scanned our code and asked to be connected. Save them and confirm.
  const mRef = useRef(m);
  mRef.current = m;
  useEffect(() => {
    const handle = (n: Notifications.Notification) => {
      const days = unpackNights(n.request.content.data);
      if (days) {
        saveReceivedNights(days).then(() => setNightsVersion((v) => v + 1));
        return;
      }
      const req = pairRequest(n);
      if (!req || mRef.current.role !== "nursery") return;
      const cur = mRef.current;
      if (!cur.parents.some((p) => p.token === req.token)) {
        // Parents who didn't give a name become "Parent 1", "Parent 2", …
        let name = req.name.trim();
        if (!name) {
          let k = 1;
          while (cur.parents.some((p) => p.name === t("parent.n", { n: k }))) k++;
          name = t("parent.n", { n: k });
        }
        update({ parents: [...cur.parents, { token: req.token, name, addedAt: Date.now(), lang: req.lang }] });
      } else if (req.lang) {
        update({ parents: cur.parents.map((p) => (p.token === req.token ? { ...p, lang: req.lang } : p)) });
      }
      const L = req.lang ?? getLang();
      getMyToken().catch(() => "").then((nursery) =>
        sendPush([req.token], tIn(L, "push.paired", { name: babyLabelIn(L, cur.babyName) }), { type: "paired", baby: cur.babyName.trim(), nursery }));
      Notifications.dismissNotificationAsync(n.request.identifier).catch(() => {});
    };
    Notifications.getPresentedNotificationsAsync().then((list) => list.forEach(handle)).catch(() => {});
    const sub = addPushListener(handle);
    return () => sub.remove();
  }, [m.role, update]);

  // Start or stop the mic when either the monitor or smart white noise needs it.
  const wantMic = listening || soundWantsMic;
  useEffect(() => {
    if (!cryDetector) return;
    let cancelled = false;
    (async () => {
      if (wantMic && !cryDetector.isListening()) {
        if (!listening) {
          // Started by white noise: only if the mic is already allowed (never prompt mid-play).
          const ok = await hasMic();
          if (!ok || cancelled) return;
        }
        cryDetector.configure(THRESHOLDS[mRef.current.sensitivity], mRef.current.babyName.trim(), mRef.current.parents.map((p) => p.token), mRef.current.alertAfter);
        if (cryDetector.start()) setMicOn(true);
        else {
          // Android won't start the microphone while hush is in the background.
          setMicOn(false);
          if (listening) setListening(false, "error", "background");
        }
      } else if (!wantMic && cryDetector.isListening()) {
        cryDetector.stop();
        setMicOn(false);
        setStatus({});
        setTimeout(syncEvents, 800);
      }
    })();
    return () => { cancelled = true; };
  }, [wantMic, listening, syncEvents]);

  const toggleListening = useCallback(async (): Promise<string | null> => {
    if (!cryDetector) return t("perm.androidOnly");
    if (listening) {
      setListening(false, "you");
      setTimeout(async () => { await syncEvents(); await sendNightSummary(); }, 1200);
      return null;
    }
    const problem = await askMicAndNotifications();
    if (problem) return problem;
    if (!(await unlock.beforeListen())) return null; // trial over: the unlock sheet is showing
    setListening(true);
    return mRef.current.parents.length ? null : t("perm.pairToGet");
  }, [listening, syncEvents, sendNightSummary, unlock, setListening]);

  /* ---------- sleep sync between connected phones (no account, through silent pushes) ---------- */
  const [lastSync, setLastSync] = useState(0);
  const peersOf = (cur: MonitorSettings) =>
    cur.role === "nursery" ? cur.parents.map((p) => p.token) : cur.pairedToken ? [cur.pairedToken] : [];
  /** Send this phone's last 30 days to some phones, two days per message. */
  const sendOwnDays = useCallback(async (to: string[]) => {
    const own = (await ownNights()).slice(0, 30);
    if (!own.length || !to.length) return;
    const device = await deviceId();
    const name = mRef.current.babyName.trim();
    const messages: { to: string; data: Record<string, unknown> }[] = [];
    for (let i = 0; i < own.length; i += 2) {
      const data = packNights(own.slice(i, i + 2), name, device);
      for (const tok of to) messages.push({ to: tok, data });
    }
    await sendDataMany(messages);
  }, []);
  const syncSleep = useCallback(async (force = false) => {
    const peers = peersOf(mRef.current);
    if (!peers.length) return 0;
    if (!force && Date.now() - lastSyncRef.current < 5 * 60_000) return peers.length; // at most every 5 min
    lastSyncRef.current = Date.now();
    setLastSync(Date.now());
    let me = "";
    try { me = await getMyToken(); } catch {}
    await sendOwnDays(peers);
    if (me) await sendDataMany(peers.map((tok) => ({ to: tok, data: { type: "sync-request", from: me } })));
    return peers.length;
  }, [sendOwnDays]);
  const lastSyncRef = useRef(0);
  // Parent's phone: the baby's room as reported by the baby's phone (shown on Home and Monitor).
  useEffect(() => {
    const sub = addPushListener((n) => {
      const d = n.request.content.data as { type?: string; playing?: boolean; sound?: string; listening?: boolean; at?: number; listenSince?: number; battery?: number; charging?: boolean } | undefined;
      if (d?.type !== "room" || mRef.current.role !== "parent") return;
      const prev = mRef.current.room;
      const at = d.at ?? Date.now();
      if (prev && prev.at > at) return; // an older report arriving late
      update({ room: { playing: !!d.playing, sound: d.sound ?? "womb", listening: !!d.listening, at, listenSince: d.listenSince, battery: d.battery ?? prev?.battery, charging: d.charging ?? prev?.charging } });
    });
    return () => sub.remove();
  }, [update]);

  /* ---------- "listen in": a parent asks for a few seconds of the room ---------- */

  // Baby's phone: record, upload, and send the parent a link (or say why not).
  const listeningRef = useRef(listening);
  listeningRef.current = listening;
  useEffect(() => {
    const busy = { current: false };
    const sub = addPushListener(async (n) => {
      const d = n.request.content.data as { type?: string; cmd?: string; from?: string; seconds?: number } | undefined;
      const cur = mRef.current;
      const secs = Math.max(5, Math.min(15, Math.round(Number(d?.seconds) || CLIP_SECONDS)));
      // Android answers natively (works with the screen locked); this is for iPhones.
      if (Platform.OS !== "ios" || d?.type !== "cmd" || d.cmd !== "clip" || !d.from || cur.role !== "nursery") return;
      const parent = cur.parents.find((p) => p.token === d.from);
      if (!parent) return;
      Notifications.dismissNotificationAsync(n.request.identifier).catch(() => {});
      const L = parent.lang ?? getLang();
      const name = babyLabelIn(L, cur.babyName);
      const reply = (key: string, data: Record<string, unknown>) =>
        sendPush([parent.token], tIn(L, key, { name, s: secs }), { type: "clip", at: Date.now(), seconds: secs, ...data });
      if (!cur.allowListen) return reply("listen.off", { error: "off" });
      if (!listeningRef.current || !cryDetector) return reply("listen.notListening", { error: "notListening" });
      const where = newClip();
      if (!where) return reply("listen.failed", { error: "setup" });
      if (busy.current) return;
      busy.current = true;
      // Nobody listens in unnoticed: say so on the baby's phone.
      Notifications.scheduleNotificationAsync({
        content: { title: "hush", body: t("listen.nowHere", { who: parent.name, s: secs }), data: { type: "listen-notice" } },
        trigger: null,
      }).catch(() => {});
      try {
        const res = await cryDetector.recordClip(secs, where.upload);
        if (res.ok) await reply("listen.ready", { url: where.download });
        else await reply(res.detail === "notListening" ? "listen.notListening" : "listen.failed", { error: res.detail === "notListening" ? "notListening" : "upload", detail: String(res.detail ?? "").slice(0, 300) });
      } catch (e) {
        await reply("listen.failed", { error: "upload", detail: String((e as Error)?.message ?? e).slice(0, 300) });
      }
      busy.current = false;
    });
    return () => sub.remove();
  }, []);

  // Parent's phone: keep the latest clip (or the reason there's none).
  useEffect(() => {
    const take = (n: Notifications.Notification) => {
      const d = n.request.content.data as { type?: string; url?: string; at?: number; error?: string; detail?: string; seconds?: number } | undefined;
      if (d?.type !== "clip" || mRef.current.role !== "parent") return;
      const at = d.at ?? n.date ?? Date.now();
      if ((mRef.current.clip?.at ?? 0) >= at) return;
      update({ clip: { url: d.url, at, error: d.error, detail: d.detail, seconds: d.seconds } });
    };
    const sub = addPushListener(take);
    const catchUp = () => Notifications.getPresentedNotificationsAsync().then((l) => l.forEach(take)).catch(() => {});
    catchUp();
    const app = AppState.addEventListener("change", (st) => st === "active" && catchUp());
    return () => { sub.remove(); app.remove(); };
  }, [update]);

  const requestClip = useCallback(async (seconds = CLIP_SECONDS) => {
    const to = mRef.current.pairedToken;
    const at = Date.now();
    if (!to) return at;
    let me = "";
    try { me = await getMyToken(); } catch {}
    await sendData([to], { type: "cmd", cmd: "clip", seconds, from: me });
    return at;
  }, []);

  // Another phone asked for our days.
  useEffect(() => {
    const replied = new Map<string, number>();
    const sub = addPushListener((n) => {
      const d = n.request.content.data as { type?: string; from?: string } | undefined;
      if (d?.type !== "sync-request" || !d.from || !peersOf(mRef.current).includes(d.from)) return;
      if (Date.now() - (replied.get(d.from) ?? 0) < 60_000) return;
      replied.set(d.from, Date.now());
      sendOwnDays([d.from]);
      Notifications.dismissNotificationAsync(n.request.identifier).catch(() => {});
    });
    return () => sub.remove();
  }, [sendOwnDays]);

  return (
    <Ctx.Provider value={{ m, update, listening, requestClip, lastStop, status, lastCry, toggleListening, baby, nightsVersion, cryHeardAt, setSoundWantsMic, micOn, syncSleep, lastSync }}>{children}</Ctx.Provider>
  );
}
