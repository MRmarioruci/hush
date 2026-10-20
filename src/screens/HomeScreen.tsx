import { useEffect, useRef, useState } from "react";
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import Svg, { Circle } from "react-native-svg";
import { SvgXml } from "react-native-svg";
import { DateTimePickerAndroid } from "@react-native-community/datetimepicker";
import { colors, fonts } from "../theme";
import { SOUNDS } from "../sounds";
import { Moon } from "../components/Moon";
import { MoonFace } from "../components/MoonFace";
import { Ring } from "../components/Ring";
import { ICONS, Icon, Screen } from "../components/ui";
import { fmtLeft, useSleep } from "../state/sleep";
import { useMonitor } from "../state/monitor";
import { useNaps } from "../state/naps";
import { fmtClock, fmtDur } from "../nights";
import { fmtTime, useT, babyLabel, dateLocale } from "../i18n";
import { AgeGuide, SleepSheet, SUN } from "../components/Naps";
import { stopLine } from "../stops";
import { roomCmd } from "./MonitorScreen";
import { WidgetNudge } from "../components/WidgetNudge";
import type { ManualSleep } from "../nights";

const MIN = 60_000;
const MOON_ICON = '<path d="M15.5 4.2a7.5 7.5 0 1 0 4.3 11.6A6 6 0 0 1 15.5 4.2z"/>';

export function HomeScreen() {
  const nav = useNavigation<{ navigate: (n: string) => void }>();
  const sleep = useSleep();
  const mon = useMonitor();
  const naps = useNaps();
  const t = useT();
  const f = sleep.s.features;
  const [note, setNote] = useState<string | null>(null);
  const [sheet, setSheet] = useState<ManualSleep | "new" | null>(null);
  const [guide, setGuide] = useState(false);
  const [, tick] = useState(0);
  useEffect(() => { const id = setInterval(() => tick((x) => x + 1), 30_000); return () => clearInterval(id); }, []);
  // Watching another room: ask how it is when Home opens.
  useEffect(() => { if (mon.role === "parent" && mon.target) roomCmd(mon.target, "status"); }, [mon.role, mon.target]); // eslint-disable-line react-hooks/exhaustive-deps
  const soundScroll = useRef<ScrollView>(null);
  const baby = mon.m.babyName.trim();
  const name = babyLabel(mon.m.babyName);

  const timerProgress = sleep.timerLeft != null && sleep.s.timer ? sleep.timerLeft / (sleep.s.timer * MIN) : null;

  const now = Date.now();
  const st = naps.state;
  const stale = naps.stale;

  return (
    <Screen
      title={baby || "hush"}
      right={
        <Pressable onPress={() => nav.navigate("Settings")} hitSlop={12} style={styles.gear} accessibilityLabel={t("home.settings")}>
          <Icon d={ICONS.gear} size={22} color={colors.cream} />
        </Pressable>
      }
    >
      {/* ---- the moon: white noise ---- */}
      {f.sounds && (
        <View style={{ alignItems: "center" }}>
          <View>
            <Moon size={176} playing={sleep.playing} beat={sleep.beat} softBeat={sleep.soundId === "womb" && sleep.beat % 2 === 1} slow={sleep.soundId === "ocean"} still={sleep.still} onPress={sleep.toggle} />
            {timerProgress != null && (
              <Svg width={264} height={264} style={StyleSheet.absoluteFill} pointerEvents="none">
                <Circle cx={132} cy={132} r={102} stroke={colors.peach} strokeWidth={5} fill="none" strokeLinecap="round"
                  strokeDasharray={`${2 * Math.PI * 102} ${2 * Math.PI * 102}`} strokeDashoffset={2 * Math.PI * 102 * (1 - timerProgress)} transform="rotate(-90 132 132)" />
              </Svg>
            )}
          </View>
          <Text style={styles.name}>{t(`sound.${sleep.soundId}`)}{sleep.playing && sleep.timerLeft != null ? ` · ${t("home.leftShort", { time: fmtLeft(sleep.timerLeft) })}` : ""}</Text>
          {!sleep.playing && sleep.lastStop && <Text style={styles.sub}>{stopLine(sleep.lastStop, t, fmtTime)}</Text>}

          <ScrollView ref={soundScroll} horizontal showsHorizontalScrollIndicator={false} style={styles.soundScroll} contentContainerStyle={styles.soundRow}
            onLayout={() => soundScroll.current?.scrollTo({ x: Math.max(0, SOUNDS.findIndex((x) => x.id === sleep.soundId) - 2) * 58, animated: false })}>
            {SOUNDS.map((x) => {
              const on = x.id === sleep.soundId;
              return (
                <Pressable key={x.id} onPress={() => sleep.set({ sound: x.id })} style={[styles.soundIcon, on && { backgroundColor: colors.peach }]} accessibilityLabel={t(`sound.${x.id}`)} accessibilityState={{ selected: on }}>
                  <SvgXml width={22} height={22} xml={`<svg viewBox="0 0 24 24" fill="none" stroke="${on ? colors.bg : colors.muted}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${x.icon}</svg>`} />
                </Pressable>
              );
            })}
          </ScrollView>

        </View>
      )}

      {/* ---- three rings: sleep, next nap, the baby's room ---- */}
      {(f.naps || f.monitor) && (
        <View style={styles.orbs}>
          {f.naps && (st.asleep ? (
            stale ? <Orb big="?" label={t("orb.asleepQ")} color={colors.peach} progress={0} onPress={() => nav.navigate("Sleep")} /> :
            <Orb big={fmtDur(Math.max(0, now - st.since) / MIN)} label={t("orb.asleep")} color={colors.sage} progress={(now - st.since) / (90 * MIN)} onPress={() => nav.navigate("Sleep")} />
          ) : (
            <Orb big={st.awakeSince != null ? fmtDur(Math.max(0, now - st.awakeSince) / MIN) : "–"} label={t("orb.awake")} color={colors.peach}
              progress={st.awakeSince != null && st.sweet ? (now - st.awakeSince) / (st.sweet[1] - st.awakeSince) : 0} onPress={() => nav.navigate("Sleep")} />
          ))}
          {f.naps && (st.asleep ? (
            <Orb big={fmtClock(st.since)} label={t("orb.since")} color="#c9bfff" progress={1} small onPress={() => setGuide(true)} />
          ) : (
            <Orb big={st.target ? fmtClock(st.target) : "–"} label={st.asleep ? "" : t(st.bedtime ? "orb.bedtime" : "orb.nextNap")} color={colors.peach} small
              progress={st.awakeSince != null && st.sweet ? (now - st.awakeSince) / (st.sweet[1] - st.awakeSince) : 0} onPress={() => setGuide(true)} />
          ))}
          {f.monitor && <RoomOrb onPress={() => nav.navigate("Monitor")} />}
        </View>
      )}

      {/* ---- a gentle question when a sleep has gone on too long ---- */}
      {f.naps && stale && <StillAsleep since={stale.since} guess={stale.guess} name={name} onPick={(at) => naps.wokeAt(at)} onYes={naps.stillAsleep} />}

      {/* ---- one button ---- */}
      {f.naps && !stale && (
        <View style={{ alignItems: "center", gap: 10 }}>
          <Pressable onPress={async () => setNote(st.asleep ? await naps.wokeUp() : await naps.fellAsleep())} style={({ pressed }) => [styles.main, pressed && { transform: [{ scale: 0.97 }] }]} accessibilityRole="button">
            {st.asleep ? <Icon d={SUN} size={20} color={colors.bg} width={2} /> : <Icon d={MOON_ICON} size={20} color={colors.bg} width={2} />}
            <Text style={styles.mainText}>{st.asleep ? t("nap.wokeUp", { name }) : t("nap.fellAsleep", { name })}</Text>
          </Pressable>
          {st.asleep && naps.fromSound ? (
            <Text style={styles.small}>{t("nap.fromSound")} <Text onPress={naps.undoSound} style={styles.link}>{t("nap.undo")}</Text></Text>
          ) : naps.endedBySound ? (
            <Text style={styles.small}>{t("nap.endedBySound")} <Text onPress={naps.undoEnd} style={styles.link}>{t("nap.undo")}</Text></Text>
          ) : (
            <Text onPress={() => setSheet("new")} style={styles.link}>{t("nap.addSleep")}</Text>
          )}
          {note && <Text style={styles.small}>{note}</Text>}
        </View>
      )}

      <WidgetNudge name={name} />

      <SleepSheet value={sheet} onClose={() => setSheet(null)} />
      <AgeGuide visible={guide} onClose={() => setGuide(false)} />
    </Screen>
  );
}

