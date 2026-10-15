import { Linking, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import Constants from "expo-constants";
import { colors, fonts } from "../theme";
import { LIMIT_DB } from "../safety";
import { Card, Chip, ICONS, Icon, Label, Screen } from "../components/ui";
import { useSleep } from "../state/sleep";
import { useMonitor } from "../state/monitor";

const RELEASES = "https://github.com/MRmarioruci/hush/releases/latest";
const STUDY = "https://www.sciencenews.org/blog/growth-curve/should-you-hush-white-noise";

export function SettingsScreen() {
  const { s, set } = useSleep();
  const { m, update } = useMonitor();

  return (
    <Screen title="Settings">
      <Card>
        <Label>Distances in</Label>
        <View style={styles.chips}>
          <Chip label="Meters" on={s.unit === "m"} onPress={() => set({ unit: "m" })} />
          <Chip label="Feet" on={s.unit === "ft"} onPress={() => set({ unit: "ft" })} />
        </View>
      </Card>

      <Card>
        <Label>Room name</Label>
        <TextInput
          value={m.room}
          onChangeText={(room) => update({ room })}
          placeholder="the nursery"
          placeholderTextColor={colors.muted}
          style={styles.input}
          maxLength={40}
        />
        <Text style={styles.hint}>Used in alerts, like "Crying in {m.room.trim() || "the nursery"}".</Text>
      </Card>

      <Card>
        <Label>About the safe level</Label>
        <Text style={styles.body}>
          hush keeps white noise under {LIMIT_DB} dB at the crib, the limit hospitals use for newborn nurseries. A 2014
          study in Pediatrics found many baby sound machines can go far above it when placed close to the crib.
        </Text>
        <Text style={styles.body}>
          The level is an estimate for a typical phone speaker. For an exact number, hold a decibel‑meter app at the
          crib.
        </Text>
        <Row label="Read about the study" onPress={() => Linking.openURL(STUDY)} />
      </Card>

      <Card>
        <Label>About the monitor</Label>
        <Text style={styles.body}>
          Crying is detected on the baby's phone itself. Sound never leaves the phone; only the alert does. hush is a
          helper, not a medical device, so keep checking on your baby as usual.
        </Text>
      </Card>

      <Card>
        <Label right={<Text style={styles.hint}>v{Constants.expoConfig?.version ?? "1"}</Text>}>hush</Label>
        <Row label="Get the latest version" onPress={() => Linking.openURL(RELEASES)} />
      </Card>
    </Screen>
  );
}

function Row({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={styles.row}>
      <Text style={styles.rowText}>{label}</Text>
      <Icon d={ICONS.chevron} size={16} color={colors.peach} width={2} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: "row", gap: 8 },
  input: { backgroundColor: colors.card2, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 11, color: colors.cream, fontFamily: fonts.body, fontSize: 15 },
  hint: { fontFamily: fonts.body, fontSize: 13, color: colors.muted },
  body: { fontFamily: fonts.body, fontSize: 14, lineHeight: 21, color: colors.cream, opacity: 0.9 },
  row: { flexDirection: "row", alignItems: "center", gap: 4 },
  rowText: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.peach },
});
