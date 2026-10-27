// A simple horizontal slider in hush's style: a rounded track that fills up to a round thumb.
// Drag or tap anywhere on it; it snaps to `step`. Reports while dragging (onChange) and once at the
// end (onDone), so a parent can draw live and save only when the finger lifts.
import { useMemo, useRef, useState } from "react";
import { PanResponder, StyleSheet, View, type LayoutChangeEvent } from "react-native";
import { colors } from "../theme";

export function Slider({ value, min, max, step = 1, onChange, onDone, color = colors.peach, label }: {
  value: number; min: number; max: number; step?: number; color?: string; label: string;
  onChange: (v: number) => void; onDone?: (v: number) => void;
}) {
  const [w, setW] = useState(1);
  const width = useRef(1);
  const cur = useRef(value);
  cur.current = value;
  const at = (x: number) => {
    const f = Math.min(1, Math.max(0, x / width.current));
    const v = min + Math.round((f * (max - min)) / step) * step;
    return Math.min(max, Math.max(min, Number(v.toFixed(4))));
  };
  const pan = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > Math.abs(g.dy),
    onPanResponderTerminationRequest: () => false,
    onPanResponderGrant: (e) => { const v = at(e.nativeEvent.locationX); cur.current = v; onChange(v); },
    onPanResponderMove: (e) => { const v = at(e.nativeEvent.locationX); if (v !== cur.current) { cur.current = v; onChange(v); } },
    onPanResponderRelease: () => onDone?.(cur.current),
    onPanResponderTerminate: () => onDone?.(cur.current),
  }), [min, max, step, onChange, onDone]); // eslint-disable-line react-hooks/exhaustive-deps
  const f = (value - min) / Math.max(1e-9, max - min);
  const nudge = (d: number) => { const v = Math.min(max, Math.max(min, value + d * step)); onChange(v); onDone?.(v); };
  return (
    <View
      style={styles.hit}
      onLayout={(e: LayoutChangeEvent) => { width.current = e.nativeEvent.layout.width; setW(e.nativeEvent.layout.width); }}
      {...pan.panHandlers}
      accessible accessibilityRole="adjustable" accessibilityLabel={label} accessibilityValue={{ min, max, now: value }}
      accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
      onAccessibilityAction={(e) => nudge(e.nativeEvent.actionName === "increment" ? 1 : -1)}
    >
      <View pointerEvents="none" style={styles.track}>
        <View style={[styles.fill, { width: Math.max(8, f * w), backgroundColor: color }]} />
      </View>
      <View pointerEvents="none" style={[styles.thumb, { left: f * (w - 28), borderColor: color }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  hit: { height: 40, justifyContent: "center" },
  track: { height: 8, borderRadius: 4, backgroundColor: colors.card2, overflow: "hidden" },
  fill: { height: 8, borderRadius: 4 },
  thumb: { position: "absolute", top: 6, width: 28, height: 28, borderRadius: 14, backgroundColor: colors.cream, borderWidth: 5 },
});
