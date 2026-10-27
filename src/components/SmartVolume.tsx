// Smart volume on the Sounds screen: the plan as a curve (with where it is now), and a page to set
// it with sliders, each redrawing the curve as it moves: how it fades in, how long it stays full,
// how fast and how low it drops, and how it rises when the baby stirs.
import { useEffect, useState } from "react";
import { Modal, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Circle, Line, Path, Rect, Text as SvgText } from "react-native-svg";
import { colors, fonts } from "../theme";
import { useSleep } from "../state/sleep";
import { useMonitor } from "../state/monitor";
import { askMicAndNotifications, hasMic } from "../monitor";
import { PLAN_DEFAULTS, RISE_STEPS, planLevel, sounds, type SmartPlan } from "../smart";
import { fmtTime, useT } from "../i18n";
import { Icon } from "./ui";
import { Slider } from "./Slider";

type T = ReturnType<typeof useT>;
const mins = (t: T, m: number) => (m < 60 ? t("dur.min", { m: Math.round(m) }) : t("dur.hm", { h: Math.floor(m / 60), mm: String(Math.round(m % 60)).padStart(2, "0") }));
const secs = (t: T, s: number) => (s < 60 ? t("smart.secs", { s }) : mins(t, s / 60));

/** The plan over its first 2 hours. `now`: minutes since it started and the level, for the dot. */
function PlanChart({ plan, now }: { plan: SmartPlan; now?: { min: number; level: number } | null }) {
  const t = useT();
  const [w, setW] = useState(300);
  const H = 128, top = 14, bottom = H - 24;
  const X = (m: number) => 12 + (Math.min(120, m) / 120) * (w - 24);
  const Y = (l: number) => top + (1 - l) * (bottom - top);
  const pts: [number, number][] = [];
  for (let m = 0; m <= 120; m += 0.5) pts.push([m, planLevel(plan, m).level]);
  const line = "M" + pts.map(([m, l]) => `${X(m).toFixed(1)} ${Y(l).toFixed(1)}`).join(" L");
  const h = plan.fade + plan.hold, e = h + plan.ease;
  const ticks: [number, string][] = [[0, "0"], [30, t("smart.t30")], [60, t("smart.t60")], [90, t("smart.t90")], [120, t("smart.t120")]];
  return (
    <View onLayout={(ev) => setW(ev.nativeEvent.layout.width)}>
      <Svg width={w} height={H}>
        <Line x1={X(0)} y1={Y(plan.low / 100)} x2={X(120)} y2={Y(plan.low / 100)} stroke={colors.card2} strokeWidth={1.5} strokeDasharray="3 5" />
        <Path d={`${line} L${X(120)} ${bottom} L${X(0)} ${bottom} Z`} fill={colors.peach} opacity={0.13} />
        <Path d={line} stroke={colors.peach} strokeWidth={3} fill="none" strokeLinejoin="round" strokeLinecap="round" />
        {h <= 120 && <Circle cx={X(h)} cy={Y(1)} r={5} fill={colors.cream} />}
        {e <= 120 && <Circle cx={X(e)} cy={Y(plan.low / 100)} r={5} fill={colors.cream} />}
        {now && now.min <= 120 && (
          <>
            <Circle cx={X(now.min)} cy={Y(now.level)} r={11} fill="none" stroke={colors.sage} strokeWidth={2} opacity={0.5} />
            <Circle cx={X(now.min)} cy={Y(now.level)} r={6} fill={colors.sage} />
          </>
        )}
        {ticks.map(([m, label], i) => (
          <SvgText key={m} x={X(m)} y={H - 6} fontSize={11} fontWeight="700" fill="#8f86bf" textAnchor={i === 0 ? "start" : i === ticks.length - 1 ? "end" : "middle"}>{label}</SvgText>
        ))}
      </Svg>
    </View>
  );
}

