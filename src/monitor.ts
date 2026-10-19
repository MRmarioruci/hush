// Baby monitor plumbing: push tokens, alert channel, pairing codes and saved monitor settings.
import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import { PermissionsAndroid, Platform } from "react-native";
import { cryDetector } from "../modules/hush-native/src";
import { onBackgroundPush } from "./background";
import { getLang, t, type Lang } from "./i18n";
import type { Family } from "./family";

export type { Member } from "./family";
/** What the other phones see about a phone that's listening (a baby's room), as it reports it. */
export type Room = {
  playing: boolean; sound: string; listening: boolean; at: number; listenSince?: number; battery?: number; charging?: boolean;
  /** When this phone received it (this phone's clock; the other phone's clock can differ). */
  got?: number;
  /** That phone's name and its baby's name. */
  name?: string; baby?: string;
  /** Last time it reported listening (this phone's clock). */
  lastListen?: number;
};
export type Sensitivity = "low" | "medium" | "high";
export type Role = "nursery" | "parent";
export type MonitorSettings = {
  babyName: string;
  sensitivity: Sensitivity;
  /** The phones that joined together (this one included), see family.ts. */
  family: Family | null;
  /** This phone's push address, once known (to tell it apart in the family list). */
  me?: string;
  /** What each listening phone last reported, by its push address. */
  rooms?: Record<string, Room>;
  /** This phone's name, as the other phones see it. */
  myName: string;
  /** Before families: the parent phones paired with this baby's phone. */
  parents?: { token: string; name: string; addedAt: number; lang?: Lang }[];
  /** Seconds of crying before the first alert. */
  alertAfter: number;
  /** Before families: what this phone did (nursery or parent), its paired baby's phone. */
  role?: Role | null;
  pairedWith?: string | null;
  pairedToken?: string | null;
  /** Baby's phone: parents may ask for a few seconds of the room's sound. */
  allowListen?: boolean;
  /** Baby's phone: seconds of sound sent with each crying alert (0 = none; needs allowListen). */
  cryClip?: number;
  /** Parent phone: the last clip from the baby's room, or why there isn't one. */
  clip?: { url?: string; at: number; error?: string; detail?: string; seconds?: number; got?: number; auto?: boolean } | null;
  /** Parent phone: preferred clip length (5, 10 or 15 s). */
  clipSeconds?: number;
};
export type AlertRecord = { id: string; body: string; at: number };

export const ALERT_AFTER: [number, string][] = [[0, "Right away"], [10, "10 sec"], [60, "1 min"]];
export const THRESHOLDS: Record<Sensitivity, number> = { low: 0.45, medium: 0.25, high: 0.12 };

const KEY = "hush:monitor";
const ALERTS_KEY = "hush:alerts";
export const MONITOR_DEFAULTS: MonitorSettings = { babyName: "", sensitivity: "medium", family: null, myName: "", alertAfter: 0 };

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
    // A phone that's listening is next to the baby: show, but don't make a sound.
    shouldPlaySound: !(cryDetector?.isListening() ?? false),
    shouldSetBadge: false,
  }),
});

/**
 * Every push this phone receives, visible or silent. On iOS, silent messages (remote control,
 * sync, pairing) don't reach expo-notifications' listener, so hush's native module passes them on.
 */
/** Makes every message unique, so two identical requests aren't taken for one delivered twice. */
const msgId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

export function addPushListener(cb: (n: Notifications.Notification) => void): { remove: () => void } {
  ensureHub();
  hub.add(cb);
  return { remove: () => { hub.delete(cb); } };
}

// One place where every push comes in (foreground listener, Android background task, iOS silent
// pushes), with duplicates dropped: in the foreground Android delivers to both.
const hub = new Set<(n: Notifications.Notification) => void>();
const seen = new Map<string, number>();
let hubReady = false;
function fanOut(n: Notifications.Notification) {
  const key = JSON.stringify(n.request.content.data ?? {});
  const now = Date.now();
  for (const [k, at] of seen) if (now - at > 60_000) seen.delete(k);
  if (seen.has(key)) return;
  seen.set(key, now);
  hub.forEach((cb) => { try { cb(n); } catch {} });
}
const asNotification = (data: Record<string, unknown>) => ({
  date: Date.now(),
  request: { identifier: `data-${Date.now()}-${Math.random()}`, content: { title: null, subtitle: null, body: null, data, sound: null }, trigger: null },
} as unknown as Notifications.Notification);
function ensureHub() {
  if (hubReady) return;
  hubReady = true;
  Notifications.addNotificationReceivedListener(fanOut);
  onBackgroundPush((data) => fanOut(asNotification(data)));
  if (Platform.OS === "ios" && cryDetector) cryDetector.onData((data) => fanOut(asNotification(data)));
}

/* ---------- microphone permission (both platforms) ---------- */

