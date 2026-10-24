// The family in Firestore: the one source of truth for who is connected and for everything they
// share, so every phone shows the same thing whether or not hush was open when it changed.
//
// families/{f}                 owner; sleep (asleep since / woke at, by which phone); ack ("I'm on it"); baby
// families/{f}/members/{uid}   who's in: push token, name, language, status "member" or "pending"
// families/{f}/phones/{uid}    each phone's live state (baby monitor, white noise, battery)
// families/{f}/acts/{id}       the activity log
// families/{f}/days/{id}       each phone's sleep days
// codes/{6 digits}             a pairing code for 5 minutes: which family, who invited
//
// No accounts: each phone signs in anonymously (its uid is its member id). The server's rules
// (firestore.rules) let only members read or change a family, let a phone with a code ask to join
// (as "pending"), and only a member can let it in. Pushes still carry what has to wake a phone
// (crying alerts, notifications, remote commands).
import Constants from "expo-constants";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import * as FirebaseAuth from "firebase/auth";
import { initializeAuth, getAuth, signInAnonymously, type Auth } from "firebase/auth";
import {
  initializeFirestore, doc, collection, setDoc, onSnapshot, query, orderBy, limit, where, getDocs, deleteDoc, getDocFromServer, runTransaction, writeBatch, getDoc, updateDoc,
  type Firestore, type Unsubscribe, type DocumentData,
} from "firebase/firestore";
import type { Lang } from "./i18n";
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
        await getDocFromServer(doc(db!, "codes", "probe"));
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
export function nativeCredentials(): { apiKey: string; projectId: string; refreshToken: string; uid: string } | null {
  const u = auth?.currentUser;
  if (!u || !config) return null;
  return { apiKey: config.apiKey, projectId: config.projectId, refreshToken: u.refreshToken, uid: u.uid };
}
/** This phone's member id ("" until signed in). */
export const myUid = () => auth?.currentUser?.uid ?? "";

const fam = (f: string) => doc(db!, "families", f);
const sub = (f: string, c: string, id: string) => doc(db!, "families", f, c, id);
const rand = (n: number) => Array.from({ length: n }, () => "abcdefghijkmnpqrstuvwxyz23456789"[Math.floor(Math.random() * 32)]).join("");

/** Writes go through even with hush in the background; failures are simply retried by the next one. */
const safe = (p: () => Promise<unknown>) => { if (!db || !myUid()) return; p().catch(() => {}); };

/* ---------- membership ---------- */

export type MemberDoc = { uid: string; token: string; name: string; lang?: Lang; status: "member" | "pending"; joinedAt: number; invitedBy?: string };
export type Me = { token: string; name: string; lang: Lang };

/** A new family with this phone in it. Returns its id. */
export async function createFamily(me: Me): Promise<string> {
  if (!(await signIn())) throw new Error("offline");
  const uid = myUid();
  const f = rand(20);
  const b = writeBatch(db!);
  b.set(fam(f), { owner: uid, created: Date.now() });
  b.set(sub(f, "members", uid), { uid, token: me.token, name: me.name, lang: me.lang, status: "member", joinedAt: Date.now() } satisfies MemberDoc);
  await b.commit();
  return f;
}

export const CODE_MINUTES = 5;
export type Code = { fid: string; by: string; byToken: string; name: string; baby: string; exp: number };

/** A fresh 6-digit code for 5 minutes (a code still in use by someone else is skipped). */
export async function publishCode(f: string, me: Me, baby: string): Promise<{ code: string; exp: number } | "offline"> {
  if (!(await signIn())) return "offline";
  for (let i = 0; i < 6; i++) {
    const code = String(Math.floor(Math.random() * 1_000_000)).padStart(6, "0");
    const exp = Date.now() + CODE_MINUTES * 60_000;
    try {
      const ok = await runTransaction(db!, async (tx) => {
        const cur = await tx.get(doc(db!, "codes", code));
        if (cur.exists() && (cur.data() as Code).exp > Date.now()) return false;
        tx.set(doc(db!, "codes", code), { fid: f, by: myUid(), byToken: me.token, name: me.name, baby, exp } satisfies Code);
        return true;
      });
      if (ok) return { code, exp };
    } catch {
      // Someone else's expired code we may not overwrite, or no connection: try another / give up.
    }
  }
  return "offline";
}
export async function readCode(code: string): Promise<Code | "missing" | "expired" | "offline"> {
  if (!(await signIn())) return "offline";
  try {
    const s = await getDocFromServer(doc(db!, "codes", code));
    if (!s.exists()) return "missing";
    const c = s.data() as Code;
    return c.exp < Date.now() ? "expired" : c;
  } catch {
    return "offline";
  }
}

