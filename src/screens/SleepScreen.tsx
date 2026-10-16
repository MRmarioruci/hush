import { useEffect, useState } from "react";
import { PermissionsAndroid, Platform, Pressable, StyleSheet, Switch, Text, View } from "react-native";
import { SMART } from "../smart";
import { useMonitor } from "../state/monitor";
import { askMicAndNotifications } from "../monitor";
import Svg, { Circle, Path } from "react-native-svg";
import { SvgXml } from "react-native-svg";
import { colors, fonts } from "../theme";
import { SOUNDS } from "../sounds";
import { LIMIT_DB } from "../safety";
import { Slider } from "../components/Slider";
import { Card, Chip, Label, Pill, Screen } from "../components/ui";
import { TIMERS, fmtDist, fmtLeft, useSleep } from "../state/sleep";
import { fmtTime, useT } from "../i18n";

export function SleepScreen() {
  const z = useSleep();
  const { s } = z;
  const t = useT();

  const tag =
    s.dist < 1 ? { t: t("sounds.tagClose"), c: colors.rose }
    : s.dist < 2 ? { t: t("sounds.tagSoft"), c: colors.moon }
    : { t: t("sounds.tagLovely"), c: colors.sage };
  const volLabel = z.dev
    ? z.dev.step === 0 ? t("sounds.volOff") : z.dev.step >= z.ceiling! ? t("sounds.maxSafe") : `${Math.round((z.dev.step / z.ceiling!) * 100)}%`
    : s.vol === 100 ? t("sounds.maxSafe") : `${s.vol}%`;
  const pos = (x: number) => Math.max(0, Math.min(100, ((x - 20) / 60) * 100));

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

      <SmartCard />

      <Card>
        <Label>{t("sounds.stopAfter")}</Label>
        <View style={styles.chips}>
          {TIMERS.map(([m]) => <Chip key={m} grow label={t(`timer.${m}`)} on={s.timer === m} onPress={() => z.setTimer(m)} />)}
        </View>
        <Text style={styles.hint}>{t("sounds.fades")}</Text>
      </Card>

      <Card>
        <View>
          <Label right={<Text style={styles.val}>{fmtDist(s.dist, s.unit)}</Text>}>{t("sounds.phoneToCrib")}</Label>
          <Slider label={t("sounds.phoneToCrib")} value={s.dist} min={0.3} max={4} step={0.1} onChange={(v) => z.set({ dist: v })} />
        </View>
        <Pill label={tag.t} color={tag.c} />
        <View style={styles.levels}>
          <View style={styles.lvl}>
            <Text style={styles.lvlLabel}>{z.dev ? t("sounds.atCribNow") : t("sounds.atCribMost")}</Text>
            <Text style={[styles.lvlNum, { color: colors.sage }]}>
              {z.level == null ? "–" : Math.round(Math.max(20, z.level))}
              <Text style={styles.lvlUnit}> dB</Text>
            </Text>
          </View>
          <View style={styles.lvl}>
            <Text style={styles.lvlLabel}>{t("sounds.safeLimit")}</Text>
            <Text style={styles.lvlNum}>
              {LIMIT_DB}
              <Text style={styles.lvlUnit}> dB</Text>
            </Text>
          </View>
        </View>
        <View style={styles.gauge}>
          <View style={[styles.gaugeFill, { width: `${z.level == null ? 0 : pos(z.level)}%` }]} />
          <View style={[styles.gaugeMark, { left: `${pos(LIMIT_DB)}%` }]} />
        </View>
        <View>
          <Label right={<Text style={styles.val}>{volLabel}</Text>}>{z.s.mode === "smart" ? t("sounds.highest") : z.dev ? t("sounds.phoneVolume") : t("sounds.volume")}</Label>
          {z.dev ? (
            <Slider label={t("sounds.phoneVolume")} value={z.dev.step} min={0} max={z.dev.max} limit={z.ceiling!} onChange={z.setStep} />
          ) : (
            <Slider label={t("sounds.volume")} value={s.vol} min={0} max={100} onChange={(v) => z.set({ vol: v })} />
          )}
        </View>
        <Text style={styles.hint}>
          {t(z.dev ? "sounds.hintDev" : "sounds.hintCap", { db: LIMIT_DB })}
          {s.dist < 2 ? " " + t("sounds.moveFurther", { dist: fmtDist(2, s.unit) }) : ""}
        </Text>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
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
    if (Platform.OS !== "android") return;
    PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO).then(setMicOk).catch(() => setMicOk(false));
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