export async function hasMic(): Promise<boolean> {
  if (Platform.OS === "android") return PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO).catch(() => false);
  if (Platform.OS === "ios") return cryDetector?.micPermission() === "granted";
  return false;
}
export async function requestMic(): Promise<boolean> {
  if (Platform.OS === "android") {
    const r = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO, {
      title: t("perm.micTitle"),
      message: t("perm.micMsg"),
      buttonPositive: t("perm.allow"),
    }).catch(() => null);
    return r === PermissionsAndroid.RESULTS.GRANTED;
  }
  if (Platform.OS === "ios") return (await cryDetector?.requestMic().catch(() => false)) ?? false;
  return false;
}

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

/* ---------- "listen in" clips (Firebase Storage, simple REST upload) ---------- */

export const storageBucket = () => (Constants.expoConfig?.extra as { storageBucket?: string } | undefined)?.storageBucket;
const bucket = storageBucket;
export const CLIP_SECONDS = 10;
/** Default length of the clip that follows a crying alert. */
export const CRY_CLIP_SECONDS = 10;
/** Where a new clip goes: an unguessable name, deleted by the bucket's lifecycle rule after a day. */
export function newClip(): { upload: string; download: string } | null {
  const b = bucket();
  if (!b) return null;
  const id = Array.from({ length: 24 }, () => "abcdefghijklmnopqrstuvwxyz0123456789"[Math.floor(Math.random() * 36)]).join("");
  const path = encodeURIComponent(`clips/${id}.wav`);
  return {
    upload: `https://firebasestorage.googleapis.com/v0/b/${b}/o?uploadType=media&name=${path}`,
    download: `https://firebasestorage.googleapis.com/v0/b/${b}/o/${path}?alt=media`,
  };
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
  // Google's push service is sometimes briefly unreachable (SERVICE_NOT_AVAILABLE, timeouts): try a few times.
  let last: unknown;
  for (const wait of [0, 1500, 4000, 8000]) {
    if (wait) await new Promise((r) => setTimeout(r, wait));
    try {
      const { data } = await Notifications.getExpoPushTokenAsync({ projectId: id });
      return data;
    } catch (e) { last = e; }
  }
  const msg = String((last as Error)?.message ?? last);
  throw new Error(/SERVICE_NOT_AVAILABLE|TIMEOUT|network|IOException|UnknownHost/i.test(msg) ? t("perm.tokenNet") : t("perm.tokenFail"));
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
  if (!["cry", "battery", "stopped"].includes(data?.type ?? "")) return;
  const list = await loadAlerts();
  if (list.some((a) => a.id === n.request.identifier)) return;
  const next = [{ id: n.request.identifier, body: n.request.content.body ?? t("nights.crying"), at: n.date }, ...list].slice(0, 30);
  await AsyncStorage.setItem(ALERTS_KEY, JSON.stringify(next)).catch(() => {});
  return next;
}

/** A silent message between hush phones (no notification is shown). */
export async function sendData(to: string[], data: Record<string, unknown>): Promise<boolean> {
  if (!to.length) return false;
  try {
    const res = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(to.map((t) => ({ to: t, data: { ...data, _id: msgId() }, priority: "high", _contentAvailable: true }))),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** Several silent messages in one request (Expo takes up to 100). */
export async function sendDataMany(messages: { to: string; data: Record<string, unknown> }[]): Promise<boolean> {
  if (!messages.length) return false;
  try {
    let ok = true;
    for (let i = 0; i < messages.length; i += 90) {
      const res = await fetch("https://exp.host/--/api/v2/push/send", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(messages.slice(i, i + 90).map((m) => ({ ...m, data: { ...m.data, _id: msgId() }, priority: "high", _contentAvailable: true }))),
      });
      ok = ok && res.ok;
    }
    return ok;
  } catch {
    return false;
  }
}

export const myLang = () => getLang();

/** Send a push through Expo's push service. Returns true when Expo accepted it. */
export async function sendPush(to: string[], body: string, data: Record<string, unknown>, title = "hush", channelId = INFO_CHANNEL, categoryId?: string): Promise<boolean> {
  if (!to.length) return false;
  try {
    const res = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(to.map((t) => ({ to: t, title, body, data: { ...data, _id: msgId() }, sound: channelId === ALARM_CHANNEL ? ALARM_SOUND : "default", priority: "high", channelId, interruptionLevel: channelId === ALARM_CHANNEL ? "time-sensitive" : "active", ...(categoryId ? { categoryId } : {}) }))),
    });
    const json = await res.json().catch(() => null);
    return res.ok && !(json?.data ?? []).some((d: { status?: string }) => d.status === "error");
  } catch {
    return false;
  }
}

/* ---------- permissions on the baby phone ---------- */

export async function askMicAndNotifications(): Promise<string | null> {
  if (Platform.OS === "web" || !cryDetector) return t("perm.androidOnly");
  if (!(await requestMic())) return t("perm.micNeeded");
  // Needed on Android 13+ to show the "listening" notification that keeps it running.
  await Notifications.requestPermissionsAsync().catch(() => {});
  return null;
}
