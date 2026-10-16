import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { colors, fonts } from "../theme";
import { Card, ICONS, Icon, Label, Screen } from "../components/ui";
import { useMonitor } from "../state/monitor";
import { dayKey, fmtClock, fmtDur, loadNights, type Night } from "../nights";
import { dateLocale, t, useT } from "../i18n";

type Mode = "day" | "week" | "month";
const BAR_H = 84;
const LEFT = '<path d="M15 6l-6 6 6 6"/>';
const SUN = '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>';

/* ---------- dates: nights are named after the evening they start on (YYYY-MM-DD) ---------- */
const keyDate = (key: string) => { const [y, m, d] = key.split("-").map(Number); return new Date(y, m - 1, d); };
const dateKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const mondayOf = (d: Date) => addDays(d, -((d.getDay() + 6) % 7));
const fmtDate = (d: Date, o: Intl.DateTimeFormatOptions) => d.toLocaleDateString(dateLocale(), o);
const dayName = (key: string) => fmtDate(keyDate(key), { weekday: "short" });
const longDate = (key: string) => fmtDate(keyDate(key), { weekday: "long", day: "numeric", month: "short" });
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const median = (xs: number[]) => { if (!xs.length) return 0; const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };
const fmt1 = (n: number) => n.toLocaleString(dateLocale(), { maximumFractionDigits: 1 });
const today = () => new Date();

const naps = (n: Night) => (n.sleeps ?? []).filter((x) => x.kind === "nap" && x.from >= keyDate(n.key).getTime()).length;
/** "Today", "Yesterday", or the date. */
function dayTitle(key: string) {
  const k = dateKey(today());
  if (key === k) return t("nights.today");
  if (key === dateKey(addDays(today(), -1))) return t("nights.yesterday");
  return longDate(key);
}

/** "12% less / more / about the same" compared with an earlier period. */
function compare(now: Night[], before: Night[], kind: "Week" | "Month") {
  if (now.length < 2 || before.length < 2) return null;
  const a = avg(now.map((n) => n.cryMin)), b = avg(before.map((n) => n.cryMin));
  if (b < 1 && a < 1) return { text: t(`nights.same${kind}`), color: colors.muted };
  const pct = Math.round(((a - b) / Math.max(b, 1)) * 100);
  if (Math.abs(pct) < 10) return { text: t(`nights.same${kind}`), color: colors.muted };
  return pct < 0
    ? { text: t(`nights.less${kind}`, { pct: -pct }), color: colors.sage }
    : { text: t(`nights.more${kind}`, { pct }), color: colors.peach };
}

export function NightsScreen() {
  const { baby, nightsVersion, syncSleep, lastSync } = useMonitor();
  const [nights, setNights] = useState<Night[] | null>(null);
  const [mode, setMode] = useState<Mode>("day");
  const [key, setKey] = useState<string | null>(null);
  const [weekStart, setWeekStart] = useState(() => mondayOf(today()));
  const [month, setMonth] = useState(() => new Date(today().getFullYear(), today().getMonth(), 1));
  useT();

  const reload = useCallback(() => { loadNights().then(setNights); }, []);
  useEffect(reload, [nightsVersion, reload]);
  useFocusEffect(reload);
  // Opening this page shares this phone's days with the connected phones and asks for theirs.
  useFocusEffect(useCallback(() => { syncSleep(); }, [syncSleep]));

  const byKey = useMemo(() => new Map((nights ?? []).map((n) => [n.key, n])), [nights]);

  if (!nights) return <Screen title={t("nights.title")}><View /></Screen>;
  if (!nights.length) return <Screen title={t("nights.title")}><Empty baby={baby} /></Screen>;

  const openNight = (k: string) => { if (byKey.has(k)) { setKey(k); setMode("day"); } };

  return (
    <Screen title={t("nights.title")}>
      <View style={styles.modes}>
        {(["day", "week", "month"] as Mode[]).map((m) => (
          <Pressable key={m} onPress={() => setMode(m)} style={[styles.mode, mode === m && styles.modeOn]} accessibilityRole="tab" accessibilityState={{ selected: mode === m }}>
            <Text style={[styles.modeText, mode === m && { color: colors.bg }]}>{t(`nights.${m}`)}</Text>
          </Pressable>
        ))}
      </View>

      {mode === "day" && <NightView nights={nights} selected={key ?? nights[0].key} onSelect={setKey} baby={baby} />}
      {mode === "week" && <WeekView byKey={byKey} start={weekStart} setStart={setWeekStart} onOpen={openNight} baby={baby} />}
      {mode === "month" && <MonthView byKey={byKey} month={month} setMonth={setMonth} onOpen={openNight} baby={baby} />}

      <Text style={styles.foot}>
        {t("nights.foot")}
        {lastSync ? " " + t("nights.synced", { time: fmtClock(lastSync) }) : ""}
      </Text>
    </Screen>
  );
}

