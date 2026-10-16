import { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Switch, Text, View, ScrollView } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { SvgXml } from "react-native-svg";
import { colors, fonts } from "../theme";
import { SOUNDS } from "../sounds";
import { ROOM_M } from "../safety";
import { Moon } from "../components/Moon";
import { Card, ICONS, Icon, Screen } from "../components/ui";
import { TIMERS, fmtLeft, fmtMinDist, useSleep } from "../state/sleep";
import { useMonitor } from "../state/monitor";
import { fmtTime, useT, babyLabel } from "../i18n";
import { NapCard } from "../components/Naps";
import { stopLine } from "../stops";
import { roomCmd } from "./MonitorScreen";
import { ListenButton } from "../components/Listen";

const greetingKey = () => {
  const h = new Date().getHours();
  return h < 5 ? "greet.late" : h < 12 ? "greet.morning" : h < 18 ? "greet.afternoon" : "greet.evening";
};

export function HomeScreen() {
  const nav = useNavigation<{ navigate: (n: string) => void }>();
  const sleep = useSleep();
  const mon = useMonitor();
  const [note, setNote] = useState<string | null>(null);
  const [asked, setAsked] = useState(0);
  // Parent's phone: ask the baby's phone how the room is when Home opens.
  useEffect(() => { if (mon.m.role === "parent" && mon.m.pairedToken) roomCmd(mon.m.pairedToken, "status"); }, [mon.m.role, mon.m.pairedToken]); // eslint-disable-line react-hooks/exhaustive-deps
  const soundScroll = useRef<ScrollView>(null);
  const t = useT();
  const f = sleep.s.features;

  const timerIdx = Math.max(0, TIMERS.findIndex(([m]) => m === sleep.s.timer));
  const nextTimer = () => sleep.setTimer(TIMERS[(timerIdx + 1) % TIMERS.length][0]);
  const timerText = sleep.timerLeft != null
    ? t("home.stopsIn", { time: fmtLeft(sleep.timerLeft) })
    : sleep.s.timer ? t("home.stopAfter", { time: t(`timer.${TIMERS[timerIdx][0]}`) }) : t("home.noTimer");

  const crying = !!mon.status.crying;
  const monState = !mon.listening
    ? { color: colors.card2 }
    : crying
      ? { color: colors.rose }
      : { color: colors.sage };
  const parents = mon.m.parents.length;

  return (
    <Screen
      eyebrow={t(greetingKey())}
      title={mon.m.babyName.trim() ? t("home.family", { name: mon.m.babyName.trim() }) : "hush"}
      right={
        <Pressable onPress={() => nav.navigate("Settings")} hitSlop={12} style={styles.gear} accessibilityLabel={t("home.settings")}>
          <Icon d={ICONS.gear} size={22} color={colors.cream} />
        </Pressable>
      }
    >
      {/* ---- next nap ---- */}
      {f.naps && !f.sounds && <NapCard big />}

      {/* ---- white noise ---- */}
      {f.sounds && <Card style={{ alignItems: "center", paddingTop: 8 }}>
        <Moon
          size={150}
          playing={sleep.playing}
          beat={sleep.beat}
          softBeat={sleep.soundId === "womb" && sleep.beat % 2 === 1}
          slow={sleep.soundId === "ocean"}
          still={sleep.still}
          onPress={sleep.toggle}
        />
        <View style={{ alignItems: "center", gap: 2, marginTop: -6 }}>
          <Text style={styles.name}>{t(`sound.${sleep.soundId}`)}</Text>
          <Text style={styles.sub}>{sleep.playing ? t("home.playing") : stopLine(sleep.lastStop, t, fmtTime) ?? t("home.tapMoon")}</Text>
        </View>

        <ScrollView ref={soundScroll} horizontal showsHorizontalScrollIndicator={false} style={styles.soundScroll} contentContainerStyle={styles.soundRow}
          onLayout={() => soundScroll.current?.scrollTo({ x: Math.max(0, SOUNDS.findIndex((x) => x.id === sleep.soundId) - 2) * 62, animated: false })}>
          {SOUNDS.map((x) => {
            const on = x.id === sleep.soundId;
            return (
              <Pressable key={x.id} onPress={() => sleep.set({ sound: x.id })} style={styles.soundItem} accessibilityLabel={t(`sound.${x.id}`)}>
                <View style={[styles.soundIcon, on && { backgroundColor: colors.peach }]}>
                  <SvgXml
                    width={22}
                    height={22}
                    xml={`<svg viewBox="0 0 24 24" fill="none" stroke="${on ? colors.bg : colors.muted}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${x.icon}</svg>`}
                  />
                </View>
                <Text style={[styles.soundName, on && { color: colors.cream }]} numberOfLines={1}>{t(`sound.${x.id}`)}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        <View style={styles.quickRow}>
          <Pressable onPress={nextTimer} style={styles.quick}>
            <Icon d={ICONS.timer} size={18} />
            <Text style={styles.quickText}>{timerText}</Text>
          </Pressable>
          <Pressable onPress={() => nav.navigate("Sounds")} style={styles.quick}>
            <View style={[styles.levelDot, { backgroundColor: sleep.safeDist == null ? colors.muted : sleep.safeDist > ROOM_M ? colors.rose : sleep.safeDist > 2 ? colors.peach : colors.sage }]} />
            <Text style={styles.quickText} numberOfLines={1}>
              {sleep.safeDist == null ? t("home.volumeOff") : t("home.placeAt", { dist: fmtMinDist(sleep.safeDist, sleep.s.unit) })}
            </Text>
          </Pressable>
        </View>
      </Card>}

      {f.naps && f.sounds && <NapCard />}

      {/* ---- baby monitor: what it shows depends on this phone's role ---- */}
      {f.monitor && <Pressable onPress={() => nav.navigate("Monitor")}>
        <Card>
          <View style={styles.monHead}>
            <View style={[styles.monIcon, mon.m.role === "parent" && { backgroundColor: colors.peach }, mon.listening && { backgroundColor: monState.color }]}>
              <Icon
                d={mon.m.role === "parent" ? ICONS.bell : mon.m.role === "nursery" ? ICONS.crib : ICONS.monitor}
                size={22}
                color={mon.listening || mon.m.role === "parent" ? colors.bg : colors.muted}
              />
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={styles.monTitle}>
                {mon.m.role === "nursery" ? (mon.listening ? t("home.listeningFor", { name: mon.baby }) : t("home.babyMonitor")) : mon.m.role === "parent" ? t("home.cryAlerts") : t("home.babyMonitor")}
              </Text>
              <Text style={styles.sub}>
                {mon.m.role == null
                  ? t("home.useSecond")
                  : mon.m.role === "parent"
                    ? mon.m.pairedWith != null ? t("home.onConnected", { name: babyLabel(mon.m.pairedWith) }) : t("home.notConnected")
                    : !parents ? t("home.connectFirst")
                    : mon.listening ? (crying ? t("orb.crying", { name: mon.baby }) : mon.lastCry ? t("nursery.lastAlert", { time: fmtTime(mon.lastCry) }) : t("nursery.quiet"))
                    : t("home.off")}
              </Text>
            </View>
            {mon.m.role === "nursery" && parents > 0 ? (
              <Switch
                value={mon.listening}
                onValueChange={async () => setNote(await mon.toggleListening())}
                trackColor={{ false: colors.card2, true: colors.sage }}
                thumbColor={colors.cream}
                accessibilityLabel={t("orb.a11y")}
              />
            ) : (
              <Icon d={ICONS.chevron} size={20} />
            )}
          </View>
          {mon.m.role === "parent" && mon.m.pairedToken && (
            <View style={styles.remote}>
              <Pressable
                onPress={() => { setAsked(Date.now()); roomCmd(mon.m.pairedToken!, mon.m.room?.playing ? "stop" : "play"); }}
                style={[styles.remoteBtn, mon.m.room?.playing && { backgroundColor: colors.peach }]}
                accessibilityRole="button"
                accessibilityLabel={mon.m.room?.playing ? t("remote.stop") : t("remote.play")}
              >
                <Icon d={mon.m.room?.playing ? '<rect x="7" y="6" width="3.5" height="12" rx="1"/><rect x="13.5" y="6" width="3.5" height="12" rx="1"/>' : '<path d="M8 5.5v13l11-6.5z"/>'} size={20} color={mon.m.room?.playing ? colors.bg : colors.cream} width={2} />
              </Pressable>
              <Text style={styles.remoteText} numberOfLines={1}>
                {asked && (!mon.m.room || mon.m.room.at < asked) && Date.now() - asked < 15000
                  ? t("remote.waiting")
                  : !mon.m.room ? t("remote.unknown")
                  : mon.m.room.playing ? t("remote.playing", { sound: t(`sound.${mon.m.room.sound}`) }) : t("remote.off")}
              </Text>
            </View>
          )}
          {mon.m.role === "parent" && mon.m.pairedToken && <View style={{ marginTop: 10 }}><ListenButton /></View>}
          {note && <Text style={styles.note}>{note}</Text>}
        </Card>
      </Pressable>}
    </Screen>
  );
}

const styles = StyleSheet.create({
  gear: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.card, alignItems: "center", justifyContent: "center", marginBottom: 2 },
  name: { fontFamily: fonts.display, fontSize: 22, color: colors.cream },
  sub: { fontFamily: fonts.body, fontSize: 13.5, color: colors.muted, fontVariant: ["tabular-nums"] },
  small: { fontFamily: fonts.body, fontSize: 12.5, color: colors.muted },
  soundScroll: { alignSelf: "stretch", marginHorizontal: -18, flexGrow: 0 },
  soundRow: { flexDirection: "row", gap: 6, paddingTop: 6, paddingHorizontal: 14 },
  soundItem: { alignItems: "center", gap: 5, width: 56 },
  soundIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.card2, alignItems: "center", justifyContent: "center" },
  soundName: { fontFamily: fonts.bodyBold, fontSize: 11.5, color: colors.muted },
  quickRow: { flexDirection: "row", gap: 8, alignSelf: "stretch" },
  quick: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: colors.card2, borderRadius: 14, paddingVertical: 10, paddingHorizontal: 8 },
  quickText: { fontFamily: fonts.bodyBold, fontSize: 12.5, color: colors.cream, fontVariant: ["tabular-nums"] },
  levelDot: { width: 8, height: 8, borderRadius: 4 },
  monHead: { flexDirection: "row", alignItems: "center", gap: 12 },
  monIcon: { width: 44, height: 44, borderRadius: 14, backgroundColor: colors.card2, alignItems: "center", justifyContent: "center" },
  remote: { flexDirection: "row", alignItems: "center", gap: 12, marginTop: 12, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "#3a3352" },
  remoteBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.card2, alignItems: "center", justifyContent: "center" },
  remoteText: { flex: 1, fontFamily: fonts.bodyBold, fontSize: 14, color: colors.cream },
  monTitle: { fontFamily: fonts.display, fontSize: 18, color: colors.cream },
  monFoot: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  note: { fontFamily: fonts.body, fontSize: 13, lineHeight: 19, color: colors.cream },
  link: { flexDirection: "row", alignItems: "center", gap: 4, alignSelf: "flex-start" },
  linkText: { fontFamily: fonts.bodyBold, fontSize: 13.5, color: colors.peach },
});
