// Parent's phone: hear a few seconds of the baby's room, and replay the latest clip.
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { useAudioPlayer, useAudioPlayerStatus } from "expo-audio";
import { colors, fonts } from "../theme";
import { CLIP_SECONDS } from "../monitor";
import { babyLabel, dateLocale, fmtTime, t, useT } from "../i18n";
import { useMonitor } from "../state/monitor";
import { Card, Icon, Label } from "./ui";

export const EAR = '<path d="M6 8.5a6 6 0 1 1 12 0c0 2.5-1.5 3.6-2.7 4.6-1 .8-1.3 1.6-1.3 2.9a3 3 0 0 1-5.6 1.5"/><path d="M9.5 9a2.5 2.5 0 0 1 5 0c0 1.2-.8 1.8-1.5 2.4"/>';
const PLAY = '<path d="M8 5.5v13l11-6.5z"/>';
const PAUSE = '<rect x="7" y="6" width="3.5" height="12" rx="1"/><rect x="13.5" y="6" width="3.5" height="12" rx="1"/>';
const LENGTHS = [5, 10, 15];
/** The baby's phone keeps the last seconds in memory, so only delivery takes time. */
const WAIT_MS = 30_000;
/** Roughly how long a clip takes to arrive (for the progress bar). */
const TYPICAL_MS = 6_000;

/* "Listen" from a widget, shortcut or notification: the Monitor card picks it up. */
let pendingOutside: { s: number; at: number } | null = null;
const outsideListeners = new Set<(s: number) => void>();
let pendingPlay: { url: string; at: number } | null = null;
const playListeners = new Set<(url: string) => void>();
/** Play a clip that arrived as a notification (tapped). */
export function playFromOutside(url: string) {
  if (playListeners.size) playListeners.forEach((l) => l(url));
  else pendingPlay = { url, at: Date.now() };
}
export function listenFromOutside(seconds: number) {
  if (outsideListeners.size) outsideListeners.forEach((l) => l(seconds));
  else pendingOutside = { s: seconds, at: Date.now() };
}