/* ---------------- one night ---------------- */

function NightView({ nights, selected, onSelect, baby }: { nights: Night[]; selected: string; onSelect: (k: string) => void; baby: string }) {
  const i = Math.max(0, nights.findIndex((n) => n.key === selected));
  const n = nights[i];
  const strip = nights.slice(0, 60);
  const max = Math.max(5, ...strip.map((x) => x.cryMin));

  return (
    <>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.dayStrip}
        style={{ marginHorizontal: -20, transform: [{ scaleX: -1 }] }}
      >
        {strip.map((x) => {
          const on = x.key === n.key;
          return (
            <Pressable key={x.key} onPress={() => onSelect(x.key)} style={[styles.day, on && styles.dayOn, { transform: [{ scaleX: -1 }] }]} accessibilityLabel={longDate(x.key)}>
              <Text style={[styles.dayName, on && { color: colors.bg }]}>{dayName(x.key)}</Text>
              <Text style={[styles.dayNum, on && { color: colors.bg }]}>{keyDate(x.key).getDate()}</Text>
              <View style={[styles.dayBar, { width: 6 + 18 * (x.cryMin / max), backgroundColor: on ? colors.bg : colors.rose, opacity: on ? 0.5 : 0.8 }]} />
            </Pressable>
          );
        })}
      </ScrollView>

      <View style={styles.picker}>
        <Pressable onPress={() => onSelect(nights[Math.min(nights.length - 1, i + 1)].key)} disabled={i >= nights.length - 1} hitSlop={12} style={i >= nights.length - 1 && { opacity: 0.25 }} accessibilityLabel={t("nights.earlier")}>
          <Icon d={LEFT} size={22} color={colors.cream} width={2} />
        </Pressable>
        <View style={{ alignItems: "center", flexShrink: 1 }}>
          <Text style={styles.pickTitle}>{dayTitle(n.key)}</Text>
          <Text style={styles.pickSub}>{t("nights.heard", { dur: fmtDur(n.listenedMin) })}</Text>
        </View>
        <Pressable onPress={() => onSelect(nights[Math.max(0, i - 1)].key)} disabled={i === 0} hitSlop={12} style={i === 0 && { opacity: 0.25 }} accessibilityLabel={t("nights.later")}>
          <Icon d={ICONS.chevron} size={22} color={colors.cream} width={2} />
        </Pressable>
      </View>

      {n.listening.length > 0 && <Timeline n={n} />}
      {(n.sleeps ?? []).length > 0 && <Sleeps n={n} />}

      <View style={styles.tiles}>
        <Tile value={String(n.cries)} label={t("nights.cried", { count: n.cries })} />
        <Tile value={fmtDur(n.cryMin)} label={t("nights.total")} />
        <Tile value={fmtDur(n.longestQuietMin)} label={t("nights.quiet")} />
        <Tile value={String(naps(n))} label={t("nights.naps", { count: naps(n) })} />
      </View>
      <WhenChart nights={nights.slice(0, 14)} baby={n.baby || baby} />
    </>
  );
}

/* ---------------- a week ---------------- */

