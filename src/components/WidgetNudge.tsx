// A gentle "you can put hush on your home screen" card (Android only). It shows from the app's
// second day, never once a hush widget is already placed, and goes away for good on "Not now".
import { useEffect, useState } from "react";
import { Image, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getWidgetInfo, requestPinWidget } from "react-native-android-widget";
import { colors, fonts } from "../theme";
import { t } from "../i18n";
import { dialog } from "./Dialog";
import { Rise } from "./ui";

const KEY = "hush:widgetNudge";
type State = { first: number; done?: boolean };

export function WidgetNudge({ name }: { name: string }) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (Platform.OS !== "android") return;
    (async () => {
      let st: State | null = null;
      try { st = JSON.parse((await AsyncStorage.getItem(KEY)) ?? "null"); } catch {}
      if (!st) { st = { first: Date.now() }; AsyncStorage.setItem(KEY, JSON.stringify(st)).catch(() => {}); }
      if (st.done || Date.now() - st.first < 20 * 3600_000) return;
      const placed = [...(await getWidgetInfo("Hush").catch(() => [])), ...(await getWidgetInfo("HushSmall").catch(() => []))];
      if (placed.length) { AsyncStorage.setItem(KEY, JSON.stringify({ ...st, done: true })).catch(() => {}); return; }
      setShow(true);
    })();
  }, []);
  if (!show) return null;
  const close = () => { setShow(false); AsyncStorage.getItem(KEY).then((r) => AsyncStorage.setItem(KEY, JSON.stringify({ ...(r ? JSON.parse(r) : { first: Date.now() }), done: true }))).catch(() => {}); };
  const add = async () => {
    const ok = await requestPinWidget({ widgetName: "Hush" }).catch(() => false);
    if (ok) close();
    else dialog(t("wn.title"), t("wn.manual"));
  };
  return (
    <Rise>
      <View style={styles.card}>
        <Image source={require("../../assets/widget-preview.png")} style={styles.preview} resizeMode="contain" accessibilityIgnoresInvertColors />
        <Text style={styles.title}>{t("wn.title")}</Text>
        <Text style={styles.sub}>{t("wn.sub", { name })}</Text>
        <View style={styles.row}>
          <Pressable onPress={close} style={styles.later} accessibilityRole="button"><Text style={styles.laterText}>{t("wn.later")}</Text></Pressable>
          <Pressable onPress={add} style={styles.add} accessibilityRole="button"><Text style={styles.addText}>{t("wn.add")}</Text></Pressable>
        </View>
      </View>
    </Rise>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.card, borderRadius: 26, padding: 18, gap: 8, alignItems: "center" },
  preview: { width: "100%", height: 120, marginBottom: 4 },
  title: { fontFamily: fonts.display, fontSize: 19, color: colors.cream, textAlign: "center" },
  sub: { fontFamily: fonts.body, fontSize: 13.5, lineHeight: 19, color: colors.muted, textAlign: "center" },
  row: { flexDirection: "row", gap: 10, alignSelf: "stretch", marginTop: 6 },
  later: { flex: 1, height: 46, borderRadius: 23, backgroundColor: colors.card2, alignItems: "center", justifyContent: "center" },
  laterText: { fontFamily: fonts.bodyBold, fontSize: 14.5, color: colors.cream },
  add: { flex: 1, height: 46, borderRadius: 23, backgroundColor: colors.peach, alignItems: "center", justifyContent: "center" },
  addText: { fontFamily: fonts.bodyBold, fontSize: 14.5, color: colors.bg },
});
