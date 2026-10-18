// Nap timing UI: the next-nap card, the add/edit sleep sheet, the age guide and the
// "typical for this age" card on the Sleep tab.
import { useEffect, useState } from "react";
import { Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { DateTimePickerAndroid } from "@react-native-community/datetimepicker";
import { SvgXml } from "react-native-svg";
import { colors, fonts } from "../theme";
import { ageMonths, bandFor, type AgeBand } from "../naps";
import { deleteSleep, fmtClock, fmtDur, kindOf, upsertSleep, type ManualSleep, type Night, type Sleep } from "../nights";
import { babyLabel, dateLocale, t, useT } from "../i18n";
import { useNaps } from "../state/naps";
import { useSleep } from "../state/sleep";
import { useMonitor } from "../state/monitor";
import { Card, ICONS, Icon, Label } from "./ui";

const MOON = (c: string) => `<svg viewBox="0 0 1024 1024"><path fill="${c}" d="M600 210a330 330 0 1 0 214 520A270 270 0 0 1 600 210z"/></svg>`;
export const SUN = '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>';
const MIN = 60_000;

/* ---------- formatting ---------- */

export function fmtAge(months: number) {
  if (months < 1) return t("age.weeks", { count: Math.max(0, Math.floor(months * 4.345)) });
  if (months < 24) return t("age.months", { count: Math.floor(months) });
  return t("age.years", { count: Math.floor(months / 12) });
}
const num = (n: number) => n.toLocaleString(dateLocale(), { maximumFractionDigits: 1 });
/** "35–60 min" or "2–3 h". */
export function fmtWake([lo, hi]: [number, number]) {
  if (hi <= 60) return t("age.rangeMin", { lo, hi });
  return t("age.rangeH", { lo: num(lo / 60), hi: num(hi / 60) });
}
const fmtCount = ([a, b]: [number, number]) => (a === b ? String(a) : `${a}–${b}`);

/** Pick a date or time with the system picker (Android). */
function pick(mode: "date" | "time", value: number, done: (ms: number) => void, max?: number) {
  if (Platform.OS !== "android") return;
  DateTimePickerAndroid.open({
    value: new Date(value),
    mode,
    maximumDate: max != null ? new Date(max) : undefined,
    onChange: (e, d) => { if (e.type === "set" && d) done(d.getTime()); },
  });
}
export function pickBirthday(current: string | null, done: (ymd: string) => void) {
  const now = Date.now();
  const start = current ? new Date(current + "T12:00:00").getTime() : now - 90 * 24 * 3600_000;
  pick("date", start, (ms) => {
    const d = new Date(ms);
    done(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
  }, now);
}

/* ---------- next nap card ---------- */

export function NapCard({ big }: { big?: boolean }) {
  const t = useT();
  const { s, set } = useSleep();
  const mon = useMonitor();
  const { state, fellAsleep, wokeUp, sleeps, fromSound, undoSound } = useNaps();
  const [sheet, setSheet] = useState<ManualSleep | "new" | null>(null);
  const [guide, setGuide] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [, setTick] = useState(0);
  useEffect(() => { const id = setInterval(() => setTick((x) => x + 1), 30_000); return () => clearInterval(id); }, []);
  const now = Date.now(); // read on every render, so a sleep that just ended never shows as in the future
  const name = babyLabel(mon.m.babyName);
  const months = ageMonths(s.birthday, now);

  let late = false;
  let head: string, value: string, line: string | null = null, progress: number | null = null, sweet: [number, number] | null = null;
  if (state.asleep) {
    head = t("nap.isAsleep", { name });
    value = fmtDur(Math.max(0, now - state.since) / MIN);
    line = t("nap.since", { time: fmtClock(state.since) });
  } else {
    head = t("nap.isAwake", { name });
    value = state.awakeSince != null ? fmtDur(Math.max(0, now - state.awakeSince) / MIN) : "–";
    if (state.target && state.sweet && state.awakeSince != null) {
      late = now > state.sweet[1];
      line = late ? t("nap.late", { name }) : t(state.bedtime ? "nap.bedAround" : "nap.around", { time: fmtClock(state.target) });
      const span = state.sweet[1] - state.awakeSince;
      progress = Math.max(0, Math.min(1, (now - state.awakeSince) / span));
      sweet = [(state.sweet[0] - state.awakeSince) / span, 1];
    } else if (!s.birthday) {
      line = t("nap.noBirthday", { name });
    } else if (state.awakeSince == null) {
      line = t("nap.noData", { name });
    }
  }

  const today = sleeps.filter((x) => x.to > new Date(now).setHours(0, 0, 0, 0));
  return (
    <Card style={{ gap: 14, alignItems: "stretch" }}>
      <View style={{ alignItems: "center", gap: 6 }}>
        <Text style={styles.eyebrow}>{head}</Text>
        <Text style={[styles.big, big && { fontSize: 52 }]}>{value}</Text>
        {line && <Text style={[styles.line, late && { color: colors.peach }]}>{line}</Text>}
        {!state.asleep && state.sweet && !late && (
          <Text style={styles.sub}>{t("nap.sweet", { from: fmtClock(state.sweet[0]), to: fmtClock(state.sweet[1]) })}</Text>
        )}
      </View>
      {progress != null && sweet && (
        <View style={styles.track}>
          <View style={[styles.fill, { width: `${progress * 100}%` }]} />
          <View style={[styles.window, { left: `${sweet[0] * 100}%`, right: 0 }]} />
        </View>
      )}
      {!state.asleep && state.personal != null && state.band && (
        <Text style={styles.small}>{t("nap.personal", { name, dur: fmtDur(state.personal) })}</Text>
      )}
      <View style={{ flexDirection: "row", gap: 10 }}>
        <Pressable
          onPress={async () => setNote(state.asleep ? await wokeUp() : await fellAsleep())}
          style={({ pressed }) => [styles.main, state.asleep && { backgroundColor: colors.peach }, pressed && { opacity: 0.85 }]}
          accessibilityRole="button"
        >
          {state.asleep ? <Icon d={SUN} size={20} color={colors.bg} width={2} /> : <SvgXml width={20} height={20} xml={MOON(colors.bg)} />}
          <Text style={styles.mainText}>{state.asleep ? t("nap.wokeUp", { name }) : t("nap.fellAsleep", { name })}</Text>
        </Pressable>
        {months != null ? (
          <Pressable onPress={() => setGuide(true)} style={styles.chip} accessibilityRole="button">
            <Text style={styles.chipText}>{fmtAge(months)}</Text>
          </Pressable>
        ) : (
          <Pressable onPress={() => pickBirthday(null, (birthday) => set({ birthday }))} style={styles.chip} accessibilityRole="button">
            <Text style={styles.chipText}>{t("nap.addBirthday")}</Text>
          </Pressable>
        )}
      </View>
      {note && <Text style={styles.small}>{note}</Text>}
      {state.asleep && fromSound && (
        <Text style={[styles.small, { textAlign: "center" }]}>
          {t("nap.fromSound")} <Text onPress={undoSound} style={{ color: colors.peach, fontFamily: fonts.bodyBold }}>{t("nap.undo")}</Text>
        </Text>
      )}
      <Text style={[styles.small, { textAlign: "center" }]}>
        {t("nap.forgot")} <Text onPress={() => setSheet("new")} style={{ color: colors.peach, fontFamily: fonts.bodyBold }}>{t("nap.addSleep")}</Text>
      </Text>

      {big && today.length > 0 && (
        <View style={{ gap: 2 }}>
          <Label right={<Text style={styles.small}>{t("nap.todaySum", { dur: fmtDur(today.reduce((a, x) => a + (Math.min(x.to, now) - Math.max(x.from, new Date(now).setHours(0, 0, 0, 0))) / MIN, 0)) })}</Text>}>{t("nap.today")}</Label>
          {today.slice().reverse().map((x, i) => <SleepRow key={i} sl={x} onPress={x.logged && x.id ? () => setSheet({ id: x.id!, from: x.from, to: x.to, kind: x.kind, note: x.note }) : undefined} />)}
        </View>
      )}

      <SleepSheet value={sheet} onClose={() => setSheet(null)} />
      <AgeGuide visible={guide} onClose={() => setGuide(false)} />
    </Card>
  );
}

/** One sleep in a list: night/nap, time range, crying. */
export function SleepRow({ sl, dayKey: dk, onPress }: { sl: Sleep; dayKey?: string; onPress?: () => void }) {
  const t = useT();
  const dayName = (ms: number) => new Date(ms).toLocaleDateString(dateLocale(), { weekday: "short" });
  const other = (ms: number) => dk != null && new Date(ms).toISOString().slice(0, 10) !== dk && new Date(ms).toDateString() !== new Date(dk + "T12:00:00").toDateString();
  const body = (
    <View style={styles.row}>
      <View style={[styles.rowIcon, sl.kind === "nap" && { backgroundColor: colors.peach }]}>
        {sl.kind === "night" ? <SvgXml width={16} height={16} xml={MOON(colors.bg)} /> : <Icon d={SUN} size={16} color={colors.bg} width={2} />}
      </View>
      <View style={{ flex: 1, gap: 1 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
          <Text style={styles.rowTitle}>{t(sl.kind === "night" ? "nights.nightSleep" : "nights.nap")}</Text>
          {!sl.logged || sl.cries > 0 ? (
            <Text style={[styles.rowCry, sl.cries === 0 && { color: colors.sage }]}>
              {sl.cries === 0 ? t("nights.noCry") : t("nights.cryShort", { count: sl.cries, dur: fmtDur(sl.cryMin) })}
            </Text>
          ) : null}
        </View>
        <Text style={styles.rowSub} numberOfLines={1}>
          {other(sl.from) ? `${dayName(sl.from)} ` : ""}{fmtClock(sl.from)} – {other(sl.to) ? `${dayName(sl.to)} ` : ""}{fmtClock(sl.to)} · {fmtDur((sl.to - sl.from) / MIN)}
          {sl.note ? ` · ${sl.note}` : ""}
        </Text>
      </View>
      {onPress && <Icon d={ICONS.chevron} size={16} />}
    </View>
  );
  return onPress ? <Pressable onPress={onPress} style={({ pressed }) => pressed && { opacity: 0.6 }}>{body}</Pressable> : body;
}

/* ---------- add / edit a sleep ---------- */

export function SleepSheet({ value, onClose }: { value: ManualSleep | "new" | null; onClose: () => void }) {
  const t = useT();
  const { reload } = useNaps();
  const [from, setFrom] = useState(Date.now() - 60 * MIN);
  const [to, setTo] = useState(Date.now());
  const [kind, setKind] = useState<"night" | "nap" | null>(null);
  const [note, setNote] = useState("");
  useEffect(() => {
    if (value === "new") { const n = Date.now(); setFrom(n - 60 * MIN); setTo(n); setKind(null); setNote(""); }
    else if (value) { setFrom(value.from); setTo(value.to ?? Date.now()); setKind(value.kind ?? null); setNote(value.note ?? ""); }
  }, [value]);
  const shownKind = kind ?? kindOf(from, to);
  const fixTo = (f: number, x: number) => { let v = x; while (v <= f) v += 24 * 3600_000; while (v - f > 24 * 3600_000) v -= 24 * 3600_000; return v; };

  const save = async () => {
    await upsertSleep({ id: value && value !== "new" ? value.id : Math.random().toString(36).slice(2, 10), from, to, kind: kind ?? undefined, note: note.trim() || undefined });
    reload();
    onClose();
  };
  const remove = async () => {
    if (value && value !== "new") await deleteSleep(value.id);
    reload();
    onClose();
  };
  const timeBox = (label: string, ms: number, onPick: (v: number) => void) => (
    <Pressable onPress={() => pick("time", ms, onPick)} style={styles.timeBox} accessibilityRole="button" accessibilityLabel={label}>
      <Text style={styles.timeLabel}>{label}</Text>
      <Text style={styles.timeValue}>{fmtClock(ms)}</Text>
      <Text style={styles.timeDay}>{new Date(ms).toLocaleDateString(dateLocale(), { weekday: "short", day: "numeric", month: "short" })}</Text>
    </Pressable>
  );
  return (
    <Modal visible={value != null} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={styles.sheet}>
        <View style={styles.handle} />
        <Text style={styles.sheetTitle}>{value === "new" ? t("sleep.add") : t("sleep.edit")}</Text>
        <View style={styles.seg}>
          {(["nap", "night"] as const).map((k) => (
            <Pressable key={k} onPress={() => setKind(k)} style={[styles.segItem, shownKind === k && styles.segOn]}>
              <Text style={[styles.segText, shownKind === k && { color: colors.bg }]}>{t(k === "nap" ? "nights.nap" : "nights.nightSleep")}</Text>
            </Pressable>
          ))}
        </View>
        <View style={{ flexDirection: "row", gap: 10 }}>
          {timeBox(t("sleep.from"), from, (v) => { setFrom(v); setTo((x) => fixTo(v, x)); })}
          {timeBox(t("sleep.to"), to, (v) => setTo(fixTo(from, v)))}
        </View>
        <Pressable onPress={() => pick("date", from, (d) => {
          const day = new Date(d), f = new Date(from);
          day.setHours(f.getHours(), f.getMinutes(), 0, 0);
          const nf = day.getTime(); setTo(nf + (to - from)); setFrom(nf);
        }, Date.now())} hitSlop={8}>
          <Text style={styles.link}>{t("sleep.changeDay")}</Text>
        </Pressable>
        <Text style={[styles.small, { textAlign: "center" }]}>{fmtDur((to - from) / MIN)}</Text>
        <TextInput value={note} onChangeText={setNote} placeholder={t("sleep.notePh")} placeholderTextColor={colors.muted} style={styles.input} maxLength={60} />
        <Text style={styles.small}>{t("sleep.synced")}</Text>
        <View style={{ flexDirection: "row", gap: 10 }}>
          {value !== "new" && (
            <Pressable onPress={remove} style={styles.del}><Text style={styles.delText}>{t("sleep.delete")}</Text></Pressable>
          )}
          <Pressable onPress={save} style={[styles.main, { backgroundColor: colors.peach }]}><Text style={styles.mainText}>{t("sleep.save")}</Text></Pressable>
        </View>
      </View>
    </Modal>
  );
}

/* ---------- age guide ---------- */

export function AgeGuide({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const t = useT();
  const { s } = useSleep();
  const mon = useMonitor();
  const months = ageMonths(s.birthday);
  if (months == null) return null;
  const band = bandFor(months);
  const name = babyLabel(mon.m.babyName);
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={[styles.sheet, { maxHeight: "88%" }]}>
        <View style={styles.handle} />
        <ScrollView contentContainerStyle={{ gap: 16 }} showsVerticalScrollIndicator={false}>
          <View style={{ gap: 2 }}>
            <Text style={styles.eyebrowLeft}>{t("age.is", { name, age: fmtAge(months) })}</Text>
            <Text style={styles.sheetTitle}>{t("guide.title")}</Text>
          </View>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <Stat value={fmtWake(band.wake)} label={t("guide.awake")} />
            <Stat value={fmtCount(band.naps)} label={t("guide.naps")} />
            <Stat value={band.total ? t("age.rangeH", { lo: band.total[0], hi: band.total[1] }) : "–"} label={t("guide.total")} />
          </View>
          <View style={{ gap: 8 }}>
            <Text style={styles.h}>{t("guide.cues")}</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {["eyes", "yawn", "stare", "fuss", "ears"].map((c) => <View key={c} style={styles.cue}><Text style={styles.cueText}>{t(`cue.${c}`)}</Text></View>)}
            </View>
          </View>
          <View style={{ gap: 6 }}>
            <Text style={styles.h}>{t("guide.next")}</Text>
            <Text style={styles.p}>{t(`guide.next${band.stage}`)}</Text>
          </View>
          <View style={{ gap: 6 }}>
            <Text style={styles.h}>{t("guide.how")}</Text>
            <Text style={styles.p}>{t("guide.howText", { name })}</Text>
          </View>
          <Text style={styles.small}>{t("guide.note")}</Text>
          <Pressable onPress={onClose} style={[styles.main, { backgroundColor: colors.peach, flex: 0 }]}><Text style={styles.mainText}>{t("guide.ok")}</Text></Pressable>
        </ScrollView>
      </View>
    </Modal>
  );
}
function Stat({ value, label }: { value: string; label: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

/* ---------- typical for this age (Sleep tab) ---------- */

export function TypicalCard({ n }: { n: Night }) {
  const t = useT();
  const { s } = useSleep();
  const [guide, setGuide] = useState(false);
  const months = ageMonths(s.birthday, new Date(n.key + "T12:00:00").getTime());
  if (months == null) return null;
  const band: AgeBand = bandFor(months);
  const sleeps = (n.sleeps ?? []).slice().sort((a, b) => a.from - b.from);
  const naps = sleeps.filter((x) => x.kind === "nap" && new Date(x.from).toDateString() === new Date(n.key + "T12:00:00").toDateString()).length;
  let longest = 0;
  for (let i = 1; i < sleeps.length; i++) {
    const gap = (sleeps[i].from - sleeps[i - 1].to) / MIN;
    const h = new Date(sleeps[i - 1].to).getHours();
    if (h >= 5 && h < 21 && gap > longest && gap < 12 * 60) longest = gap;
  }
  const slept = (n.sleptMin ?? n.listenedMin) / 60;
  const isToday = new Date().toDateString() === new Date(n.key + "T12:00:00").toDateString();
  const status = (v: number, [lo, hi]: [number, number]) => (isToday && v < hi ? "soFar" : v < lo ? "low" : v > hi ? "high" : "ok");
  return (
    <Card style={{ gap: 14 }}>
      <Label right={<Pressable onPress={() => setGuide(true)} hitSlop={8}><Text style={styles.link}>{t("typ.about")}</Text></Pressable>}>
        {t("typ.title", { age: fmtAge(months) })}
      </Label>
      {band.total && (
        <Meter label={t("typ.total")} value={fmtDur(slept * 60)} frac={Math.min(1, slept / 18)} range={[band.total[0] / 18, band.total[1] / 18]}
          left={t("typ.totalUsual", { range: t("age.rangeH", { lo: band.total[0], hi: band.total[1] }) })}
          right={t(`typ.${status(slept, band.total)}`)} warn={!["ok", "soFar"].includes(status(slept, band.total))} />
      )}
      <View style={{ gap: 6 }}>
        <View style={styles.meterHead}><Text style={styles.rowTitle}>{t("typ.naps")}</Text><Text style={styles.rowTitle}>{naps}</Text></View>
        <View style={{ flexDirection: "row", gap: 6 }}>
          {Array.from({ length: Math.max(band.naps[1], naps, 1) }, (_, i) => (
            <View key={i} style={[styles.napPip, i < naps && { backgroundColor: colors.sage }, i >= band.naps[1] && { borderStyle: "dashed" }]} />
          ))}
        </View>
        <Text style={styles.small}>{t("typ.napsUsual", { range: fmtCount(band.naps) })}</Text>
      </View>
      {longest > 0 && (
        <Meter label={t("typ.awake")} value={fmtDur(longest)} frac={Math.min(1, longest / (band.wake[1] * 1.6))} range={[band.wake[0] / (band.wake[1] * 1.6), 1 / 1.6]}
          left={t("typ.awakeUsual", { range: fmtWake(band.wake) })}
          right={longest > band.wake[1] * 1.1 ? t("typ.long") : t("typ.ok")} warn={longest > band.wake[1] * 1.1} />
      )}
      <AgeGuide visible={guide} onClose={() => setGuide(false)} />
    </Card>
  );
}
function Meter({ label, value, frac, range, left, right, warn }: { label: string; value: string; frac: number; range: [number, number]; left: string; right: string; warn?: boolean }) {
  return (
    <View style={{ gap: 6 }}>
      <View style={styles.meterHead}><Text style={styles.rowTitle}>{label}</Text><Text style={[styles.rowTitle, warn && { color: colors.peach }]}>{value}</Text></View>
      <View style={styles.meterTrack}>
        <View style={[styles.meterRange, { left: `${range[0] * 100}%`, width: `${(range[1] - range[0]) * 100}%` }]} />
        <View style={[styles.meterDot, { left: `${frac * 100}%` }, warn && { backgroundColor: colors.peach }]} />
      </View>
      <View style={styles.meterHead}><Text style={styles.small}>{left}</Text><Text style={styles.small}>{right}</Text></View>
    </View>
  );
}

const styles = StyleSheet.create({
  eyebrow: { fontFamily: fonts.bodyBold, fontSize: 12.5, letterSpacing: 0.6, textTransform: "uppercase", color: colors.muted },
  eyebrowLeft: { fontFamily: fonts.bodyBold, fontSize: 12.5, letterSpacing: 0.6, textTransform: "uppercase", color: colors.muted },
  big: { fontFamily: fonts.display, fontSize: 42, color: colors.cream, fontVariant: ["tabular-nums"] },
  line: { fontFamily: fonts.bodyBold, fontSize: 16, color: colors.cream, textAlign: "center" },
  sub: { fontFamily: fonts.body, fontSize: 14, color: colors.muted, textAlign: "center" },
  small: { fontFamily: fonts.body, fontSize: 13, lineHeight: 19, color: colors.muted },
  track: { height: 10, borderRadius: 99, backgroundColor: colors.card2 },
  fill: { position: "absolute", left: 0, top: 0, bottom: 0, borderRadius: 99, backgroundColor: colors.sage },
  window: { position: "absolute", top: -3, bottom: -3, borderRadius: 99, borderWidth: 2, borderColor: colors.peach, backgroundColor: "rgba(255,214,140,0.3)" },
  main: { flex: 1, minHeight: 54, borderRadius: 99, backgroundColor: colors.moon, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, paddingHorizontal: 16 },
  mainText: { fontFamily: fonts.bodyBold, fontSize: 16, color: colors.bg },
  chip: { minHeight: 54, borderRadius: 99, paddingHorizontal: 12, alignItems: "center", justifyContent: "center" },
  chipText: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.cream },
  link: { fontFamily: fonts.bodyBold, fontSize: 13.5, color: colors.peach },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 8 },
  rowIcon: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.moon, alignItems: "center", justifyContent: "center" },
  rowTitle: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.cream },
  rowSub: { fontFamily: fonts.body, fontSize: 13, color: colors.muted, fontVariant: ["tabular-nums"] },
  rowCry: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.rose },
  backdrop: { flex: 1, backgroundColor: "rgba(14,10,36,0.6)" },
  sheet: { backgroundColor: colors.card, borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 22, paddingBottom: 30, paddingTop: 10, gap: 14 },
  handle: { alignSelf: "center", width: 40, height: 4, borderRadius: 2, backgroundColor: "#4a3f86" },
  sheetTitle: { fontFamily: fonts.display, fontSize: 24, color: colors.cream },
  seg: { flexDirection: "row", backgroundColor: colors.card2, borderRadius: 99, padding: 4 },
  segItem: { flex: 1, alignItems: "center", paddingVertical: 10, borderRadius: 99 },
  segOn: { backgroundColor: colors.peach },
  segText: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.muted },
  timeBox: { flex: 1, backgroundColor: "rgba(247,241,255,0.05)", borderRadius: 18, padding: 14, gap: 2 },
  timeLabel: { fontFamily: fonts.bodyBold, fontSize: 12.5, color: colors.muted },
  timeValue: { fontFamily: fonts.display, fontSize: 26, color: colors.cream, fontVariant: ["tabular-nums"] },
  timeDay: { fontFamily: fonts.body, fontSize: 12.5, color: colors.muted },
  input: { minHeight: 46, borderRadius: 14, backgroundColor: colors.card2, color: colors.cream, fontFamily: fonts.body, fontSize: 15, paddingHorizontal: 14 },
  del: { minHeight: 54, borderRadius: 99, backgroundColor: colors.card2, paddingHorizontal: 20, alignItems: "center", justifyContent: "center" },
  delText: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.rose },
  stat: { flex: 1, paddingVertical: 4, gap: 2 },
  statValue: { fontFamily: fonts.display, fontSize: 19, color: colors.cream },
  statLabel: { fontFamily: fonts.body, fontSize: 12, color: colors.muted },
  h: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.cream },
  p: { fontFamily: fonts.body, fontSize: 14, lineHeight: 21, color: "#d9d2f5" },
  cue: { backgroundColor: colors.card2, borderRadius: 99, paddingHorizontal: 12, paddingVertical: 8 },
  cueText: { fontFamily: fonts.bodyBold, fontSize: 13.5, color: colors.cream },
  meterHead: { flexDirection: "row", justifyContent: "space-between", gap: 8 },
  meterTrack: { height: 10, borderRadius: 99, backgroundColor: colors.card2 },
  meterRange: { position: "absolute", top: 0, bottom: 0, borderRadius: 99, backgroundColor: "rgba(158,230,196,0.3)" },
  meterDot: { position: "absolute", top: -3, width: 16, height: 16, marginLeft: -8, borderRadius: 8, backgroundColor: colors.sage, borderWidth: 2, borderColor: colors.card },
  napPip: { flex: 1, height: 10, borderRadius: 99, backgroundColor: colors.card2, borderWidth: 1, borderColor: "#5a4e96" },
});
