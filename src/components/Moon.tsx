import { useEffect, useRef } from "react";
import { Animated, Easing, Pressable, StyleSheet, View } from "react-native";
import Svg, { Ellipse, Path } from "react-native-svg";
import { colors, fonts } from "../theme";
import { t } from "../i18n";

const SIZE = 176;
const RINGS = 6;

/** The play button: a glowing moon that sends out a ripple on every beat of the sound. */
export function Moon({
  playing,
  beat,
  softBeat,
  slow,
  still,
  onPress,
  size = SIZE,
}: {
  playing: boolean;
  beat: number;
  softBeat: boolean;
  slow: boolean;
  still: boolean;
  onPress: () => void;
  size?: number;
}) {
  const k = size / SIZE;
  const press = useRef(new Animated.Value(1)).current;
  const glow = useRef(new Animated.Value(playing ? 1 : 0)).current;
  const icon = useRef(new Animated.Value(playing ? 1 : 0)).current;
  const rings = useRef(Array.from({ length: RINGS }, () => ({ v: new Animated.Value(1), soft: false }))).current;
  const next = useRef(0);

  useEffect(() => {
    Animated.timing(glow, { toValue: playing ? 1 : 0, duration: 600, useNativeDriver: true }).start();
    Animated.spring(icon, { toValue: playing ? 1 : 0, useNativeDriver: true, friction: 6 }).start();
  }, [playing, glow, icon]);

  useEffect(() => {
    if (!playing || still || beat < 0) return;
    const r = rings[next.current++ % RINGS];
    r.soft = softBeat;
    r.v.setValue(0);
    Animated.timing(r.v, {
      toValue: 1,
      duration: slow ? 6000 : 2600,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  }, [beat]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <View style={{ width: SIZE * 1.5 * k, height: SIZE * 1.5 * k, alignItems: "center", justifyContent: "center" }}>
    <View style={[styles.wrap, { transform: [{ scale: k }] }]}>
      {rings.map((r, i) => (
        <Animated.View
          key={i}
          pointerEvents="none"
          style={[
            styles.ring,
            {
              opacity: r.v.interpolate({ inputRange: [0, 1], outputRange: [r.soft ? 0.22 : 0.4, 0] }),
              transform: [{ scale: r.v.interpolate({ inputRange: [0, 1], outputRange: [1.05, 2.5] }) }],
            },
          ]}
        />
      ))}
      <Animated.View
        pointerEvents="none"
        style={[styles.halo, { opacity: glow.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0.8] }) }]}
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={playing ? t("common.pause") : t("common.play")}
        onPress={onPress}
        onPressIn={() => Animated.spring(press, { toValue: 0.94, useNativeDriver: true, speed: 40 }).start()}
        onPressOut={() => Animated.spring(press, { toValue: 1, useNativeDriver: true, friction: 4 }).start()}
        android_disableSound
      >
        <Animated.View style={{ transform: [{ scale: press }] }}>
          {/* A sleepy crescent moon with a face; z's drift up while the sound plays. */}
          <View style={styles.disc}>
            <Svg width={SIZE * 0.86} height={SIZE * 0.86} viewBox="0 0 150 150">
              <Path d="M98 22a58 58 0 1 0 30 78A48 48 0 0 1 98 22z" fill={colors.moon} />
              <Path d="M50 78q7 6 14 0" stroke="#5b4320" strokeWidth={4} fill="none" strokeLinecap="round" />
              <Path d="M78 86q7 6 14 0" stroke="#5b4320" strokeWidth={4} fill="none" strokeLinecap="round" />
              <Ellipse cx="48" cy="94" rx="7" ry="4.5" fill="#ff9db0" opacity={0.85} />
              <Ellipse cx="96" cy="102" rx="7" ry="4.5" fill="#ff9db0" opacity={0.85} />
              <Path d="M66 104q5 4 10 1" stroke="#5b4320" strokeWidth={3.5} fill="none" strokeLinecap="round" />
            </Svg>
            <Animated.Text style={[styles.z, { opacity: glow }]}>z</Animated.Text>
            <Animated.Text style={[styles.z2, { opacity: glow }]}>z</Animated.Text>
          </View>
          <View style={styles.badge} pointerEvents="none">
            <Animated.View style={[StyleSheet.absoluteFill, styles.center, {
              opacity: icon.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }),
              transform: [{ scale: icon.interpolate({ inputRange: [0, 1], outputRange: [1, 0.5] }) }],
            }]}>
              <Svg width={22} height={22} viewBox="0 0 24 24"><Path d="M8.5 5.5v13l10.5-6.5z" fill={colors.bg} /></Svg>
            </Animated.View>
            <Animated.View style={[StyleSheet.absoluteFill, styles.center, {
              opacity: icon,
              transform: [{ scale: icon.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1] }) }],
            }]}>
              <Svg width={22} height={22} viewBox="0 0 24 24"><Path d="M7 5h3.6v14H7zM13.4 5H17v14h-3.6z" fill={colors.bg} /></Svg>
            </Animated.View>
          </View>
        </Animated.View>
      </Pressable>
    </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: SIZE * 1.5, height: SIZE * 1.5, alignItems: "center", justifyContent: "center" },
  ring: {
    position: "absolute",
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    borderWidth: 1.5,
    borderColor: colors.peach,
  },
  halo: {
    position: "absolute",
    width: SIZE + 40,
    height: SIZE + 40,
    borderRadius: (SIZE + 40) / 2,
    backgroundColor: "rgba(255,227,163,0.10)",
  },
  disc: { width: SIZE, height: SIZE, borderRadius: SIZE / 2, backgroundColor: colors.card2, alignItems: "center", justifyContent: "center" },
  z: { position: "absolute", right: 30, top: 26, fontFamily: fonts.displayBold, fontSize: 22, color: "#c9bfff" },
  z2: { position: "absolute", right: 16, top: 8, fontFamily: fonts.displayBold, fontSize: 15, color: "#c9bfff" },
  badge: { position: "absolute", right: 6, bottom: 6, width: 48, height: 48, borderRadius: 24, backgroundColor: colors.peach, borderWidth: 4, borderColor: colors.card },
  center: { alignItems: "center", justifyContent: "center" },
});
