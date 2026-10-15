import { Pressable, StyleSheet, Text, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { SvgXml } from "react-native-svg";
import { colors, fonts } from "../theme";
import { SOUNDS } from "../sounds";
import { LIMIT_DB } from "../safety";
import { Slider } from "../components/Slider";
import { Card, Chip, Label, Pill, Screen } from "../components/ui";
import { TIMERS, fmtDist, fmtLeft, useSleep } from "../state/sleep";

export function SleepScreen() {
  const z = useSleep();
  const { s } = z;

  const tag =
    s.dist < 1 ? { t: "A little close", c: colors.rose }
    : s.dist < 2 ? { t: "Okay, keep it soft", c: colors.moon }
    : { t: "Lovely spot", c: colors.sage };
  const volLabel = z.dev
    ? z.dev.step === 0 ? "Off" : z.dev.step >= z.ceiling! ? "Max safe" : `${Math.round((z.dev.step / z.ceiling!) * 100)}%`
    : s.vol === 100 ? "Max safe" : `${s.vol}%`;
  const pos = (x: number) => Math.max(0, Math.min(100, ((x - 20) / 60) * 100));

  return (
    <Screen title="Sounds">
      {/* now playing */}
      <Pressable onPress={z.toggle} style={({ pressed }) => [styles.now, pressed && { transform: [{ scale: 0.98 }] }]} accessibilityLabel={z.playing ? "Pause" : "Play"}>
        <View style={styles.playBtn}>
          <Svg width={22} height={22} viewBox="0 0 24 24">
            <Path d={z.playing ? "M7 5h3.6v14H7zM13.4 5H17v14h-3.6z" : "M8.5 5.5v13l10.5-6.5z"} fill={colors.bg} />
          </Svg>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.nowName}>{z.sound.name}</Text>
          <Text style={styles.nowSub}>
            {z.playing ? (z.timerLeft != null ? `Playing · stops in ${fmtLeft(z.timerLeft)}` : "Playing") : z.sound.sub}
          </Text>
        </View>
      </Pressable>

      <Card>
        <Label>Sound</Label>
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
                <Text style={[styles.tileText, on && { color: colors.bg }]}>{x.name}</Text>
              </Pressable>
            );
          })}
        </View>
      </Card>

      <Card>
        <Label>Stop after</Label>
        <View style={styles.chips}>
          {TIMERS.map(([m, l]) => <Chip key={m} grow label={l} on={s.timer === m} onPress={() => z.setTimer(m)} />)}
        </View>
        <Text style={styles.hint}>Fades out gently over the last minute.</Text>
      </Card>

      <Card>
        <View>
          <Label right={<Text style={styles.val}>{fmtDist(s.dist, s.unit)}</Text>}>Phone to crib</Label>
          <Slider label="Distance from phone to crib" value={s.dist} min={0.3} max={4} step={0.1} onChange={(v) => z.set({ dist: v })} />
        </View>
        <Pill label={tag.t} color={tag.c} />
        <View style={styles.levels}>
          <View style={styles.lvl}>
            <Text style={styles.lvlLabel}>{z.dev ? "At the crib now" : "At the crib, at most"}</Text>
            <Text style={[styles.lvlNum, { color: colors.sage }]}>
              {z.level == null ? "–" : Math.round(Math.max(20, z.level))}
              <Text style={styles.lvlUnit}> dB</Text>
            </Text>
          </View>
          <View style={styles.lvl}>
            <Text style={styles.lvlLabel}>Safe limit</Text>
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
          <Label right={<Text style={styles.val}>{volLabel}</Text>}>{z.dev ? "Phone volume" : "Volume"}</Label>
          {z.dev ? (
            <Slider label="Phone volume" value={z.dev.step} min={0} max={z.dev.max} limit={z.ceiling!} onChange={z.setStep} />
          ) : (
            <Slider label="Volume" value={s.vol} min={0} max={100} onChange={(v) => z.set({ vol: v })} />
          )}
        </View>
        <Text style={styles.hint}>
          {z.dev
            ? `While hush plays, your phone's volume can't go past the line, so it stays under ${LIMIT_DB} dB at the crib.`
            : `Volume is capped so it can't pass ${LIMIT_DB} dB at the crib, even with your phone turned all the way up.`}
          {s.dist < 2 ? ` Moving the phone to ${fmtDist(2, s.unit)} or more lets it play fuller.` : ""}
        </Text>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
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
