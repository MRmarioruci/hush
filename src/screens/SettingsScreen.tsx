import { Children, useCallback, useState, type ReactNode } from "react";
import { AppState, Linking, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { cryDetector } from "../../modules/hush-native/src";
import { useT } from "../i18n";
import { LanguagePicker, useLangLabel } from "../components/LanguagePicker";
import Constants from "expo-constants";
import { useNavigation } from "@react-navigation/native";
import { colors, fonts } from "../theme";
import { LIMIT_DB } from "../safety";
import { ICONS, Icon, Screen } from "../components/ui";
import { useSleep } from "../state/sleep";
import { useMonitor } from "../state/monitor";

const RELEASES = "https://github.com/MRmarioruci/hush/releases/latest";
const STUDY = "https://www.sciencenews.org/blog/growth-curve/should-you-hush-white-noise";

export function SettingsScreen() {
  const nav = useNavigation<{ navigate: (n: string) => void }>();
  const { s, set } = useSleep();
  const { m, update } = useMonitor();
  const initial = (m.babyName.trim()[0] ?? "").toUpperCase();
  const t = useT();
  const langLabel = useLangLabel();
  const [picking, setPicking] = useState(false);

  // Battery exemption only matters on Android, and mostly for the phone in the baby's room.
  const [exempt, setExempt] = useState(() => cryDetector?.isBatteryExempt() ?? true);
  useFocusEffect(useCallback(() => {
    setExempt(cryDetector?.isBatteryExempt() ?? true);
    const sub = AppState.addEventListener("change", (st) => st === "active" && setExempt(cryDetector?.isBatteryExempt() ?? true));
    return () => sub.remove();
  }, []));

  return (
    <Screen
      title={t("settings.title")}
      right={
        <Pressable onPress={() => nav.navigate("Home")} hitSlop={12} style={styles.close} accessibilityLabel={t("common.back")}>
          <Text style={styles.closeText}>{t("common.done")}</Text>
        </Pressable>
      }
    >
      <View style={styles.baby}>
        <View style={styles.babyAvatar}>
          {initial ? <Text style={styles.babyInitial}>{initial}</Text> : <Icon d={ICONS.sleep} size={30} color={colors.bg} />}
        </View>
        <TextInput
          value={m.babyName}
          onChangeText={(babyName) => update({ babyName })}
          placeholder={t("settings.babyName")}
          placeholderTextColor={colors.muted}
          style={styles.babyInput}
          maxLength={24}
          autoCapitalize="words"
        />
      </View>

      <Group title={t("settings.prefs")}>
        <Row label={t("settings.language")} onPress={() => setPicking(true)}>
          <View style={styles.valueRow}>
            <Text style={styles.value} numberOfLines={1}>{langLabel}</Text>
            <Icon d={ICONS.chevron} size={18} />
          </View>
        </Row>
        <Row label={t("settings.distances")}>
          <View style={styles.seg}>
            {(["m", "ft"] as const).map((u) => (
              <Pressable key={u} onPress={() => set({ unit: u })} style={[styles.segItem, s.unit === u && styles.segOn]}>
                <Text style={[styles.segText, s.unit === u && { color: colors.bg }]}>{u === "m" ? t("settings.meters") : t("settings.feet")}</Text>
              </Pressable>
            ))}
          </View>
        </Row>
      </Group>

      <Group title={t("settings.safety")}>
        <Row label={t("settings.maxCrib")}><Text style={styles.value}>{LIMIT_DB} dB</Text></Row>
        {Platform.OS === "android" && (
          <Row label={t("settings.battery")} onPress={exempt ? undefined : () => cryDetector?.requestBatteryExempt()}>
            <Text style={[styles.value, !exempt && { color: colors.peach }]}>{exempt ? t("settings.batteryOn") : t("settings.batteryOff")}</Text>
          </Row>
        )}
        <Row label={t("settings.why")} onPress={() => Linking.openURL(STUDY)} />
      </Group>

      <Group title={t("settings.about")}>
        <Row label={t("settings.version")}><Text style={styles.value}>{Constants.expoConfig?.version ?? "1.0"}</Text></Row>
        <Row label={t("settings.latest")} onPress={() => Linking.openURL(RELEASES)} />
        <Row label={t("settings.setup")} onPress={() => set({ onboarded: false })} />
      </Group>

      <Text style={styles.foot}>{t("settings.foot")}</Text>
      <LanguagePicker visible={picking} onClose={() => setPicking(false)} />
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
  close: { backgroundColor: colors.card, borderRadius: 99, paddingHorizontal: 16, paddingVertical: 9, marginBottom: 4 },
  closeText: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.peach },
  baby: { alignItems: "center", gap: 12, paddingVertical: 10 },
  babyAvatar: { width: 84, height: 84, borderRadius: 42, backgroundColor: colors.moon, alignItems: "center", justifyContent: "center" },
  babyInitial: { fontFamily: fonts.displayBold, fontSize: 36, color: colors.bg },
  babyInput: { fontFamily: fonts.display, fontSize: 22, color: colors.cream, textAlign: "center", minWidth: 200, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: colors.card2, outlineWidth: 0 } as object,

  groupTitle: { fontFamily: fonts.bodyBold, fontSize: 12.5, color: colors.muted, letterSpacing: 0.6, textTransform: "uppercase", marginLeft: 6 },
  group: { backgroundColor: colors.card, borderRadius: 20, paddingHorizontal: 16 },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: 54, gap: 12 },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "#3a3352" },
  rowLabel: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.cream },
  value: { fontFamily: fonts.body, fontSize: 15, color: colors.muted, flexShrink: 1 },
  valueRow: { flexDirection: "row", alignItems: "center", gap: 4, flexShrink: 1, maxWidth: "60%" },

  seg: { flexDirection: "row", backgroundColor: colors.card2, borderRadius: 99, padding: 3 },
  segItem: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 99 },
  segOn: { backgroundColor: colors.cream },
  segText: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.muted },
  foot: { fontFamily: fonts.body, fontSize: 12.5, color: colors.muted, textAlign: "center", opacity: 0.75 },
});