function WeekView({ byKey, start, setStart, onOpen, baby }: { byKey: Map<string, Night>; start: Date; setStart: (d: Date) => void; onOpen: (k: string) => void; baby: string }) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  const week = days.map((d) => byKey.get(dateKey(d))).filter((n): n is Night => !!n);
  const prevWeek = Array.from({ length: 7 }, (_, i) => byKey.get(dateKey(addDays(start, i - 7)))).filter((n): n is Night => !!n);
  const canNext = start < mondayOf(today());
  const max = Math.max(5, ...week.map((n) => n.cryMin));
  const range = `${fmtDate(start, { day: "numeric", month: "short" })} – ${fmtDate(addDays(start, 6), { day: "numeric", month: "short" })}`;
  const cmp = compare(week, prevWeek, "Week");
  const calmest = week.length ? week.reduce((a, b) => (b.cryMin < a.cryMin ? b : a)) : null;

  return (
    <>
      <Period title={range} onPrev={() => setStart(addDays(start, -7))} onNext={canNext ? () => setStart(addDays(start, 7)) : undefined} />
      <Card style={{ gap: 10 }}>
        <Label right={<Text style={styles.axisText}>{t("nights.avg", { dur: fmtDur(avg(week.map((n) => n.cryMin))) })}</Text>}>{t("nights.perDay")}</Label>
        <View style={styles.bars}>
          {days.map((d) => {
            const k = dateKey(d), n = byKey.get(k);
            return (
              <Pressable key={k} onPress={() => onOpen(k)} disabled={!n} style={styles.barCol} accessibilityLabel={n ? t("nights.barA11y", { day: dayName(k), dur: fmtDur(n.cryMin) }) : dayName(k)}>
                <Text style={styles.barVal}>{n ? Math.round(n.cryMin) : ""}</Text>
                {n ? (
                  <View style={[styles.bar, { height: Math.max(3, (n.cryMin / max) * BAR_H), backgroundColor: calmest?.key === k ? colors.sage : "#463d63" }]} />
                ) : (
                  <View style={styles.barEmpty} />
                )}
                <Text style={styles.axisText}>{dayName(k)}</Text>
              </Pressable>
            );
          })}
        </View>
        {cmp && <Text style={[styles.trend, { color: cmp.color }]}>{cmp.text}</Text>}
        <Text style={styles.hintText}>{week.length ? t("nights.tapDay") : t("nights.noWeek")}</Text>
      </Card>
      {week.length > 0 && (
        <>
          <View style={styles.tiles}>
            <Tile value={fmtDur(avg(week.map((n) => n.cryMin)))} label={t("nights.avgCry")} />
            <Tile value={fmt1(avg(week.map((n) => n.cries)))} label={t("nights.avgCries")} />
            <Tile value={fmtDur(avg(week.map((n) => n.longestQuietMin)))} label={t("nights.avgQuiet")} />
            <Tile value={fmt1(avg(week.map(naps)))} label={t("nights.avgNaps")} />
          </View>
          {calmest && <Calmest n={calmest} onOpen={onOpen} />}
          <WhenChart nights={week} baby={baby} />
        </>
      )}
    </>
  );
}

/* ---------------- a month ---------------- */

