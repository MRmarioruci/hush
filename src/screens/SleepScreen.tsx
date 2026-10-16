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
import { Slider } from "../components/Slider";
import { Card, Chip, Label, Pill, Screen } from "../components/ui";
import { TIMERS, fmtDist, fmtLeft, fmtMinDist, useSleep } from "../state/sleep";
import { fmtTime, useT } from "../i18n";

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

  return (
    <Screen title={t("sounds.title")}>
      {/* now playing */}
      <Pressable onPress={z.toggle} style={({ pressed }) => [styles.now, pressed && { transform: [{ scale: 0.98 }] }]} accessibilityLabel={z.playing ? t("common.pause") : t("common.play")}>
        <View style={styles.playBtn}>
          <Svg width={22} height={22} viewBox="0 0 24 24">
            <Path d={z.playing ? "M7 5h3.6v14H7zM13.4 5H17v14h-3.6z" : "M8.5 5.5v13l10.5-6.5z"} fill={colors.bg} />
          </Svg>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.nowName}>{t(`sound.${z.soundId}`)}</Text>
          <Text style={styles.nowSub}>
            {z.playing ? (z.timerLeft != null ? t("sounds.playingStops", { time: fmtLeft(z.timerLeft) }) : t("home.playing")) : t(`sound.${z.soundId}.sub`)}
          </Text>
        </View>
      </Pressable>

      <Card>
        <Label>{t("sounds.sound")}</Label>
        <View style={styles.grid}>
          {SOUNDS.map((x) => {
            const on = x.id === z.soundId;
            return (
              <Pressable
                key={x.id}
                onPress={() => z.set({ sound: x.id })}
                style={({ pressed }) => [styles.tile, on && styles.tileOn, pressed && { transform: [{ scale: 0.95 }] }]}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
              >
                <SvgXml
                  width={26}
                  height={26}
                  xml={`<svg viewBox="0 0 24 24" fill="none" stroke="${on ? colors.bg : colors.muted}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${x.icon}</svg>`}
                />
                <Text style={[styles.tileText, on && { color: colors.bg }]} numberOfLines={1}>{t(`sound.${x.id}`)}</Text>
              </Pressable>
            );
          })}
        </View>
      </Card>

      <Card>
        <View>
          <Label right={<Text style={styles.val}>{volLabel}</Text>}>{z.s.mode === "smart" ? t("sounds.highest") : z.dev ? t("sounds.phoneVolume") : t("sounds.volume")}</Label>
          {z.dev ? (
            <Slider label={t("sounds.phoneVolume")} value={z.dev.step} min={0} max={z.dev.max} onChange={z.setStep} />
          ) : (
            <Slider label={t("sounds.volume")} value={s.vol} min={0} max={100} onChange={(v) => z.set({ vol: v })} />
          )}
        </View>
        <View style={styles.place}>
          <Text style={styles.placeLabel}>{t("sounds.placeAt")}</Text>
          <Text style={[styles.placeNum, { color: tag.c }]}>{z.safeDist == null ? "–" : fmtMinDist(z.safeDist, s.unit)}</Text>
          <Text style={styles.placeLabel}>{t("sounds.fromCrib")}</Text>
        </View>
        {tooLoud ? (
          <View style={styles.warn}>
            <Text style={styles.warnText}>{t("sounds.tooLoudRoom", { dist: fmtDist(ROOM_M, s.unit) })}</Text>
          </View>
        ) : (
          <Pill label={tag.t} color={tag.c} />
        )}
        <Text style={styles.hint}>
          {t("sounds.placeHint", { db: LIMIT_DB })}
          {z.s.mode === "smart" ? " " + t("sounds.smartStart") : ""}
          {Platform.OS === "ios" ? " " + t("sounds.iosVolume") : ""}
        </Text>
      </Card>

      <SmartCard />

      <Card>
        <Label>{t("sounds.stopAfter")}</Label>
        <View style={styles.chips}>
          {TIMERS.map(([m]) => <Chip key={m} grow label={t(`timer.${m}`)} on={s.timer === m} onPress={() => z.setTimer(m)} />)}
        </View>
        <Text style={styles.hint}>{t("sounds.fades")}</Text>
      </Card>

    </Screen>
  );
}

