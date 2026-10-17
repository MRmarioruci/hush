// Parent's phone: hear a few seconds of the baby's room, and replay the latest clip.
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { useAudioPlayer, useAudioPlayerStatus } from "expo-audio";
import { colors, fonts } from "../theme";
import { CLIP_SECONDS } from "../monitor";
import { dateLocale, fmtTime, useT } from "../i18n";
import { useMonitor } from "../state/monitor";
import { Card, Icon, Label } from "./ui";

export const EAR = '<path d="M6 8.5a6 6 0 1 1 12 0c0 2.5-1.5 3.6-2.7 4.6-1 .8-1.3 1.6-1.3 2.9a3 3 0 0 1-5.6 1.5"/><path d="M9.5 9a2.5 2.5 0 0 1 5 0c0 1.2-.8 1.8-1.5 2.4"/>';
const PLAY = '<path d="M8 5.5v13l11-6.5z"/>';
const PAUSE = '<rect x="7" y="6" width="3.5" height="12" rx="1"/><rect x="13.5" y="6" width="3.5" height="12" rx="1"/>';
const LENGTHS = [5, 10, 15];
/** Upload and delivery on top of the recording itself. */
const SLACK_MS = 45_000;

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
  const { m, update, requestClip } = useMonitor();
  const [asked, setAsked] = useState(0);
  const [askedFor, setAskedFor] = useState(CLIP_SECONDS);
  const [, tick] = useState(0);
  const player = useAudioPlayer(null);
  const status = useAudioPlayerStatus(player);
  const clip = m.clip;
  // Compare with when it arrived here, not the baby's phone's clock.
  const fresh = !!clip && (clip.got ?? clip.at) >= asked;
  const waiting = asked > 0 && !fresh && Date.now() - asked < askedFor * 1000 + SLACK_MS;
  const timedOut = asked > 0 && !fresh && !waiting;

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
    setAsked(await requestClip(seconds));
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
  return { m, clip, fresh, waiting, timedOut, elapsed, askedFor, status, toggle, ask };
}

function fmtWhen(ms: number) {
  const d = new Date(ms);
  const today = new Date().toDateString() === d.toDateString();
  return today ? fmtTime(ms) : `${d.toLocaleDateString(dateLocale(), { weekday: "short" })} ${fmtTime(ms)}`;
}

/** Monitor tab: choose 5/10/15 s, listen, and the latest clip with a player. */
export function ListenCard() {
  const t = useT();
  const c = useClip(true);
  const [len, setLen] = useState(c.m.clipSeconds ?? CLIP_SECONDS);
  const recFrac = Math.min(1, c.elapsed / (c.askedFor * 1000));
  const recording = c.waiting && recFrac < 1;
  const error = c.fresh && c.clip?.error ? c.clip.error : null;
  const playFrac = c.status.duration > 0 ? Math.min(1, c.status.currentTime / c.status.duration) : 0;

  return (
    <Card style={{ gap: 14 }}>
      <Label>{t("listen.title")}</Label>
      <View style={styles.lengths}>
        {LENGTHS.map((s) => (
          <Pressable key={s} onPress={() => setLen(s)} disabled={c.waiting} style={[styles.len, len === s && styles.lenOn]} accessibilityRole="radio" accessibilityState={{ checked: len === s }}>
            <Text style={[styles.lenText, len === s && { color: colors.bg }]}>{t("listen.secs", { s })}</Text>
          </Pressable>
        ))}
      </View>
      <Pressable
        onPress={() => c.ask(len)}
        disabled={c.waiting || !c.m.pairedToken}
        style={({ pressed }) => [styles.big, c.waiting && styles.bigBusy, pressed && { transform: [{ scale: 0.98 }] }]}
        accessibilityRole="button"
      >
        {c.waiting && <View style={[styles.bigFill, { width: `${(recording ? recFrac : 1) * 100}%` }]} />}
        {c.waiting ? <ActivityIndicator color={colors.bg} /> : <Icon d={EAR} size={22} color={colors.bg} width={2} />}
        <Text style={styles.bigText}>
          {c.waiting ? (recording ? t("listen.recordingShort", { s: Math.max(1, Math.ceil(c.askedFor - c.elapsed / 1000)) }) : t("listen.sending")) : t("listen.button", { s: len })}
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
              <Text style={styles.clipTitle}>{t("listen.latest")}</Text>
              <Text style={styles.clipMeta}>{fmtWhen(c.clip.at)} · {t("listen.secs", { s: c.clip.seconds ?? CLIP_SECONDS })}</Text>
            </View>
            <View style={styles.track}><View style={[styles.trackFill, { width: `${playFrac * 100}%` }]} /></View>
          </View>
        </View>
      ) : (
        !c.waiting && <Text style={styles.hint}>{t("listen.hint")}</Text>
      )}
    </Card>
  );
}

