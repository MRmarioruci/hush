import { useCallback, useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { colors, fonts } from "../theme";
import { Card, ICONS, Icon, Label, Screen } from "../components/ui";
import { useMonitor } from "../state/monitor";
import { fmtClock, fmtDur, loadNights, type Night } from "../nights";

const BAR_H = 84;
const LEFT = '<path d="M15 6l-6 6 6 6"/>';
const dayName = (key: string) => {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString([], { weekday: "short" });
};
const longDate = (key: string) => {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString([], { weekday: "long", day: "numeric", month: "short" });
};

export function NightsScreen() {
  const { baby, nightsVersion } = useMonitor();
  const [nights, setNights] = useState<Night[] | null>(null);
  const [i, setI] = useState(0);

  const reload = useCallback(() => { loadNights().then(setNights); }, []);
  useEffect(reload, [nightsVersion, reload]);
  useFocusEffect(reload);

  if (!nights) return <Screen title="Nights"><View /></Screen>;
  if (!nights.length) return <Screen title="Nights"><Empty baby={baby} /></Screen>;

  const n = nights[Math.min(i, nights.length - 1)];
  const who = n.baby ?? baby;

  return (
    <Screen title="Nights">
      <View style={styles.picker}>
        <Pressable onPress={() => setI((x) => Math.min(nights.length - 1, x + 1))} disabled={i >= nights.length - 1} hitSlop={12} style={i >= nights.length - 1 && { opacity: 0.25 }} accessibilityLabel="Earlier night">
          <Icon d={LEFT} size={22} color={colors.cream} width={2} />
        </Pressable>
        <View style={{ alignItems: "center" }}>
          <Text style={styles.pickTitle}>{i === 0 ? "Last night" : longDate(n.key)}</Text>
          <Text style={styles.pickSub}>{fmtClock(n.from)} – {fmtClock(n.to)}</Text>
        </View>
        <Pressable onPress={() => setI((x) => Math.max(0, x - 1))} disabled={i === 0} hitSlop={12} style={i === 0 && { opacity: 0.25 }} accessibilityLabel="Later night">
          <Icon d={ICONS.chevron} size={22} color={colors.cream} width={2} />
        </Pressable>
      </View>

      {n.listening.length > 0 && <Timeline n={n} />}

      <View style={styles.tiles}>
        <Tile value={String(n.cries)} label={n.cries === 1 ? "time cried" : "times cried"} />
        <Tile value={fmtDur(n.cryMin)} label="crying in total" />
        <Tile value={fmtDur(n.longestQuietMin)} label="longest quiet stretch" />
        <Tile value={n.firstWake ? fmtClock(n.firstWake) : "–"} label="first cry" />
      </View>

      <WeekChart nights={nights} selected={n.key} onPick={(k) => setI(nights.findIndex((x) => x.key === k))} />
      <WhenChart nights={nights.slice(0, 14)} baby={who} />

      <Text style={styles.foot}>What the baby's phone heard while listening. Raw detail is kept for 14 nights, then shrunk to a short summary.</Text>
    </Screen>
  );
}

function Empty({ baby }: { baby: string }) {
  return (
    <Card style={{ alignItems: "center", gap: 10, paddingVertical: 28 }}>
      <View style={styles.emptyIcon}><Icon d={ICONS.nights} size={28} color={colors.bg} width={2} /></View>
      <Text style={styles.emptyTitle}>No nights yet</Text>
      <Text style={styles.emptyText}>Start listening on the phone in {baby}'s room. In the morning you'll see when {baby} cried and for how long.</Text>
    </Card>
  );
}

function Tile({ value, label }: { value: string; label: string }) {
  return (
    <View style={styles.tile}>
      <Text style={styles.tileValue}>{value}</Text>
      <Text style={styles.tileLabel}>{label}</Text>
    </View>
  );
}

/** The night as a strip: listening shaded, crying spells as marks, white noise as a thin line. */
function Timeline({ n }: { n: Night }) {
  const start = n.from, end = Math.max(n.to, n.from + 3600_000);
  const x = (t: number) => `${Math.max(0, Math.min(100, ((t - start) / (end - start)) * 100))}%` as const;
  const w = (a: number, b: number) => `${Math.max(0.8, ((Math.min(b, end) - Math.max(a, start)) / (end - start)) * 100)}%` as const;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => start + f * (end - start));
  return (
    <Card style={{ gap: 10 }}>
      <Label>Timeline</Label>
      <View style={styles.strip}>
        {n.listening.map(([a, b], k) => <View key={`l${k}`} style={[styles.listen, { left: x(a), width: w(a, b) }]} />)}
        {n.noise.map(([a, b], k) => <View key={`n${k}`} style={[styles.noise, { left: x(a), width: w(a, b) }]} />)}
        {n.spells.map(([a, b], k) => <View key={`s${k}`} style={[styles.spell, { left: x(a), width: w(a, b) }]} />)}
      </View>
      <View style={styles.axis}>{ticks.map((t, k) => <Text key={k} style={styles.axisText}>{fmtClock(t)}</Text>)}</View>
      <View style={styles.legend}>
        <Key color={colors.rose} label="Crying" />
        <Key color="rgba(169,214,189,0.45)" label="Listening" />
        <Key color={colors.moon} label="White noise" thin />
      </View>
    </Card>
  );
}

function Key({ color, label, thin }: { color: string; label: string; thin?: boolean }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
      <View style={{ width: 9, height: thin ? 3 : 9, borderRadius: 2, backgroundColor: color }} />
      <Text style={styles.axisText}>{label}</Text>
    </View>
  );
}