/** Asking for a clip, waiting for it, and playing it: shared by the card and the Home button. */
function useClip(outside = false) {
  const { m, update, requestClip, target, targetBaby, targetName } = useMonitor();
  const [asked, setAsked] = useState(0);
  const [sendFail, setSendFail] = useState(false);
  const [askedFor, setAskedFor] = useState(CLIP_SECONDS);
  const [, tick] = useState(0);
  const player = useAudioPlayer(null);
  const status = useAudioPlayerStatus(player);
  const clip = m.clip;
  // Compare with when it arrived here, not the baby's phone's clock.
  const fresh = !!clip && (clip.got ?? clip.at) >= asked;
  const waiting = asked > 0 && !sendFail && !fresh && Date.now() - asked < WAIT_MS;
  const timedOut = asked > 0 && !sendFail && !fresh && !waiting;
  const roomName = targetBaby ? t("hero.room", { name: babyLabel(targetBaby) }) : targetName || t("rt.otherPhone");

  const play = (url: string) => {
    try { player.replace({ uri: url }); player.play(); } catch {}
  };
  const toggle = () => {
    if (!clip?.url) return;
    if (status.playing) player.pause();
    else if (status.duration > 0 && status.currentTime < status.duration - 0.2 && status.currentTime > 0) player.play();
    else play(clip.url);
  };
  const ask = async (seconds: number) => {
    setAskedFor(seconds);
    update({ clipSeconds: seconds });
    setSendFail(false);
    const r = await requestClip(seconds);
    setSendFail(!r.ok);
    setAsked(r.at);
  };

  // The clip I just asked for plays as soon as it arrives.
  useEffect(() => { if (asked && clip?.url && (clip.got ?? clip.at) >= asked) play(clip.url); }, [clip?.got, clip?.at]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!waiting) return;
    const id = setInterval(() => tick((x) => x + 1), 500);
    return () => clearInterval(id);
  }, [waiting]);

  // Listen requested from outside the app (only the card on the Monitor page takes it).
  useEffect(() => {
    if (!outside) return;
    if (pendingOutside && Date.now() - pendingOutside.at < 30_000) { ask(pendingOutside.s); pendingOutside = null; }
    const l = (s: number) => ask(s);
    outsideListeners.add(l);
    if (pendingPlay && Date.now() - pendingPlay.at < 30_000) { play(pendingPlay.url); pendingPlay = null; }
    const p = (url: string) => play(url);
    playListeners.add(p);
    return () => { outsideListeners.delete(l); playListeners.delete(p); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const elapsed = asked ? Date.now() - asked : 0;
  return { m, target, clip, fresh, waiting, timedOut, sendFail, roomName, elapsed, askedFor, status, toggle, ask };
}

function fmtWhen(ms: number) {
  const d = new Date(ms);
  const today = new Date().toDateString() === d.toDateString();
  return today ? fmtTime(ms) : `${d.toLocaleDateString(dateLocale(), { weekday: "short" })} ${fmtTime(ms)}`;
}

/** Monitor tab: choose 5/10/15 s, listen, and the latest clip with a player. */
export function ListenCard({ bare }: { bare?: boolean } = {}) {
  const t = useT();
  const c = useClip(true);
  const [len, setLen] = useState(c.m.clipSeconds ?? CLIP_SECONDS);
  // Eases towards full and never quite gets there until the clip arrives.
  const frac = 1 - Math.exp(-c.elapsed / TYPICAL_MS);
  const error = c.fresh && c.clip?.error ? c.clip.error : null;
  const playFrac = c.status.duration > 0 ? Math.min(1, c.status.currentTime / c.status.duration) : 0;

  const Wrap = bare ? View : Card;
  return (
    <Wrap style={{ gap: 12 }}>
      <View style={styles.listenHead}>
        <Text style={styles.headText}>{t("listen.title")}</Text>
        <View style={styles.lengths}>
          {LENGTHS.map((s) => (
            <Pressable key={s} onPress={() => setLen(s)} disabled={c.waiting} hitSlop={6} style={[styles.len, len === s && styles.lenOn]} accessibilityRole="radio" accessibilityState={{ checked: len === s }}>
              <Text style={[styles.lenText, len === s && { color: colors.bg }]}>{t("listen.secs", { s })}</Text>
            </Pressable>
          ))}
        </View>
      </View>
      <Pressable
        onPress={() => c.ask(len)}
        disabled={c.waiting || !c.target}
        style={({ pressed }) => [styles.big, c.waiting && styles.bigBusy, pressed && { transform: [{ scale: 0.98 }] }]}
        accessibilityRole="button"
      >
        {c.waiting && <View style={[styles.bigFill, { width: `${frac * 100}%` }]} />}
        {c.waiting ? <ActivityIndicator color={colors.bg} /> : <Icon d={EAR} size={22} color={colors.bg} width={2} />}
        <Text style={styles.bigText}>
          {c.waiting ? t("listen.sending") : t("listen.button", { s: len })}
        </Text>
      </Pressable>
      {c.timedOut && <Text style={styles.err}>{t("listen.noAnswer")}</Text>}
      {error && <Text style={styles.err}>{t(`listen.err.${error}`)}</Text>}
      {error === "upload" && c.clip?.detail && <Text style={styles.detail} selectable numberOfLines={3}>{c.clip.detail}</Text>}

      {c.clip?.url ? (
        <View style={styles.clip}>
          <Pressable onPress={c.toggle} style={[styles.clipBtn, c.status.playing && { backgroundColor: colors.peach }]} accessibilityRole="button" accessibilityLabel={c.status.playing ? t("common.pause") : t("common.play")}>
            <Icon d={c.status.playing ? PAUSE : PLAY} size={20} color={colors.bg} width={2} />
          </Pressable>
          <View style={{ flex: 1, gap: 6 }}>
            <View style={styles.clipHead}>
              <Text style={styles.clipTitle}>{c.clip.auto ? t("listen.latestCry") : t("listen.latest")}</Text>
              <Text style={styles.clipMeta}>{fmtWhen(c.clip.at)} · {t("listen.secs", { s: c.clip.seconds ?? CLIP_SECONDS })}</Text>
            </View>
            <View style={styles.track}><View style={[styles.trackFill, { width: `${playFrac * 100}%` }]} /></View>
          </View>
        </View>
      ) : null}
    </Wrap>
  );
}

/** Monitor tab, round style: the listen circle (tap: listen, long-press: change length) beside other round buttons, then the clip. */
export function ListenRound({ children }: { children?: React.ReactNode }) {
  const t = useT();
  const c = useClip(true);
  const [len, setLen] = useState(c.m.clipSeconds ?? CLIP_SECONDS);
  const frac = 1 - Math.exp(-c.elapsed / TYPICAL_MS);
  const error = c.fresh && c.clip?.error ? c.clip.error : null;
  const playFrac = c.status.duration > 0 ? Math.min(1, c.status.currentTime / c.status.duration) : 0;
  return (
    <View style={{ gap: 14 }}>
      <View style={styles.roundRow}>
        <RoundBtn
          onPress={() => c.ask(len)} onLongPress={() => setLen(LENGTHS[(LENGTHS.indexOf(len) + 1) % LENGTHS.length])}
          disabled={c.waiting || !c.target} bg={colors.sage} label={c.waiting ? t("listen.sending") : t("listen.button", { s: len })} progress={c.waiting ? frac : undefined}>
          {c.waiting ? <ActivityIndicator color="#1e4a39" /> : <Icon d={EAR} size={28} color="#1e4a39" width={2} />}
        </RoundBtn>
        {children}
      </View>
      {c.waiting && <Notice spin text={t("rt.waitingClip", { name: c.roomName, s: Math.round(c.elapsed / 1000) })} />}
      {c.sendFail && <Notice bad text={t("rt.sendFail")} />}
      {c.timedOut && <Notice bad text={t("rt.noClip", { name: c.roomName })} />}
      {error && <Notice bad={error !== "allowed"} text={t(`listen.err.${error}`, { name: c.roomName })} />}
      {c.clip?.url ? (
        <View style={styles.clip}>
          <Pressable onPress={c.toggle} style={[styles.clipBtn, c.status.playing && { backgroundColor: colors.peach }]} accessibilityRole="button" accessibilityLabel={c.status.playing ? t("common.pause") : t("common.play")}>
            <Icon d={c.status.playing ? PAUSE : PLAY} size={20} color={colors.bg} width={2} />
          </Pressable>
          <View style={{ flex: 1, gap: 6 }}>
            <View style={styles.clipHead}>
              <Text style={styles.clipTitle}>{c.clip.auto ? t("listen.latestCry") : t("listen.latest")}</Text>
              <Text style={styles.clipMeta}>{fmtWhen(c.clip.at)} · {t("listen.secs", { s: c.clip.seconds ?? CLIP_SECONDS })}</Text>
            </View>
            <View style={styles.track}><View style={[styles.trackFill, { width: `${playFrac * 100}%` }]} /></View>
          </View>
        </View>
      ) : null}
    </View>
  );
}

/** One line of feedback under the round buttons: working on it, or what went wrong and what to do. */
export function Notice({ text, bad, spin, onPress }: { text: string; bad?: boolean; spin?: boolean; onPress?: () => void }) {
  return (
    <Pressable onPress={onPress} disabled={!onPress} style={[styles.notice, bad && { backgroundColor: "rgba(255,157,176,0.14)" }]} accessibilityRole={bad ? "alert" : "text"} accessibilityLiveRegion="polite">
      {spin ? <ActivityIndicator size="small" color={colors.muted} /> : bad ? <Icon d='<circle cx="12" cy="12" r="9"/><path d="M12 7.5v5.5M12 16.5v.01"/>' size={18} color={colors.rose} width={2.2} /> : null}
      <Text style={[styles.noticeText, bad && { color: colors.cream }]}>{text}</Text>
    </Pressable>
  );
}

/** A round button with a short label under it. `progress` draws a ring while something is on its way. */
export function RoundBtn({ onPress, onLongPress, disabled, bg = colors.card, label, children, progress, a11y, size = 72 }: {
  onPress: () => void; onLongPress?: () => void; disabled?: boolean; bg?: string; label: string; children: React.ReactNode; progress?: number; a11y?: string; size?: number;
}) {
  return (
    <Pressable onPress={onPress} onLongPress={onLongPress} disabled={disabled} style={({ pressed }) => [styles.roundItem, pressed && { transform: [{ scale: 0.95 }] }]} accessibilityRole="button" accessibilityLabel={a11y ?? label}>
      <View style={[styles.roundBtn, { backgroundColor: bg, width: size, height: size, borderRadius: size / 2 }, progress != null && { opacity: 0.6 + 0.4 * progress }]}>{children}</View>
      <Text style={styles.roundLabel} numberOfLines={2}>{label}</Text>
    </Pressable>
  );
}

/** Home: one button, last-used length. */
export function ListenButton() {
  const t = useT();
  const c = useClip();
  const len = c.m.clipSeconds ?? CLIP_SECONDS;
  const label = c.waiting ? t("listen.sending") : t("listen.button", { s: len });
  const line = c.timedOut ? t("listen.noAnswer")
    : c.fresh && c.clip?.error ? t(`listen.err.${c.clip.error}`)
    : c.status.playing ? t("listen.playing")
    : c.clip?.url ? t("listen.last", { time: fmtWhen(c.clip.at) })
    : null;
  return (
    <View style={styles.row}>
      <Pressable onPress={() => c.ask(len)} disabled={c.waiting || !c.target} style={({ pressed }) => [styles.small, (c.waiting || pressed) && { opacity: 0.75 }]} accessibilityRole="button">
        {c.waiting ? <ActivityIndicator color={colors.bg} size="small" /> : <Icon d={EAR} size={18} color={colors.bg} width={2} />}
        <Text style={styles.smallText}>{label}</Text>
      </Pressable>
      {line && (
        <Pressable onPress={c.toggle} disabled={!c.clip?.url} style={{ flex: 1 }}>
          <Text style={[styles.hint, c.fresh && c.clip?.error && { color: colors.rose }]} numberOfLines={2}>{line}</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  notice: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: colors.card, borderRadius: 18, paddingVertical: 10, paddingHorizontal: 14 },
  noticeText: { flex: 1, fontFamily: fonts.bodyBold, fontSize: 13.5, lineHeight: 19, color: colors.muted },
  roundRow: { flexDirection: "row", justifyContent: "center", gap: 14 },
  roundItem: { width: 84, alignItems: "center", gap: 8 },
  roundBtn: { width: 68, height: 68, borderRadius: 34, alignItems: "center", justifyContent: "center" },
  roundLabel: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.muted, textAlign: "center", fontVariant: ["tabular-nums"] },
  listenHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  headText: { fontFamily: fonts.bodyBold, fontSize: 15.5, color: colors.cream },
  lengths: { flexDirection: "row", gap: 2 },
  len: { alignItems: "center", paddingVertical: 5, paddingHorizontal: 11, borderRadius: 99 },
  lenOn: { backgroundColor: colors.cream },
  lenText: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.muted },
  big: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, minHeight: 50, borderRadius: 99, backgroundColor: colors.sage, overflow: "hidden" },
  bigBusy: { backgroundColor: "rgba(158,230,196,0.45)" },
  bigFill: { position: "absolute", left: 0, top: 0, bottom: 0, backgroundColor: colors.sage },
  bigText: { fontFamily: fonts.bodyBold, fontSize: 16, color: colors.bg, fontVariant: ["tabular-nums"] },
  err: { fontFamily: fonts.bodyBold, fontSize: 13.5, lineHeight: 19, color: colors.rose },
  detail: { fontFamily: fonts.body, fontSize: 11, color: colors.muted },
  hint: { fontFamily: fonts.body, fontSize: 13, lineHeight: 18, color: colors.muted },
  clip: { flexDirection: "row", alignItems: "center", gap: 12 },
  clipBtn: { width: 40, height: 40, borderRadius: 22, backgroundColor: colors.moon, alignItems: "center", justifyContent: "center" },
  clipHead: { flexDirection: "row", justifyContent: "space-between", gap: 8 },
  clipTitle: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.cream },
  clipMeta: { fontFamily: fonts.body, fontSize: 12.5, color: colors.muted, fontVariant: ["tabular-nums"] },
  track: { height: 4, borderRadius: 2, backgroundColor: "#4a3f86", overflow: "hidden" },
  trackFill: { height: 4, backgroundColor: colors.peach },
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  small: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.sage, borderRadius: 99, paddingHorizontal: 16, paddingVertical: 11, minHeight: 44 },
  smallText: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.bg, fontVariant: ["tabular-nums"] },
});
