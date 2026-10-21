import { useEffect, useState } from "react";
import { Modal, Platform, Pressable, StyleSheet, Switch, Text, View } from "react-native";
import { SMART } from "../smart";
import { useMonitor } from "../state/monitor";
import { askMicAndNotifications, hasMic } from "../monitor";
import Svg, { Circle, Path } from "react-native-svg";
import { SvgXml } from "react-native-svg";
import { colors, fonts } from "../theme";
import { SOUNDS } from "../sounds";
import { LIMIT_DB, ROOM_M } from "../safety";
import { Dial } from "../components/Dial";
import { Card, Chip, Label, Pill, Screen } from "../components/ui";
import { TIMERS, fmtDist, fmtLeft, fmtMinDist, useSleep } from "../state/sleep";
import { fmtTime, useT } from "../i18n";
import { stopLine } from "../stops";

export function SleepScreen() {
  const z = useSleep();
  const { s } = z;
  const t = useT();

  // Green when a nightstand-ish distance is enough, amber further, red past a bedroom's size.
  const d = z.safeDist ?? 0;
  const tooLoud = d > ROOM_M;
  const tag = d <= 1.2 ? { t: t("sounds.tagNear"), c: colors.sage }
    : d <= 2 ? { t: t("sounds.tagMid"), c: colors.moon }
    : { t: t("sounds.tagFar"), c: colors.peach };
  const volLabel = z.dev
    ? z.dev.step === 0 ? t("sounds.volOff") : `${Math.round((z.dev.step / z.dev.max) * 100)}%`
    : s.vol === 0 ? t("sounds.volOff") : `${s.vol}%`;

  const vol = z.dev ? (z.dev.max ? z.dev.step / z.dev.max : 0) : s.vol / 100;
  const setVol = (v: number) => (z.dev ? z.setStep(Math.round(v * z.dev.max)) : z.set({ vol: Math.round(v * 100) }));
  const timerIdx = Math.max(0, TIMERS.findIndex(([m]) => m === s.timer));
  const smart = s.mode === "smart";

  return (
    <Screen title={t("sounds.title")}>
      {/* the dial: drag for volume; the middle says how far the phone must be from the crib; play sits in the gap */}
      <View style={{ alignItems: "center" }}>
        <View>
          <Dial size={268} value={vol} onChange={setVol} color={tooLoud ? colors.rose : colors.peach} label={z.dev ? t("sounds.phoneVolume") : t("sounds.volume")}>
            <Text style={styles.placeLabel}>{t("sounds.placeIt")}</Text>
            <Text style={[styles.placeNum, { color: tooLoud ? colors.rose : tag.c }]}>{z.safeDist == null ? "–" : fmtMinDist(z.safeDist, s.unit)}</Text>
            <Text style={styles.placeLabel}>{t("sounds.fromCrib")}</Text>
            <Text style={styles.volText}>{t("sounds.volumeIs", { vol: volLabel })}</Text>
          </Dial>
          <Pressable onPress={z.toggle} style={({ pressed }) => [styles.play, pressed && { transform: [{ scale: 0.94 }] }]} accessibilityRole="button" accessibilityLabel={z.playing ? t("common.pause") : t("common.play")}>
            <Svg width={30} height={30} viewBox="0 0 24 24"><Path d={z.playing ? "M7 5h3.6v14H7zM13.4 5H17v14h-3.6z" : "M8.5 5.5v13l10.5-6.5z"} fill={colors.bg} /></Svg>
          </Pressable>
        </View>
        <Text style={styles.nowName}>{t(`sound.${z.soundId}`)}{z.playing && z.timerLeft != null ? ` · ${t("home.leftShort", { time: fmtLeft(z.timerLeft) })}` : ""}</Text>
        {tooLoud && <Text style={styles.warnLine}>{t("sounds.tooLoudRoom", { dist: fmtDist(ROOM_M, s.unit) })}</Text>}
      </View>

      <View style={styles.grid}>
        {SOUNDS.map((x) => {
          const on = x.id === z.soundId;
          return (
            <Pressable key={x.id} onPress={() => z.set({ sound: x.id })} style={styles.tile} accessibilityRole="button" accessibilityState={{ selected: on }} accessibilityLabel={t(`sound.${x.id}`)}>
              <View style={[styles.tileIcon, on && { backgroundColor: colors.peach }]}>
                <SvgXml width={24} height={24} xml={`<svg viewBox="0 0 24 24" fill="none" stroke="${on ? colors.bg : "#c9bfff"}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${x.icon}</svg>`} />
              </View>
              <Text style={[styles.tileText, on && { color: colors.cream }]} numberOfLines={1}>{t(`sound.${x.id}`)}</Text>
            </Pressable>
          );
        })}
      </View>

      {/* how the volume behaves: smart (follows the baby) or manual (stays put, optional timer) */}
      <View style={styles.modeSeg}>
        {(["smart", "manual"] as const).map((m) => {
          const on = s.mode === m;
          return (
            <Pressable key={m} onPress={() => { z.set({ mode: m }); if (m === "smart" && s.timer) z.setTimer(0); }} style={[styles.modeItem, on && styles.modeItemOn]} accessibilityRole="tab" accessibilityState={{ selected: on }}>
              <Svg width={18} height={18} viewBox="0 0 24 24"><Path d={m === "smart" ? "M3 17c4 0 4-10 9-10s5 6 9 6" : "M3 12h18"} stroke={on ? colors.bg : colors.muted} strokeWidth={2.2} strokeLinecap="round" fill="none" /></Svg>
              <Text style={[styles.modeText, on && { color: colors.bg }]}>{t(m === "smart" ? "smart.smart" : "smart.manual")}</Text>
            </Pressable>
          );
        })}
      </View>

      {smart ? <SmartCard /> : (
        <View style={styles.manualBox}>
          <Text style={styles.hint}>{t("smart.manualHint")}</Text>
          <Pressable onPress={() => z.setTimer(TIMERS[(timerIdx + 1) % TIMERS.length][0])} style={[styles.pill, { flex: 0 }]} accessibilityLabel={t("sounds.stopAfter")}>
            <Svg width={20} height={20} viewBox="0 0 24 24"><Circle cx={12} cy={13} r={7} stroke={s.timer ? colors.peach : colors.muted} strokeWidth={2} fill="none" /><Path d="M12 10v3l2 1.5M10 3h4" stroke={s.timer ? colors.peach : colors.muted} strokeWidth={2} strokeLinecap="round" fill="none" /></Svg>
            <Text style={styles.pillText}>{t("sounds.stopAfter")}: {z.timerLeft != null ? fmtLeft(z.timerLeft) : s.timer ? t(`timer.${s.timer}`) : t("timer.0")}</Text>
          </Pressable>
        </View>
      )}
      {Platform.OS === "ios" && <Text style={styles.hint}>{t("sounds.iosVolume")}</Text>}
    </Screen>
  );
}