/** Home: one button, last-used length. */
export function ListenButton() {
  const t = useT();
  const c = useClip();
  const len = c.m.clipSeconds ?? CLIP_SECONDS;
  const recording = c.waiting && c.elapsed < c.askedFor * 1000;
  const label = c.waiting
    ? (recording ? t("listen.recordingShort", { s: Math.max(1, Math.ceil(c.askedFor - c.elapsed / 1000)) }) : t("listen.sending"))
    : t("listen.button", { s: len });
  const line = c.timedOut ? t("listen.noAnswer")
    : c.fresh && c.clip?.error ? t(`listen.err.${c.clip.error}`)
    : c.status.playing ? t("listen.playing")
    : c.clip?.url ? t("listen.last", { time: fmtWhen(c.clip.at) })
    : null;
  return (
    <View style={styles.row}>
      <Pressable onPress={() => c.ask(len)} disabled={c.waiting || !c.m.pairedToken} style={({ pressed }) => [styles.small, (c.waiting || pressed) && { opacity: 0.75 }]} accessibilityRole="button">
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
  lengths: { flexDirection: "row", backgroundColor: colors.card2, borderRadius: 99, padding: 4 },
  len: { flex: 1, alignItems: "center", paddingVertical: 9, borderRadius: 99 },
  lenOn: { backgroundColor: colors.cream },
  lenText: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.muted },
  big: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, minHeight: 56, borderRadius: 99, backgroundColor: colors.sage, overflow: "hidden" },
  bigBusy: { backgroundColor: "rgba(169,214,189,0.45)" },
  bigFill: { position: "absolute", left: 0, top: 0, bottom: 0, backgroundColor: colors.sage },
  bigText: { fontFamily: fonts.bodyBold, fontSize: 16, color: colors.bg, fontVariant: ["tabular-nums"] },
  err: { fontFamily: fonts.bodyBold, fontSize: 13.5, lineHeight: 19, color: colors.rose },
  detail: { fontFamily: fonts.body, fontSize: 11, color: colors.muted },
  hint: { fontFamily: fonts.body, fontSize: 13, lineHeight: 18, color: colors.muted },
  clip: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: colors.card2, borderRadius: 18, padding: 12 },
  clipBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.moon, alignItems: "center", justifyContent: "center" },
  clipHead: { flexDirection: "row", justifyContent: "space-between", gap: 8 },
  clipTitle: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.cream },
  clipMeta: { fontFamily: fonts.body, fontSize: 12.5, color: colors.muted, fontVariant: ["tabular-nums"] },
  track: { height: 4, borderRadius: 2, backgroundColor: "#463d63", overflow: "hidden" },
  trackFill: { height: 4, backgroundColor: colors.peach },
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  small: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.sage, borderRadius: 99, paddingHorizontal: 16, paddingVertical: 11, minHeight: 44 },
  smallText: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.bg, fontVariant: ["tabular-nums"] },
});
