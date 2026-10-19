import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { colors, fonts } from "../theme";
import { Card, ICONS, Icon, Label, Screen } from "../components/ui";
import { useMonitor } from "../state/monitor";
import { dayKey, fmtClock, fmtDur, loadManual, type ManualSleep, type Night, type Sleep } from "../nights";
import { useNaps } from "../state/naps";
import { useSleep } from "../state/sleep";
import { AgeGuide, SleepRow, SleepSheet } from "../components/Naps";
import { Ring } from "../components/Ring";
import Svg, { Circle, Path } from "react-native-svg";
import { ageMonths, bandFor } from "../naps";
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
  const { baby, syncSleep, lastSync } = useMonitor();
  const { s } = useSleep();
  const naps = useNaps();
  const [loaded, setLoaded] = useState(false);
  const nights = loaded ? naps.nights : null;
  const [sheet, setSheet] = useState<ManualSleep | "new" | null>(null);
  const [mine, setMine] = useState<Set<string>>(new Set());
  const f = s.features;
  // Sleep charts unless the baby monitor has actually heard something (then crying charts).
  const sleepMode = !f.monitor || !(nights ?? []).some((n) => n.listening.length > 0);
  const [mode, setMode] = useState<Mode>("day");
  const [key, setKey] = useState<string | null>(null);
  const [weekStart, setWeekStart] = useState(() => mondayOf(today()));
  const [month, setMonth] = useState(() => new Date(today().getFullYear(), today().getMonth(), 1));
  useT();

  const reload = useCallback(() => { naps.reload(); loadManual().then((m) => setMine(new Set(m.list.map((x) => x.id)))).catch(() => {}); setTimeout(() => setLoaded(true), 50); }, [naps.reload]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { loadManual().then((m) => setMine(new Set(m.list.map((x) => x.id)))).catch(() => {}); }, [naps.nights]);
  useFocusEffect(reload);
  // Opening this page shares this phone's days with the connected phones and asks for theirs.
  useFocusEffect(useCallback(() => { syncSleep(); }, [syncSleep]));
  const edit = (sl: Sleep) => sl.logged && sl.id && mine.has(sl.id) ? () => setSheet({ id: sl.id!, from: sl.from, to: sl.to, kind: sl.kind, note: sl.note }) : undefined;
  const sheetEl = <SleepSheet value={sheet} onClose={() => setSheet(null)} />;

  const byKey = useMemo(() => new Map((nights ?? []).map((n) => [n.key, n])), [nights]);

  if (!nights) return <Screen title={t("nights.title")}><View /></Screen>;
  if (!nights.length) return <Screen title={t("nights.title")}><Empty baby={baby} naps={f.naps} onAdd={() => setSheet("new")} />{sheetEl}</Screen>;

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

      {mode === "day" && <NightView nights={nights} selected={key ?? nights[0].key} onSelect={setKey} baby={baby} naps={f.naps} edit={edit} onAdd={() => setSheet("new")} />}
      {mode === "week" && <WeekView byKey={byKey} start={weekStart} setStart={setWeekStart} onOpen={openNight} baby={baby} sleepMode={sleepMode} />}
      {mode === "month" && <MonthView byKey={byKey} month={month} setMonth={setMonth} onOpen={openNight} baby={baby} sleepMode={sleepMode} />}
      {sheetEl}

      <Text style={styles.foot}>
        {t("nights.foot")}
        {lastSync ? " " + t("nights.synced", { time: fmtClock(lastSync) }) : ""}
      </Text>
    </Screen>
  );
}

/* ---------------- one night ---------------- */

