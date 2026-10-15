import { useEffect, useRef } from "react";
import { Animated, Easing, Pressable, StyleSheet, View } from "react-native";
import Svg, { Circle, Defs, Path, RadialGradient, Stop } from "react-native-svg";
import { colors } from "../theme";

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
}: {
  playing: boolean;
  beat: number;
  softBeat: boolean;
  slow: boolean;
  still: boolean;
  onPress: () => void;
}) {
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
    <View style={styles.wrap}>
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
        accessibilityLabel={playing ? "Pause" : "Play"}
        onPress={onPress}
        onPressIn={() => Animated.spring(press, { toValue: 0.94, useNativeDriver: true, speed: 40 }).start()}
        onPressOut={() => Animated.spring(press, { toValue: 1, useNativeDriver: true, friction: 4 }).start()}
        android_disableSound
      >
        <Animated.View style={{ transform: [{ scale: press }] }}>
          <Svg width={SIZE} height={SIZE} viewBox="0 0 176 176">
            <Defs>
              <RadialGradient id="m" cx="36%" cy="32%" r="75%">
                <Stop offset="0" stopColor="#fff7dc" />
                <Stop offset="0.46" stopColor={colors.moon} />
                <Stop offset="1" stopColor={colors.moonDeep} />
              </RadialGradient>
            </Defs>
            <Circle cx="88" cy="88" r="88" fill="url(#m)" />
            <Circle cx="56" cy="46" r="14" fill="#aa8246" opacity="0.16" />
            <Circle cx="128" cy="126" r="8" fill="#aa8246" opacity="0.16" />
            <Circle cx="120" cy="58" r="5" fill="#aa8246" opacity="0.12" />
          </Svg>
          <View style={styles.iconBox} pointerEvents="none">
            <Animated.View style={[StyleSheet.absoluteFill, styles.center, {
              opacity: icon.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }),
              transform: [{ scale: icon.interpolate({ inputRange: [0, 1], outputRange: [1, 0.5] }) }],
            }]}>
              <Svg width={52} height={52} viewBox="0 0 24 24"><Path d="M8.5 5.5v13l10.5-6.5z" fill={colors.bg} /></Svg>
            </Animated.View>
            <Animated.View style={[StyleSheet.absoluteFill, styles.center, {
              opacity: icon,
              transform: [{ scale: icon.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1] }) }],
            }]}>
              <Svg width={52} height={52} viewBox="0 0 24 24"><Path d="M7 5h3.6v14H7zM13.4 5H17v14h-3.6z" fill={colors.bg} /></Svg>
            </Animated.View>
          </View>
        </Animated.View>
      </Pressable>
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
    backgroundColor: "rgba(246,226,176,0.10)",
  },
  iconBox: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 },
  center: { alignItems: "center", justifyContent: "center" },
});