const styles = StyleSheet.create({
  place: { alignItems: "center", gap: 2, paddingVertical: 6 },
  placeLabel: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.muted },
  placeNum: { fontFamily: fonts.display, fontSize: 50, lineHeight: 56, color: colors.cream, fontVariant: ["tabular-nums"] },
  warn: { backgroundColor: "rgba(255,157,176,0.14)", borderRadius: 14, paddingVertical: 10, paddingHorizontal: 12 },
  warnText: { fontFamily: fonts.bodyBold, fontSize: 13.5, lineHeight: 19, color: colors.rose },
  loudRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, paddingTop: 4 },
  loudLabel: { flex: 1, fontFamily: fonts.bodyBold, fontSize: 14.5, color: colors.cream },
  dialogBack: { flex: 1, backgroundColor: "rgba(14,10,36,0.7)", justifyContent: "center", padding: 24 },
  dialog: { backgroundColor: colors.card, borderRadius: 24, padding: 22, gap: 12 },
  dialogTitle: { fontFamily: fonts.display, fontSize: 21, color: colors.cream },
  dialogText: { fontFamily: fonts.body, fontSize: 15, lineHeight: 22, color: colors.muted },
  dialogSafe: { backgroundColor: colors.peach, borderRadius: 99, paddingVertical: 14, alignItems: "center", marginTop: 6 },
  dialogSafeText: { fontFamily: fonts.bodyBold, fontSize: 16, color: colors.bg },
  dialogLoud: { borderRadius: 99, paddingVertical: 12, alignItems: "center" },
  dialogLoudText: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.rose },
  modeRow: { flexDirection: "row", backgroundColor: colors.card2, borderRadius: 99, padding: 3 },
  modeOn: { backgroundColor: colors.peach },
  smartRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  smartTitle: { fontFamily: fonts.display, fontSize: 17, color: colors.cream, fontVariant: ["tabular-nums"] },
  rowLabel: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.cream },
  allow: { alignSelf: "flex-start", backgroundColor: colors.card2, borderRadius: 99, paddingHorizontal: 14, paddingVertical: 8 },
  allowText: { fontFamily: fonts.bodyBold, fontSize: 13.5, color: colors.peach },
  curveAxis: { flexDirection: "row", justifyContent: "space-between", marginTop: -8 },
  curveText: { fontFamily: fonts.body, fontSize: 11, color: colors.muted },
  now: { flexDirection: "row", alignItems: "center", gap: 14, backgroundColor: colors.card, borderRadius: 24, padding: 14 },
  playBtn: { width: 52, height: 52, borderRadius: 26, backgroundColor: colors.moon, alignItems: "center", justifyContent: "center" },
  nowSub: { fontFamily: fonts.body, fontSize: 13, color: colors.muted, fontVariant: ["tabular-nums"] },
  grid: { flexDirection: "row", flexWrap: "wrap", rowGap: 6 },
  tile: { width: "25%", paddingVertical: 6, alignItems: "center", gap: 6 },
  tileIcon: { width: 60, height: 60, borderRadius: 30, backgroundColor: colors.card, alignItems: "center", justifyContent: "center" },
  volText: { fontFamily: fonts.bodyBold, fontSize: 12, color: "#8f86bf" },
  play: { position: "absolute", bottom: -4, alignSelf: "center", width: 76, height: 76, borderRadius: 38, backgroundColor: colors.peach, alignItems: "center", justifyContent: "center", borderWidth: 5, borderColor: colors.bg },
  nowName: { fontFamily: fonts.display, fontSize: 20, color: colors.cream, marginTop: 14 },
  modeSeg: { flexDirection: "row", backgroundColor: colors.card, borderRadius: 27, padding: 4 },
  modeItem: { flex: 1, height: 46, borderRadius: 23, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  modeItemOn: { backgroundColor: colors.sage },
  modeText: { fontFamily: fonts.bodyBold, fontSize: 14.5, color: colors.muted },
  manualBox: { gap: 10 },
  smartBox: { backgroundColor: colors.card, borderRadius: 24, padding: 16, gap: 12 },
  smartWhat: { fontFamily: fonts.bodyBold, fontSize: 14, lineHeight: 20, color: colors.cream },
  smartNow: { flexDirection: "row", alignItems: "center", gap: 8 },
  nowDot: { width: 8, height: 8, borderRadius: 4 },
  warnLine: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.rose, textAlign: "center", marginTop: 10 },
  pills: { flexDirection: "row", gap: 10 },
  pill: { flex: 1, height: 54, borderRadius: 27, backgroundColor: colors.card, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  pillText: { fontFamily: fonts.bodyBold, fontSize: 14.5, color: colors.cream },
  tileOn: { backgroundColor: colors.peach },
  tileText: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.muted },
  chips: { flexDirection: "row", gap: 6 },
  hint: { fontFamily: fonts.body, fontSize: 13, lineHeight: 19, color: colors.muted },
  val: { fontFamily: fonts.display, fontSize: 16, color: colors.cream, fontVariant: ["tabular-nums"] },
  levels: { flexDirection: "row", gap: 8 },
  lvl: { flex: 1, backgroundColor: colors.card2, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 11, gap: 2 },
  lvlLabel: { fontFamily: fonts.body, fontSize: 12.5, color: colors.muted },
  lvlNum: { fontFamily: fonts.display, fontSize: 28, color: colors.cream, fontVariant: ["tabular-nums"] },
  lvlUnit: { fontFamily: fonts.body, fontSize: 14, color: colors.muted },
  gauge: { height: 8, borderRadius: 99, backgroundColor: colors.card2 },
  gaugeFill: { position: "absolute", left: 0, top: 0, bottom: 0, borderRadius: 99, backgroundColor: colors.sage },
  gaugeMark: { position: "absolute", top: -5, bottom: -5, width: 3, marginLeft: -1.5, borderRadius: 2, backgroundColor: colors.cream },
});

