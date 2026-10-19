// The baby monitor: listening state, settings and pairing. Independent of the white noise,
// so both can run at once and neither stops the other.
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { Alert, AppState, Platform } from "react-native";
import { cryDetector, type CryStatus } from "../../modules/hush-native/src";
import { addEvents, deviceId, fmtDur, lastSleep, ownNights, packNights, saveReceivedNights, unpackNights, type HushEvent } from "../nights";
import * as Notifications from "expo-notifications";
import { loadStops, saveStops, type Stop, type StopWhy } from "../stops";
import { CLIP_SECONDS, CRY_CLIP_SECONDS, newClip, storageBucket, sendData, MONITOR_DEFAULTS, addPushListener, hasMic, sendPush, THRESHOLDS, askMicAndNotifications, loadMonitor, saveMonitor, type MonitorSettings, type Room, setupAlertChannel, getMyToken, sendDataMany } from "../monitor";
import { makeInvite, membersOf, mergeEntries, newFamily, readFamilyMsg, readInvite, type Family, type Member } from "../family";
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
  /** The code other phones scan (or open as a link) to join; makes the family if there's none yet. */
  invite: () => Promise<string>;
  /** Join with a scanned code or opened link. Returns an error to show, or null. */
  join: (raw: string) => Promise<string | null>;
  /** The phone that showed the code we joined with, until it answers. */
  joining: string | null;
  removeMember: (token: string) => void;
  leaveFamily: () => void;
  update: (patch: Partial<MonitorSettings>) => void;
  listening: boolean;
  /** Ask a listening phone for a few seconds of sound (default: the target). Returns when it was asked. */
  requestClip: (seconds?: number, to?: string | null) => Promise<{ at: number; ok: boolean }>;
  /** Another phone wants to listen in but it's off here: ask on screen, and tell them if it's allowed. */
  askAllow: (who: string, from: string) => void;
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
  useEffect(() => {
    loadMonitor().then((raw) => {
      const v = migrate(raw);
      // No name yet: start with the phone's own name (e.g. "Redmi Note 14"); it can be changed in the phones list.
      const dn = !v.myName?.trim() ? cryDetector?.deviceName?.() : null;
      if (dn) { const next = { ...v, myName: dn }; saveMonitor(next); setM(next); } else setM(v);
    });
  }, []);
  const update = useCallback((patch: Partial<MonitorSettings>) => {
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
      allowAsk: t("allow.notif", { who: "{who}" }),
    });
  }, [lang, baby]);

  // Each parent gets alerts in their own phone's language.
  useEffect(() => {
    cryDetector?.setTargets(members.map((p) => {
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

  /* ---------- the family: which phones belong together ---------- */

  /** This phone's push address (asks for notifications the first time). */
  const myToken = useCallback(async () => {
    let tok: string;
    try { tok = await getMyToken(); } catch (e) {
      // Google's push service unreachable for a moment: the address we already have still works.
      if (mRef.current.me) tok = mRef.current.me; else throw e;
    }
    if (tok !== mRef.current.me) {
      const cur = mRef.current;
      // A family made before the address was known (an update from paired phones): add ourselves.
      const fam = cur.family && !cur.family.entries[tok]
        ? { ...cur.family, entries: { ...cur.family.entries, [tok]: { name: cur.myName.trim(), lang: getLang(), at: Date.now() } } }
        : cur.family;
      update({ me: tok, family: fam });
      mRef.current = { ...cur, me: tok, family: fam };
    }
    return tok;
  }, [update]);

  /** Tell phones what we know about the family (all of them unless given). */
  const broadcast = useCallback(async (f: Family, to?: string[]) => {
    const meTok = mRef.current.me ?? "";
    if (!meTok) return;
    const list = to ?? Object.entries(f.entries).filter(([tok, e]) => tok !== meTok && (!e.gone || Date.now() - e.at < 7 * 86400_000)).map(([tok]) => tok);
    if (!list.length) return;
    await sendDataMany(list.map((tok) => ({ to: tok, data: { type: "family", id: f.id, key: f.key, entries: f.entries, from: meTok, baby: mRef.current.babyName.trim() } })));
  }, []);

  const setFamily = useCallback((f: Family | null, extra: Partial<MonitorSettings> = {}) => {
    update({ family: f, ...extra });
    mRef.current = { ...mRef.current, family: f, ...extra };
  }, [update]);

  // Phones that were paired before families existed: share the family once our address is known.
  useEffect(() => {
    if (!m.family || !(m.family as Family & { legacy?: boolean }).legacy) return;
    myToken().then(() => {
      const f = mRef.current.family;
      if (!f) return;
      const { legacy: _, ...clean } = f as Family & { legacy?: boolean };
      setFamily(clean);
      broadcast(clean);
    }).catch(() => {});
  }, [!!m.family]); // eslint-disable-line react-hooks/exhaustive-deps

  // This phone's name or language changed: tell the others.
  useEffect(() => {
    const f = mRef.current.family;
    const meTok = mRef.current.me;
    if (!f || !meTok) return;
    const mine = f.entries[meTok];
    const name = m.myName.trim();
    if (mine && mine.name === name && mine.lang === lang) return;
    const id = setTimeout(() => {
      const cur = mRef.current.family!;
      const next = { ...cur, entries: { ...cur.entries, [meTok]: { name, lang, at: Date.now() } } };
      setFamily(next);
      broadcast(next);
    }, 1500);
    return () => clearTimeout(id);
  }, [m.myName, lang, m.me, setFamily, broadcast]);

  const [joining, setJoining] = useState<string | null>(null);
  const joinTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Family news from another phone.
  useEffect(() => {
    const sub = addPushListener((n) => {
      const msg = readFamilyMsg(n.request.content.data);
      if (!msg) return;
      const cur = mRef.current;
      const f = cur.family;
      const meTok = cur.me ?? "";
      if (!f || !meTok || msg.from === meTok) return;
      const same = msg.id === f.id && msg.key === f.key;
      const known = !!f.entries[msg.from] && !f.entries[msg.from].gone;
      if (!same && !known) return; // not our family
      Notifications.dismissNotificationAsync(n.request.identifier).catch(() => {});
      if (msg.from === joining) { setJoining(null); if (joinTimer.current) clearTimeout(joinTimer.current); }
      // Two families joined up (or phones updated from pairing): settle on one name for it.
      const adopt = !same && msg.id < f.id;
      const merged = mergeEntries(f.entries, msg.entries);
      const entries = merged ?? f.entries;
      const mine = entries[meTok];
      if (mine?.gone && msg.entries[meTok]?.gone) {
        // Another phone removed this one: start over on our own.
        setFamily(newFamily(meTok, cur.myName.trim(), getLang()), { rooms: {} });
        return;
      }
      const next: Family = { id: adopt ? msg.id : f.id, key: adopt ? msg.key : f.key, entries };
      if (!cur.babyName.trim() && msg.baby) update({ babyName: msg.baby });
      if (merged || adopt) {
        setFamily(next);
        broadcast(next); // everyone gets the news, including phones that just joined
      } else if (mergeEntries(msg.entries, f.entries) || !same) {
        broadcast(next, [msg.from]); // they're behind: bring them up to date
      }
    });
    return () => sub.remove();
  }, [joining, setFamily, broadcast, update]);

  const invite = useCallback(async () => {
    const tok = await myToken();
    let f = mRef.current.family;
    if (!f) { f = newFamily(tok, mRef.current.myName.trim(), getLang()); setFamily(f); }
    return makeInvite(f, tok, mRef.current.myName.trim());
  }, [myToken, setFamily]);

  const join = useCallback(async (raw: string): Promise<string | null> => {
    const inv = readInvite(raw);
    if (!inv) return t("family.notCode");
    let tok: string;
    try { tok = await myToken(); } catch (e) { return (e as Error).message; }
    if (inv.token === tok) return t("family.ownCode");
    const cur = mRef.current;
    const old = cur.family;
    if (old && old.id === inv.id && old.key === inv.key && old.entries[inv.token]) return null; // already in it
    // Leaving the old family: tell its phones.
    if (old && membersOf(old, tok).length) {
      const left = { ...old, entries: { ...old.entries, [tok]: { ...(old.entries[tok] ?? { name: cur.myName.trim() }), gone: true, at: Date.now() } } };
      broadcast(left);
    }
    const now = Date.now();
    const next: Family = { id: inv.id, key: inv.key, entries: { [tok]: { name: cur.myName.trim(), lang: getLang(), at: now }, [inv.token]: { name: inv.name, at: 1 } } };
    setFamily(next, { rooms: {} });
    setJoining(inv.token);
    if (joinTimer.current) clearTimeout(joinTimer.current);
    joinTimer.current = setTimeout(() => setJoining((j) => (j === inv.token ? "failed" : j)), 25_000);
    await broadcast(next, [inv.token]);
    return null;
  }, [myToken, setFamily, broadcast]);

  const removeMember = useCallback((token: string) => {
    const f = mRef.current.family;
    if (!f?.entries[token]) return;
    const next = { ...f, entries: { ...f.entries, [token]: { ...f.entries[token], gone: true, at: Date.now() } } };
    const rooms = { ...(mRef.current.rooms ?? {}) };
    delete rooms[token];
    setFamily(next, { rooms });
    broadcast(next);
  }, [setFamily, broadcast]);

  const leaveFamily = useCallback(() => {
    const cur = mRef.current;
    const f = cur.family;
    const meTok = cur.me ?? "";
    if (!f || !meTok) return;
    broadcast({ ...f, entries: { ...f.entries, [meTok]: { ...(f.entries[meTok] ?? { name: "" }), gone: true, at: Date.now() } } });
    setFamily(newFamily(meTok, cur.myName.trim(), getLang()), { rooms: {} });
  }, [setFamily, broadcast]);

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
  // What another phone reports about its room (shown on Home and Monitor).
  useEffect(() => {
    const sub = addPushListener((n) => {
      const d = n.request.content.data as { type?: string; from?: string; name?: string; baby?: string; playing?: boolean; sound?: string; listening?: boolean; at?: number; listenSince?: number; battery?: number; charging?: boolean } | undefined;
      if (d?.type !== "room") return;
      const cur = mRef.current;
      const mems = membersOf(cur.family, cur.me ?? "");
      // Older versions don't say who they are: only clear with a single other phone.
      const from = d.from ?? (mems.length === 1 ? mems[0].token : null);
      if (!from || !mems.some((p) => p.token === from)) return;
      const prev = cur.rooms?.[from];
      const at = d.at ?? Date.now();
      if (prev && prev.at > at) return; // an older report arriving late
      const got = Date.now();
      const next: Room = {
        playing: !!d.playing, sound: d.sound ?? "womb", listening: !!d.listening, at, listenSince: d.listenSince,
        battery: d.battery ?? prev?.battery, charging: d.charging ?? prev?.charging, got,
        name: d.name ?? prev?.name, baby: d.baby ?? prev?.baby, lastListen: d.listening ? got : prev?.lastListen,
      };
      update({ rooms: { ...(cur.rooms ?? {}), [from]: next } });
      mRef.current = { ...mRef.current, rooms: { ...(cur.rooms ?? {}), [from]: next } };
    });
    return () => sub.remove();
  }, [update]);

  /* ---------- "listen in": a parent asks for a few seconds of the room ---------- */

  const asking = useRef(0);
  const askAllow = useCallback((who: string, from: string) => {
    if (mRef.current.allowListen || Date.now() - asking.current < 30_000) return;
    asking.current = Date.now();
    Alert.alert(t("allow.title", { who: who || t("rt.otherPhone") }), t("allow.body"), [
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
    const catchUp = () => Notifications.getPresentedNotificationsAsync().then((l) => l.forEach(take)).catch(() => {});
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
    return { at, ok };
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
    <Ctx.Provider value={{ m, members, me, rooms, target, room, targetName, targetBaby, setFocus, role, invite, join, joining, removeMember, leaveFamily, update, listening, requestClip, askAllow, lastStop, status, lastCry, toggleListening, baby, nightsVersion, cryHeardAt, setSoundWantsMic, micOn, syncSleep, lastSync }}>{children}</Ctx.Provider>
  );
}

/** Settings from before families: paired phones become a family (shared once this phone's address is known). */
function migrate(raw: MonitorSettings): MonitorSettings {
  if (raw.family) return raw;
  const entries: Family["entries"] = {};
  for (const p of raw.parents ?? []) entries[p.token] = { name: p.name, lang: p.lang, at: p.addedAt || 1 };
  if (raw.pairedToken) entries[raw.pairedToken] = { name: "", at: 1 };
  if (!Object.keys(entries).length) return raw;
  // The baby's phone's family name wins when they meet ("~" sorts after every generated name).
  const f = newFamily("", raw.myName.trim());
  const family = { ...f, id: raw.role === "nursery" ? f.id : `~${f.id}`, entries, legacy: true } as Family;
  return { ...raw, family };
}
