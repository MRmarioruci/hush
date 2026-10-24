// The family's shared room in Firestore: one source of truth every phone reads and writes, so they
// all show the same thing (who's the baby monitor, white noise, battery, asleep or awake, "I'm on
// it", the activity log and the sleep history), whether or not hush was open when it changed.
//
// rooms/{room}            sleep: asleep since / woke at, and by which phone; ack: "I'm on it"
// rooms/{room}/phones/{p} each phone: its family entry (name, language) and live state
// rooms/{room}/acts/{id}  the activity log
// rooms/{room}/days/{id}  each phone's sleep days
//
// No accounts: an anonymous sign-in, and the room's name is the family's secret id + key from the
// pairing code, which only the family's phones know. Pushes still carry what has to wake a phone
// (crying alerts, notifications, remote commands, pairing).
import Constants from "expo-constants";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import * as FirebaseAuth from "firebase/auth";
import { initializeAuth, getAuth, signInAnonymously, type Auth } from "firebase/auth";
import {
  initializeFirestore, doc, collection, setDoc, onSnapshot, query, orderBy, limit, where, getDocs, deleteDoc, getDocFromServer,
  type Firestore, type Unsubscribe, type DocumentData,
} from "firebase/firestore";
import type { Family, Entry } from "./family";
import { diag } from "../modules/hush-native/src";

type Config = { apiKey: string; projectId: string; appId: string; storageBucket?: string };
const config = (Constants.expoConfig?.extra as { firebase?: Config } | undefined)?.firebase;

let app: FirebaseApp | null = null;
let auth: Auth | null = null;
let db: Firestore | null = null;

function init(): boolean {
  if (db) return true;
  if (!config?.apiKey || !config.projectId) return false;
  try {
    app = getApps()[0] ?? initializeApp(config);
    // React Native keeps the sign-in in AsyncStorage (the same anonymous user across restarts).
    const rnPersistence = (FirebaseAuth as unknown as { getReactNativePersistence?: (s: unknown) => FirebaseAuth.Persistence }).getReactNativePersistence;
    try {
      auth = rnPersistence ? initializeAuth(app, { persistence: rnPersistence(AsyncStorage) }) : getAuth(app);
    } catch {
      auth = getAuth(app); // already initialised (fast refresh)
    }
    db = initializeFirestore(app, { ignoreUndefinedProperties: true, experimentalAutoDetectLongPolling: true });
    return true;
  } catch {
    return false;
  }
}

/** Signed in (anonymously), or null when the cloud isn't set up or can't be reached. */
let signing: Promise<boolean> | null = null;
export function signIn(): Promise<boolean> {
  if (!init() || !auth) return Promise.resolve(false);
  if (!signing) {
    signing = (async () => {
      try {
        await auth!.authStateReady();
        if (!auth!.currentUser) await signInAnonymously(auth!);
        if (!auth!.currentUser) throw new Error("no user");
        // The room store has to be there and let us in; until it does, the phones keep syncing by push.
        await getDocFromServer(doc(db!, "rooms", "hush-probe-0000000000000"));
        diag.mark("cloud room ready");
        return true;
      } catch (e) {
        diag.mark(`cloud not ready: ${(e as { code?: string }).code ?? ""} ${String((e as Error).message ?? e).slice(0, 120)}`);
        signing = null; // try again next time
        return false;
      }
    })();
  }
  return signing;
}

/** For the native side, which writes this phone's state while hush sleeps (CloudSync.kt). */
export function nativeCredentials(): { apiKey: string; projectId: string; refreshToken: string } | null {
  const u = auth?.currentUser;
  if (!u || !config) return null;
  return { apiKey: config.apiKey, projectId: config.projectId, refreshToken: u.refreshToken };
}

export const roomId = (f: Family | null | undefined) => (f ? `${f.id}${f.key}`.replace(/[^A-Za-z0-9~_-]/g, "") : "");
/** A phone's document: its push address without the wrapper. */
export const phoneId = (token: string) => token.replace(/^ExponentPushToken\[/, "").replace(/\]$/, "").replace(/[^A-Za-z0-9_-]/g, "_");