/** One stirring spell: the quiet level, the rise, staying up, easing back. */
function StirChart({ plan }: { plan: SmartPlan }) {
  const t = useT();
  const [w, setW] = useState(300);
  const H = 104, top = 14, bottom = H - 24;
  const low = plan.low / 100, peak = Math.max(low, plan.peak / 100);
  const lead = 120, t1 = lead + plan.riseS, t2 = t1 + plan.stay * 60, t3 = t2 + plan.back * 60, total = t3 + 120;
  const X = (s: number) => 12 + (s / total) * (w - 24);
  const Y = (l: number) => top + (1 - l) * (bottom - top);
  const line = `M${X(0)} ${Y(low)} L${X(lead)} ${Y(low)} L${X(t1)} ${Y(peak)} L${X(t2)} ${Y(peak)} L${X(t3)} ${Y(low)} L${X(total)} ${Y(low)}`;
  return (
    <View onLayout={(ev) => setW(ev.nativeEvent.layout.width)}>
      <Svg width={w} height={H}>
        <Rect x={X(lead)} y={top - 4} width={Math.max(4, X(t1) - X(lead))} height={bottom - top + 4} rx={6} fill={colors.rose} opacity={0.16} />
        <Path d={`${line} L${X(total)} ${bottom} L${X(0)} ${bottom} Z`} fill={colors.sage} opacity={0.12} />
        <Path d={line} stroke={colors.sage} strokeWidth={3} fill="none" strokeLinejoin="round" strokeLinecap="round" />
        <Circle cx={X(lead)} cy={Y(low)} r={5} fill={colors.rose} />
        <SvgText x={Math.max(12, X(lead) - 14)} y={H - 6} fontSize={11} fontWeight="700" fill={colors.rose} textAnchor="start">{t("smart.stirs")}</SvgText>
        <SvgText x={(X(t1) + X(t2)) / 2} y={H - 6} fontSize={11} fontWeight="700" fill="#8f86bf" textAnchor="middle">{t("smart.staysUp")}</SvgText>
        <SvgText x={Math.min(w - 12, (X(t2) + X(t3)) / 2)} y={H - 6} fontSize={11} fontWeight="700" fill="#8f86bf" textAnchor={(X(t2) + X(t3)) / 2 > w - 50 ? "end" : "middle"}>{t("smart.easesBack")}</SvgText>
      </Svg>
    </View>
  );
}

/** Where smart volume hears the baby from (this phone's mic, or the baby monitor). */
function useHearing() {
  const z = useSleep();
  const mon = useMonitor();
  const t = useT();
  const [micOk, setMicOk] = useState(true);
  useEffect(() => { if (Platform.OS !== "web") hasMic().then(setMicOk).catch(() => setMicOk(false)); }, [z.s.smartCry]);
  const monitorName = mon.rooms[0]?.name.trim() || "";
  const text = mon.listening ? t("smart.hearsMic")
    : mon.rooms.length ? t("smart.hearsMonitor", { phone: monitorName || t("rt.otherPhone") })
    : micOk ? t("smart.hearsMic")
    : t("smart.hearsNone", { name: mon.baby });
  return { text, ok: mon.listening || mon.rooms.length > 0 || micOk, micOk, setMicOk };
}

/** The card on the Sounds screen (smart mode). */
export function SmartCard() {
  const z = useSleep();
  const mon = useMonitor();
  const t = useT();
  const [open, setOpen] = useState(false);
  const plan = z.s.smartPlan;
  const v = z.smart;
  const now = v ? { min: v.minutes, level: v.level } : null;
  const at = v?.nextChange ? " · " + t("smart.until", { time: fmtTime(v.nextChange) }) : "";
  const phase = !v ? t("smart.idleShort") : ({
    fading: t("smart.fading") + at,
    settling: t("smart.settling", { name: mon.baby }) + at,
    easing: t("smart.easing") + at,
    sleeping: t("smart.sleeping"),
    rising: t("smart.rising", { name: mon.baby, pct: Math.round(v.level * 100) }),
    up: t("smart.up", { name: mon.baby }) + at,
    calming: t("smart.easingBack") + at,
  } as const)[v.phase];
  const quietBy = plan.fade + plan.hold + plan.ease;
  return (
    <View style={styles.box}>
      <View style={styles.headRow}>
        <Text style={[styles.cardTitle, { flex: 1 }]} numberOfLines={1} maxFontSizeMultiplier={1.25}>{t("smart.title")}</Text>
        <Pressable onPress={() => setOpen(true)} style={styles.adjust} accessibilityRole="button">
          <Icon d='<path d="M4 7h10M18 7h2M4 17h4M12 17h8M16 5v4M10 15v4"/>' size={16} color={colors.bg} width={2.2} />
          <Text style={styles.adjustText} maxFontSizeMultiplier={1.2}>{t("smart.adjust")}</Text>
        </Pressable>
      </View>
      <Text style={styles.sub} maxFontSizeMultiplier={1.25}>{plan.low >= 100 ? t("smart.lowFull") : t("smart.summary", { hold: mins(t, plan.fade + plan.hold), quiet: mins(t, quietBy), pct: plan.low })}</Text>
      <PlanChart plan={plan} now={now} />
      <View style={styles.nowRow}>
        <View style={[styles.dot, { backgroundColor: v ? (v.phase === "rising" || v.phase === "up" ? colors.rose : colors.sage) : colors.card2 }]} />
        <Text style={[styles.sub, { flex: 1 }]} numberOfLines={2} maxFontSizeMultiplier={1.25}>{phase}</Text>
      </View>
      <SmartSheet visible={open} onClose={() => setOpen(false)} />
    </View>
  );
}