function NightView({ nights, selected, onSelect, baby, naps: napsOn, edit, onAdd }: { nights: Night[]; selected: string; onSelect: (k: string) => void; baby: string; naps: boolean; edit: (s: Sleep) => (() => void) | undefined; onAdd: () => void }) {
  const { s } = useSleep();
  const [guide, setGuide] = useState(false);
  const i = Math.max(0, nights.findIndex((n) => n.key === selected));
  const n = nights[i];
  const strip = nights.slice(0, 60);
  const heard = n.listening.length > 0;
  const crying = strip.some((y) => y.listening.length);
  const months = ageMonths(s.birthday, keyDate(n.key).getTime() + 12 * 3600_000);
  const band = months == null ? null : bandFor(months);
  const goal = band?.total ? band.total[1] * 60 : 15 * 60;
  const sleeps = n.sleeps ?? [];
  // Only the part of each sleep inside this day, so the legend adds up to the total in the middle.
  const d0 = keyDate(n.key).getTime(), d1 = addDays(keyDate(n.key), 1).getTime();
  const within = (x: Sleep) => Math.max(0, Math.min(x.to, d1) - Math.max(x.from, d0)) / 60_000;
  const nightMin = sleeps.filter((x) => x.kind === "night").reduce((a, x) => a + within(x), 0);
  const napList = sleeps.filter((x) => x.kind === "nap" && within(x) > 0);
  const napMin = napList.reduce((a, x) => a + within(x), 0);

  return (
    <>
      {/* each day as a little ring: how full the day's sleep (or crying) was */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dayStrip}
        style={{ marginHorizontal: -20, transform: [{ scaleX: -1 }] }}>
        {strip.map((x) => {
          const on = x.key === n.key;
          const frac = crying ? Math.min(1, x.cryMin / 60) : Math.min(1, (x.sleptMin ?? 0) / goal);
          return (
            <Pressable key={x.key} onPress={() => onSelect(x.key)} style={[styles.day, { transform: [{ scaleX: -1 }] }]} accessibilityLabel={longDate(x.key)} accessibilityState={{ selected: on }}>
              <Ring size={42} stroke={5} progress={frac} color={on ? colors.peach : crying ? colors.rose : colors.sage} track={colors.card}>
                <Text style={[styles.dayNum, on && { color: colors.peach }]}>{keyDate(x.key).getDate()}</Text>
              </Ring>
              <Text style={[styles.dayName, on && { color: colors.peach }]}>{dayName(x.key)}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <View style={{ alignItems: "center", gap: 4 }}>
        <Text style={styles.pickTitle}>{dayTitle(n.key)}</Text>
        <Clock n={n}>
          <Text style={styles.clockBig}>{fmtDur(n.sleptMin ?? 0)}</Text>
          <Text style={styles.clockSub}>{band?.total ? t("nights.sleptUsual", { range: t("age.rangeH", { lo: band.total[0], hi: band.total[1] }) }) : t("nights.sleptShort")}</Text>
        </Clock>
        <View style={styles.legend}>
          {nightMin > 0 && <Key color="#c9bfff" label={`${t("nights.night")} ${fmtDur(nightMin)}`} />}
          {napList.length > 0 && <Key color={colors.peach} label={`${t("nights.naps", { count: napList.length })} ${fmtDur(napMin)}`} />}
          {heard && <Key color={colors.rose} label={`${t("nights.crying")} ${fmtDur(n.cryMin)}`} />}
        </View>
      </View>

      <View style={styles.roundRow}>
        <Pressable onPress={onAdd} style={styles.roundBtn} accessibilityLabel={t("nights.addSleep")}>
          <Icon d='<path d="M12 5v14M5 12h14"/>' size={20} color={colors.bg} width={2.4} />
        </Pressable>
        {napsOn && months != null && (
          <Pressable onPress={() => setGuide(true)} style={styles.softBtn}>
            <Text style={styles.softBtnText}>{t("nights.ageGuide")}</Text>
          </Pressable>
        )}
      </View>

      {sleeps.length > 0 && <Sleeps n={n} edit={edit} />}
      {heard && (
        <View style={styles.tiles}>
          <Tile value={String(n.cries)} label={t("nights.cried", { count: n.cries })} />
          <Tile value={fmtDur(n.longestQuietMin)} label={t("nights.quiet")} />
        </View>
      )}
      {crying && <WhenChart nights={nights.slice(0, 14)} baby={n.baby || baby} />}
      <AgeGuide visible={guide} onClose={() => setGuide(false)} />
    </>
  );
}

/** The day as a 24 h clock: midnight at the top, sleeps as arcs (night lavender, naps butter), crying as rose ticks inside. */
function Clock({ n, children }: { n: Night; children: React.ReactNode }) {
  const S = 264, C = S / 2, R = 104, R2 = 82;
  const start = keyDate(n.key).getTime(), end = addDays(keyDate(n.key), 1).getTime();
  const ang = (v: number) => ((Math.max(start, Math.min(end, v)) - start) / (end - start)) * 360 - 90;
  const pt = (r: number, deg: number) => [C + r * Math.cos((deg * Math.PI) / 180), C + r * Math.sin((deg * Math.PI) / 180)];
  const arc = (r: number, a: number, b: number) => {
    const from = ang(a), to = Math.max(ang(b), from + 1.5);
    const [x1, y1] = pt(r, from), [x2, y2] = pt(r, Math.min(to, from + 359.9));
    return `M${x1.toFixed(1)} ${y1.toFixed(1)} A${r} ${r} 0 ${to - from > 180 ? 1 : 0} 1 ${x2.toFixed(1)} ${y2.toFixed(1)}`;
  };
  const inDay = (a: number, b: number) => b > start && a < end;
  const now = Date.now();
  const [nx, ny] = pt(R, ang(now));
  const logged = (n.sleeps ?? []).length ? [] : (n.logged ?? []);
  return (
    <View style={{ width: S, height: S, alignItems: "center", justifyContent: "center" }}>
      <Svg width={S} height={S} style={{ position: "absolute", left: 0, top: 0 }}>
        <Circle cx={C} cy={C} r={R} stroke={colors.card} strokeWidth={24} fill="none" />
        {(n.sleeps ?? []).filter((x) => inDay(x.from, x.to)).map((x, k) => (
          <Path key={k} d={arc(R, x.from, x.to)} stroke={x.kind === "night" ? "#c9bfff" : colors.peach} strokeWidth={24} strokeLinecap="round" fill="none" />
        ))}
        {logged.filter(([a, b]) => inDay(a, b)).map(([a, b], k) => <Path key={`g${k}`} d={arc(R, a, b)} stroke="#c9bfff" strokeWidth={24} strokeLinecap="round" fill="none" />)}
        {n.noise.filter(([a, b]) => inDay(a, b)).map(([a, b], k) => <Path key={`n${k}`} d={arc(R2, a, b)} stroke={colors.moon} strokeOpacity={0.35} strokeWidth={3} fill="none" />)}
        {n.spells.filter(([a, b]) => inDay(a, b)).map(([a, b], k) => <Path key={`s${k}`} d={arc(R2, a, b)} stroke={colors.rose} strokeWidth={8} strokeLinecap="round" fill="none" />)}
        {now > start && now < end && <Circle cx={nx} cy={ny} r={6} fill={colors.cream} />}
      </Svg>
      {[0, 6, 12, 18].map((h) => {
        const [x, y] = pt(R - 26, h * 15 - 90);
        return <Text key={h} style={[styles.clockHour, { left: x - 12, top: y - 8 }]}>{h}</Text>;
      })}
      {children}
    </View>
  );
}

/* ---------------- a week ---------------- */

function WeekView({ byKey, start, setStart, onOpen, baby, sleepMode }: { byKey: Map<string, Night>; start: Date; setStart: (d: Date) => void; onOpen: (k: string) => void; baby: string; sleepMode: boolean }) {
  const val = (n: Night) => (sleepMode ? (n.sleptMin ?? 0) : n.cryMin);
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  const week = days.map((d) => byKey.get(dateKey(d))).filter((n): n is Night => !!n);
  const prevWeek = Array.from({ length: 7 }, (_, i) => byKey.get(dateKey(addDays(start, i - 7)))).filter((n): n is Night => !!n);
  const canNext = start < mondayOf(today());
  const max = Math.max(5, ...week.map(val));
  const range = `${fmtDate(start, { day: "numeric", month: "short" })} – ${fmtDate(addDays(start, 6), { day: "numeric", month: "short" })}`;
  const cmp = sleepMode ? null : compare(week, prevWeek, "Week");
  const calmest = sleepMode ? null : week.length ? week.reduce((a, b) => (b.cryMin < a.cryMin ? b : a)) : null;

  return (
    <>
      <Period title={range} onPrev={() => setStart(addDays(start, -7))} onNext={canNext ? () => setStart(addDays(start, 7)) : undefined} />
      <Card style={{ gap: 10 }}>
        <Label right={<Text style={styles.axisText}>{t("nights.avg", { dur: fmtDur(avg(week.map(val))) })}</Text>}>{t(sleepMode ? "nights.sleepPerDay" : "nights.perDay")}</Label>
        <View style={styles.bars}>
          {days.map((d) => {
            const k = dateKey(d), n = byKey.get(k);
            return (
              <Pressable key={k} onPress={() => onOpen(k)} disabled={!n} style={styles.barCol} accessibilityLabel={n ? `${dayName(k)}: ${fmtDur(val(n))}` : dayName(k)}>
                <Text style={styles.barVal}>{n ? (sleepMode ? fmt1(val(n) / 60) : Math.round(n.cryMin)) : ""}</Text>
                {n ? (
                  <View style={[styles.bar, { height: Math.max(3, (val(n) / max) * BAR_H), backgroundColor: calmest?.key === k || sleepMode ? colors.sage : "#4a3f86" }]} />
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
            {sleepMode ? (
              <Tile value={fmtDur(avg(week.map(val)))} label={t("nights.avgSleep")} />
            ) : (
              <>
                <Tile value={fmtDur(avg(week.map((n) => n.cryMin)))} label={t("nights.avgCry")} />
                <Tile value={fmt1(avg(week.map((n) => n.cries)))} label={t("nights.avgCries")} />
                <Tile value={fmtDur(avg(week.map((n) => n.longestQuietMin)))} label={t("nights.avgQuiet")} />
              </>
            )}
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

function MonthView({ byKey, month, setMonth, onOpen, baby, sleepMode }: { byKey: Map<string, Night>; month: Date; setMonth: (d: Date) => void; onOpen: (k: string) => void; baby: string; sleepMode: boolean }) {
  const val = (n: Night) => (sleepMode ? (n.sleptMin ?? 0) : n.cryMin);
  const tint = sleepMode ? "169,214,189" : "242,165,151";
  const y = month.getFullYear(), mo = month.getMonth();
  const daysIn = new Date(y, mo + 1, 0).getDate();
  const all = Array.from({ length: daysIn }, (_, i) => new Date(y, mo, i + 1));
  const inMonth = all.map((d) => byKey.get(dateKey(d))).filter((n): n is Night => !!n);
  const prevMonth = Array.from({ length: new Date(y, mo, 0).getDate() }, (_, i) => byKey.get(dateKey(new Date(y, mo - 1, i + 1)))).filter((n): n is Night => !!n);
  const now = today();
  const canNext = y < now.getFullYear() || (y === now.getFullYear() && mo < now.getMonth());
  const max = Math.max(5, ...inMonth.map(val));
  const lead = (all[0].getDay() + 6) % 7; // Monday-first grid
  const weekdays = Array.from({ length: 7 }, (_, i) => fmtDate(addDays(new Date(2024, 0, 1), i), { weekday: "narrow" })); // 1 Jan 2024 was a Monday
  const cmp = sleepMode ? null : compare(inMonth, prevMonth, "Month");
  const calmest = sleepMode ? null : inMonth.length ? inMonth.reduce((a, b) => (b.cryMin < a.cryMin ? b : a)) : null;

  // Week-by-week averages inside this month.
  const weeks: { label: string; avg: number; count: number }[] = [];
  for (let w = mondayOf(all[0]); w <= all[daysIn - 1]; w = addDays(w, 7)) {
    const ns = Array.from({ length: 7 }, (_, i) => addDays(w, i))
      .filter((d) => d.getMonth() === mo)
      .map((d) => byKey.get(dateKey(d)))
      .filter((n): n is Night => !!n);
    weeks.push({ label: fmtDate(w < all[0] ? all[0] : w, { day: "numeric" }), avg: avg(ns.map(val)), count: ns.length });
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
            const a = n ? 0.18 + 0.82 * (val(n) / max) : 0;
            return (
              <Pressable key={k} onPress={() => onOpen(k)} disabled={!n} style={styles.calCell} accessibilityLabel={n ? `${longDate(k)}: ${fmtDur(val(n))}` : longDate(k)}>
                <View style={[styles.calDay, n ? { backgroundColor: `rgba(${tint},${a})` } : styles.calNone]}>
                  <Text style={[styles.calNum, !n && { color: colors.muted }, n && a > 0.6 && { color: colors.bg }]}>{d.getDate()}</Text>
                </View>
              </Pressable>
            );
          })}
        </View>
        <View style={styles.legendRow}>
          <Text style={styles.axisText}>{t(sleepMode ? "nights.lessSleep" : "nights.less")}</Text>
          {[0.18, 0.4, 0.6, 0.8, 1].map((a) => <View key={a} style={[styles.legendCell, { backgroundColor: `rgba(${tint},${a})` }]} />)}
          <Text style={styles.axisText}>{t(sleepMode ? "nights.moreSleep" : "nights.more")}</Text>
        </View>
        <Text style={styles.hintText}>{inMonth.length ? t("nights.tapDay") : t("nights.noMonth")}</Text>
      </Card>

      {inMonth.length > 0 && (
        <>
          <View style={styles.tiles}>
            <Tile value={String(inMonth.length)} label={t("nights.recorded", { count: inMonth.length })} />
            {sleepMode ? (
              <Tile value={fmtDur(avg(inMonth.map(val)))} label={t("nights.avgSleep")} />
            ) : (
              <>
                <Tile value={fmtDur(avg(inMonth.map((n) => n.cryMin)))} label={t("nights.avgCry")} />
                <Tile value={fmt1(avg(inMonth.map((n) => n.cries)))} label={t("nights.avgCries")} />
              </>
            )}
            <Tile value={fmt1(avg(inMonth.map(naps)))} label={t("nights.avgNaps")} />
          </View>
          <Card style={{ gap: 10 }}>
            <Label>{t(sleepMode ? "nights.weeklySleep" : "nights.weekly")}</Label>
            <View style={styles.bars}>
              {weeks.map((w, i) => (
                <View key={i} style={styles.barCol}>
                  <Text style={styles.barVal}>{w.count ? (sleepMode ? fmt1(w.avg / 60) : Math.round(w.avg)) : ""}</Text>
                  {w.count ? <View style={[styles.bar, { height: Math.max(3, (w.avg / wMax) * BAR_H), backgroundColor: sleepMode ? colors.sage : "#4a3f86" }]} /> : <View style={styles.barEmpty} />}
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

function Empty({ baby, naps: napsOn, onAdd }: { baby: string; naps: boolean; onAdd: () => void }) {
  return (
    <Card style={{ alignItems: "center", gap: 10, paddingVertical: 28 }}>
      <View style={styles.emptyIcon}><Icon d={ICONS.nights} size={28} color={colors.bg} width={2} /></View>
      <Text style={styles.emptyTitle}>{t("nights.emptyTitle")}</Text>
      <Text style={styles.emptyText}>{t(napsOn ? "nights.emptyNaps" : "nights.emptyText", { name: baby })}</Text>
      {napsOn && (
        <Pressable onPress={onAdd} style={styles.addBtn}><Text style={styles.addText}>{t("nights.addSleep")}</Text></Pressable>
      )}
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
        {(n.logged ?? []).map(([a, b], k) => <View key={`g${k}`} style={[styles.logged, { left: x(a), width: w(a, b) }]} />)}
        {n.listening.map(([a, b], k) => <View key={`l${k}`} style={[styles.listen, { left: x(a), width: w(a, b) }]} />)}
        {n.noise.map(([a, b], k) => <View key={`n${k}`} style={[styles.noise, { left: x(a), width: w(a, b) }]} />)}
        {n.spells.map(([a, b], k) => <View key={`s${k}`} style={[styles.spell, { left: x(a), width: w(a, b) }]} />)}
      </View>
      <View style={styles.axis}>{[0, 6, 12, 18, 24].map((h) => <Text key={h} style={styles.axisText}>{fmtClock(at(h % 24))}</Text>)}</View>
      <View style={styles.legend}>
        {(n.logged ?? []).length > 0 && <Key color="rgba(198,184,255,0.55)" label={t("nights.asleep")} />}
        {n.listening.length > 0 && <Key color={colors.rose} label={t("nights.crying")} />}
        {n.listening.length > 0 && <Key color="rgba(158,230,196,0.45)" label={t("nights.listening")} />}
        {n.noise.length > 0 && <Key color={colors.moon} label={t("nights.noise")} thin />}
      </View>
    </Card>
  );
}

/** Each sleep this day: night or nap, when, and how much crying. Logged ones on this phone can be edited. */
function Sleeps({ n, edit, onAdd }: { n: Night; edit: (s: Sleep) => (() => void) | undefined; onAdd?: () => void }) {
  const list = n.sleeps ?? [];
  return (
    <Card style={{ gap: 4 }}>
      <Label right={onAdd && <Pressable onPress={onAdd} hitSlop={8}><Text style={styles.addLink}>+ {t("nights.addSleep")}</Text></Pressable>}>{t("nights.sleeps")}</Label>
      {list.map((sl, k) => <SleepRow key={k} sl={sl} dayKey={n.key} onPress={edit(sl)} />)}
      {!list.length && <Text style={styles.hintText}>{t("nights.noSleeps")}</Text>}
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
          <View key={k} style={[styles.heatCell, { backgroundColor: v > 0 ? `rgba(255,157,176,${0.18 + 0.82 * (v / max)})` : colors.card2 }]} />
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
  day: { width: 46, alignItems: "center", gap: 4, paddingVertical: 4 },
  dayOn: { backgroundColor: colors.peach },
  dayName: { fontFamily: fonts.body, fontSize: 11.5, color: colors.muted },
  dayNum: { fontFamily: fonts.display, fontSize: 14, color: colors.cream, fontVariant: ["tabular-nums"] },
  dayBar: { height: 4, borderRadius: 2, marginTop: 3 },

  picker: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 4, gap: 10 },
  pickTitle: { fontFamily: fonts.display, fontSize: 18, color: colors.cream, textAlign: "center", flexShrink: 1 },
  pickSub: { fontFamily: fonts.body, fontSize: 13, color: colors.muted, fontVariant: ["tabular-nums"] },

  strip: { height: 36, borderRadius: 10, backgroundColor: colors.card2, overflow: "hidden" },
  nightTint: { position: "absolute", top: 0, bottom: 0, backgroundColor: "rgba(14,10,36,0.35)" },
  sleepRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 8 },
  sleepIcon: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.moon, alignItems: "center", justifyContent: "center" },
  sleepTitle: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.cream },
  sleepSub: { fontFamily: fonts.body, fontSize: 13, color: colors.muted, fontVariant: ["tabular-nums"] },
  sleepCry: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.rose },
  logged: { position: "absolute", top: 4, bottom: 4, borderRadius: 6, backgroundColor: "rgba(198,184,255,0.45)" },
  addLink: { fontFamily: fonts.bodyBold, fontSize: 13.5, color: colors.peach },
  addBtn: { backgroundColor: colors.peach, borderRadius: 99, paddingHorizontal: 22, paddingVertical: 12, marginTop: 6 },
  addText: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.bg },
  listen: { position: "absolute", top: 0, bottom: 0, backgroundColor: "rgba(158,230,196,0.3)" },
  noise: { position: "absolute", bottom: 0, height: 4, backgroundColor: colors.moon, opacity: 0.6 },
  spell: { position: "absolute", top: 7, bottom: 7, borderRadius: 4, backgroundColor: colors.rose },
  axis: { flexDirection: "row", justifyContent: "space-between" },
  axisText: { fontFamily: fonts.body, fontSize: 11.5, color: colors.muted, fontVariant: ["tabular-nums"] },
  legend: { flexDirection: "row", gap: 14, flexWrap: "wrap", justifyContent: "center" },
  clockBig: { fontFamily: fonts.display, fontSize: 40, color: colors.cream, fontVariant: ["tabular-nums"] },
  clockSub: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.muted, textAlign: "center", maxWidth: 150 },
  clockHour: { position: "absolute", width: 24, textAlign: "center", fontFamily: fonts.bodyBold, fontSize: 11, color: "#8f86bf" },
  roundRow: { flexDirection: "row", gap: 10, justifyContent: "center", alignItems: "center" },
  roundBtn: { width: 50, height: 50, borderRadius: 25, backgroundColor: colors.peach, alignItems: "center", justifyContent: "center" },
  softBtn: { height: 50, borderRadius: 25, paddingHorizontal: 22, backgroundColor: colors.card, alignItems: "center", justifyContent: "center" },
  softBtnText: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.cream },

  tiles: { flexDirection: "row", gap: 8, paddingHorizontal: 6 },
  tile: { flexBasis: 0, flexGrow: 1, paddingVertical: 4, paddingHorizontal: 4, gap: 2 },
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
  calDay: { flex: 1, borderRadius: 99, alignItems: "center", justifyContent: "center" },
  calNone: { opacity: 0.6 },
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
