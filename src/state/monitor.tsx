// The baby monitor: listening state, settings and pairing. Independent of the white noise,
// so both can run at once and neither stops the other.
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { AppState, PermissionsAndroid } from "react-native";
import { cryDetector, type CryStatus } from "../../modules/hush-native/src";
import { addEvents, fmtDur, loadNights, nightKey, packNight, saveReceivedNight, unpackNight, type HushEvent } from "../nights";
import * as Notifications from "expo-notifications";
import {
  MONITOR_DEFAULTS,
  pairRequest,
  sendPush,
  THRESHOLDS,
  askMicAndNotifications,
  loadMonitor,
  saveMonitor,
  type MonitorSettings,
} from "../monitor";
import { babyLabel, t, useLang } from "../i18n";
import { useUnlock } from "./unlock";

type Monitor = {
  m: MonitorSettings;
  update: (patch: Partial<MonitorSettings>) => void;
  listening: boolean;
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
  const [listening, setListening] = useState(() => cryDetector?.isListening() ?? false);
  const [soundWantsMic, setSoundWantsMic] = useState(false);
  const [micOn, setMicOn] = useState(() => cryDetector?.isListening() ?? false);
  const [status, setStatus] = useState<CryStatus>({});
  const [lastCry, setLastCry] = useState<number | null>(null);
  const [cryHeardAt, setCryHeardAt] = useState<number | null>(null);

  // Native alerts and the "listening" notification use the app's language.
  const lang = useLang();
  useEffect(() => {
    cryDetector?.setTexts({
      crying: t("push.crying", { name: baby }),
      still: t("push.still", { name: baby }),
      lowBattery: t("push.lowBattery", { name: baby, pct: "{pct}" }),
      stopped: t("push.stopped", { name: baby }),
      listenTitle: t("push.listenTitle"),
      listenText: t("push.listenText", { name: baby }),
    });
  }, [lang, baby]);

  useEffect(() => {
    cryDetector?.configure(THRESHOLDS[m.sensitivity], m.babyName.trim(), tokens, m.alertAfter);
  }, [m.sensitivity, m.alertAfter, m.babyName, tokens.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!cryDetector) return;
    const a = cryDetector.onStatus((st) => {
      setStatus(st);
      if (st.crying) setCryHeardAt(Date.now());
      if (st.error) { setListening(false); setMicOn(false); }
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

  // Baby's phone: after a long listening session ends, send parents a summary of the night.
  const sendNightSummary = useCallback(async () => {
    const cur = mRef.current;
    const to = cur.parents.map((p) => p.token);
    if (!to.length) return;
    const nights = await loadNights();
    const n = nights.find((x) => x.key === nightKey(Date.now() - 60_000));
    if (!n || n.listenedMin < 120) return;
    const label = babyLabel(cur.babyName);
    const body = n.cries === 0
      ? t("push.night0", { name: label })
      : t("push.night", { name: label, count: n.cries, dur: fmtDur(n.cryMin) });
    sendPush(to, body, packNight(n, cur.babyName.trim()));
  }, []);

  // Baby's phone: a parent scanned our code and asked to be connected. Save them and confirm.
  const mRef = useRef(m);
  mRef.current = m;
  useEffect(() => {
    const handle = (n: Notifications.Notification) => {
      const night = unpackNight(n.request.content.data);
      if (night) {
        saveReceivedNight(night).then(() => setNightsVersion((v) => v + 1));
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
        update({ parents: [...cur.parents, { token: req.token, name, addedAt: Date.now() }] });
      }
      sendPush([req.token], t("push.paired", { name: babyLabel(cur.babyName) }), { type: "paired", baby: cur.babyName.trim() });
      Notifications.dismissNotificationAsync(n.request.identifier).catch(() => {});
    };
    Notifications.getPresentedNotificationsAsync().then((list) => list.forEach(handle)).catch(() => {});
    const sub = Notifications.addNotificationReceivedListener(handle);
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
          const ok = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO).catch(() => false);
          if (!ok || cancelled) return;
        }
        cryDetector.configure(THRESHOLDS[mRef.current.sensitivity], mRef.current.babyName.trim(), mRef.current.parents.map((p) => p.token), mRef.current.alertAfter);
        cryDetector.start();
        setMicOn(true);
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
      setListening(false);
      setTimeout(async () => { await syncEvents(); await sendNightSummary(); }, 1200);
      return null;
    }
    const problem = await askMicAndNotifications();
    if (problem) return problem;
    if (!(await unlock.beforeListen())) return null; // trial over: the unlock sheet is showing
    setListening(true);
    return mRef.current.parents.length ? null : t("perm.pairToGet");
  }, [listening, syncEvents, sendNightSummary, unlock]);

  return (
    <Ctx.Provider value={{ m, update, listening, status, lastCry, toggleListening, baby, nightsVersion, cryHeardAt, setSoundWantsMic, micOn }}>{children}</Ctx.Provider>
  );
}
