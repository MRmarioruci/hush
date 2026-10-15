import { Pressable, StyleSheet, Text, View } from "react-native";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, fonts } from "../theme";
import { ICONS, Icon } from "./ui";
import { useSleep } from "../state/sleep";
import { useMonitor } from "../state/monitor";

const TABS: Record<string, { label: string; icon: string }> = {
  Home: { label: "Home", icon: ICONS.home },
  Sounds: { label: "Sounds", icon: ICONS.sounds },
  Monitor: { label: "Monitor", icon: ICONS.monitor },
  Settings: { label: "Settings", icon: ICONS.settings },
};

/** Floating bar at the bottom. A small dot shows what's running, whichever tab you're on. */
export function TabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const { playing } = useSleep();
  const { listening, status } = useMonitor();

  return (
    <View style={[styles.wrap, { paddingBottom: Math.max(insets.bottom, 10) }]} pointerEvents="box-none">
      <View style={styles.bar}>
        {state.routes.map((route, i) => {
          const focused = state.index === i;
          const t = TABS[route.name];
          const live =
            route.name === "Sounds" ? playing : route.name === "Monitor" ? listening : false;
          const liveColor = route.name === "Monitor" && status.crying ? colors.rose : colors.sage;
          return (
            <Pressable
              key={route.key}
              accessibilityRole="tab"
              accessibilityState={{ selected: focused }}
              accessibilityLabel={t.label}
              onPress={() => {
                const e = navigation.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
                if (!focused && !e.defaultPrevented) navigation.navigate(route.name);
              }}
              android_ripple={null}
              style={({ pressed }) => [styles.item, pressed && { transform: [{ scale: 0.92 }] }]}
            >
              <View style={styles.iconBox}>
                <Icon d={t.icon} size={23} color={focused ? colors.peach : colors.muted} width={focused ? 2.1 : 1.8} />
                {live && <View style={[styles.dot, { backgroundColor: liveColor }]} />}
              </View>
              <Text style={[styles.text, focused && styles.textOn]}>{t.label}</Text>
              <View style={[styles.mark, focused && styles.markOn]} />
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: "absolute", left: 0, right: 0, bottom: 0, paddingHorizontal: 16, paddingTop: 8, backgroundColor: "rgba(27,23,39,0.94)" },
  bar: {
    flexDirection: "row",
    backgroundColor: "#221d31",
    borderRadius: 28,
    paddingVertical: 8,
    paddingHorizontal: 6,
    maxWidth: 440,
    width: "100%",
    alignSelf: "center",
    borderWidth: 1,
    borderColor: "#2f2943",
  },
  item: { flex: 1, alignItems: "center", gap: 2, paddingTop: 2 },
  iconBox: { width: 40, height: 28, alignItems: "center", justifyContent: "center" },
  mark: { width: 4, height: 4, borderRadius: 2, marginTop: 1, backgroundColor: "transparent" },
  markOn: { backgroundColor: colors.peach },
  dot: { position: "absolute", top: 1, right: 4, width: 8, height: 8, borderRadius: 4, borderWidth: 1.5, borderColor: "#221d31" },
  text: { fontFamily: fonts.body, fontSize: 11.5, color: colors.muted },
  textOn: { fontFamily: fonts.bodyBold, color: colors.peach },
});
