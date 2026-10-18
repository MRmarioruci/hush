import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { colors, fonts } from "../theme";
import { LANGS, deviceLang, useLangChoice, useT } from "../i18n";
import { ICONS, Icon } from "./ui";

/** Name shown for the current language setting. */
export function useLangLabel() {
  const { choice } = useLangChoice();
  const t = useT();
  return choice === "auto" ? `${t("settings.auto")} · ${LANGS.find((l) => l.code === deviceLang())?.name}` : LANGS.find((l) => l.code === choice)?.name ?? "";
}

/** Bottom sheet listing the languages, each written in its own language. */
export function LanguagePicker({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { choice, setChoice } = useLangChoice();
  const t = useT();
  const options: { code: "auto" | (typeof LANGS)[number]["code"]; name: string }[] = [
    { code: "auto", name: `${t("settings.auto")} · ${LANGS.find((l) => l.code === deviceLang())?.name}` },
    ...LANGS,
  ];
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={styles.sheet}>
        <View style={styles.handle} />
        <Text style={styles.title}>{t("settings.language")}</Text>
        <ScrollView style={{ maxHeight: 460 }}>
          {options.map((o) => {
            const on = o.code === choice;
            return (
              <Pressable
                key={o.code}
                onPress={() => { setChoice(o.code); onClose(); }}
                style={({ pressed }) => [styles.row, pressed && { opacity: 0.6 }]}
                accessibilityRole="radio"
                accessibilityState={{ checked: on }}
              >
                <Text style={[styles.name, on && { color: colors.peach }]}>{o.name}</Text>
                {on && <Icon d={ICONS.check} size={20} color={colors.peach} width={2.4} />}
              </Pressable>
            );
          })}
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(14,10,36,0.6)" },
  sheet: { backgroundColor: colors.card, borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 20, paddingBottom: 36, paddingTop: 10 },
  handle: { alignSelf: "center", width: 40, height: 4, borderRadius: 2, backgroundColor: "#4a3f86", marginBottom: 14 },
  title: { fontFamily: fonts.display, fontSize: 20, color: colors.cream, marginBottom: 8 },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: 52, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#3e3378" },
  name: { fontFamily: fonts.bodyBold, fontSize: 16, color: colors.cream },
});
