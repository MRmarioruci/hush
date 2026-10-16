// Baby monitor plumbing: push tokens, alert channel, pairing codes and saved monitor settings.
import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import { PermissionsAndroid, Platform } from "react-native";
import { t } from "./i18n";

export type Parent = { token: string; name: string; addedAt: number };
export type Sensitivity = "low" | "medium" | "high";
export type Role = "nursery" | "parent";
export type MonitorSettings = {
  babyName: string;
  sensitivity: Sensitivity;
  parents: Parent[];
  myName: string;
  /** Seconds of crying before the first alert. */
  alertAfter: number;
  /** What this phone does in the monitor: stays with the baby, or gets the alerts. */
  role: Role | null;
  /** Parent phone only: name of the baby whose nursery phone paired with us. */
  pairedWith: string | null;
};
export type AlertRecord = { id: string; body: string; at: number };

export const ALERT_AFTER: [number, string][] = [[0, "Right away"], [10, "10 sec"], [60, "1 min"]];
export const THRESHOLDS: Record<Sensitivity, number> = { low: 0.45, medium: 0.25, high: 0.12 };

const KEY = "hush:monitor";
const ALERTS_KEY = "hush:alerts";
export const MONITOR_DEFAULTS: MonitorSettings = { babyName: "", sensitivity: "medium", parents: [], myName: "", role: null, pairedWith: null, alertAfter: 0 };

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

/** Crying alerts use an alarm-style channel so they ring and vibrate even with the phone on silent. */
export const ALARM_CHANNEL = "baby-alarm-2";
export const ALARM_SOUND = "alert.wav";
export const INFO_CHANNEL = "cry-alerts";

export async function setupAlertChannel() {
  if (Platform.OS !== "android") return;
  await Notifications.deleteNotificationChannelAsync("baby-alarm").catch(() => {}); // replaced (new sound)
  await Notifications.setNotificationChannelAsync(ALARM_CHANNEL, {
    name: t("notif.alarmName"),
    description: t("notif.alarmDesc"),
    importance: Notifications.AndroidImportance.MAX,
    sound: ALARM_SOUND,
    enableVibrate: true,
    vibrationPattern: [0, 700, 300, 700, 300, 700],
    bypassDnd: true,
    audioAttributes: {
      usage: Notifications.AndroidAudioUsage.ALARM,
      contentType: Notifications.AndroidAudioContentType.SONIFICATION,
    },
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
  });
  await Notifications.setNotificationChannelAsync(INFO_CHANNEL, {
    name: t("notif.infoName"),
    description: t("notif.infoDesc"),
    importance: Notifications.AndroidImportance.HIGH,
    sound: "default",
    enableVibrate: true,
    vibrationPattern: [0, 300, 200, 300],
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
  });
}

export function projectId(): string | undefined {
  return (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId;
}

/** This phone's address for receiving alerts. Throws a readable error when push isn't set up. */
export async function getMyToken(): Promise<string> {
  const id = projectId();
  if (!id) throw new Error(t("perm.notSetUp"));
  const perm = await Notifications.requestPermissionsAsync();
  if (!perm.granted) throw new Error(t("perm.notifs"));
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
/** Name of the baby in a "paired" message, if this notification is one. */
export function pairedBaby(n: Notifications.Notification): string | null {
  const data = n.request.content.data as { type?: string; baby?: string } | undefined;
  return data?.type === "paired" ? (data.baby ?? "") : null;
}

export async function recordAlert(n: Notifications.Notification) {
  const data = n.request.content.data as { type?: string } | undefined;
  if (!["cry", "battery", "stopped"].includes(data?.type ?? "")) return;
  const list = await loadAlerts();
  if (list.some((a) => a.id === n.request.identifier)) return;
  const next = [{ id: n.request.identifier, body: n.request.content.body ?? t("nights.crying"), at: n.date }, ...list].slice(0, 30);
  await AsyncStorage.setItem(ALERTS_KEY, JSON.stringify(next)).catch(() => {});
  return next;
}

/* ---------- pairing ----------
   The baby's phone shows a QR code with its own push address. The parent's phone scans it and
   sends a "pair-request" push carrying the parent's address. The baby's phone saves that parent
   and replies with "paired". */

export type PairCode = { app: "hush"; v: 2; token: string; baby: string };

export const makePairCode = (token: string, baby: string) =>
  JSON.stringify({ app: "hush", v: 2, token, baby } satisfies PairCode);

export function readPairCode(raw: string): PairCode | null {
  try {
    const c = JSON.parse(raw);
    if (c?.app === "hush" && c.v === 2 && typeof c.token === "string" && c.token.startsWith("ExponentPushToken[")) return c;
  } catch {}
  return null;
}

/** Send a push through Expo's push service. Returns true when Expo accepted it. */
export async function sendPush(to: string[], body: string, data: Record<string, unknown>, title = "hush", channelId = INFO_CHANNEL): Promise<boolean> {
  if (!to.length) return false;
  try {
    const res = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(to.map((t) => ({ to: t, title, body, data, sound: channelId === ALARM_CHANNEL ? ALARM_SOUND : "default", priority: "high", channelId }))),
    });
    const json = await res.json().catch(() => null);
    return res.ok && !(json?.data ?? []).some((d: { status?: string }) => d.status === "error");
  } catch {
    return false;
  }
}

export type PairRequest = { token: string; name: string };
export function pairRequest(n: Notifications.Notification): PairRequest | null {
  const d = n.request.content.data as { type?: string; token?: string; name?: string } | undefined;
  return d?.type === "pair-request" && typeof d.token === "string" ? { token: d.token, name: d.name || "Parent" } : null;
}

/* ---------- permissions on the baby phone ---------- */

export async function askMicAndNotifications(): Promise<string | null> {
  if (Platform.OS !== "android") return t("perm.androidOnly");
  const mic = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO, {
    title: t("perm.micTitle"),
    message: t("perm.micMsg"),
    buttonPositive: t("perm.allow"),
  });
  if (mic !== PermissionsAndroid.RESULTS.GRANTED) return t("perm.micNeeded");
  // Needed on Android 13+ to show the "listening" notification that keeps it running.
  await Notifications.requestPermissionsAsync().catch(() => {});
  return null;
}
