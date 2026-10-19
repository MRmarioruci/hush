import { Pressable, StyleSheet, Text, View } from "react-native";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, fonts } from "../theme";
import { ICONS, Icon } from "./ui";
import { useSleep } from "../state/sleep";
import { useMonitor } from "../state/monitor";
import { useT } from "../i18n";

const TABS: Record<string, { label: string; icon: string }> = {
  Home: { label: "tab.home", icon: ICONS.home },
  Sounds: { label: "tab.sounds", icon: ICONS.sounds },
  Monitor: { label: "tab.monitor", icon: ICONS.monitor },
  Nights: { label: "tab.nights", icon: ICONS.nights },
};

/** Floating bar at the bottom. A small dot shows what's running, whichever tab you're on. */
export function TabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const { playing } = useSleep();
  const { listening, status } = useMonitor();
  const tr = useT();

  return (
    <View style={[styles.wrap, { paddingBottom: Math.max(insets.bottom, 10) }]} pointerEvents="box-none">
      <View style={styles.bar}>
        {state.routes.map((route, i) => {
          const focused = state.index === i;
          const t = TABS[route.name];
          if (!t) return null; // Settings opens from the gear on Home
          const live =
            route.name === "Sounds" ? playing : route.name === "Monitor" ? listening : false;
          const liveColor = route.name === "Monitor" && status.crying ? colors.rose : colors.sage;
          return (
            <Pressable
              key={route.key}
              accessibilityRole="tab"
              accessibilityState={{ selected: focused }}
              accessibilityLabel={tr(t.label)}
              onPress={() => {
                const e = navigation.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
                if (!focused && !e.defaultPrevented) navigation.navigate(route.name);
              }}
              android_ripple={null}
              style={({ pressed }) => [styles.item, pressed && { transform: [{ scale: 0.92 }] }]}
            >
              <View style={[styles.iconBox, focused && { backgroundColor: colors.peach }]}>
                <Icon d={t.icon} size={24} color={focused ? colors.bg : colors.muted} width={2} />
                {live && <View style={[styles.dot, { backgroundColor: liveColor }]} />}
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: "absolute", left: 0, right: 0, bottom: 0, paddingHorizontal: 16, paddingTop: 8 },
  bar: {
    flexDirection: "row",
    backgroundColor: colors.card,
    borderRadius: 32,
    height: 64,
    alignItems: "center",
    paddingHorizontal: 6,
    maxWidth: 440,
    width: "100%",
    alignSelf: "center",
    shadowColor: "#000", shadowOpacity: 0.35, shadowRadius: 16, shadowOffset: { width: 0, height: 6 }, elevation: 10,
  },
  item: { flex: 1, alignItems: "center", justifyContent: "center" },
  iconBox: { width: 60, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  mark: { width: 4, height: 4, borderRadius: 2, marginTop: 1, backgroundColor: "transparent" },
  markOn: { backgroundColor: colors.peach },
  dot: { position: "absolute", top: 7, right: 14, width: 9, height: 9, borderRadius: 5, borderWidth: 1.5, borderColor: colors.card },
  text: { fontFamily: fonts.body, fontSize: 11.5, color: colors.muted },
  textOn: { fontFamily: fonts.bodyBold, color: colors.peach },
});