/** Smart vs manual volume, with a small picture of the night's volume curve. */
function SmartCard() {
  const z = useSleep();
  const mon = useMonitor();
  const smart = z.s.mode === "smart";
  const t = useT();
  const [micMsg, setMicMsg] = useState<string | null>(null);
  const [micOk, setMicOk] = useState(true);
  useEffect(() => {
    if (Platform.OS === "web") return;
    hasMic().then(setMicOk).catch(() => setMicOk(false));
  }, [z.s.smartCry]);

  const phaseText = (() => {
    const v = z.smart;
    if (!v) return t("smart.idle", { start: SMART.startDb, sleep: SMART.sleepDb, min: SMART.holdMin });
    const at = v.nextChange ? " " + t("smart.until", { time: fmtTime(v.nextChange) }) : "";
    switch (v.phase) {
      case "settling": return t("smart.settling", { name: mon.baby }) + at;
      case "easing": return t("smart.easing") + at;
      case "sleeping": return t("smart.sleeping");
      case "calming": return t("smart.calming", { name: mon.baby }) + at;
    }
  })();

  return (
    <View style={styles.smartBox}>
      <Text style={styles.smartWhat}>{t("smart.what", { name: mon.baby })}</Text>
      <Curve phase={z.smart?.phase ?? null} startedAt={null} />
      <View style={styles.smartNow}>
        <View style={[styles.nowDot, { backgroundColor: z.smart ? colors.sage : colors.card2 }]} />
        <Text style={styles.hint} numberOfLines={2}>{z.smart ? phaseText : t("smart.idleShort")}</Text>
      </View>
      <View style={styles.smartRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.rowLabel}>{t("smart.respond")}</Text>
          <Text style={styles.hint}>{t("smart.respondSub", { name: mon.baby })}</Text>
        </View>
        <Switch value={z.s.smartCry} onValueChange={(v) => z.set({ smartCry: v })} trackColor={{ false: colors.card2, true: colors.sage }} thumbColor={colors.cream} />
      </View>
      {z.s.smartCry && !micOk && (
        <Pressable onPress={async () => { const problem = await askMicAndNotifications(); setMicMsg(problem); setMicOk(!problem); }} style={styles.allow}>
          <Text style={styles.allowText}>{t("smart.allowMic")}</Text>
        </Pressable>
      )}
      {micMsg && <Text style={styles.hint}>{micMsg}</Text>}
    </View>
  );
}