function MonthView({ byKey, month, setMonth, onOpen, baby }: { byKey: Map<string, Night>; month: Date; setMonth: (d: Date) => void; onOpen: (k: string) => void; baby: string }) {
  const y = month.getFullYear(), mo = month.getMonth();
  const daysIn = new Date(y, mo + 1, 0).getDate();
  const all = Array.from({ length: daysIn }, (_, i) => new Date(y, mo, i + 1));
  const inMonth = all.map((d) => byKey.get(dateKey(d))).filter((n): n is Night => !!n);
  const prevMonth = Array.from({ length: new Date(y, mo, 0).getDate() }, (_, i) => byKey.get(dateKey(new Date(y, mo - 1, i + 1)))).filter((n): n is Night => !!n);
  const now = today();
  const canNext = y < now.getFullYear() || (y === now.getFullYear() && mo < now.getMonth());
  const max = Math.max(5, ...inMonth.map((n) => n.cryMin));
  const lead = (all[0].getDay() + 6) % 7; // Monday-first grid
  const weekdays = Array.from({ length: 7 }, (_, i) => fmtDate(addDays(new Date(2024, 0, 1), i), { weekday: "narrow" })); // 1 Jan 2024 was a Monday
  const cmp = compare(inMonth, prevMonth, "Month");
  const calmest = inMonth.length ? inMonth.reduce((a, b) => (b.cryMin < a.cryMin ? b : a)) : null;

  // Week-by-week averages inside this month.
  const weeks: { label: string; avg: number; count: number }[] = [];
  for (let w = mondayOf(all[0]); w <= all[daysIn - 1]; w = addDays(w, 7)) {
    const ns = Array.from({ length: 7 }, (_, i) => addDays(w, i))
      .filter((d) => d.getMonth() === mo)
      .map((d) => byKey.get(dateKey(d)))
      .filter((n): n is Night => !!n);
    weeks.push({ label: fmtDate(w < all[0] ? all[0] : w, { day: "numeric" }), avg: avg(ns.map((n) => n.cryMin)), count: ns.length });
  }
  const wMax = Math.max(5, ...weeks.map((w) => w.avg));

  return (
    <>
      <Period title={fmtDate(month, { month: "long", year: "numeric" })} onPrev={() => setMonth(new Date(y, mo - 1, 1))} onNext={canNext ? () => setMonth(new Date(y, mo + 1, 1)) : undefined} />
      <Card style={{ gap: 10 }}>
        <View style={styles.calHead}>{weekdays.map((w, i) => <Text key={i} style={styles.calWd}>{w}</Text>)}</View>
        <View style={styles.cal}>
          {Array.from({ length: lead }, (_, i) => <View key={`b${i}`} style={styles.calCell} />)}
          {all.map((d) => {
            const k = dateKey(d), n = byKey.get(k);
            const a = n ? 0.18 + 0.82 * (n.cryMin / max) : 0;
            return (
              <Pressable key={k} onPress={() => onOpen(k)} disabled={!n} style={styles.calCell} accessibilityLabel={n ? t("nights.barA11y", { day: longDate(k), dur: fmtDur(n.cryMin) }) : longDate(k)}>
                <View style={[styles.calDay, n ? { backgroundColor: `rgba(242,165,151,${a})` } : styles.calNone]}>
                  <Text style={[styles.calNum, !n && { color: colors.muted }, n && a > 0.6 && { color: colors.bg }]}>{d.getDate()}</Text>
                </View>
              </Pressable>
            );
          })}
        </View>
        <View style={styles.legendRow}>
          <Text style={styles.axisText}>{t("nights.less")}</Text>
          {[0.18, 0.4, 0.6, 0.8, 1].map((a) => <View key={a} style={[styles.legendCell, { backgroundColor: `rgba(242,165,151,${a})` }]} />)}
          <Text style={styles.axisText}>{t("nights.more")}</Text>
        </View>
        <Text style={styles.hintText}>{inMonth.length ? t("nights.tapDay") : t("nights.noMonth")}</Text>
      </Card>

      {inMonth.length > 0 && (
        <>
          <View style={styles.tiles}>
            <Tile value={String(inMonth.length)} label={t("nights.recorded", { count: inMonth.length })} />
            <Tile value={fmtDur(avg(inMonth.map((n) => n.cryMin)))} label={t("nights.avgCry")} />
            <Tile value={fmt1(avg(inMonth.map((n) => n.cries)))} label={t("nights.avgCries")} />
            <Tile value={fmt1(avg(inMonth.map(naps)))} label={t("nights.avgNaps")} />
          </View>
          <Card style={{ gap: 10 }}>
            <Label>{t("nights.weekly")}</Label>
            <View style={styles.bars}>
              {weeks.map((w, i) => (
                <View key={i} style={styles.barCol}>
                  <Text style={styles.barVal}>{w.count ? Math.round(w.avg) : ""}</Text>
                  {w.count ? <View style={[styles.bar, { height: Math.max(3, (w.avg / wMax) * BAR_H), backgroundColor: "#463d63" }]} /> : <View style={styles.barEmpty} />}
                  <Text style={styles.axisText} numberOfLines={1}>{w.label}</Text>
                </View>
              ))}
            </View>
            {cmp && <Text style={[styles.trend, { color: cmp.color }]}>{cmp.text}</Text>}
          </Card>
          {calmest && <Calmest n={calmest} onOpen={onOpen} />}
          <WhenChart nights={inMonth} baby={baby} />
        </>
      )}
    </>
  );
}