function Orb({ big, label, color, progress, onPress, small }: { big: string; label: string; color: string; progress: number; onPress?: () => void; small?: boolean }) {
  return (
    <View style={styles.orb}>
      <Ring size={98} stroke={5} progress={progress} color={color} onPress={onPress} label={`${label} ${big}`}>
        <Text style={[styles.orbBig, { color }, small && { fontSize: 15 }]} numberOfLines={1} adjustsFontSizeToFit>{big}</Text>
      </Ring>
      <Text style={styles.orbLabel} numberOfLines={1}>{label}</Text>
    </View>
  );
}

/** The baby's room at a glance: this phone listening, another room, or not set up. */
function RoomOrb({ onPress }: { onPress: () => void }) {
  const mon = useMonitor();
  const t = useT();
  let big: string, color: string, on = true;
  if (mon.listening) {
    big = mon.status.crying ? t("orb.cryingShort") : t("orb.listening");
    color = mon.status.crying ? colors.rose : colors.sage;
  } else if (mon.room) {
    const fresh = Date.now() - (mon.room.got ?? mon.room.at) < 30 * MIN;
    on = mon.room.listening && fresh;
    big = on ? t("orb.quiet") : t("orb.off");
    color = on ? colors.sage : colors.muted;
  } else {
    big = mon.members.length ? t("orb.off") : t("orb.setUp");
    color = colors.muted;
    on = false;
  }
  return <Orb big={big} label={t("orb.room")} color={color} progress={on ? 1 : 0} small onPress={onPress} />;
}