/** The smart volume plan as a line: high while settling, easing down, a bump when crying. */
function Curve({ phase }: { phase: string | null; startedAt: null }) {
  const t = useT();
  const W = 300, H = 64;
  const y = (db: number) => 8 + ((SMART.startDb - db) / (SMART.startDb - SMART.sleepDb)) * (H - 22);
  const x = (min: number) => (min / 120) * W;
  const h = SMART.holdMin, e = SMART.holdMin + SMART.easeMin;
  const d = `M0 ${y(SMART.startDb)} L${x(h)} ${y(SMART.startDb)} L${x(e)} ${y(SMART.sleepDb)} L${x(78)} ${y(SMART.sleepDb)} L${x(80)} ${y(SMART.startDb)} L${x(85)} ${y(SMART.startDb)} L${x(95)} ${y(SMART.sleepDb)} L${W} ${y(SMART.sleepDb)}`;
  const dot = phase === "settling" ? [x(h / 2), y(SMART.startDb)] : phase === "easing" ? [x((h + e) / 2), y((SMART.startDb + SMART.sleepDb) / 2)] : phase === "calming" ? [x(82), y(SMART.startDb)] : phase === "sleeping" ? [x(105), y(SMART.sleepDb)] : null;
  return (
    <View>
      <Svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
        <Path d={`${d} L${W} ${H - 12} L0 ${H - 12} Z`} fill={colors.peach} opacity={0.12} />
        <Path d={d} stroke={colors.peach} strokeWidth={2} fill="none" strokeLinejoin="round" />
        {dot && <Circle cx={dot[0]} cy={dot[1]} r={5} fill={colors.cream} />}
      </Svg>
      <View style={styles.curveAxis}>
        <Text style={styles.curveText}>{t("smart.curveAsleep")}</Text>
        <Text style={styles.curveText}>{t("smart.curveCry")}</Text>
        <Text style={styles.curveText}>{t("smart.curveRest")}</Text>
      </View>
    </View>
  );
}