/** Crying minutes for the last 7 nights, with a comparison to the 7 before. */
function WeekChart({ nights, selected, onPick }: { nights: Night[]; selected: string; onPick: (key: string) => void }) {
  const week = nights.slice(0, 7).reverse();
  const prev = nights.slice(7, 14);
  const max = Math.max(5, ...week.map((n) => n.cryMin));
  const avg = (l: Night[]) => (l.length ? l.reduce((s, n) => s + n.cryMin, 0) / l.length : 0);
  const now = avg(week), before = avg(prev);
  let trend: { text: string; color: string } | null = null;
  if (prev.length >= 3 && week.length >= 3) {
    const diff = now - before;
    trend = Math.abs(diff) < 2
      ? { text: `About the same as the week before (${fmtDur(before)} a night)`, color: colors.muted }
      : diff < 0
        ? { text: `Down from ${fmtDur(before)} a night the week before`, color: colors.sage }
        : { text: `Up from ${fmtDur(before)} a night the week before`, color: colors.peach };
  }
  return (
    <Card style={{ gap: 10 }}>
      <Label right={<Text style={styles.axisText}>avg {fmtDur(now)}</Text>}>Crying per night</Label>
      <View style={styles.bars}>
        {week.map((n) => (
          <Pressable key={n.key} onPress={() => onPick(n.key)} style={styles.barCol} accessibilityLabel={`${dayName(n.key)}: ${fmtDur(n.cryMin)} crying`}>
            <Text style={styles.barVal}>{Math.round(n.cryMin)}</Text>
            <View style={[styles.bar, { height: Math.max(3, (n.cryMin / max) * BAR_H), backgroundColor: n.key === selected ? colors.peach : "#463d63" }]} />
            <Text style={[styles.axisText, n.key === selected && { color: colors.cream }]}>{dayName(n.key)}</Text>
          </Pressable>
        ))}
      </View>
      {trend && <Text style={[styles.trend, { color: trend.color }]}>{trend.text}</Text>}
    </Card>
  );
}

/** When crying tends to happen, by hour from 7 pm to 7 am, across recent nights. */
function WhenChart({ nights, baby }: { nights: Night[]; baby: string }) {
  const order = [19, 20, 21, 22, 23, 0, 1, 2, 3, 4, 5, 6];
  const totals = order.map((h) => nights.reduce((s, n) => s + (n.hours[h] ?? 0), 0));
  const max = Math.max(...totals);
  if (max <= 0) return null;
  const peak = order[totals.indexOf(max)];
  return (
    <Card style={{ gap: 10 }}>
      <Label right={<Text style={styles.axisText}>{nights.length} nights</Text>}>When {baby} usually cries</Label>
      <View style={styles.heat}>
        {totals.map((v, k) => (
          <View key={k} style={[styles.heatCell, { backgroundColor: v > 0 ? `rgba(242,165,151,${0.18 + 0.82 * (v / max)})` : colors.card2 }]} />
        ))}
      </View>
      <View style={styles.axis}>
        {["7pm", "10pm", "1am", "4am", "7am"].map((t) => <Text key={t} style={styles.axisText}>{t}</Text>)}
      </View>
      <Text style={styles.trend}>Most often around {fmtClock(new Date(2000, 0, 1, peak).getTime())}</Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  picker: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 4 },
  pickTitle: { fontFamily: fonts.display, fontSize: 18, color: colors.cream },
  pickSub: { fontFamily: fonts.body, fontSize: 13, color: colors.muted, fontVariant: ["tabular-nums"] },

  strip: { height: 36, borderRadius: 10, backgroundColor: colors.card2, overflow: "hidden" },
  listen: { position: "absolute", top: 0, bottom: 0, backgroundColor: "rgba(169,214,189,0.16)" },
  noise: { position: "absolute", bottom: 0, height: 4, backgroundColor: colors.moon, opacity: 0.6 },
  spell: { position: "absolute", top: 7, bottom: 7, borderRadius: 4, backgroundColor: colors.rose },
  axis: { flexDirection: "row", justifyContent: "space-between" },
  axisText: { fontFamily: fonts.body, fontSize: 11.5, color: colors.muted, fontVariant: ["tabular-nums"] },
  legend: { flexDirection: "row", gap: 14 },

  tiles: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  tile: { flexBasis: "48%", flexGrow: 1, backgroundColor: colors.card, borderRadius: 18, paddingVertical: 13, paddingHorizontal: 14, gap: 2 },
  tileValue: { fontFamily: fonts.display, fontSize: 24, color: colors.cream, fontVariant: ["tabular-nums"] },
  tileLabel: { fontFamily: fonts.body, fontSize: 12.5, color: colors.muted },

  bars: { flexDirection: "row", gap: 8, alignItems: "flex-end", paddingTop: 4 },
  barCol: { flex: 1, alignItems: "center", justifyContent: "flex-end", gap: 5 },
  bar: { width: "100%", borderTopLeftRadius: 7, borderTopRightRadius: 7, borderBottomLeftRadius: 2, borderBottomRightRadius: 2 },
  barVal: { fontFamily: fonts.body, fontSize: 11, color: colors.muted, fontVariant: ["tabular-nums"] },
  trend: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.muted },

  heat: { flexDirection: "row", gap: 3 },
  heatCell: { flex: 1, height: 26, borderRadius: 5 },

  emptyIcon: { width: 60, height: 60, borderRadius: 30, backgroundColor: colors.moon, alignItems: "center", justifyContent: "center" },
  emptyTitle: { fontFamily: fonts.display, fontSize: 20, color: colors.cream },
  emptyText: { fontFamily: fonts.body, fontSize: 14, lineHeight: 21, color: colors.muted, textAlign: "center" },
  foot: { fontFamily: fonts.body, fontSize: 12, lineHeight: 18, color: colors.muted, textAlign: "center", opacity: 0.75 },
});
