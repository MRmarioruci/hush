// Baby monitor plumbing: push tokens, alert channel, pairing codes and saved monitor settings.
import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import { PermissionsAndroid, Platform } from "react-native";

export type Parent = { token: string; name: string; addedAt: number };
export type Sensitivity = "low" | "medium" | "high";
export type MonitorSettings = {
  room: string;
  sensitivity: Sensitivity;
  parents: Parent[];
  myName: string;
};
export type AlertRecord = { id: string; body: string; at: number };

export const THRESHOLDS: Record<Sensitivity, number> = { low: 0.5, medium: 0.3, high: 0.15 };

const KEY = "hush:monitor";
const ALERTS_KEY = "hush:alerts";
export const MONITOR_DEFAULTS: MonitorSettings = { room: "the nursery", sensitivity: "medium", parents: [], myName: "" };

export async function loadMonitor(): Promise<MonitorSettings> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? { ...MONITOR_DEFAULTS, ...JSON.parse(raw) } : MONITOR_DEFAULTS;
  } catch {
    return MONITOR_DEFAULTS;
  }
}
export const saveMonitor = (m: MonitorSettings) => AsyncStorage.setItem(KEY, JSON.stringify(m)).catch(() => {});

/* ---------- alerts on the parent phone ---------- */

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export async function setupAlertChannel() {
  if (Platform.OS !== "android") return;
  await Notifications.setNotificationChannelAsync("cry-alerts", {
    name: "Cry alerts",
    description: "When the baby phone hears crying",
    importance: Notifications.AndroidImportance.MAX,
    sound: "default",
    vibrationPattern: [0, 400, 200, 400],
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
  });
}

export function projectId(): string | undefined {
  return (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId;
}

/** This phone's address for receiving alerts. Throws a readable error when push isn't set up. */
export async function getMyToken(): Promise<string> {
  const id = projectId();
  if (!id) throw new Error("Alerts aren't set up in this build yet.");
  const perm = await Notifications.requestPermissionsAsync();
  if (!perm.granted) throw new Error("Allow notifications for hush so this phone can receive alerts.");
  await setupAlertChannel();
  const { data } = await Notifications.getExpoPushTokenAsync({ projectId: id });
  return data;
}

export async function loadAlerts(): Promise<AlertRecord[]> {
  try {
    return JSON.parse((await AsyncStorage.getItem(ALERTS_KEY)) ?? "[]");
  } catch {
    return [];
  }
}
export async function recordAlert(n: Notifications.Notification) {
  const data = n.request.content.data as { type?: string } | undefined;
  if (data?.type !== "cry") return;
  const list = await loadAlerts();
  if (list.some((a) => a.id === n.request.identifier)) return;
  const next = [{ id: n.request.identifier, body: n.request.content.body ?? "Crying", at: n.date }, ...list].slice(0, 30);
  await AsyncStorage.setItem(ALERTS_KEY, JSON.stringify(next)).catch(() => {});
  return next;
}

/* ---------- pairing codes ---------- */

export type PairCode = { app: "hush"; v: 1; token: string; name: string };

export const makePairCode = (token: string, name: string) =>
  JSON.stringify({ app: "hush", v: 1, token, name } satisfies PairCode);

export function readPairCode(raw: string): PairCode | null {
  try {
    const c = JSON.parse(raw);
    if (c?.app === "hush" && typeof c.token === "string" && c.token.startsWith("ExponentPushToken[")) return c;
  } catch {}
  return null;
}

/* ---------- permissions on the baby phone ---------- */

export async function askMicAndNotifications(): Promise<string | null> {
  if (Platform.OS !== "android") return "Listening for crying works on Android phones.";
  const mic = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO, {
    title: "Let hush listen for crying",
    message: "hush listens on this phone to notice when your baby cries. Sound never leaves the phone.",
    buttonPositive: "Allow",
  });
  if (mic !== PermissionsAndroid.RESULTS.GRANTED) return "hush needs the microphone to listen for crying.";
  // Needed on Android 13+ to show the "listening" notification that keeps it running.
  await Notifications.requestPermissionsAsync().catch(() => {});
  return null;
}
