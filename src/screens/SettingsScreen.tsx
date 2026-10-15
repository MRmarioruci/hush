import { Children, type ReactNode } from "react";
import { Linking, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import Constants from "expo-constants";
import { colors, fonts } from "../theme";
import { LIMIT_DB } from "../safety";
import { ICONS, Icon, Screen } from "../components/ui";
import { useSleep } from "../state/sleep";
import { useMonitor } from "../state/monitor";

const RELEASES = "https://github.com/MRmarioruci/hush/releases/latest";
const STUDY = "https://www.sciencenews.org/blog/growth-curve/should-you-hush-white-noise";

export function SettingsScreen() {
  const { s, set } = useSleep();
  const { m, update } = useMonitor();
  const initial = (m.babyName.trim()[0] ?? "").toUpperCase();

  return (
    <Screen title="Settings">
      <View style={styles.baby}>
        <View style={styles.babyAvatar}>
          {initial ? <Text style={styles.babyInitial}>{initial}</Text> : <Icon d={ICONS.sleep} size={30} color={colors.bg} />}
        </View>
        <TextInput
          value={m.babyName}
          onChangeText={(babyName) => update({ babyName })}
          placeholder="Baby's name"
          placeholderTextColor={colors.muted}
          style={styles.babyInput}
          maxLength={24}
          autoCapitalize="words"
        />
      </View>

      <Group title="Preferences">
        <Row label="Distances">
          <View style={styles.seg}>
            {(["m", "ft"] as const).map((u) => (
              <Pressable key={u} onPress={() => set({ unit: u })} style={[styles.segItem, s.unit === u && styles.segOn]}>
                <Text style={[styles.segText, s.unit === u && { color: colors.bg }]}>{u === "m" ? "Meters" : "Feet"}</Text>
              </Pressable>
            ))}
          </View>
        </Row>
      </Group>

      <Group title="Safety">
        <Row label="Max at the crib"><Text style={styles.value}>{LIMIT_DB} dB</Text></Row>
        <Row label="Why 50 dB" onPress={() => Linking.openURL(STUDY)} />
      </Group>

      <Group title="About">
        <Row label="Version"><Text style={styles.value}>{Constants.expoConfig?.version ?? "1.0"}</Text></Row>
        <Row label="Get the latest version" onPress={() => Linking.openURL(RELEASES)} />
      </Group>

      <Text style={styles.foot}>Sound stays on the baby's phone. Only alerts are sent.</Text>
    </Screen>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={{ gap: 8 }}>
      <Text style={styles.groupTitle}>{title}</Text>
      <View style={styles.group}>
        {Children.toArray(children).map((c, i) => (
          <View key={i} style={i > 0 && styles.divider}>{c}</View>
        ))}
      </View>
    </View>
  );
}

function Row({ label, children, onPress }: { label: string; children?: ReactNode; onPress?: () => void }) {
  const body = (
    <>
      <Text style={styles.rowLabel}>{label}</Text>
      {children ?? (onPress ? <Icon d={ICONS.chevron} size={18} /> : null)}
    </>
  );
  return onPress ? (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.row, pressed && { opacity: 0.6 }]}>{body}</Pressable>
  ) : (
    <View style={styles.row}>{body}</View>
  );
}

const styles = StyleSheet.create({
  baby: { alignItems: "center", gap: 12, paddingVertical: 10 },
  babyAvatar: { width: 84, height: 84, borderRadius: 42, backgroundColor: colors.moon, alignItems: "center", justifyContent: "center" },
  babyInitial: { fontFamily: fonts.displayBold, fontSize: 36, color: colors.bg },
  babyInput: { fontFamily: fonts.display, fontSize: 22, color: colors.cream, textAlign: "center", minWidth: 200, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: colors.card2, outlineWidth: 0 } as object,

  groupTitle: { fontFamily: fonts.bodyBold, fontSize: 12.5, color: colors.muted, letterSpacing: 0.6, textTransform: "uppercase", marginLeft: 6 },
  group: { backgroundColor: colors.card, borderRadius: 20, paddingHorizontal: 16 },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: 54, gap: 12 },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "#3a3352" },
  rowLabel: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.cream },
  value: { fontFamily: fonts.body, fontSize: 15, color: colors.muted },

  seg: { flexDirection: "row", backgroundColor: colors.card2, borderRadius: 99, padding: 3 },
  segItem: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 99 },
  segOn: { backgroundColor: colors.cream },
  segText: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.muted },
  foot: { fontFamily: fonts.body, fontSize: 12.5, color: colors.muted, textAlign: "center", opacity: 0.75 },
});