/* ---------------- shared pieces ---------------- */

function Period({ title, onPrev, onNext }: { title: string; onPrev: () => void; onNext?: () => void }) {
  return (
    <View style={styles.picker}>
      <Pressable onPress={onPrev} hitSlop={12} accessibilityLabel={t("nights.prev")}>
        <Icon d={LEFT} size={22} color={colors.cream} width={2} />
      </Pressable>
      <Text style={styles.pickTitle}>{title}</Text>
      <Pressable onPress={onNext} disabled={!onNext} hitSlop={12} style={!onNext && { opacity: 0.25 }} accessibilityLabel={t("nights.next")}>
        <Icon d={ICONS.chevron} size={22} color={colors.cream} width={2} />
      </Pressable>
    </View>
  );
}

function Calmest({ n, onOpen }: { n: Night; onOpen: (k: string) => void }) {
  return (
    <Pressable onPress={() => onOpen(n.key)} style={styles.calm}>
      <View style={styles.calmDot} />
      <Text style={styles.calmText}>
        {t("nights.calmestDay")} · <Text style={{ color: colors.cream }}>{longDate(n.key)}</Text> · {fmtDur(n.cryMin)}
      </Text>
      <Icon d={ICONS.chevron} size={16} />
    </Pressable>
  );
}

