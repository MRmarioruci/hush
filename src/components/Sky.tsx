import { useEffect, useMemo, useRef } from "react";
import { Animated, Easing, StyleSheet, useWindowDimensions, View } from "react-native";
import { useAppActive } from "./ui";

type Star = { x: number; y: number; r: number; delay: number; dur: number; anim: Animated.Value };

/** A quiet night sky: twinkling stars and the odd shooting star. */
export function Sky({ still }: { still: boolean }) {
  const { width, height } = useWindowDimensions();
  const stars = useMemo<Star[]>(
    () =>
      Array.from({ length: Math.round((width * height) / 9000) }, () => ({
        x: Math.random() * width,
        y: Math.random() * height * 0.8,
        r: Math.random() * 1.2 + 0.6,
        delay: Math.random() * 4000,
        dur: 2200 + Math.random() * 3800,
        anim: new Animated.Value(0.4),
      })),
    [width, height]
  );

  const active = useAppActive();
  useEffect(() => {
    if (still || !active) return;
    // Each star's loop runs entirely on the native side (no delay inside it), started after its own offset.
    const loops = stars.map((s) =>
      Animated.loop(
        Animated.sequence([
          Animated.timing(s.anim, { toValue: 1, duration: s.dur, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
          Animated.timing(s.anim, { toValue: 0.2, duration: s.dur, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        ])
      )
    );
    const timers = loops.map((l, i) => setTimeout(() => l.start(), stars[i].delay));
    return () => { timers.forEach(clearTimeout); loops.forEach((l) => l.stop()); };
  }, [stars, still, active]);

  // Shooting star every 20–40 s.
  const shoot = useRef(new Animated.Value(0)).current;
  const shootPos = useRef({ x: 0, y: 0 });
  useEffect(() => {
    if (still || !active) return;
    let timer: ReturnType<typeof setTimeout>;
    const run = () => {
      timer = setTimeout(() => {
        shootPos.current = { x: Math.random() * width * 0.6, y: Math.random() * height * 0.25 };
        shoot.setValue(0);
        Animated.timing(shoot, { toValue: 1, duration: 900, easing: Easing.out(Easing.quad), useNativeDriver: true }).start(run);
      }, 20000 + Math.random() * 20000);
    };
    run();
    return () => clearTimeout(timer);
  }, [still, active, width, height, shoot]);

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {stars.map((s, i) => (
        <Animated.View
          key={i}
          style={{
            position: "absolute",
            left: s.x,
            top: s.y,
            width: s.r * 2,
            height: s.r * 2,
            borderRadius: s.r,
            backgroundColor: "#fff4de",
            opacity: still ? 0.5 : s.anim,
          }}
        />
      ))}
      {!still && (
        <Animated.View
          style={{
            position: "absolute",
            left: shootPos.current.x,
            top: shootPos.current.y,
            width: 70,
            height: 1.5,
            borderRadius: 1,
            backgroundColor: "#fff0d7",
            opacity: shoot.interpolate({ inputRange: [0, 0.15, 1], outputRange: [0, 0.8, 0] }),
            transform: [
              { translateX: shoot.interpolate({ inputRange: [0, 1], outputRange: [0, 200] }) },
              { translateY: shoot.interpolate({ inputRange: [0, 1], outputRange: [0, 80] }) },
              { rotate: "22deg" },
            ],
          }}
        />
      )}
    </View>
  );
}
