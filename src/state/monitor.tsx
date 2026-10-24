// The baby monitor: listening state, settings and pairing. Independent of the white noise,
// so both can run at once and neither stops the other.
import { logAct, receiveAct, receiveActs, setActTransport, type Act } from "../activity";
import { dialog } from "../components/Dialog";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { AppState, Platform } from "react-native";
import { cryDetector, diag, type CryStatus } from "../../modules/hush-native/src";
import { addEvents, applySharedSleeps, dayKey, dropReceivedOnce, deviceId, fmtDur, lastSleep, ownNights, packNights, RAW_DAYS, saveReceivedNights, setSleepSync, unpackNights, type HushEvent, type Night, type SharedSleep } from "../nights";
import { approve, askToJoin, createFamily, isMember, leaveFamily as leaveCloud, myUid, nativeCredentials, publishCode, readCode, removeByToken, removeFromFamily, signIn, updateMe, watchMembers, watchMyRequest, watchRoom, writeAct, writeDay, writePhone, writeRoom, writeSleep, type PhoneLive, type RoomSleep } from "../cloud";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useAppActive } from "../components/ui";
import * as Notifications from "expo-notifications";
import { loadStops, saveStops, type Stop, type StopWhy } from "../stops";
import { CLIP_SECONDS, CRY_CLIP_SECONDS, newClip, storageBucket, sendData, MONITOR_DEFAULTS, addPushListener, hasMic, sendPush, THRESHOLDS, askMicAndNotifications, loadMonitor, saveMonitor, type MonitorSettings, type Room, setupAlertChannel, getMyToken, sendDataMany, onDeadTokens } from "../monitor";
import { membersOf, type Family, type Member } from "../family";
import { babyLabel, babyLabelIn, getLang, t, tIn, useLang } from "../i18n";
import { useUnlock } from "./unlock";

/** A phone in the family that's listening (a baby's room), as it last reported. */
export type RoomView = { token: string; name: string; room: Room | null };

type Monitor = {
  m: MonitorSettings;
  /** The other phones in the family. */
  members: Member[];
  /** This phone's push address ("" until known). */
  me: string;
  /** Other phones listening right now (fresh reports), newest first. */
  rooms: RoomView[];
  /** The room the remote, listen-in and widget act on: the one picked, else the one listening. */
  target: string | null;
  room: Room | null;
  /** That phone's name and its baby's name, as it reported them. */
  targetName: string;
  targetBaby: string;
  setFocus: (token: string | null) => void;
  /** What this phone is doing now: listening (a baby's room), watching another room, or neither. */
  role: "nursery" | "parent" | null;
  /** A 6-digit code (5 minutes) for another phone to join with; makes the family if there's none yet. Or an error to show. */
  invite: () => Promise<{ code: string; exp: number } | string>;
  /** Join with a scanned code or opened link. Returns an error to show, or null. */
  join: (raw: string) => Promise<string | null>;
  /** Waiting to be let in (the family's id), "denied", "failed" (no answer), or null. */
  joining: string | null;
  removeMember: (token: string) => void;
  leaveFamily: () => void;
  update: (patch: Partial<MonitorSettings>) => void;
  listening: boolean;
  /** Ask a listening phone for a few seconds of sound (default: the target). Returns when it was asked. */
  requestClip: (seconds?: number, to?: string | null) => Promise<{ at: number; ok: boolean }>;
  /** Another phone wants to listen in but it's off here: ask on screen, and tell them if it's allowed. */
  askAllow: (who: string, from: string) => void;
  cancelJoin: () => void;
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
  /** "I'm on it" for crying in a room: quiets its alerts for a few minutes and tells the others. */
  ackCry: (room?: string) => Promise<void>;
  /** When this phone last asked for a recording (0 = never, or sending failed). */
  clipAsked: number;
  /** Pick up a recording the native side got meanwhile; returns the latest. */
  syncClip: () => { url?: string } | null;
  /** Someone is on the crying (this phone = "me"), until when. */
  ack: { who: string; until: number } | null;
  lastSync: number;
  /** Connected to the family's room in the cloud (the source of truth for everything shared). */
  cloudReady: boolean;
  /** The room's shared sleep: asleep since / woke at, and which phone said so (null: not known yet). */
  roomSleep: RoomSleep | null;
  setRoomSleep: (s: RoomSleep) => void;
  /** Whether another phone is known to be on the cloud room (then its pushes about shared state are redundant). */
  isOnCloud: (token: string) => boolean;
  /** This phone's live state, for the room (white noise etc.; the native side adds battery and the mic). */
  writeLive: (live: Omit<PhoneLive, "seen">) => void;
};

const Ctx = createContext<Monitor | null>(null);
export const useMonitor = () => useContext(Ctx)!;

/** How long "I'm on it" quiets the crying alerts. */
const ACK_MS = 5 * 60_000;