/** A sleep that can't still be going on: ask, with a guess of when it ended. */
function StillAsleep({ since, guess, name, onPick, onYes }: { since: number; guess: number | null; name: string; onPick: (at: number) => void; onYes: () => void }) {
  const t = useT();
  const pick = () => {
    if (Platform.OS !== "android") { onPick(guess ?? Date.now()); return; }
    DateTimePickerAndroid.open({
      value: new Date(guess ?? Date.now()),
      mode: "time",
      onChange: (e, d) => {
        if (e.type !== "set" || !d) return;
        // The time picked is the latest such time after the sleep began (and not in the future).
        let at = d.getTime();
        while (at > Date.now()) at -= 24 * 3600_000;
        if (at < since) at = Date.now();
        onPick(at);
      },
    });
  };
  const when = new Date(since).toDateString() === new Date().toDateString() ? fmtClock(since) : `${new Date(since).toLocaleDateString(dateLocale(), { weekday: "short" })} ${fmtClock(since)}`;
  return (
    <View style={styles.nudge}>
      <View style={styles.nudgeHead}>
        <MoonFace size={46} awake />
        <View style={{ flex: 1 }}>
          <Text style={styles.nudgeTitle}>{t("still.title", { name })}</Text>
          <Text style={styles.nudgeSub}>{t("still.since", { time: when })}</Text>
        </View>
      </View>
      <View style={styles.nudgeBtns}>
        <Pressable onPress={guess ? () => onPick(guess) : pick} style={[styles.nudgeBtn, { backgroundColor: colors.peach }]} accessibilityRole="button">
          <Text style={[styles.nudgeBtnText, { color: colors.bg }]}>{guess ? t("still.wokeAt", { time: fmtClock(guess) }) : t("still.wokeUp")}</Text>
        </Pressable>
        {guess && <Pressable onPress={pick} style={styles.nudgeBtn} accessibilityRole="button"><Text style={styles.nudgeBtnText}>{t("still.other")}</Text></Pressable>}
        <Pressable onPress={onYes} style={styles.nudgeBtn} accessibilityRole="button"><Text style={styles.nudgeBtnText}>{t("still.yes")}</Text></Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  gear: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.card, alignItems: "center", justifyContent: "center", marginBottom: 2 },
  name: { fontFamily: fonts.display, fontSize: 22, color: colors.cream, marginTop: -10 },
  sub: { fontFamily: fonts.body, fontSize: 13, color: colors.muted, marginTop: 2 },
  small: { fontFamily: fonts.body, fontSize: 13, color: colors.muted, textAlign: "center" },
  link: { fontFamily: fonts.bodyBold, fontSize: 13.5, color: colors.peach },
  soundScroll: { alignSelf: "stretch", marginHorizontal: -20, flexGrow: 0, marginTop: 14 },
  soundRow: { flexDirection: "row", gap: 10, paddingHorizontal: 20 },
  soundIcon: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.card, alignItems: "center", justifyContent: "center" },
  quickRow: { flexDirection: "row", gap: 8, alignSelf: "stretch", marginTop: 6 },
  quick: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 8 },
  quickText: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.cream, fontVariant: ["tabular-nums"] },
  levelDot: { width: 8, height: 8, borderRadius: 4 },
  orbs: { flexDirection: "row", justifyContent: "space-around" },
  orb: { alignItems: "center", gap: 7, width: 104 },
  orbBig: { fontFamily: fonts.displayBold, fontSize: 18, paddingHorizontal: 10, fontVariant: ["tabular-nums"] },
  orbLabel: { fontFamily: fonts.bodyBold, fontSize: 12.5, color: colors.muted },
  main: { flexDirection: "row", alignItems: "center", gap: 9, backgroundColor: colors.peach, borderRadius: 99, paddingHorizontal: 26, minHeight: 54 },
  mainText: { fontFamily: fonts.bodyBold, fontSize: 16, color: colors.bg },
  second: { flex: 1, minHeight: 52, borderRadius: 99, backgroundColor: colors.card, alignItems: "center", justifyContent: "center" },
  secondText: { fontFamily: fonts.bodyBold, fontSize: 14.5, color: colors.cream },
  nudge: { backgroundColor: colors.card, borderRadius: 24, padding: 14, gap: 12 },
  nudgeHead: { flexDirection: "row", alignItems: "center", gap: 12 },
  nudgeTitle: { fontFamily: fonts.bodyBold, fontSize: 15.5, color: colors.cream },
  nudgeSub: { fontFamily: fonts.body, fontSize: 13, color: colors.muted, marginTop: 1 },
  nudgeBtns: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  nudgeBtn: { minHeight: 40, paddingHorizontal: 14, borderRadius: 20, backgroundColor: colors.card2, alignItems: "center", justifyContent: "center", flexGrow: 1 },
  nudgeBtnText: { fontFamily: fonts.bodyBold, fontSize: 13.5, color: colors.cream },
  stillTitle: { fontFamily: fonts.displayBold, fontSize: 26, color: colors.cream },
  stillSub: { fontFamily: fonts.body, fontSize: 14.5, color: colors.muted, textAlign: "center", paddingHorizontal: 20, marginTop: -6 },
});