const styles = StyleSheet.create({
  place: { alignItems: "center", gap: 2, backgroundColor: colors.card2, borderRadius: 20, paddingVertical: 16 },
  placeLabel: { fontFamily: fonts.body, fontSize: 14, color: colors.muted },
  placeNum: { fontFamily: fonts.display, fontSize: 44, color: colors.cream, fontVariant: ["tabular-nums"] },
  warn: { backgroundColor: "rgba(242,165,151,0.14)", borderRadius: 14, paddingVertical: 10, paddingHorizontal: 12 },
  warnText: { fontFamily: fonts.bodyBold, fontSize: 13.5, lineHeight: 19, color: colors.rose },
  loudRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, paddingTop: 4 },
  loudLabel: { flex: 1, fontFamily: fonts.bodyBold, fontSize: 14.5, color: colors.cream },
  dialogBack: { flex: 1, backgroundColor: "rgba(10,8,18,0.7)", justifyContent: "center", padding: 24 },
  dialog: { backgroundColor: colors.card, borderRadius: 24, padding: 22, gap: 12 },
  dialogTitle: { fontFamily: fonts.display, fontSize: 21, color: colors.cream },
  dialogText: { fontFamily: fonts.body, fontSize: 15, lineHeight: 22, color: colors.muted },
  dialogSafe: { backgroundColor: colors.peach, borderRadius: 99, paddingVertical: 14, alignItems: "center", marginTop: 6 },
  dialogSafeText: { fontFamily: fonts.bodyBold, fontSize: 16, color: colors.bg },
  dialogLoud: { borderRadius: 99, paddingVertical: 12, alignItems: "center" },
  dialogLoudText: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.rose },
  modeRow: { flexDirection: "row", backgroundColor: colors.card2, borderRadius: 99, padding: 3 },
  modeItem: { flex: 1, alignItems: "center", paddingVertical: 9, borderRadius: 99 },
  modeOn: { backgroundColor: colors.peach },
  modeText: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.muted },
  smartRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  smartTitle: { fontFamily: fonts.display, fontSize: 17, color: colors.cream, fontVariant: ["tabular-nums"] },
  rowLabel: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.cream },
  allow: { alignSelf: "flex-start", backgroundColor: colors.card2, borderRadius: 99, paddingHorizontal: 14, paddingVertical: 8 },
  allowText: { fontFamily: fonts.bodyBold, fontSize: 13.5, color: colors.peach },
  curveAxis: { flexDirection: "row", justifyContent: "space-between", marginTop: -8 },
  curveText: { fontFamily: fonts.body, fontSize: 11, color: colors.muted },
  now: { flexDirection: "row", alignItems: "center", gap: 14, backgroundColor: colors.card, borderRadius: 24, padding: 14 },
  playBtn: { width: 52, height: 52, borderRadius: 26, backgroundColor: colors.moon, alignItems: "center", justifyContent: "center" },
  nowName: { fontFamily: fonts.display, fontSize: 19, color: colors.cream },
  nowSub: { fontFamily: fonts.body, fontSize: 13, color: colors.muted, fontVariant: ["tabular-nums"] },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  tile: { flexBasis: "30%", flexGrow: 1, backgroundColor: colors.card2, borderRadius: 18, paddingTop: 14, paddingBottom: 11, alignItems: "center", gap: 6 },
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
    <Card style={{ gap: 14 }}>
      <View style={styles.modeRow}>
        {(["smart", "manual"] as const).map((m) => (
          <Pressable key={m} onPress={() => z.set({ mode: m })} style={[styles.modeItem, z.s.mode === m && styles.modeOn]}>
            <Text style={[styles.modeText, z.s.mode === m && { color: colors.bg }]}>{m === "smart" ? t("smart.smart") : t("smart.manual")}</Text>
          </Pressable>
        ))}
      </View>
      {smart ? (
        <>
          <Curve phase={z.smart?.phase ?? null} startedAt={null} />
          <View style={styles.smartRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.smartTitle}>{z.smart ? t("smart.atCrib", { db: Math.round(z.smart.db) }) : t("smart.title")}</Text>
              <Text style={styles.hint}>{phaseText}</Text>
            </View>
          </View>
          <View style={styles.smartRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowLabel}>{t("smart.respond")}</Text>
              <Text style={styles.hint}>{t("smart.respondSub", { name: mon.baby })}</Text>
            </View>
            <Switch value={z.s.smartCry} onValueChange={(v) => z.set({ smartCry: v })} trackColor={{ false: colors.card2, true: colors.sage }} thumbColor={colors.cream} />
          </View>
          {z.s.smartCry && !micOk && (
            <Pressable
              onPress={async () => {
                const problem = await askMicAndNotifications();
                setMicMsg(problem);
                setMicOk(!problem);
              }}
              style={styles.allow}
            >
              <Text style={styles.allowText}>{t("smart.allowMic")}</Text>
            </Pressable>
          )}
          {micMsg && <Text style={styles.hint}>{micMsg}</Text>}
        </>
      ) : (
        <Text style={styles.hint}>{t("smart.manualHint")}</Text>
      )}
    </Card>
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