export function MonitorProvider({ children }: { children: ReactNode }) {
  const [m, setM] = useState<MonitorSettings>(MONITOR_DEFAULTS);
  const unlock = useUnlock();
  // Nothing is saved until the stored settings have loaded: an early save (a notification handled at
  // startup, say) used to write the defaults over the real settings and lose the pairing.
  const loaded = useRef(false);
  const pending = useRef<Partial<MonitorSettings>>({});
  // Made once: useRef's argument runs on every render, and a new promise there replaced the resolver,
  // so the first promise never resolved and anything waiting on it (the push address) hung.
  const readyResolve = useRef<() => void>(() => {});
  const ready = useRef<Promise<void> | null>(null);
  if (!ready.current) ready.current = new Promise<void>((res) => { readyResolve.current = res; });
  useEffect(() => {
    loadMonitor().then((raw) => {
      let v = { ...raw, ...pending.current };
      // 1.31: phones are connected through the family in the cloud. Pairings from before are
      // forgotten once, for a clean start (every phone pairs again).
      if (!v.cloudFamily) {
        v = { ...v, family: null, rooms: {}, parents: undefined, pairedToken: undefined, pairedWith: undefined, role: undefined, cloudFamily: true };
        AsyncStorage.multiRemove(["hush:cloudDays", "hush:acts"]).catch(() => {});
        saveMonitor(v);
      }
      // No name yet: start with the phone's own name (e.g. "Redmi Note 14"); it can be changed in the phones list.
      // Old placeholder names ("Parent 1", "Phone 2", in any language) count as no name.
      const placeholder = !v.myName?.trim() || /^[^\s\d]+\s*\d{1,2}$/u.test(v.myName.trim());
      const dn = placeholder ? cryDetector?.deviceName?.() : null;
      if (dn) v = { ...v, myName: dn };
      if (dn || Object.keys(pending.current).length) saveMonitor(v);
      pending.current = {};
      loaded.current = true;
      mRef.current = v; // before anything waiting on `ready` reads it
      setM(v);
      readyResolve.current();
    });
  }, []);
  const update = useCallback((patch: Partial<MonitorSettings>) => {
    if (!loaded.current) {
      // Before loading, anything about the family or rooms was worked out from empty defaults: drop it.
      const { family: _f, rooms: _r, ...safe } = patch;
      pending.current = { ...pending.current, ...safe };
      setM((prev) => ({ ...prev, ...safe }));
      return;
    }
    setM((prev) => {
      const next = { ...prev, ...patch };
      saveMonitor(next);
      return next;
    });
  }, []);

  const baby = babyLabel(m.babyName);
  const me = m.me ?? "";
  const members = membersOf(m.family, me);
  const tokens = members.map((p) => p.token);
  // The cloud room (set up further down; these refs are read by callbacks defined before it).
  const ridRef = useRef("");
  const cloudRef = useRef(false);
  const pushDaysRef = useRef<(force?: boolean) => Promise<void>>(async () => {});
  /** Pushes keep carrying shared things too while any phone isn't on the cloud room (older versions). */
  const pushAlso = () => !cloudRef.current;
  // "listening" is the baby monitor switch. The mic also runs when smart white noise wants it.
  const [listening, setListeningRaw] = useState(() => cryDetector?.isListening() ?? false);
  const [lastStop, setLastStop] = useState<Stop | null>(null);
  // Every change of the switch goes through here, so a stop always has a reason.
  const listeningNow = useRef(cryDetector?.isListening() ?? false);
  const setListening = useCallback((on: boolean, why: StopWhy = "you", detail?: string) => {
    const was = listeningNow.current;
    listeningNow.current = on;
    if (was !== on) logAct(on ? "monOn" : "monOff", on ? (why === "remote" && detail ? { asker: detail } : {}) : { why });
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
        logAct("monOff", { why: "system" });
        const stop: Stop = { at: Date.now(), why: "system" };
        saveStops({ listen: stop, wasListening: false });
        setLastStop(stop);
      } else setLastStop(st.listen ?? null);
    });
    // The switch says on, but the listener isn't running: the phone stopped it.
    const check = () => { if (cryDetector && !cryDetector.isListening()) setListeningRaw((on) => { if (on) { if (listeningNow.current) { listeningNow.current = false; logAct("monOff", { why: "system" }); } const stop: Stop = { at: Date.now(), why: "system" }; setLastStop(stop); saveStops({ listen: stop, wasListening: false }); } return false; }); };
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
      allowAsk: t("allow.notif", { who: "{who}" }),
      acked: t("push.acked", { name: baby, who: "{who}" }),
    });
  }, [lang, baby]);
  // The ongoing "listening" notification says why: alerts for the paired phones, a monitor with
  // no phone paired yet, or only smart volume listening for crying.
  useEffect(() => {
    cryDetector?.setTexts({
      listenTitle: t("push.listenTitle"),
      listenText: t(!listening && soundWantsMic ? "push.listenSound" : members.length ? "push.listenText" : "push.listenAlone", { name: baby }),
    });
  }, [lang, baby, listening, soundWantsMic, members.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // Each parent gets alerts in their own phone's language.
  useEffect(() => {
    cryDetector?.setTargets(members.map((p) => {
      const L = p.lang ?? getLang();
      const name = babyLabelIn(L, m.babyName);
      return {
        token: p.token,
        crying: tIn(L, "push.crying", { name }),
        still: tIn(L, "push.still", { name }),
        acked: tIn(L, "push.acked", { name, who: "{who}" }),
        lowBattery: tIn(L, "push.lowBattery", { name, pct: "{pct}" }),
        stopped: tIn(L, "push.stopped", { name }),
        name: p.name,
        listenReady: tIn(L, "listen.ready", { name, s: "{s}" }),
        listenOff: tIn(L, "listen.off", { name }),
        listenNotListening: tIn(L, "listen.notListening", { name }),
        listenFailed: tIn(L, "listen.failed", { name }),
        cryClip: tIn(L, "listen.cryClip", { name, s: "{s}" }),
      };
    }));
  }, [tokens.join(","), members.map((p) => p.name + p.lang).join(), m.babyName, lang]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    cryDetector?.setListen(!!m.allowListen, storageBucket() ?? "", t("listen.nowHere", { who: "{who}", s: "{s}" }), m.cryClip ?? CRY_CLIP_SECONDS);
  }, [m.allowListen, m.cryClip, lang]);

  useEffect(() => {
    cryDetector?.configure(THRESHOLDS[m.sensitivity], m.babyName.trim(), tokens, m.alertAfter);
  }, [m.sensitivity, m.alertAfter, m.babyName, tokens.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!cryDetector) return;
    // The mic reports twice a second. With the screen off, keep the latest without redrawing:
    // Android saves every redraw made in the background and applies them all at once on unlock,
    // which after an hour or so is enough to get hush killed (and the white noise with it).
    let shown: CryStatus = {};
    const apply = (st: CryStatus) => { shown = st; setStatus(st); };
    const appSub = AppState.addEventListener("change", (s) => { if (s === "active" && latest) apply(latest); });
    let latest: CryStatus | null = null;
    const a = cryDetector.onStatus((st) => {
      if (st.monitorBy !== undefined) { setListening(true, "remote", st.monitorBy || undefined); return; }
      latest = st;
      if (AppState.currentState === "active" || !!st.crying !== !!shown.crying || st.error) apply(st);
      if (st.crying) setCryHeardAt(Date.now());
      if (st.error) { setListening(false, "error", st.error); setMicOn(false); }
    });
    const b = cryDetector.onCry((e) => setLastCry(e.at));
    return () => { a.remove(); b.remove(); appSub.remove(); };
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
    const mems = membersOf(cur.family, cur.me ?? "");
    const to = mems.map((p) => p.token);
    if (!to.length) return;
    const last = await lastSleep();
    if (!last) return;
    const { sleep, days } = last;
    if (Date.now() - sleep.to > 5 * 60_000 || sleep.to - sleep.from < 30 * 60_000) return;
    const kind = sleep.kind === "night" ? "night" : "nap";
    const data = packNights(days, cur.babyName.trim(), await deviceId());
    // One message per language, so every parent reads it in their own.
    const langs = [...new Set(mems.map((p) => p.lang ?? getLang()))];
    for (const L of langs) {
      const label = babyLabelIn(L, cur.babyName);
      const body = sleep.cries === 0
        ? tIn(L, `push.${kind}0`, { name: label })
        : tIn(L, `push.${kind}`, { name: label, count: sleep.cries, dur: fmtDur(sleep.cryMin) });
      sendPush(mems.filter((p) => (p.lang ?? getLang()) === L).map((p) => p.token), body, data);
    }
  }, []);

  const mRef = useRef(m);
  mRef.current = m;

  // Nights from another phone.
  useEffect(() => {
    const handle = (n: Notifications.Notification) => {
      const days = unpackNights(n.request.content.data);
      if (days) saveReceivedNights(days).then(() => setNightsVersion((v) => v + 1));
    };
    Notifications.getPresentedNotificationsAsync().then((list) => list.forEach(handle)).catch(() => {});
    const sub = addPushListener(handle);
    return () => sub.remove();
  }, []);

  /* ---------- the family: which phones belong together (Firestore, see the end and src/cloud.ts) ---------- */

  /** This phone's push address (asks for notifications the first time). */
  const myToken = useCallback(async () => {
    await ready.current!;
    let tok: string;
    try { tok = await getMyToken(); } catch (e) {
      // Google's push service unreachable for a moment: the address we already have still works.
      if (mRef.current.me) tok = mRef.current.me; else throw e;
    }
    if (tok !== mRef.current.me) {
      update({ me: tok });
      mRef.current = { ...mRef.current, me: tok };
    }
    return tok;
  }, [update]);

  const setFamily = useCallback((f: Family | null, extra: Partial<MonitorSettings> = {}) => {
    update({ family: f, ...extra });
    mRef.current = { ...mRef.current, family: f, ...extra };
  }, [update]);

  useEffect(() => { cryDetector?.setMe(me, m.myName.trim()); }, [me, m.myName]);

  /* ---------- the rooms: other phones that are listening ---------- */
  const [focus, setFocus] = useState<string | null>(null);
  const [, tickRooms] = useState(0);
  useEffect(() => { const id = setInterval(() => tickRooms((x) => x + 1), 60_000); return () => clearInterval(id); }, []);
  const FRESH = 30 * 60_000; // listening phones report every 10 minutes
  const now = Date.now();
  const allRooms = m.rooms ?? {};
  const rooms: RoomView[] = members
    .map((p) => ({ token: p.token, name: p.name, room: allRooms[p.token] ?? null }))
    .filter((x) => x.room?.listening && now - (x.room.got ?? x.room.at) < FRESH)
    .sort((a, b) => (b.room!.got ?? 0) - (a.room!.got ?? 0));
  const recent = members
    .map((p) => ({ token: p.token, at: allRooms[p.token]?.lastListen ?? 0 }))
    .filter((x) => x.at > 0)
    .sort((a, b) => b.at - a.at)[0]?.token;
  const target = (focus && members.some((p) => p.token === focus) ? focus : null)
    ?? rooms[0]?.token ?? recent ?? (members.length === 1 ? members[0].token : null);
  const room = target ? allRooms[target] ?? null : null;
  const targetMember = members.find((p) => p.token === target);
  const targetName = room?.name || targetMember?.name || "";
  const targetBaby = room?.baby ?? "";
  const role: Monitor["role"] = listening ? "nursery" : target ? "parent" : null;
  const targetRef = useRef(target);
  targetRef.current = target;

  // Start or stop the mic when either the monitor or smart white noise needs it.
  const wantMic = listening || soundWantsMic;
  // The mic only sends its twice-a-second level updates while hush is on screen.
  useEffect(() => {
    cryDetector?.setVisible(AppState.currentState === "active");
    const sub = AppState.addEventListener("change", (st) => cryDetector?.setVisible(st === "active"));
    return () => sub.remove();
  }, []);
  // Listening (here, or switched on from another phone) makes this phone the baby monitor. Stopping
  // doesn't change it back: that's chosen on the Monitor tab.
  useEffect(() => { if (listening && loaded.current && mRef.current.mode !== "monitor") update({ mode: "monitor" }); }, [listening, update]);
  // Only the baby monitor alerts the other phones; smart volume just listens for itself.
  useEffect(() => { cryDetector?.setMonitor(listening); }, [listening]);
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
        cryDetector.setMonitor(listening);
        cryDetector.configure(THRESHOLDS[mRef.current.sensitivity], mRef.current.babyName.trim(), membersOf(mRef.current.family, mRef.current.me ?? "").map((p) => p.token), mRef.current.alertAfter);
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
      // The other phones show which phone is the monitor: tell them straight away.
      setTimeout(() => cryDetector?.reportRoom(), 600);
      setTimeout(async () => { await syncEvents(); await sendNightSummary(); }, 1200);
      return null;
    }
    const problem = await askMicAndNotifications();
    if (problem) return problem;
    if (!(await unlock.beforeListen())) return null; // trial over: the unlock sheet is showing
    setListening(true);
    setTimeout(() => cryDetector?.reportRoom(), 1500);
    return membersOf(mRef.current.family, mRef.current.me ?? "").length ? null : t("perm.pairToGet");
  }, [listening, syncEvents, sendNightSummary, unlock, setListening]);

  /* ---------- sleep sync between connected phones (no account, through silent pushes) ---------- */
  const [lastSync, setLastSync] = useState(0);
  const peersOf = (cur: MonitorSettings) => membersOf(cur.family, cur.me ?? "").map((p) => p.token);
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
    if (cloudRef.current && ridRef.current) {
      setLastSync(Date.now());
      await pushDaysRef.current(force);
      if (!pushAlso()) return peers.length;
    }
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
  // What another phone reports about its room (shown on Home and Monitor). Reports come in through
  // the push listener while hush runs, and are also kept natively as they arrive, so the ones that
  // came while hush was closed or asleep are picked up when it opens.
  type RoomMsg = { type?: string; from?: string; name?: string; baby?: string; playing?: boolean; sound?: string; listening?: boolean; canMonitor?: boolean; at?: number; got?: number; listenSince?: number; battery?: number; charging?: boolean };
  const applyRooms = useCallback((list: RoomMsg[]) => {
    const cur = mRef.current;
    const mems = membersOf(cur.family, cur.me ?? "");
    const rooms = { ...(cur.rooms ?? {}) };
    let changed = false;
    for (const d of list) {
      // Older versions don't say who they are: only clear with a single other phone.
      const from = d.from ?? (mems.length === 1 ? mems[0].token : null);
      if (!from || !mems.some((p) => p.token === from)) continue;
      const prev = rooms[from];
      const at = d.at ?? Date.now();
      if (prev && prev.at >= at) continue; // already known, or an older report arriving late
      const got = Math.min(Date.now(), d.got ?? Date.now());
      rooms[from] = {
        playing: !!d.playing, sound: d.sound ?? "womb", listening: !!d.listening, at, listenSince: d.listenSince,
        battery: d.battery ?? prev?.battery, charging: d.charging ?? prev?.charging, got,
        name: d.name ?? prev?.name, baby: d.baby ?? prev?.baby, lastListen: d.listening ? got : prev?.lastListen,
        canMonitor: !!d.canMonitor && !d.listening,
      };
      changed = true;
    }
    if (!changed) return;
    update({ rooms });
    mRef.current = { ...mRef.current, rooms };
  }, [update]);
  // Catch up: the reports kept natively, then ask every phone what it's doing right now (they
  // answer natively, even locked or with hush closed). On opening hush and coming back to it.
  const lastAsk = useRef(0);
  const catchUp = useCallback(async () => {
    if (!loaded.current || !cryDetector) return;
    applyRooms(Object.values(cryDetector.rooms()) as RoomMsg[]);
    const cur = mRef.current;
    const peers = membersOf(cur.family, cur.me ?? "").map((p) => p.token);
    if (!pushAlso()) return; // the cloud room already has every phone's state
    if (!peers.length || Date.now() - lastAsk.current < 45_000) return;
    lastAsk.current = Date.now();
    try { const me = await getMyToken(); await sendData(peers, { type: "cmd", cmd: "status", from: me }); } catch {}
  }, [applyRooms]);
  useEffect(() => {
    const first = setTimeout(catchUp, 1200);
    const app = AppState.addEventListener("change", (st) => st === "active" && catchUp());
    return () => { clearTimeout(first); app.remove(); };
  }, [catchUp, tokens.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { cryDetector?.setBaby(m.babyName.trim()); }, [m.babyName]);
  useEffect(() => {
    const sub = addPushListener((n) => {
      const d = n.request.content.data as RoomMsg | undefined;
      if (d?.type !== "room") return;
      applyRooms([d]);
    });
    return () => sub.remove();
  }, [applyRooms]);

  /* ---------- "listen in": a parent asks for a few seconds of the room ---------- */

  const asking = useRef(0);
  const askAllow = useCallback((who: string, from: string) => {
    if (mRef.current.allowListen || Date.now() - asking.current < 30_000) return;
    asking.current = Date.now();
    dialog(t("allow.title", { who: who || t("rt.otherPhone") }), t("allow.body"), [
      { text: t("allow.no"), style: "cancel" },
      { text: t("allow.yes"), onPress: () => {
        update({ allowListen: true });
        // Their Listen button says they can try again now.
        if (from) sendData([from], { type: "clip", at: Date.now(), error: "allowed", from: mRef.current.me ?? "" }).catch(() => {});
      } },
    ]);
  }, [update]);

  // Baby's phone: record, upload, and send the parent a link (or say why not).
  const listeningRef = useRef(listening);
  listeningRef.current = listening;
  useEffect(() => {
    const busy = { current: false };
    const sub = addPushListener(async (n) => {
      const d = n.request.content.data as { type?: string; cmd?: string; from?: string; seconds?: number } | undefined;
      const cur = mRef.current;
      const secs = Math.max(5, Math.min(15, Math.round(Number(d?.seconds) || CLIP_SECONDS)));
      // Asked to listen in while it's off here and hush is open: ask right away.
      if (d?.type === "cmd" && d.cmd === "clip" && d.from && !cur.allowListen && AppState.currentState === "active") {
        const asker = membersOf(cur.family, cur.me ?? "").find((p) => p.token === d.from);
        if (asker) askAllow(asker.name.trim(), d.from);
      }
      // Android answers natively (works with the screen locked); this is for iPhones.
      if (Platform.OS !== "ios" || d?.type !== "cmd" || d.cmd !== "clip" || !d.from) return;
      const parent = membersOf(cur.family, cur.me ?? "").find((p) => p.token === d.from);
      if (!parent) return;
      Notifications.dismissNotificationAsync(n.request.identifier).catch(() => {});
      const L = parent.lang ?? getLang();
      const name = babyLabelIn(L, cur.babyName);
      const reply = (key: string, data: Record<string, unknown>) =>
        sendPush([parent.token], tIn(L, key, { name, s: secs }), { type: "clip", at: Date.now(), seconds: secs, ...data });
      if (!cur.allowListen) {
        if (AppState.currentState !== "active") Notifications.scheduleNotificationAsync({
          content: { title: "hush", body: t("allow.notif", { who: parent.name }), data: { type: "allow-listen", who: parent.name, from: parent.token } }, trigger: null,
        }).catch(() => {});
        return reply("listen.off", { error: "off" });
      }
      if (!listeningRef.current || !cryDetector) return reply("listen.notListening", { error: "notListening" });
      const where = newClip();
      if (!where) return reply("listen.failed", { error: "setup" });
      if (busy.current) return;
      busy.current = true;
      // Nobody listens in unnoticed: say so on the baby's phone.
      Notifications.scheduleNotificationAsync({
        content: { title: "hush", body: t("listen.nowHere", { who: parent.name, s: secs }), data: { type: "listen-notice" }, sound: false },
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
  }, [askAllow]);

  /** The latest recording the native side kept (it arrives there even with hush's screens asleep). */
  const syncClip = useCallback(() => {
    const c = cryDetector?.lastClip();
    if (!c || !c.at) return mRef.current.clip ?? null;
    if ((mRef.current.clip?.at ?? 0) >= c.at && (mRef.current.clip?.got ?? 0) >= c.got) return mRef.current.clip ?? null;
    const clip = { url: c.url || undefined, at: c.at, error: c.error || undefined, seconds: c.seconds, got: c.got, auto: !!c.auto };
    update({ clip });
    return clip;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const syncClipRef = useRef(syncClip);
  syncClipRef.current = syncClip;

  // Parent's phone: keep the latest clip (or the reason there's none).
  useEffect(() => {
    const take = (n: Notifications.Notification) => {
      const d = n.request.content.data as { type?: string; url?: string; at?: number; error?: string; detail?: string; seconds?: number; auto?: boolean } | undefined;
      if (d?.type !== "clip") return;
      const at = d.at ?? n.date ?? Date.now();
      if ((mRef.current.clip?.at ?? 0) >= at) return;
      update({ clip: { url: d.url, at, error: d.error, detail: d.detail, seconds: d.seconds, got: Date.now(), auto: !!d.auto } });
    };
    const sub = addPushListener(take);
    const catchUp = () => { syncClipRef.current(); Notifications.getPresentedNotificationsAsync().then((l) => l.forEach(take)).catch(() => {}); };
    catchUp();
    const app = AppState.addEventListener("change", (st) => st === "active" && catchUp());
    return () => { sub.remove(); app.remove(); };
  }, [update]);

  const requestClip = useCallback(async (seconds = CLIP_SECONDS, which?: string | null) => {
    const to = which ?? targetRef.current;
    const at = Date.now();
    if (!to) return { at, ok: false };
    let me = "";
    try { me = await getMyToken(); } catch {}
    const ok = await sendData([to], { type: "cmd", cmd: "clip", seconds, from: me });
    setClipAsked(ok ? at : 0);
    return { at, ok };
  }, []);
  const [clipAsked, setClipAsked] = useState(0);

  /* ---------- the room's shared history (src/activity.ts) ---------- */
  useEffect(() => {
    let me = "";
    getMyToken().then((x) => { me = x; }).catch(() => {});
    setActTransport({
      me: () => me || mRef.current.me || "",
      myName: () => mRef.current.myName.trim(),
      send: (a) => {
        if (cloudRef.current && ridRef.current) writeAct(ridRef.current, { ...a, by: a.by || me });
        if (!pushAlso()) return;
        const to = peersOf(mRef.current); if (to.length) sendData(to, { type: "act", act: a, from: me }).catch(() => {});
      },
    });
    const sub = addPushListener((n) => {
      const d = n.request.content.data as { type?: string; from?: string; act?: Act } | undefined;
      if (d?.type === "act" && d.act && d.from && peersOf(mRef.current).includes(d.from)) receiveAct({ ...d.act, by: d.from });
    });
    return () => { sub.remove(); setActTransport(null); };
  }, []);

  /* ---------- "I'm on it" ---------- */
  const [ack, setAck] = useState<{ who: string; until: number } | null>(null);
  const ackCry = useCallback(async (room0?: string) => {
    const cur = mRef.current;
    let me = "";
    try { me = await getMyToken(); } catch {}
    const room = room0 || target;
    if (!room || !me) return;
    const until = Date.now() + ACK_MS;
    const name = cur.myName.trim() || t("rt.otherPhone");
    setAck({ who: "me", until });
    logAct("onit");
    writeRoom(ridRef.current, { ack: { by: me, name, until } });
    // The baby's phone sends its next cries quietly; the other parents hear who's going.
    sendData([room], { type: "cmd", cmd: "ack", from: me, name, until }).catch(() => {});
    for (const p of membersOf(cur.family, me).filter((x) => x.token !== room)) {
      const L = p.lang ?? getLang();
      sendPush([p.token], tIn(L, "push.ackOther", { who: name, name: babyLabelIn(L, cur.babyName) }), { type: "ack", room, from: me, by: name, until }).catch(() => {});
    }
    // This phone's crying alert is handled.
    Notifications.dismissNotificationAsync(`hush-room-${room.slice(-12)}`).catch(() => {});
  }, [target]);
  useEffect(() => {
    const sub = addPushListener((n) => {
      const d = n.request.content.data as { type?: string; from?: string; by?: string; until?: number } | undefined;
      if (d?.type === "ack" && d.from && peersOf(mRef.current).includes(d.from)) setAck({ who: d.by ?? "", until: Math.min(d.until ?? 0, Date.now() + 15 * 60_000) });
    });
    return () => sub.remove();
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

  /* ---------- the family in the cloud (src/cloud.ts): who's connected, and everything shared ---------- */
  const rid = m.family?.id ?? "";
  ridRef.current = rid;
  const [cloudReady, setCloudReady] = useState(false);
  cloudRef.current = cloudReady;
  const active = useAppActive();
  // Sign in and check the cloud answers; retried every 2 minutes while hush is on screen.
  // (Also once when hush starts in the background, woken by a push: the member list should run then too.)
  useEffect(() => { signIn().then((ok) => { if (ok) setCloudReady(true); }); }, []);
  useEffect(() => {
    if (cloudReady || !active) return;
    let stop = false;
    const attempt = () => signIn().then((ok) => { if (!stop && ok) setCloudReady(true); });
    attempt();
    const id = setInterval(attempt, 2 * 60_000);
    return () => { stop = true; clearInterval(id); };
  }, [cloudReady, active]);
  const hasFamily = !!rid && members.length > 0;
  const meInfo = (tok: string) => ({ token: tok, name: mRef.current.myName.trim(), lang: getLang() });

  // Who's in: the family's member list on the server, kept up to date whenever hush runs (also in
  // the background; it only changes when someone joins, leaves or renames). This phone's copy is
  // only a cache (so alerts still reach everyone without a connection).
  const tokenUid = useRef<Record<string, string>>({});
  const askedAllow = useRef(new Set<string>());
  useEffect(() => {
    if (!cloudReady || !rid) return;
    return watchMembers(rid, (list, mine) => {
      const cur = mRef.current;
      if (cur.family?.id !== rid) return;
      if (!mine || mine.status !== "member") {
        // Removed by another phone (or the family is gone): this phone is on its own again.
        diag.mark("no longer in the family");
        setFamily(null, { rooms: {} });
        return;
      }
      const entries: Family["entries"] = {};
      const map: Record<string, string> = {};
      for (const x of list) {
        if (x.status !== "member" || !x.token) continue;
        entries[x.token] = { name: x.name ?? "", ...(x.lang ? { lang: x.lang } : {}), at: x.joinedAt ?? 0 };
        map[x.token] = x.uid;
      }
      tokenUid.current = map;
      if (JSON.stringify(cur.family.entries) !== JSON.stringify(entries)) {
        const gone = Object.keys(cur.family.entries).filter((tok) => !entries[tok]);
        const rooms = { ...(cur.rooms ?? {}) };
        for (const tok of gone) delete rooms[tok];
        setFamily({ id: rid, key: "cloud", entries }, { rooms });
      }
      // Our own entry follows this phone (push address, name, language).
      const tok = cur.me;
      if (tok && (mine.token !== tok || (mine.name ?? "") !== cur.myName.trim() || mine.lang !== getLang())) updateMe(rid, meInfo(tok));
      // A phone asked to join with a code from this phone: Allow or Not now.
      for (const x of list) {
        if (x.status !== "pending" || x.invitedBy !== myUid() || Math.abs(Date.now() - (x.joinedAt ?? 0)) > 5 * 60_000 || askedAllow.current.has(x.uid)) continue;
        askedAllow.current.add(x.uid);
        const who = x.name?.trim() || t("rt.otherPhone");
        const room = cur.babyName.trim() ? t("hero.room", { name: babyLabel(cur.babyName) }) : t("rx.room");
        dialog(t("pair.wantsTitle", { name: who, room }), t("pair.wantsBody", { name: babyLabel(cur.babyName) }), [
          { text: t("pair.notNow"), style: "cancel", onPress: () => { removeFromFamily(rid, x.uid); } },
          { text: t("pair.allow"), onPress: () => {
            approve(rid, x.uid).then((ok) => { if (!ok) dialog(t("pair.requestGone", { name: who })); }, () => dialog(t("pair.offline")));
          } },
        ]);
      }
    });
  }, [cloudReady, rid]); // eslint-disable-line react-hooks/exhaustive-deps
  // Renamed here, or the language changed: our entry follows.
  useEffect(() => {
    if (!cloudReady || !rid || !me) return;
    const id = setTimeout(() => updateMe(rid, meInfo(me)), 1500);
    return () => clearTimeout(id);
  }, [cloudReady, rid, me, m.myName, lang]); // eslint-disable-line react-hooks/exhaustive-deps

  /** A pairing code for others to join with (makes the family if there's none yet). Or an error to show. */
  const invite = useCallback(async (): Promise<{ code: string; exp: number } | string> => {
    let tok: string;
    try { tok = await myToken(); } catch (e) { return (e as Error).message; }
    if (!(await signIn())) return t("pair.offline");
    setCloudReady(true);
    let f = mRef.current.family?.id ?? "";
    // A family this phone isn't really in any more (removed while offline): start a new one.
    if (f && (await isMember(f)) === false) f = "";
    if (!f) {
      try { f = await createFamily(meInfo(tok)); } catch { return t("pair.offline"); }
      setFamily({ id: f, key: "cloud", entries: { [tok]: { name: mRef.current.myName.trim(), lang: getLang(), at: Date.now() } } }, { rooms: {} });
    }
    const r = await publishCode(f, meInfo(tok), mRef.current.babyName.trim());
    return r === "offline" ? t("pair.offline") : r;
  }, [myToken, setFamily]); // eslint-disable-line react-hooks/exhaustive-deps

  // Joining: this phone waits as "pending" until a member lets it in, says no, or 3 minutes pass.
  // The request is remembered (m.joinPending), so it carries on if hush is closed meanwhile. The
  // old family is only left once the new one has let this phone in.
  const JOIN_MS = 3 * 60_000;
  const [joinResult, setJoinResult] = useState<"denied" | "failed" | null>(null);
  const joining = m.joinPending?.fid ?? joinResult;
  /** Join with a typed code, a scanned QR or an opened link. Returns an error to show, or null. */
  const join = useCallback(async (raw: string): Promise<string | null> => {
    const code = raw.match(/[?&]c=(\d{6})/)?.[1] ?? raw.replace(/\s/g, "").match(/^(\d{6})$/)?.[1];
    if (!code) return t("family.notCode");
    let tok: string;
    try { tok = await myToken(); } catch (e) { return (e as Error).message; }
    const c = await readCode(code);
    if (c === "offline") return t("pair.offline");
    if (c === "missing") return t("pair.noCode");
    if (c === "expired") return t("pair.expired");
    setCloudReady(true);
    if (c.by === myUid()) return t("family.ownCode");
    const old = mRef.current.family?.id ?? "";
    if (old === c.fid) return null; // already in it
    const r = await askToJoin(c.fid, meInfo(tok), c.by);
    if (!r) return t("pair.offline");
    if (r === "member") {
      if (old) leaveCloud(old);
      setFamily({ id: c.fid, key: "cloud", entries: {} }, { rooms: {}, joinPending: null });
      return null;
    }
    setJoinResult(null);
    update({ joinPending: { fid: c.fid, at: Date.now(), leave: old || undefined, name: c.name, baby: c.baby } });
    // Wakes the inviting phone with a notification (tapping it opens the Allow question).
    const room = c.baby ? t("hero.room", { name: babyLabel(c.baby) }) : t("rx.room");
    sendPush([c.byToken], t("pair.wantsTitle", { name: mRef.current.myName.trim() || t("rt.otherPhone"), room }), { type: "join-ask" }).catch(() => {});
    return null;
  }, [myToken, setFamily, update]); // eslint-disable-line react-hooks/exhaustive-deps
  const jp = m.joinPending;
  useEffect(() => {
    if (!jp || !cloudReady) return;
    const done = (res: "denied" | "failed") => { update({ joinPending: null }); setJoinResult(res); };
    const off = watchMyRequest(jp.fid, (st) => {
      if (st === "member") {
        if (jp.leave && jp.leave !== jp.fid) leaveCloud(jp.leave);
        setFamily({ id: jp.fid, key: "cloud", entries: {} }, { rooms: {}, joinPending: null });
        setJoinResult(null);
      } else if (st === "gone") done("denied");
    });
    const timer = setTimeout(() => { leaveCloud(jp.fid); done("failed"); }, Math.max(0, jp.at + JOIN_MS - Date.now()));
    return () => { off(); clearTimeout(timer); };
  }, [jp?.fid, jp?.at, cloudReady]); // eslint-disable-line react-hooks/exhaustive-deps
  /** Stop waiting (cancelled), or put a "said no" / "no answer" away. */
  const cancelJoin = useCallback(() => {
    const p = mRef.current.joinPending;
    if (p) { leaveCloud(p.fid); update({ joinPending: null }); }
    setJoinResult(null);
  }, [update]);

  const removeMember = useCallback((token: string) => {
    const f = mRef.current.family;
    if (!f?.entries[token]) return;
    removeByToken(f.id, token);
    const entries = { ...f.entries };
    delete entries[token];
    const rooms = { ...(mRef.current.rooms ?? {}) };
    delete rooms[token];
    setFamily({ ...f, entries }, { rooms });
  }, [setFamily]);
  const leaveFamily = useCallback(() => {
    const f = mRef.current.family;
    if (f) leaveCloud(f.id);
    setFamily(null, { rooms: {} });
  }, [setFamily]);

  // Phones whose push address stopped working (hush removed, data cleared) leave the family, so
  // nothing keeps sending to them. Found by any send, here or in the native listener.
  useEffect(() => {
    const drop = (list: string[]) => {
      if (!loaded.current) return;
      const f = mRef.current.family;
      const gone = list.filter((tok) => f?.entries[tok] && tok !== mRef.current.me);
      gone.forEach((tok) => { removeMember(tok); diag.mark(`removed phone with dead push address …${tok.slice(-6)}`); });
    };
    const off = onDeadTokens(drop);
    const check = () => drop(cryDetector?.takeDeadTokens() ?? []);
    const id = setInterval(check, 60_000);
    const app = AppState.addEventListener("change", (st) => st === "active" && check());
    ready.current!.then(check);
    return () => { off(); clearInterval(id); app.remove(); };
  }, [removeMember]);

  // The native side writes this phone's state too (mic, battery), also while hush sleeps.
  useEffect(() => {
    if (!cryDetector || !cloudReady || !me) return;
    const c = nativeCredentials();
    if (!hasFamily || !c) { cryDetector.setCloud("", "", "", "", ""); return; }
    cryDetector.setCloud(c.apiKey, c.projectId, rid, c.uid, c.refreshToken);
  }, [cloudReady, rid, me, hasFamily]);
  useEffect(() => { if (cloudReady && hasFamily && m.babyName.trim()) writeRoom(rid, { baby: m.babyName.trim() }); }, [cloudReady, rid, hasFamily, m.babyName]);

  // Logged sleeps: every change here goes to the family's shared list (see nights.ts).
  useEffect(() => { dropReceivedOnce().then(() => setNightsVersion((v) => v + 1)).catch(() => {}); }, []);
  useEffect(() => {
    setSleepSync({
      me: () => mRef.current.me ?? "",
      send: (x) => { if (cloudRef.current && ridRef.current) writeSleep(ridRef.current, { ...x }); },
    });
    return () => setSleepSync(null);
  }, []);

  const writeLive = useCallback((live: Omit<PhoneLive, "seen">) => {
    const cur = mRef.current;
    if (!cloudRef.current || !ridRef.current || !cur.me) return;
    const b = cryDetector?.battery?.();
    writePhone(ridRef.current, cur.me, { ...live, ...(b ? { battery: b[0], charging: b[1] } : {}), name: cur.myName.trim(), baby: cur.babyName.trim(), seen: Date.now() });
  }, []);

  const [roomSleep, setRoomSleepState] = useState<RoomSleep | null>(null);
  const setRoomSleep = useCallback((sl: RoomSleep) => {
    setRoomSleepState((cur) => (cur && cur.at > sl.at ? cur : sl));
    writeRoom(ridRef.current, { sleep: sl });
  }, []);

  // This phone's sleep days: only the ones that changed (remembered across restarts). A day still
  // going changes every minute; times are compared to 5 minutes, and today goes at most every 5.
  const DAYS_KEY = "hush:cloudDays";
  const wroteDays = useRef<Record<string, { h: string; at: number }> | null>(null);
  const pushingDays = useRef(false);
  const pushDays = useCallback(async (force = false) => {
    const room = ridRef.current;
    if (!cloudRef.current || !room || pushingDays.current) return;
    pushingDays.current = true;
    try {
      if (!wroteDays.current) {
        try { wroteDays.current = JSON.parse((await AsyncStorage.getItem(DAYS_KEY)) ?? "{}") ?? {}; } catch { wroteDays.current = {}; }
      }
      const done = wroteDays.current!;
      // Logged sleeps are shared as their own list; the days carry what this phone recorded.
      const own = (await ownNights(Date.now(), { logged: false })).slice(0, 30);
      const device = await deviceId();
      const baby = mRef.current.babyName.trim();
      const today = dayKey(Date.now());
      let changed = false;
      for (const n of own) {
        const k = `${room}|${n.key}`;
        const h = hashOf(JSON.stringify(n, (_k, v) => (typeof v === "number" && v > 1e12 ? Math.floor(v / 300_000) : v)));
        const prev = done[k];
        if (prev?.h === h) continue;
        if (!force && prev && n.key === today && Date.now() - prev.at < 5 * 60_000) continue;
        writeDay(room, device, n.key, Date.now(), JSON.stringify(packNights([{ ...n, rev: Date.now() }], baby, device)));
        done[k] = { h, at: Date.now() };
        changed = true;
      }
      if (changed) {
        const oldest = own.at(-1)?.key ?? "";
        for (const k of Object.keys(done)) if (k.split("|")[1] < oldest) delete done[k];
        AsyncStorage.setItem(DAYS_KEY, JSON.stringify(done)).catch(() => {});
      }
    } catch {} finally { pushingDays.current = false; }
  }, []);
  pushDaysRef.current = pushDays;
  useEffect(() => {
    if (!cloudReady || !hasFamily) return;
    const id = setTimeout(() => pushDays(), 3000);
    return () => clearTimeout(id);
  }, [cloudReady, hasFamily, rid, nightsVersion, listening, pushDays]);
  useEffect(() => {
    if (!cloudReady || !hasFamily || !active) return;
    const id = setInterval(() => pushDays(), 5 * 60_000);
    return () => clearInterval(id);
  }, [cloudReady, hasFamily, active, pushDays]);

  // Reading the room: only while hush is on screen. Coming back gets everything at once.
  const seenDays = useRef<Record<string, number>>({});
  const lastAck = useRef(0);
  useEffect(() => {
    if (!cloudReady || !hasFamily || !active) return;
    // A snapshot counts only while this phone is still in this family (leaving or being removed
    // switches before the old listener has stopped).
    const live = () => mRef.current.family?.id === rid;
    let unsub = () => {};
    let stopped = false;
    deviceId().then((myDevice) => {
      if (stopped) return;
      unsub = watchRoom(rid, {
        room: (d) => {
          if (!live()) return;
          const sl = d.sleep;
          if (sl && typeof sl.at === "number") setRoomSleepState((cur) => (cur && cur.at > sl.at ? cur : sl));
          const cur = mRef.current;
          if (d.ack && d.ack.until > Date.now() && d.ack.by !== cur.me && d.ack.until !== lastAck.current) {
            lastAck.current = d.ack.until;
            setAck({ who: d.ack.name, until: Math.min(d.ack.until, Date.now() + 15 * 60_000) });
          }
          if (d.baby && !cur.babyName.trim()) update({ babyName: d.baby });
        },
        phones: (list) => {
          if (!live()) return;
          const meTok = mRef.current.me ?? "";
          applyRooms(list.filter((p) => p.token && p.token !== meTok && typeof p.seen === "number").map((p) => ({
            from: p.token, name: p.name, baby: p.baby, playing: p.playing, sound: p.sound, listening: p.listening,
            canMonitor: p.canMonitor, listenSince: p.listenSince, battery: p.battery, charging: p.charging, at: p.seen, got: p.seen,
          })));
        },
        acts: (list) => { if (live()) receiveActs(list as Act[]); },
        days: (list) => {
          if (!live()) return;
          const got: Night[] = [];
          for (const d of list) {
            if (!d.device || d.device === myDevice) continue;
            const id = `${d.device}|${d.key}`;
            if (seenDays.current[id] === d.rev) continue;
            seenDays.current[id] = d.rev;
            try { got.push(...(unpackNights(JSON.parse(d.j)) ?? [])); } catch {}
          }
          if (got.length) saveReceivedNights(got).then((ok) => { if (ok) setNightsVersion((v) => v + 1); });
        },
        sleeps: (list) => {
          if (!live()) return;
          applySharedSleeps(list as SharedSleep[], sharedSince()).then(({ changed, missing }) => {
            // Ours that the family doesn't have yet (made before joining, or offline): send them.
            for (const x of missing) writeSleep(rid, { ...x, updated: x.updated ?? Date.now() });
            if (changed) setNightsVersion((v) => v + 1);
          }).catch(() => {});
        },
      }, dayKey(Date.now() - 35 * 86400_000), Date.now() - 20 * 86400_000);
    }).catch(() => {});
    return () => { stopped = true; unsub(); };
  }, [cloudReady, rid, hasFamily, active]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Ctx.Provider value={{ m, members, me, rooms, target, room, targetName, targetBaby, setFocus, role, invite, join, joining, removeMember, leaveFamily, update, listening, requestClip, askAllow, cancelJoin, lastStop, status, lastCry, toggleListening, baby, nightsVersion, cryHeardAt, setSoundWantsMic, micOn, syncSleep, lastSync, ackCry, ack, clipAsked, syncClip, cloudReady, roomSleep: cloudReady ? roomSleep : null, setRoomSleep, writeLive, isOnCloud: () => cloudReady }}>{children}</Ctx.Provider>
  );
}


/** A short fingerprint of a string (to tell whether a day changed). */
function hashOf(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return `${s.length}:${h >>> 0}`;
}

/** Logged sleeps older than this are rolled up into each phone's day summaries (nights.ts). */
const sharedSince = () => { const d = new Date(Date.now() - (RAW_DAYS - 1) * 86400_000); d.setHours(0, 0, 0, 0); return d.getTime(); };
