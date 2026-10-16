import { useEffect, useRef } from "react";
import { Animated, Easing, StyleSheet, Text, View } from "react-native";
import { SvgXml } from "react-native-svg";
import { colors, fonts } from "../theme";
import { useT } from "../i18n";

/** Two phones: the baby's phone by the crib hears crying, and an alert travels to the parent's phone. */
export function MonitorHero({ baby, still }: { baby: string; still?: boolean }) {
  const tr = useT();
  const t = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (still) return;
    const travel = Animated.loop(
      Animated.sequence([
        Animated.timing(t, { toValue: 1, duration: 1600, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.delay(900),
        Animated.timing(t, { toValue: 0, duration: 0, useNativeDriver: true }),
      ])
    );
    const breathe = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 1250, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 0, useNativeDriver: true }),
      ])
    );
    travel.start();
    breathe.start();
    return () => { travel.stop(); breathe.stop(); };
  }, [t, pulse, still]);

  return (
    <View style={styles.wrap}>
      {/* baby's phone */}
      <View style={styles.phone}>
        <View style={[styles.screen, { transform: [{ rotate: "-6deg" }] }]}>
          <Animated.View
            style={[styles.wave, {
              opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.6, 0] }),
              transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1.5] }) }],
            }]}
          />
          <SvgXml width={74} height={74} xml={CRIB} />
        </View>
        <Text style={styles.tag} numberOfLines={1}>{tr("hero.room", { name: baby })}</Text>
      </View>

      {/* the alert travelling across */}
      <View style={styles.path}>
        <View style={styles.dots}>{Array.from({ length: 7 }, (_, i) => <View key={i} style={styles.dot} />)}</View>
        <Animated.View
          style={[styles.spark, {
            opacity: t.interpolate({ inputRange: [0, 0.1, 0.9, 1], outputRange: [0, 1, 1, 0] }),
            transform: [{ translateX: t.interpolate({ inputRange: [0, 1], outputRange: [-38, 38] }) }],
          }]}
        />
      </View>

      {/* parent's phone */}
      <View style={styles.phone}>
        <View style={[styles.screen, { justifyContent: "flex-start", paddingTop: 14, transform: [{ rotate: "6deg" }] }]}>
          <View style={styles.note}>
            <View style={styles.noteIcon}><SvgXml width={12} height={12} xml={MOON} /></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.noteApp}>hush</Text>
              <Text style={styles.noteText} numberOfLines={2}>{tr("hero.crying", { name: baby })}</Text>
            </View>
          </View>
          <Text style={styles.clock}>02:14</Text>
        </View>
        <Text style={styles.tag}>{tr("hero.you")}</Text>
      </View>
    </View>
  );
}

const CRIB = `<svg viewBox="0 0 74 74" fill="none" stroke-linecap="round" stroke-linejoin="round">
  <path d="M14 30v30M60 30v30M14 38h46M14 56h46" stroke="${colors.muted}" stroke-width="2.4"/>
  <path d="M22 38v18M30 38v18M38 38v18M46 38v18M54 38v18" stroke="${colors.muted}" stroke-width="1.6" opacity=".6"/>
  <circle cx="30" cy="31" r="6.5" fill="${colors.peach}"/>
  <path d="M27.5 31.2c.8.7 1.6.7 2.4 0M31.2 31.2c.8.7 1.6.7 2.4 0" stroke="${colors.bg}" stroke-width="1.2"/>
  <path d="M36 33c4-3 12-3 18 0v5H36z" fill="${colors.sage}"/>
  <path d="M50 14a6 6 0 1 0 5 9 5 5 0 0 1-5-9z" fill="${colors.moon}"/>
</svg>`;
const MOON = `<svg viewBox="0 0 24 24"><path fill="${colors.moon}" d="M15.5 3.2a9 9 0 1 0 5.3 13.9A7.2 7.2 0 0 1 15.5 3.2z"/></svg>`;

const styles = StyleSheet.create({
  wrap: { flexDirection: "row", alignItems: "center", justifyContent: "center", paddingTop: 12, paddingBottom: 4 },
  phone: { alignItems: "center", gap: 10 },
  screen: {
    width: 104, height: 168, borderRadius: 22, backgroundColor: colors.card, borderWidth: 3, borderColor: "#38324c",
    alignItems: "center", justifyContent: "center", overflow: "hidden",
  },
  wave: { position: "absolute", width: 96, height: 96, borderRadius: 48, borderWidth: 2, borderColor: colors.sage },
  tag: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.muted },
  path: { width: 84, height: 20, alignItems: "center", justifyContent: "center", marginBottom: 26 },
  dots: { flexDirection: "row", gap: 7 },
  dot: { width: 4, height: 4, borderRadius: 2, backgroundColor: "#463d63" },
  spark: { position: "absolute", width: 10, height: 10, borderRadius: 5, backgroundColor: colors.peach },
  note: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: colors.card2, borderRadius: 10, padding: 7, width: 92 },
  noteIcon: { width: 18, height: 18, borderRadius: 6, backgroundColor: colors.bg, alignItems: "center", justifyContent: "center" },
  noteApp: { fontFamily: fonts.body, fontSize: 8.5, color: colors.muted },
  noteText: { fontFamily: fonts.bodyBold, fontSize: 9.5, color: colors.cream },
  clock: { fontFamily: fonts.display, fontSize: 26, color: colors.cream, opacity: 0.5, marginTop: 24 },
});