/** Ask to join (this phone shows up as "pending" until a member lets it in). "member": already in. */
export async function askToJoin(f: string, me: Me, invitedBy: string): Promise<"pending" | "member" | false> {
  if (!(await signIn())) return false;
  const uid = myUid();
  try {
    const cur = await getDocFromServer(sub(f, "members", uid));
    if (cur.exists() && (cur.data() as MemberDoc).status === "member") return "member";
    await setDoc(sub(f, "members", uid), { uid, token: me.token, name: me.name, lang: me.lang, status: "pending", joinedAt: Date.now(), invitedBy } satisfies MemberDoc);
    return "pending";
  } catch {
    return false;
  }
}
/** Let a waiting phone in, if it's still waiting. False: it cancelled or gave up meanwhile. */
export async function approve(f: string, uid: string): Promise<boolean> {
  return runTransaction(db!, async (tx) => {
    const s = await tx.get(sub(f, "members", uid));
    if (!s.exists() || (s.data() as MemberDoc).status !== "pending") return false;
    tx.update(sub(f, "members", uid), { status: "member", joinedAt: Date.now() });
    return true;
  });
}
/**
 * Remove the phone with this push address, found on the server (this phone's list may not be
 * loaded yet), and only while that entry still has the address (a phone that got a new address
 * isn't removed by mistake).
 */
export async function removeByToken(f: string, token: string) {
  if (!db || !f || !token || !(await signIn())) return;
  try {
    const s = await getDocs(query(collection(db, "families", f, "members"), where("token", "==", token)));
    for (const d of s.docs) {
      const uid = (d.data() as MemberDoc).uid ?? d.id;
      await deleteDoc(sub(f, "phones", uid)).catch(() => {});
      await runTransaction(db, async (tx) => {
        const cur = await tx.get(sub(f, "members", uid));
        if (cur.exists() && (cur.data() as MemberDoc).token === token) tx.delete(sub(f, "members", uid));
      }).catch(() => {});
    }
  } catch {}
}
/** Say no to a pending phone, or remove a member (its live state goes too). */
export async function removeFromFamily(f: string, uid: string) {
  if (!db || !f || !uid) return;
  // The live state first: once the entry is gone, this phone may no longer touch the family.
  await deleteDoc(sub(f, "phones", uid)).catch(() => {});
  await deleteDoc(sub(f, "members", uid)).catch(() => {});
}
/** This phone leaves (or cancels its request). */
export const leaveFamily = (f: string) => removeFromFamily(f, myUid());
/** This phone's own entry: push address, name, language. */
export function updateMe(f: string, me: Me) {
  safe(() => updateDoc(sub(f, "members", myUid()), { token: me.token, name: me.name, lang: me.lang }));
}

/**
 * The family's members, kept up to date (runs whenever hush runs, also in the background: it only
 * fires when someone joins, leaves or renames). Only answers from the server count, so an empty
 * cache can't look like "this phone was removed". `mine`: this phone's own entry, or null if it
 * isn't in the family (removed, or said no to).
 */
export function watchMembers(f: string, cb: (list: MemberDoc[], mine: MemberDoc | null) => void): Unsubscribe {
  if (!db || !f) return () => {};
  const uid = myUid();
  return onSnapshot(collection(db, "families", f, "members"), { includeMetadataChanges: true }, (s) => {
    if (s.metadata.fromCache) return;
    const list = s.docs.map((d) => d.data() as MemberDoc);
    cb(list, list.find((x) => x.uid === uid) ?? null);
  }, (e) => {
    // No longer allowed to read: this phone isn't a member any more. (Other errors: try again later.)
    if ((e as { code?: string }).code === "permission-denied") cb([], null);
  });
}
/** A pending phone waits on its own entry: let in (member), said no (gone), or still waiting. */
export function watchMyRequest(f: string, cb: (state: "member" | "pending" | "gone") => void): Unsubscribe {
  if (!db || !f) return () => {};
  return onSnapshot(sub(f, "members", myUid()), { includeMetadataChanges: true }, (s) => {
    if (s.metadata.fromCache) return;
    cb(!s.exists() ? "gone" : (s.data() as MemberDoc).status);
  }, () => cb("gone"));
}
export async function isMember(f: string): Promise<boolean | null> {
  try { const s = await getDoc(sub(f, "members", myUid())); return s.exists() && (s.data() as MemberDoc).status === "member"; } catch { return null; }
}

