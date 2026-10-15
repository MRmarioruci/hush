import { useState } from "react";
import { Pressable, StyleSheet, Switch, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { SvgXml } from "react-native-svg";
import { colors, fonts } from "../theme";
import { SOUNDS } from "../sounds";
import { LIMIT_DB } from "../safety";
import { Moon } from "../components/Moon";
import { Card, ICONS, Icon, Pill, Screen } from "../components/ui";
import { TIMERS, fmtLeft, useSleep } from "../state/sleep";
import { useMonitor } from "../state/monitor";

const greeting = () => {
  const h = new Date().getHours();
  return h < 5 ? "Late night" : h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
};
const fmtTime = (t: number) => new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

export function HomeScreen() {
  const nav = useNavigation<{ navigate: (n: string) => void }>();
  const sleep = useSleep();
  const mon = useMonitor();
  const [note, setNote] = useState<string | null>(null);

  const timerIdx = Math.max(0, TIMERS.findIndex(([m]) => m === sleep.s.timer));
  const nextTimer = () => sleep.setTimer(TIMERS[(timerIdx + 1) % TIMERS.length][0]);
  const timerText = sleep.timerLeft != null ? `Stops in ${fmtLeft(sleep.timerLeft)}` : sleep.s.timer ? `Stop after ${TIMERS[timerIdx][1]}` : "No timer";

  const crying = !!mon.status.crying;
  const monState = !mon.listening
    ? { label: "Off", color: colors.card2, text: colors.muted }
    : crying
      ? { label: "Crying", color: colors.rose, text: colors.bg }
      : { label: "Listening", color: colors.sage, text: colors.bg };
  const parents = mon.m.parents.length;

  return (
    <Screen
      eyebrow={mon.m.babyName.trim() ? `${greeting()}, ${mon.m.babyName.trim()}` : greeting()}
      title="hush"
      right={
        <SvgXml
          width={26}
          height={26}
          style={{ marginBottom: 6 }}
          xml={`<svg viewBox="0 0 24 24"><path fill="${colors.moon}" d="M15.5 3.2a9 9 0 1 0 5.3 13.9A7.2 7.2 0 0 1 15.5 3.2z"/></svg>`}
        />
      }
    >
      {/* ---- white noise ---- */}
      <Card style={{ alignItems: "center", paddingTop: 8 }}>
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
          <Text style={styles.name}>{sleep.sound.name}</Text>
          <Text style={styles.sub}>{sleep.playing ? "Playing" : "Tap the moon to play"}</Text>
        </View>

        <View style={styles.soundRow}>
          {SOUNDS.map((x) => {
            const on = x.id === sleep.soundId;
            return (
              <Pressable key={x.id} onPress={() => sleep.set({ sound: x.id })} style={styles.soundItem} accessibilityLabel={x.name}>
                <View style={[styles.soundIcon, on && { backgroundColor: colors.peach }]}>
                  <SvgXml
                    width={22}
                    height={22}
                    xml={`<svg viewBox="0 0 24 24" fill="none" stroke="${on ? colors.bg : colors.muted}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${x.icon}</svg>`}
                  />
                </View>
                <Text style={[styles.soundName, on && { color: colors.cream }]}>{x.name}</Text>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.quickRow}>
          <Pressable onPress={nextTimer} style={styles.quick}>
            <Icon d={ICONS.timer} size={18} />
            <Text style={styles.quickText}>{timerText}</Text>
          </Pressable>
          <Pressable onPress={() => nav.navigate("Sleep")} style={styles.quick}>
            <View style={[styles.levelDot, { backgroundColor: sleep.level != null && sleep.level > LIMIT_DB + 0.5 ? colors.rose : colors.sage }]} />
            <Text style={styles.quickText}>
              {sleep.level == null ? "Volume off" : `≈${Math.round(Math.max(20, sleep.level))} dB at crib`}
            </Text>
          </Pressable>
        </View>
      </Card>

      {/* ---- baby monitor ---- */}
      <Card>
        <View style={styles.monHead}>
          <View style={[styles.monIcon, mon.listening && { backgroundColor: monState.color }]}>
            <Icon d={ICONS.monitor} size={22} color={mon.listening ? colors.bg : colors.muted} />
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={styles.monTitle}>Baby monitor</Text>
            <Text style={styles.sub}>
              {mon.listening
                ? crying ? `${mon.baby} is crying` : `Listening for ${mon.baby}`
                : parents ? `${parents} parent phone${parents > 1 ? "s" : ""} paired` : "Alerts when the baby cries"}
            </Text>
          </View>
          <Switch
            value={mon.listening}
            onValueChange={async () => setNote(await mon.toggleListening())}
            trackColor={{ false: colors.card2, true: colors.sage }}
            thumbColor={colors.cream}
            accessibilityLabel="Listen for crying"
          />
        </View>
        {mon.listening && (
          <View style={styles.monFoot}>
            <Pill label={monState.label} color={monState.color} />
            <Text style={styles.small}>{mon.lastCry ? `Last alert ${fmtTime(mon.lastCry)}` : "Quiet so far"}</Text>
          </View>
        )}
        {note && <Text style={styles.note}>{note}</Text>}
        <Pressable onPress={() => nav.navigate("Monitor")} style={styles.link}>
          <Text style={styles.linkText}>{parents ? "Monitor settings" : "Pair a parent phone"}</Text>
          <Icon d={ICONS.chevron} size={16} color={colors.peach} width={2} />
        </Pressable>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  name: { fontFamily: fonts.display, fontSize: 22, color: colors.cream },
  sub: { fontFamily: fonts.body, fontSize: 13.5, color: colors.muted, fontVariant: ["tabular-nums"] },
  small: { fontFamily: fonts.body, fontSize: 12.5, color: colors.muted },
  soundRow: { flexDirection: "row", alignSelf: "stretch", justifyContent: "space-between", paddingTop: 6 },
  soundItem: { alignItems: "center", gap: 5, flex: 1 },
  soundIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.card2, alignItems: "center", justifyContent: "center" },
  soundName: { fontFamily: fonts.bodyBold, fontSize: 11.5, color: colors.muted },
  quickRow: { flexDirection: "row", gap: 8, alignSelf: "stretch" },
  quick: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: colors.card2, borderRadius: 14, paddingVertical: 10, paddingHorizontal: 8 },
  quickText: { fontFamily: fonts.bodyBold, fontSize: 12.5, color: colors.cream, fontVariant: ["tabular-nums"] },
  levelDot: { width: 8, height: 8, borderRadius: 4 },
  monHead: { flexDirection: "row", alignItems: "center", gap: 12 },
  monIcon: { width: 44, height: 44, borderRadius: 14, backgroundColor: colors.card2, alignItems: "center", justifyContent: "center" },
  monTitle: { fontFamily: fonts.display, fontSize: 18, color: colors.cream },
  monFoot: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  note: { fontFamily: fonts.body, fontSize: 13, lineHeight: 19, color: colors.cream },
  link: { flexDirection: "row", alignItems: "center", gap: 4, alignSelf: "flex-start" },
  linkText: { fontFamily: fonts.bodyBold, fontSize: 13.5, color: colors.peach },
});
