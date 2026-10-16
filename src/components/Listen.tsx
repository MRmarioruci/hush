// Parent's phone: "Listen 10 s" — hear a few seconds of the baby's room.
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { createAudioPlayer, type AudioPlayer } from "expo-audio";
import { colors, fonts } from "../theme";
import { CLIP_SECONDS } from "../monitor";
import { fmtTime, useT } from "../i18n";
import { useMonitor } from "../state/monitor";
import { Icon } from "./ui";

const EAR = '<path d="M6 8.5a6 6 0 1 1 12 0c0 2.5-1.5 3.6-2.7 4.6-1 .8-1.3 1.6-1.3 2.9a3 3 0 0 1-5.6 1.5"/><path d="M9.5 9a2.5 2.5 0 0 1 5 0c0 1.2-.8 1.8-1.5 2.4"/>';
const WAIT_MS = 60_000;

export function ListenButton({ compact }: { compact?: boolean }) {
  const t = useT();
  const { m, requestClip } = useMonitor();
  const [asked, setAsked] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [, tick] = useState(0);
  const player = useRef<AudioPlayer | null>(null);
  const clip = m.clip;
  const waiting = asked > 0 && (!clip || clip.at < asked) && Date.now() - asked < WAIT_MS;
  const timedOut = asked > 0 && (!clip || clip.at < asked) && Date.now() - asked >= WAIT_MS;

  const play = (url: string) => {
    try {
      player.current?.remove();
      const p = createAudioPlayer({ uri: url });
      player.current = p;
      setPlaying(true);
      p.play();
      setTimeout(() => setPlaying(false), (CLIP_SECONDS + 2) * 1000);
    } catch { setPlaying(false); }
  };

  // A clip I just asked for: play it as soon as it arrives.
  useEffect(() => {
    if (asked && clip?.url && clip.at >= asked) play(clip.url);
  }, [clip?.at]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => player.current?.remove(), []);
  useEffect(() => {
    if (!waiting) return;
    const id = setInterval(() => tick((x) => x + 1), 1000);
    return () => clearInterval(id);
  }, [waiting]);

  const status = waiting
    ? t("listen.recording", { s: CLIP_SECONDS })
    : timedOut ? t("listen.noAnswer")
    : playing ? t("listen.playing")
    : clip?.error && clip.at >= asked ? t(`listen.err.${clip.error}`)
    : clip?.url && Date.now() - clip.at < 12 * 3600_000 ? t("listen.last", { time: fmtTime(clip.at) })
    : null;

  return (
    <View style={[styles.row, compact && { marginTop: 0 }]}>
      <Pressable
        onPress={async () => setAsked(await requestClip())}
        disabled={waiting || !m.pairedToken}
        style={({ pressed }) => [styles.btn, (waiting || pressed) && { opacity: 0.7 }]}
        accessibilityRole="button"
        accessibilityLabel={t("listen.button", { s: CLIP_SECONDS })}
      >
        {waiting ? <ActivityIndicator color={colors.bg} size="small" /> : <Icon d={EAR} size={18} color={colors.bg} width={2} />}
        <Text style={styles.btnText}>{t("listen.button", { s: CLIP_SECONDS })}</Text>
      </Pressable>
      {status && (
        <Pressable onPress={() => clip?.url && !waiting && play(clip.url)} disabled={!clip?.url || waiting} style={{ flex: 1 }}>
          <Text style={[styles.status, clip?.error && clip.at >= asked && !waiting && { color: colors.rose }]} numberOfLines={2}>{status}</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 12, marginTop: 4 },
  btn: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.sage, borderRadius: 99, paddingHorizontal: 16, paddingVertical: 11, minHeight: 44 },
  btnText: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.bg },
  status: { fontFamily: fonts.body, fontSize: 13, lineHeight: 18, color: colors.muted },
});
