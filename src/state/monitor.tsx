// The baby monitor: listening state, settings and pairing. Independent of the white noise,
// so both can run at once and neither stops the other.
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { cryDetector, type CryStatus } from "../../modules/hush-native/src";
import {
  MONITOR_DEFAULTS,
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
  room: string;
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

  const room = m.room.trim() || "the nursery";
  const tokens = m.parents.map((p) => p.token);
  const [listening, setListening] = useState(() => cryDetector?.isListening() ?? false);
  const [status, setStatus] = useState<CryStatus>({});
  const [lastCry, setLastCry] = useState<number | null>(null);

  useEffect(() => {
    cryDetector?.configure(THRESHOLDS[m.sensitivity], room, tokens);
  }, [m.sensitivity, room, tokens.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!cryDetector) return;
    const a = cryDetector.onStatus((st) => {
      setStatus(st);
      if (st.error) setListening(false);
    });
    const b = cryDetector.onCry((e) => setLastCry(e.at));
    return () => { a.remove(); b.remove(); };
  }, []);

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
    cryDetector.configure(THRESHOLDS[m.sensitivity], room, tokens);
    cryDetector.start();
    setListening(true);
    return tokens.length ? null : "Listening. Pair a parent phone in Monitor to get alerts.";
  }, [listening, m.sensitivity, room, tokens.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Ctx.Provider value={{ m, update, listening, status, lastCry, toggleListening, room }}>{children}</Ctx.Provider>
  );
}