function Empty({ baby }: { baby: string }) {
  return (
    <Card style={{ alignItems: "center", gap: 10, paddingVertical: 28 }}>
      <View style={styles.emptyIcon}><Icon d={ICONS.nights} size={28} color={colors.bg} width={2} /></View>
      <Text style={styles.emptyTitle}>{t("nights.emptyTitle")}</Text>
      <Text style={styles.emptyText}>{t("nights.emptyText", { name: baby })}</Text>
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

/** The day as a 24 h strip: night hours tinted, listening shaded, crying as marks, white noise as a thin line. */
function Timeline({ n }: { n: Night }) {
  const start = keyDate(n.key).getTime(), end = addDays(keyDate(n.key), 1).getTime();
  const x = (v: number) => `${Math.max(0, Math.min(100, ((v - start) / (end - start)) * 100))}%` as const;
  const w = (a: number, b: number) => `${Math.max(0.6, ((Math.min(b, end) - Math.max(a, start)) / (end - start)) * 100)}%` as const;
  const at = (h: number) => start + h * 3600_000;
  return (
    <Card style={{ gap: 10 }}>
      <Label>{t("nights.timeline")}</Label>
      <View style={styles.strip}>
        <View style={[styles.nightTint, { left: 0, width: x(at(7)) }]} />
        <View style={[styles.nightTint, { left: x(at(19)), right: 0 }]} />
        {n.listening.map(([a, b], k) => <View key={`l${k}`} style={[styles.listen, { left: x(a), width: w(a, b) }]} />)}
        {n.noise.map(([a, b], k) => <View key={`n${k}`} style={[styles.noise, { left: x(a), width: w(a, b) }]} />)}
        {n.spells.map(([a, b], k) => <View key={`s${k}`} style={[styles.spell, { left: x(a), width: w(a, b) }]} />)}
      </View>
      <View style={styles.axis}>{[0, 6, 12, 18, 24].map((h) => <Text key={h} style={styles.axisText}>{fmtClock(at(h % 24))}</Text>)}</View>
      <View style={styles.legend}>
        <Key color={colors.rose} label={t("nights.crying")} />
        <Key color="rgba(169,214,189,0.45)" label={t("nights.listening")} />
        <Key color={colors.moon} label={t("nights.noise")} thin />
      </View>
    </Card>
  );
}

/** Each sleep this day: night or nap, when, and how much crying. */
function Sleeps({ n }: { n: Night }) {
  const list = n.sleeps ?? [];
  return (
    <Card style={{ gap: 4 }}>
      <Label>{t("nights.sleeps")}</Label>
      {list.map((sl, k) => (
        <View key={k} style={styles.sleepRow}>
          <View style={[styles.sleepIcon, sl.kind === "nap" && { backgroundColor: colors.peach }]}>
            <Icon d={sl.kind === "night" ? ICONS.nights : SUN} size={16} color={colors.bg} width={2} />
          </View>
          <View style={{ flex: 1, gap: 1 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
              <Text style={styles.sleepTitle}>{t(sl.kind === "night" ? "nights.nightSleep" : "nights.nap")}</Text>
              <Text style={[styles.sleepCry, sl.cries === 0 && { color: colors.sage }]}>
                {sl.cries === 0 ? t("nights.noCry") : t("nights.cryShort", { count: sl.cries, dur: fmtDur(sl.cryMin) })}
              </Text>
            </View>
            <Text style={styles.sleepSub} numberOfLines={1}>
              {dayKey(sl.from) !== n.key ? `${dayName(dayKey(sl.from))} ` : ""}{fmtClock(sl.from)} – {dayKey(sl.to) !== n.key ? `${dayName(dayKey(sl.to))} ` : ""}{fmtClock(sl.to)}
            </Text>
          </View>
        </View>
      ))}
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

/** When crying tends to happen, by hour of the day, across the given days. */
function WhenChart({ nights, baby }: { nights: Night[]; baby: string }) {
  const order = Array.from({ length: 24 }, (_, h) => h);
  const totals = order.map((h) => nights.reduce((s, n) => s + (n.hours[h] ?? 0), 0));
  const max = Math.max(...totals);
  if (max <= 0) return null;
  const peak = order[totals.indexOf(max)];
  return (
    <Card style={{ gap: 10 }}>
      <Label right={<Text style={styles.axisText}>{t("nights.count", { count: nights.length })}</Text>}>{t("nights.when", { name: baby })}</Label>
      <View style={styles.heat}>
        {totals.map((v, k) => (
          <View key={k} style={[styles.heatCell, { backgroundColor: v > 0 ? `rgba(242,165,151,${0.18 + 0.82 * (v / max)})` : colors.card2 }]} />
        ))}
      </View>
      <View style={styles.axis}>
        {[0, 6, 12, 18, 24].map((h) => <Text key={h} style={styles.axisText}>{new Date(2000, 0, 1, h % 24).toLocaleTimeString(dateLocale(), { hour: "numeric" })}</Text>)}
      </View>
      <Text style={styles.trend}>{t("nights.peak", { time: fmtClock(new Date(2000, 0, 1, peak).getTime()) })}</Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  modes: { flexDirection: "row", backgroundColor: colors.card, borderRadius: 99, padding: 4 },
  mode: { flex: 1, alignItems: "center", paddingVertical: 9, borderRadius: 99 },
  modeOn: { backgroundColor: colors.cream },
  modeText: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.muted },

  dayStrip: { gap: 6, paddingHorizontal: 20 },
  day: { width: 50, alignItems: "center", gap: 2, paddingVertical: 9, borderRadius: 16, backgroundColor: colors.card },
  dayOn: { backgroundColor: colors.peach },
  dayName: { fontFamily: fonts.body, fontSize: 11.5, color: colors.muted },
  dayNum: { fontFamily: fonts.display, fontSize: 18, color: colors.cream, fontVariant: ["tabular-nums"] },
  dayBar: { height: 4, borderRadius: 2, marginTop: 3 },

  picker: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 4, gap: 10 },
  pickTitle: { fontFamily: fonts.display, fontSize: 18, color: colors.cream, textAlign: "center", flexShrink: 1 },
  pickSub: { fontFamily: fonts.body, fontSize: 13, color: colors.muted, fontVariant: ["tabular-nums"] },

  strip: { height: 36, borderRadius: 10, backgroundColor: colors.card2, overflow: "hidden" },
  nightTint: { position: "absolute", top: 0, bottom: 0, backgroundColor: "rgba(10,8,20,0.35)" },
  sleepRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 8 },
  sleepIcon: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.moon, alignItems: "center", justifyContent: "center" },
  sleepTitle: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.cream },
  sleepSub: { fontFamily: fonts.body, fontSize: 13, color: colors.muted, fontVariant: ["tabular-nums"] },
  sleepCry: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.rose },
  listen: { position: "absolute", top: 0, bottom: 0, backgroundColor: "rgba(169,214,189,0.3)" },
  noise: { position: "absolute", bottom: 0, height: 4, backgroundColor: colors.moon, opacity: 0.6 },
  spell: { position: "absolute", top: 7, bottom: 7, borderRadius: 4, backgroundColor: colors.rose },
  axis: { flexDirection: "row", justifyContent: "space-between" },
  axisText: { fontFamily: fonts.body, fontSize: 11.5, color: colors.muted, fontVariant: ["tabular-nums"] },
  legend: { flexDirection: "row", gap: 14, flexWrap: "wrap" },

  tiles: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  tile: { flexBasis: "48%", flexGrow: 1, backgroundColor: colors.card, borderRadius: 18, paddingVertical: 13, paddingHorizontal: 14, gap: 2 },
  tileValue: { fontFamily: fonts.display, fontSize: 24, color: colors.cream, fontVariant: ["tabular-nums"] },
  tileLabel: { fontFamily: fonts.body, fontSize: 12.5, color: colors.muted },

  bars: { flexDirection: "row", gap: 8, alignItems: "flex-end", paddingTop: 4 },
  barCol: { flex: 1, alignItems: "center", justifyContent: "flex-end", gap: 5 },
  bar: { width: "100%", borderTopLeftRadius: 7, borderTopRightRadius: 7, borderBottomLeftRadius: 2, borderBottomRightRadius: 2 },
  barEmpty: { width: "60%", height: 2, borderRadius: 1, backgroundColor: colors.card2 },
  barVal: { fontFamily: fonts.body, fontSize: 11, color: colors.muted, fontVariant: ["tabular-nums"] },
  trend: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.muted },
  hintText: { fontFamily: fonts.body, fontSize: 12.5, color: colors.muted, textAlign: "center" },

  calm: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: colors.card, borderRadius: 18, paddingVertical: 13, paddingHorizontal: 14 },
  calmDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.sage },
  calmText: { flex: 1, fontFamily: fonts.body, fontSize: 13.5, color: colors.muted },

  calHead: { flexDirection: "row" },
  calWd: { width: `${100 / 7}%`, textAlign: "center", fontFamily: fonts.bodyBold, fontSize: 11.5, color: colors.muted },
  cal: { flexDirection: "row", flexWrap: "wrap" },
  calCell: { width: `${100 / 7}%`, aspectRatio: 1, padding: 3 },
  calDay: { flex: 1, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  calNone: { borderWidth: 1, borderColor: colors.card2 },
  calNum: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.cream, fontVariant: ["tabular-nums"] },
  legendRow: { flexDirection: "row", alignItems: "center", gap: 4, justifyContent: "center" },
  legendCell: { width: 16, height: 10, borderRadius: 3 },

  heat: { flexDirection: "row", gap: 2 },
  heatCell: { flex: 1, height: 26, borderRadius: 3 },

  emptyIcon: { width: 60, height: 60, borderRadius: 30, backgroundColor: colors.moon, alignItems: "center", justifyContent: "center" },
  emptyTitle: { fontFamily: fonts.display, fontSize: 20, color: colors.cream },
  emptyText: { fontFamily: fonts.body, fontSize: 14, lineHeight: 21, color: colors.muted, textAlign: "center" },
  foot: { fontFamily: fonts.body, fontSize: 12, lineHeight: 18, color: colors.muted, textAlign: "center", opacity: 0.75 },
});
