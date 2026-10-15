// The baby monitor: listening state, settings and pairing. Independent of the white noise,
// so both can run at once and neither stops the other.
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { cryDetector, type CryStatus } from "../../modules/hush-native/src";
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

type Monitor = {
  m: MonitorSettings;
  update: (patch: Partial<MonitorSettings>) => void;
  listening: boolean;
  status: CryStatus;
  lastCry: number | null;
  toggleListening: () => Promise<string | null>;
  baby: string;
};

const Ctx = createContext<Monitor | null>(null);
export const useMonitor = () => useContext(Ctx)!;

export function MonitorProvider({ children }: { children: ReactNode }) {
  const [m, setM] = useState<MonitorSettings>(MONITOR_DEFAULTS);
  useEffect(() => { loadMonitor().then(setM); }, []);
  const update = useCallback((patch: Partial<MonitorSettings>) => {
    setM((prev) => {
      const next = { ...prev, ...patch };
      saveMonitor(next);
      return next;
    });
  }, []);

  const baby = m.babyName.trim() || "Baby";
  const tokens = m.parents.map((p) => p.token);
  const [listening, setListening] = useState(() => cryDetector?.isListening() ?? false);
  const [status, setStatus] = useState<CryStatus>({});
  const [lastCry, setLastCry] = useState<number | null>(null);

  useEffect(() => {
    cryDetector?.configure(THRESHOLDS[m.sensitivity], baby, tokens, m.alertAfter);
  }, [m.sensitivity, m.alertAfter, baby, tokens.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!cryDetector) return;
    const a = cryDetector.onStatus((st) => {
      setStatus(st);
      if (st.error) setListening(false);
    });
    const b = cryDetector.onCry((e) => setLastCry(e.at));
    return () => { a.remove(); b.remove(); };
  }, []);

  // Baby's phone: a parent scanned our code and asked to be connected. Save them and confirm.
  const mRef = useRef(m);
  mRef.current = m;
  useEffect(() => {
    const handle = (n: Notifications.Notification) => {
      const req = pairRequest(n);
      if (!req || mRef.current.role !== "nursery") return;
      const cur = mRef.current;
      if (!cur.parents.some((p) => p.token === req.token)) {
        update({ parents: [...cur.parents, { token: req.token, name: req.name, addedAt: Date.now() }] });
      }
      const who = cur.babyName.trim() || "Baby";
      sendPush([req.token], `Connected to ${who}'s phone`, { type: "paired", baby: who });
      Notifications.dismissNotificationAsync(n.request.identifier).catch(() => {});
    };
    Notifications.getPresentedNotificationsAsync().then((list) => list.forEach(handle)).catch(() => {});
    const sub = Notifications.addNotificationReceivedListener(handle);
    return () => sub.remove();
  }, [m.role, update]);

  const toggleListening = useCallback(async (): Promise<string | null> => {
    if (!cryDetector) return "Listening for crying works on Android phones.";
    if (listening) {
      cryDetector.stop();
      setListening(false);
      setStatus({});
      return null;
    }
    const problem = await askMicAndNotifications();
    if (problem) return problem;
    cryDetector.configure(THRESHOLDS[m.sensitivity], baby, tokens, m.alertAfter);
    cryDetector.start();
    setListening(true);
    return tokens.length ? null : "Pair a parent phone to get alerts.";
  }, [listening, m.sensitivity, m.alertAfter, baby, tokens.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Ctx.Provider value={{ m, update, listening, status, lastCry, toggleListening, baby }}>{children}</Ctx.Provider>
  );
}
