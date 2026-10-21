// A round volume dial: a 270° arc you drag around, with anything in the middle.
import { useRef, type ReactNode } from "react";
import { PanResponder, View } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";
import { colors } from "../theme";

const START = 135; // degrees, measured clockwise from 3 o'clock: the arc starts bottom-left
const SWEEP = 270;

const point = (c: number, r: number, deg: number) => {
  const a = (deg * Math.PI) / 180;
  return [c + r * Math.cos(a), c + r * Math.sin(a)];
};
const arc = (c: number, r: number, from: number, to: number) => {
  const [x1, y1] = point(c, r, from), [x2, y2] = point(c, r, to);
  return `M${x1} ${y1} A${r} ${r} 0 ${to - from > 180 ? 1 : 0} 1 ${x2} ${y2}`;
};

/** value 0..1; onChange gets 0..1 while dragging. */
export function Dial({ size, value, onChange, color = colors.peach, children, label, onCenterPress, bottom }: {
  size: number; value: number; onChange: (v: number) => void; color?: string; children?: ReactNode; label: string;
  /** A tap in the middle (not a drag). */ onCenterPress?: () => void; bottom?: ReactNode;
}) {
  const ref = useRef<View>(null);
  const origin = useRef({ x: 0, y: 0 });
  const cb = useRef(onChange);
  cb.current = onChange;
  const tap = useRef(onCenterPress);
  tap.current = onCenterPress;
  const center = useRef(false);
  const inCenter = (px: number, py: number) => {
    const dx = px - origin.current.x - size / 2, dy = py - origin.current.y - size / 2;
    return dx * dx + dy * dy < (size * 0.3) ** 2;
  };
  const fromTouch = (px: number, py: number) => {
    const dx = px - origin.current.x - size / 2, dy = py - origin.current.y - size / 2;
    if (dx * dx + dy * dy < (size * 0.18) ** 2) return; // too close to the middle to tell
    let deg = (Math.atan2(dy, dx) * 180) / Math.PI;
    let a = (deg - START + 720) % 360;
    if (a > SWEEP) a = a > SWEEP + (360 - SWEEP) / 2 ? 0 : SWEEP; // in the gap: the nearer end
    cb.current(a / SWEEP);
  };
  const pan = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponderCapture: () => true,
    onPanResponderTerminationRequest: () => false,
    onPanResponderGrant: (e) => {
      const { pageX, pageY } = e.nativeEvent;
      ref.current?.measureInWindow((x, y) => {
        origin.current = { x, y };
        center.current = inCenter(pageX, pageY);
        if (!center.current) fromTouch(pageX, pageY);
      });
    },
    onPanResponderMove: (_, g) => { if (center.current && Math.hypot(g.dx, g.dy) < 12) return; center.current = false; fromTouch(g.moveX, g.moveY); },
    onPanResponderRelease: (_, g) => { if (center.current && Math.hypot(g.dx, g.dy) < 12) tap.current?.(); center.current = false; },
  })).current;

  const v = Math.max(0, Math.min(1, value));
  const c = size / 2, r = size / 2 - 14;
  const [kx, ky] = point(c, r, START + SWEEP * v);
  return (
    <View ref={ref} style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}
      accessible accessibilityRole="adjustable" accessibilityLabel={label} accessibilityValue={{ min: 0, max: 100, now: Math.round(v * 100) }}
      accessibilityActions={[{ name: "increment" }, { name: "decrement" }, ...(onCenterPress ? [{ name: "activate" as const }] : [])]}
      onAccessibilityAction={(e) => e.nativeEvent.actionName === "activate" ? onCenterPress?.() : onChange(Math.max(0, Math.min(1, v + (e.nativeEvent.actionName === "increment" ? 0.1 : -0.1))))}
      {...pan.panHandlers}>
      <Svg width={size} height={size} style={{ position: "absolute", left: 0, top: 0 }}>
        <Path d={arc(c, r, START, START + SWEEP)} stroke={colors.card} strokeWidth={18} fill="none" strokeLinecap="round" />
        {v > 0.005 && <Path d={arc(c, r, START, START + SWEEP * v)} stroke={color} strokeWidth={18} fill="none" strokeLinecap="round" />}
        <Circle cx={kx} cy={ky} r={14} fill={colors.cream} />
      </Svg>
      <View pointerEvents="none" style={{ alignItems: "center" }}>{children}</View>
      {bottom != null && <View pointerEvents="none" style={{ position: "absolute", bottom: 14, alignItems: "center" }}>{bottom}</View>}
    </View>
  );
}