const roomDoc = (room: string) => doc(db!, "rooms", room);

/* ---------- writing ---------- */

/** Writes go through even with hush in the background; failures are simply retried by the next one. */
const safe = (p: () => Promise<unknown>) => { if (!db) return; p().catch(() => {}); };

/** The live state of this phone (or the family entry of any phone). Merged into what's there. */
export type PhoneLive = { listening?: boolean; canMonitor?: boolean; playing?: boolean; sound?: string; listenSince?: number; battery?: number; charging?: boolean; baby?: string; name?: string; seen: number };
export function writePhone(room: string, token: string, data: { live?: PhoneLive; entry?: Entry }) {
  if (!room || !token) return;
  const flat: Record<string, unknown> = { token };
  if (data.live) for (const [k, v] of Object.entries(data.live)) flat[k] = v;
  if (data.entry) flat.entry = { name: data.entry.name ?? "", at: data.entry.at, ...(data.entry.lang ? { lang: data.entry.lang } : {}), ...(data.entry.gone ? { gone: true } : { gone: false }) };
  safe(() => setDoc(doc(db!, "rooms", room, "phones", phoneId(token)), flat, { merge: true }));
}

export type RoomSleep = { asleep: boolean; since: number; at: number; from: string };
export type RoomAck = { by: string; name: string; until: number };
export function writeRoom(room: string, data: { sleep?: RoomSleep; ack?: RoomAck; baby?: string }) {
  if (!room) return;
  safe(() => setDoc(roomDoc(room), { ...data, updated: Date.now() }, { merge: true }));
}

export function writeAct(room: string, act: { id: string } & Record<string, unknown>) {
  if (!room || !act.id) return;
  safe(() => setDoc(doc(db!, "rooms", room, "acts", act.id), act));
}

/** One of this phone's sleep days, packed (Firestore can't hold the timelines' nested arrays). */
export function writeDay(room: string, device: string, key: string, rev: number, packed: string) {
  if (!room || !device || !key) return;
  safe(() => setDoc(doc(db!, "rooms", room, "days", `${device.replace(/[^A-Za-z0-9_-]/g, "_")}_${key}`), { device, key, rev, j: packed }));
}

/** Settings → Clear sleep history: this phone's days leave the room too. */
export async function deleteDays(room: string, device: string) {
  if (!room || !device || !(await signIn())) return;
  try {
    const s = await getDocs(query(collection(db!, "rooms", room, "days"), where("device", "==", device)));
    await Promise.all(s.docs.map((d) => deleteDoc(d.ref)));
  } catch {}
  AsyncStorage.removeItem("hush:cloudDays").catch(() => {});
}

/* ---------- reading (only while hush is on screen; it catches up instantly when it comes back) ---------- */

export type PhoneDoc = { token: string; entry?: Entry } & Partial<PhoneLive>;
export type DayDoc = { device: string; key: string; rev: number; j: string };
export type RoomHandlers = {
  room: (d: { sleep?: RoomSleep; ack?: RoomAck; baby?: string }) => void;
  phones: (list: PhoneDoc[]) => void;
  acts: (list: DocumentData[]) => void;
  days: (list: DayDoc[]) => void;
};
export function watchRoom(room: string, h: RoomHandlers, sinceKey: string): Unsubscribe {
  if (!db || !room) return () => {};
  const subs: Unsubscribe[] = [];
  const err = () => {};
  subs.push(onSnapshot(roomDoc(room), (s) => { if (s.exists()) h.room(s.data() as Parameters<RoomHandlers["room"]>[0]); }, err));
  subs.push(onSnapshot(collection(db, "rooms", room, "phones"), (s) => h.phones(s.docs.map((d) => d.data() as PhoneDoc)), err));
  subs.push(onSnapshot(query(collection(db, "rooms", room, "acts"), orderBy("at", "desc"), limit(40)), (s) => h.acts(s.docs.map((d) => d.data())), err));
  subs.push(onSnapshot(query(collection(db, "rooms", room, "days"), where("key", ">=", sinceKey)), (s) => h.days(s.docs.map((d) => d.data() as DayDoc)), err));
  return () => subs.forEach((u) => u());
}
