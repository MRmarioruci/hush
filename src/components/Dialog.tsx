// hush's own dialogs, in the app's style, instead of the system pop-up.
// Same call shape as Alert.alert: dialog("Title", "Message", [{ text, style, onPress }]).
import { useEffect, useRef, useState } from "react";
import { Animated, Easing, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { colors, fonts } from "../theme";
import { t } from "../i18n";

export type DialogButton = { text: string; style?: "default" | "cancel" | "destructive"; onPress?: () => void };
type Req = { title: string; message?: string; buttons: DialogButton[] };

let push: ((r: Req) => void) | null = null;
const waiting: Req[] = [];

/** Show a dialog. With no buttons there's a single OK. */
export function dialog(title: string, message?: string, buttons?: DialogButton[]) {
  const r = { title, message, buttons: buttons?.length ? buttons : [{ text: t("common.ok") }] };
  if (push) push(r); else waiting.push(r);
}

/** Mounted once near the root. Shows one dialog at a time, queued in order. */
export function DialogHost() {
  const [queue, setQueue] = useState<Req[]>([]);
  const cur = queue[0];
  const a = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    push = (r) => setQueue((q) => [...q, r]);
    if (waiting.length) setQueue((q) => [...q, ...waiting.splice(0)]);
    return () => { push = null; };
  }, []);
  useEffect(() => {
    if (!cur) return;
    a.setValue(0);
    Animated.timing(a, { toValue: 1, duration: 220, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [cur, a]);

  const close = (b?: DialogButton) => {
    setQueue((q) => q.slice(1));
    // Run the action after the dialog is gone, so it can open another one.
    if (b?.onPress) setTimeout(b.onPress, 60);
  };
  if (!cur) return null;
  const cancel = cur.buttons.find((b) => b.style === "cancel");
  const stacked = cur.buttons.length > 2 || cur.buttons.some((b) => b.text.length > 14);
  // The main action sits last (right or bottom), like the rest of the app.
  const ordered = [...cur.buttons.filter((b) => b.style === "cancel"), ...cur.buttons.filter((b) => b.style !== "cancel")];

  return (
    <Modal visible transparent animationType="none" onRequestClose={() => close(cancel)} statusBarTranslucent>
      <Animated.View style={[styles.back, { opacity: a }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={() => cancel && close(cancel)} accessibilityLabel={cancel?.text} />
        <Animated.View style={[styles.card, { opacity: a, transform: [{ scale: a.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1] }) }] }]} accessibilityViewIsModal>
          <View style={styles.moon} />
          <Text style={styles.title} accessibilityRole="header">{cur.title}</Text>
          {!!cur.message && <Text style={styles.msg}>{cur.message}</Text>}
          <View style={[styles.btns, stacked && { flexDirection: "column-reverse" }]}>
            {ordered.map((b, i) => {
              const main = b.style !== "cancel" && i === ordered.length - 1;
              const bad = b.style === "destructive";
              return (
                <Pressable key={i} onPress={() => close(b)} style={({ pressed }) => [styles.btn, !stacked && { flex: 1 },
                  main && { backgroundColor: bad ? colors.rose : colors.peach }, pressed && { opacity: 0.85 }]} accessibilityRole="button">
                  <Text style={[styles.btnText, main && { color: colors.bg }, !main && bad && { color: colors.rose }]} numberOfLines={2}>{b.text}</Text>
                </Pressable>
              );
            })}
          </View>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  back: { flex: 1, backgroundColor: "rgba(12,8,32,0.62)", alignItems: "center", justifyContent: "center", padding: 28 },
  card: { width: "100%", maxWidth: 380, backgroundColor: colors.card, borderRadius: 30, paddingHorizontal: 22, paddingTop: 26, paddingBottom: 18, alignItems: "center", gap: 10 },
  moon: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.peach, marginBottom: 2 },
  title: { fontFamily: fonts.display, fontSize: 21, color: colors.cream, textAlign: "center" },
  msg: { fontFamily: fonts.body, fontSize: 14.5, lineHeight: 21, color: colors.muted, textAlign: "center" },
  btns: { flexDirection: "row", gap: 10, alignSelf: "stretch", marginTop: 10 },
  btn: { minHeight: 50, borderRadius: 25, backgroundColor: colors.card2, alignItems: "center", justifyContent: "center", paddingHorizontal: 16 },
  btnText: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.cream, textAlign: "center" },
});
