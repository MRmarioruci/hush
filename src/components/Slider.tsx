import { useRef, useState } from "react";
import { GestureResponderEvent, StyleSheet, View } from "react-native";
import { colors } from "../theme";

/**
 * A soft, chunky slider. When `limit` is set, the part of the track past it is
 * shown as locked and the thumb can't be dragged into it.
 */
export function Slider({
  value,
  min,
  max,
  step = 1,
  limit,
  fill = colors.peach,
  onChange,
  onRelease,
  label,
}: {
  value: number;
  min: number;
  max: number;
  step?: number;
  limit?: number;
  fill?: string;
  onChange: (v: number) => void;
  onRelease?: (v: number) => void;
  label: string;
}) {
  const ref = useRef<View>(null);
  const box = useRef({ x: 0, w: 1 });
  const [active, setActive] = useState(false);
  const last = useRef(value);

  const measure = () => ref.current?.measureInWindow((x, _y, w) => (box.current = { x, w: Math.max(1, w) }));

  const fromEvent = (e: GestureResponderEvent) => {
    const { x, w } = box.current;
    const p = Math.min(1, Math.max(0, (e.nativeEvent.pageX - x - THUMB / 2) / (w - THUMB)));
    let v = Math.round((min + p * (max - min)) / step) * step;
    if (limit != null) v = Math.min(v, limit);
    v = Math.min(max, Math.max(min, +v.toFixed(4)));
    if (v !== last.current) {
      last.current = v;
      onChange(v);
    }
  };

  const pct = (v: number) => ((v - min) / (max - min)) * 100;
  const valuePct = pct(Math.min(max, Math.max(min, value)));
  const limitPct = limit != null ? pct(limit) : 100;

  return (
    <View
      ref={ref}
      onLayout={measure}
      style={styles.hit}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={label}
      accessibilityValue={{ min, max, now: value }}
      accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
      onAccessibilityAction={(e) => {
        const dir = e.nativeEvent.actionName === "increment" ? 1 : -1;
        let v = Math.min(max, Math.max(min, value + dir * step));
        if (limit != null) v = Math.min(v, limit);
        onChange(v);
        onRelease?.(v);
      }}
      onStartShouldSetResponder={() => true}
      onMoveShouldSetResponder={() => true}
      onResponderTerminationRequest={() => false}
      onResponderGrant={(e) => {
        measure();
        setActive(true);
        last.current = value;
        fromEvent(e);
      }}
      onResponderMove={fromEvent}
      onResponderRelease={() => {
        setActive(false);
        onRelease?.(last.current);
      }}
      onResponderTerminate={() => setActive(false)}
    >
      <View style={styles.track}>
        {limit != null && limitPct < 100 && (
          <View style={[styles.locked, { left: `${limitPct}%` }]} />
        )}
        <View style={[styles.fill, { width: `${valuePct}%`, backgroundColor: fill }]} />
        {limit != null && limitPct < 100 && <View style={[styles.limitMark, { left: `${limitPct}%` }]} />}
      </View>
      <View
        pointerEvents="none"
        style={[
          styles.thumb,
          { left: `${valuePct}%`, marginLeft: -(THUMB * valuePct) / 100, transform: [{ scale: active ? 1.15 : 1 }] },
        ]}
      />
    </View>
  );
}

const THUMB = 26;

const styles = StyleSheet.create({
  hit: { height: 36, justifyContent: "center" },
  track: {
    height: 8,
    borderRadius: 99,
    backgroundColor: colors.card2,
    marginHorizontal: 13,
  },
  fill: { position: "absolute", left: 0, top: 0, bottom: 0, borderRadius: 99 },
  locked: {
    position: "absolute",
    right: 0,
    top: 0,
    bottom: 0,
    borderTopRightRadius: 99,
    borderBottomRightRadius: 99,
    backgroundColor: "rgba(242,165,151,0.22)",
  },
  limitMark: {
    position: "absolute",
    top: -6,
    bottom: -6,
    width: 3,
    marginLeft: -1.5,
    borderRadius: 2,
    backgroundColor: colors.cream,
  },
  thumb: {
    position: "absolute",
    width: THUMB,
    height: THUMB,
    borderRadius: THUMB / 2,
    backgroundColor: colors.cream,
    elevation: 4,
    shadowColor: "#000",
    shadowOpacity: 0.35,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
});
