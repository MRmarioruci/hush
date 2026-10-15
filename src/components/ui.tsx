import type { ReactNode } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { SvgXml } from "react-native-svg";
import { colors, fonts } from "../theme";

export const TAB_BAR_SPACE = 96;

/** Scrollable page with the big title, clear of the status bar and the floating tab bar. */
export function Screen({ title, eyebrow, right, children }: { title: string; eyebrow?: string; right?: ReactNode; children: ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + TAB_BAR_SPACE }]}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.head}>
        <View style={{ flexShrink: 1 }}>
          {eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}
          <Text style={styles.title}>{title}</Text>
        </View>
        {right}
      </View>
      {children}
    </ScrollView>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Label({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <View style={styles.labelRow}>
      <Text style={styles.label}>{children}</Text>
      {right}
    </View>
  );
}

export function Chip({ label, on, onPress, grow }: { label: string; on?: boolean; onPress: () => void; grow?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: !!on }}
      style={({ pressed }) => [styles.chip, grow && { flexGrow: 1, alignItems: "center", paddingHorizontal: 6 }, on && styles.chipOn, pressed && { transform: [{ scale: 0.95 }] }]}
    >
      <Text style={[styles.chipText, on && { color: colors.bg }]}>{label}</Text>
    </Pressable>
  );
}

export function Pill({ label, color }: { label: string; color: string }) {
  return (
    <View style={[styles.pill, { backgroundColor: color }]}>
      <Text style={styles.pillText}>{label}</Text>
    </View>
  );
}

/** Line icons drawn on a 24px grid. */
export function Icon({ d, size = 24, color = colors.muted, width = 1.8 }: { d: string; size?: number; color?: string; width?: number }) {
  return (
    <SvgXml
      width={size}
      height={size}
      xml={`<svg viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`}
    />
  );
}

export const ICONS = {
  home: '<path d="M4 11.5 12 5l8 6.5"/><path d="M6 10v9h4.5v-5h3v5H18v-9"/>',
  sleep: '<path d="M15.5 4.2a7.5 7.5 0 1 0 4.3 11.6A6 6 0 0 1 15.5 4.2z"/><path d="M18 3.5v2M17 4.5h2"/>',
  sounds: '<path d="M4 10v4M8 7v10M12 4v16M16 8v8M20 11v2"/>',
  crib: '<path d="M4 9v11M20 9v11M4 13h16M4 18h16M8 13v5M12 13v5M16 13v5"/><circle cx="9" cy="9.5" r="2"/>',
  bell: '<path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z"/><path d="M10 20a2 2 0 0 0 4 0"/>',
  mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21"/>',
  phone: '<rect x="7" y="3" width="10" height="18" rx="2.5"/><path d="M11 18h2"/>',
  check: '<path d="M5 12.5 10 17l9-10"/>',
  monitor: '<circle cx="12" cy="12" r="2"/><path d="M8.5 15.5a5 5 0 0 1 0-7M15.5 8.5a5 5 0 0 1 0 7M5.6 18.4a9 9 0 0 1 0-12.8M18.4 5.6a9 9 0 0 1 0 12.8"/>',
  settings: '<path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/>',
  chevron: '<path d="M9 6l6 6-6 6"/>',
  timer: '<circle cx="12" cy="13" r="7"/><path d="M12 10v3l2 1.5M10 3h4"/>',
};

const styles = StyleSheet.create({
  content: { paddingHorizontal: 20, gap: 16, maxWidth: 480, width: "100%", alignSelf: "center" },
  head: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 4 },
  eyebrow: { fontFamily: fonts.body, fontSize: 14, color: colors.muted, marginBottom: 2 },
  title: { fontFamily: fonts.displayBold, fontSize: 30, color: colors.cream, lineHeight: 36 },
  card: { backgroundColor: colors.card, borderRadius: 24, padding: 18, gap: 14 },
  labelRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" },
  label: { fontFamily: fonts.display, fontSize: 15, color: colors.muted },
  chip: { backgroundColor: colors.card2, borderRadius: 99, paddingHorizontal: 14, paddingVertical: 8 },
  chipOn: { backgroundColor: colors.cream },
  chipText: { fontFamily: fonts.bodyBold, fontSize: 13.5, color: colors.muted },
  pill: { borderRadius: 99, paddingHorizontal: 10, paddingVertical: 4, alignSelf: "flex-start" },
  pillText: { fontFamily: fonts.bodyBold, fontSize: 12, color: colors.bg },
});