/* ---------- shared state ---------- */

/** The live state of this phone. Merged into what's there. */
export type PhoneLive = { crying?: boolean; cryAt?: number; listening?: boolean; canMonitor?: boolean; playing?: boolean; sound?: string; listenSince?: number; battery?: number; charging?: boolean; baby?: string; name?: string; seen: number };
export function writePhone(f: string, token: string, live: PhoneLive) {
  if (!f || !token) return;
  safe(() => setDoc(sub(f, "phones", myUid()), { ...live, token }, { merge: true }));
}

export type RoomSleep = { asleep: boolean; since: number; at: number; from: string };
export type RoomAck = { by: string; name: string; until: number };
export function writeRoom(f: string, data: { sleep?: RoomSleep; ack?: RoomAck; baby?: string }) {
  if (!f) return;
  const { sleep, ...rest } = data;
  if (Object.keys(rest).length) safe(() => setDoc(fam(f), { ...rest, updated: Date.now() }, { merge: true }));
  // Asleep / awake: the newest statement wins, whichever write reaches the server last.
  if (sleep) safe(() => runTransaction(db!, async (tx) => {
    const cur = (await tx.get(fam(f))).data()?.sleep as RoomSleep | undefined;
    if (cur && cur.at > sleep.at) return;
    tx.set(fam(f), { sleep, updated: Date.now() }, { merge: true });
  }));
}

export function writeAct(f: string, act: { id: string } & Record<string, unknown>) {
  if (!f || !act.id) return;
  safe(() => setDoc(sub(f, "acts", act.id), act));
}

/** A logged sleep in the family's shared list (one document per sleep; deleted ones are marked). */
export function writeSleep(f: string, s: { id: string } & Record<string, unknown>) {
  if (!f || !s.id) return;
  safe(() => setDoc(sub(f, "sleeps", s.id), s));
}

/** One of this phone's sleep days, packed (Firestore can't hold the timelines' nested arrays). */
export function writeDay(f: string, device: string, key: string, rev: number, packed: string) {
  if (!f || !device || !key) return;
  safe(() => setDoc(sub(f, "days", `${device.replace(/[^A-Za-z0-9_-]/g, "_")}_${key}`), { device, key, rev, j: packed }));
}

/** Settings → Clear sleep history: this phone's days and the family's activity log go too. */
export async function deleteDays(f: string, device: string) {
  if (!f || !device || !(await signIn())) return;
  try {
    const s = await getDocs(query(collection(db!, "families", f, "days"), where("device", "==", device)));
    const a = await getDocs(collection(db!, "families", f, "acts"));
    await Promise.all([...s.docs, ...a.docs].map((d) => deleteDoc(d.ref)));
  } catch {}
  AsyncStorage.removeItem("hush:cloudDays").catch(() => {});
}

/* ---------- reading (only while hush is on screen; it catches up instantly when it comes back) ---------- */

export type PhoneDoc = { token: string } & Partial<PhoneLive>;
export type DayDoc = { device: string; key: string; rev: number; j: string };
export type RoomHandlers = {
  room: (d: { sleep?: RoomSleep; ack?: RoomAck; baby?: string }) => void;
  phones: (list: PhoneDoc[]) => void;
  acts: (list: DocumentData[]) => void;
  days: (list: DayDoc[]) => void;
  sleeps: (list: DocumentData[]) => void;
};
export function watchRoom(f: string, h: RoomHandlers, sinceKey: string, sleepsSince: number): Unsubscribe {
  if (!db || !f) return () => {};
  const subs: Unsubscribe[] = [];
  const err = () => {};
  subs.push(onSnapshot(fam(f), (s) => { if (s.exists()) h.room(s.data() as Parameters<RoomHandlers["room"]>[0]); }, err));
  subs.push(onSnapshot(collection(db, "families", f, "phones"), (s) => h.phones(s.docs.map((d) => d.data() as PhoneDoc)), err));
  subs.push(onSnapshot(query(collection(db, "families", f, "acts"), orderBy("at", "desc"), limit(40)), (s) => h.acts(s.docs.map((d) => d.data())), err));
  subs.push(onSnapshot(query(collection(db, "families", f, "days"), where("key", ">=", sinceKey)), (s) => h.days(s.docs.map((d) => d.data() as DayDoc)), err));
  subs.push(onSnapshot(query(collection(db, "families", f, "sleeps"), where("updated", ">=", sleepsSince)), (s) => h.sleeps(s.docs.map((d) => d.data())), err));
  return () => subs.forEach((u) => u());
}