/** The settings page: two cards, each a curve with two sliders under it. */
function SmartSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const z = useSleep();
  const mon = useMonitor();
  const t = useT();
  const insets = useSafeAreaInsets();
  const hearing = useHearing();
  const [p, setP] = useState<SmartPlan>(z.s.smartPlan);
  useEffect(() => { if (visible) setP(z.s.smartPlan); }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps
  // Drawn live while dragging; saved when the finger lifts.
  const live = (patch: Partial<SmartPlan>) => setP((x) => ({ ...x, ...patch }));
  const save = (patch: Partial<SmartPlan>) => setP((x) => { const next = { ...x, ...patch }; z.set({ smartPlan: next }); return next; });
  // One slider for how quickly it gets quiet: a short soft start, a third of the time at full,
  // the rest dropping.
  const quietAfter = Math.round(p.hold + p.ease);
  const quiet = (q: number): Partial<SmartPlan> => { const hold = Math.round(q / 3); return { fade: 0.5, hold, ease: q - hold }; };
  const riseIdx = Math.max(0, RISE_STEPS.findIndex((x) => x >= p.riseS));
  // Stays up after the last sound, then eases back over the same time.
  const upFor = p.stay + p.back;
  const upPatch = (m: number): Partial<SmartPlan> => ({ stay: Math.ceil(m / 2), back: Math.floor(m / 2) || 1 });
  const row = (label: string, value: string, slider: React.ReactNode, color = colors.peach) => (
    <View>
      <View style={styles.sliderHead}>
        <Text style={styles.sliderLabel} numberOfLines={1} maxFontSizeMultiplier={1.25}>{label}</Text>
        <Text style={[styles.sliderValue, { color }]} numberOfLines={1} maxFontSizeMultiplier={1.25}>{value}</Text>
      </View>
      {slider}
    </View>
  );
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={[styles.page, { paddingTop: insets.top + 12 }]}>
        <View style={styles.pageHead}>
          <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button" accessibilityLabel={t("common.back")}>
            <Icon d='<path d="M15 6l-6 6 6 6"/>' size={22} color={colors.cream} width={2.2} />
          </Pressable>
          <Text style={styles.pageTitle} numberOfLines={1} maxFontSizeMultiplier={1.2}>{t("smart.title")}</Text>
          <Pressable onPress={() => { setP(PLAN_DEFAULTS); z.set({ smartPlan: PLAN_DEFAULTS }); }} hitSlop={8} accessibilityRole="button">
            <Text style={styles.reset} maxFontSizeMultiplier={1.2}>{t("smart.reset")}</Text>
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={{ gap: 14, paddingBottom: insets.bottom + 30 }}>
          {/* How it gets quiet */}
          <View style={styles.box}>
            <Text style={styles.cardTitle} maxFontSizeMultiplier={1.25}>{t("smart.planTitle")}</Text>
            <PlanChart plan={p} />
            {row(t("smart.quietAfter"), mins(t, quietAfter),
              <Slider label={t("smart.quietAfter")} value={quietAfter} min={10} max={90} step={5} onChange={(q) => live(quiet(q))} onDone={(q) => save(quiet(q))} />)}
            {row(t("smart.low"), `${p.low}%`,
              <Slider label={t("smart.low")} value={p.low} min={20} max={100} step={5} onChange={(low) => live({ low })} onDone={(low) => save({ low })} />)}
            <Text style={styles.small} maxFontSizeMultiplier={1.25}>{p.low >= 100 ? t("smart.lowFull") : t("smart.lowSounds", { pct: Math.round(sounds(p.low / 100) * 100) })}</Text>
          </View>

          {/* When the baby stirs */}
          <View style={styles.box}>
            <View style={styles.headRow}>
              <Text style={[styles.cardTitle, { flex: 1 }]} numberOfLines={2} maxFontSizeMultiplier={1.25}>{t("smart.stirTitle", { name: mon.baby })}</Text>
              <Switch value={z.s.smartCry} onValueChange={(v) => z.set({ smartCry: v })} trackColor={{ false: colors.card2, true: colors.sage }} thumbColor={colors.cream} accessibilityLabel={t("smart.stirTitle", { name: mon.baby })} />
            </View>
            {z.s.smartCry ? (
              <>
                <StirChart plan={{ ...p, peak: 100 }} />
                {row(t("smart.rise"), secs(t, RISE_STEPS[riseIdx]),
                  <Slider label={t("smart.rise")} value={riseIdx} min={0} max={RISE_STEPS.length - 1} step={1} color={colors.sage}
                    onChange={(i) => live({ riseS: RISE_STEPS[i] })} onDone={(i) => save({ riseS: RISE_STEPS[i], peak: 100 })} />, colors.sage)}
                {row(t("smart.upFor2"), mins(t, upFor),
                  <Slider label={t("smart.upFor2")} value={upFor} min={4} max={40} step={2} color={colors.sage} onChange={(m) => live(upPatch(m))} onDone={(m) => save(upPatch(m))} />, colors.sage)}
                <View style={styles.hears}>
                  <Icon d='<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21"/>' size={16} color={hearing.ok ? colors.sage : colors.rose} width={2} />
                  <Text style={[styles.small, { flex: 1, textAlign: "left" }]} maxFontSizeMultiplier={1.25}>{hearing.text}</Text>
                  {!hearing.ok && (
                    <Pressable onPress={async () => { const problem = await askMicAndNotifications(); hearing.setMicOk(!problem); }} style={styles.allow} accessibilityRole="button">
                      <Text style={styles.allowText} maxFontSizeMultiplier={1.2}>{t("smart.allowMic")}</Text>
                    </Pressable>
                  )}
                </View>
              </>
            ) : <Text style={styles.small} maxFontSizeMultiplier={1.25}>{t("smart.stirSub")}</Text>}
          </View>
          <Text style={[styles.small, { paddingHorizontal: 10 }]} maxFontSizeMultiplier={1.25}>{t("smart.never")}</Text>
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  box: { backgroundColor: colors.card, borderRadius: 24, padding: 16, gap: 10, overflow: "hidden" },
  headRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  cardTitle: { fontFamily: fonts.bodyBold, fontSize: 16, color: colors.cream },
  sub: { fontFamily: fonts.body, fontSize: 13, lineHeight: 18, color: colors.muted },
  adjust: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: colors.peach, borderRadius: 99, paddingHorizontal: 12, height: 34 },
  adjustText: { fontFamily: fonts.bodyBold, fontSize: 13.5, color: colors.bg },
  nowRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  page: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: 20 },
  pageHead: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 14 },
  pageTitle: { flex: 1, fontFamily: fonts.display, fontSize: 24, color: colors.cream },
  reset: { fontFamily: fonts.bodyBold, fontSize: 13.5, color: colors.muted },
  sliderHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" },
  sliderLabel: { flexShrink: 1, fontFamily: fonts.bodyBold, fontSize: 14, color: colors.cream },
  sliderValue: { fontFamily: fonts.display, fontSize: 16, marginLeft: 8 },
  small: { fontFamily: fonts.body, fontSize: 12.5, lineHeight: 17, color: colors.muted, textAlign: "center" },
  seg: { flexDirection: "row", backgroundColor: colors.card, borderRadius: 24, padding: 4, gap: 4 },
  segItem: { flex: 1, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  segText: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.muted },
  hears: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.card2, borderRadius: 16, paddingVertical: 9, paddingHorizontal: 12 },
  allow: { backgroundColor: colors.card2, borderRadius: 99, paddingHorizontal: 12, paddingVertical: 7 },
  allowText: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.peach },
});
