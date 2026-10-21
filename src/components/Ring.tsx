// A round progress ring with something in the middle: the building block of the circle UI.
import type { ReactNode } from "react";
import { Pressable, View, type StyleProp, type ViewStyle } from "react-native";
import Svg, { Circle } from "react-native-svg";
import { colors } from "../theme";

export function Ring({ size, stroke = 5, progress, color, track = colors.card2, fill = colors.card, children, onPress, label, style }: {
  size: number; stroke?: number; progress: number; color: string; track?: string; fill?: string;
  children?: ReactNode; onPress?: () => void; label?: string; style?: StyleProp<ViewStyle>;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const p = Math.max(0, Math.min(1, Number.isFinite(progress) ? progress : 0));
  const body = (
    <View style={[{ width: size, height: size, borderRadius: size / 2, backgroundColor: fill, alignItems: "center", justifyContent: "center" }, style]}>
      <Svg width={size} height={size} style={{ position: "absolute", left: 0, top: 0 }} pointerEvents="none">
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={track} strokeWidth={stroke} fill="none" />
        {p > 0 && (
          <Circle cx={size / 2} cy={size / 2} r={r} stroke={color} strokeWidth={stroke} fill="none" strokeLinecap="round"
            strokeDasharray={`${c} ${c}`} strokeDashoffset={c * (1 - p)} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
        )}
      </Svg>
      {children}
    </View>
  );
  return onPress ? <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} style={({ pressed }) => pressed && { transform: [{ scale: 0.96 }] }}>{body}</Pressable> : body;
}
