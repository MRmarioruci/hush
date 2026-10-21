// Swipe left / right anywhere on a page to go to the next / previous tab. Things with their own
// drag (the globe, the volume dial) take the touch first, so they're never fought over; sideways
// lists scroll natively before this ever kicks in.
import { useMemo, type ReactNode } from "react";
import { PanResponder, View } from "react-native";

type Nav = { getState: () => { routes: { name: string }[]; index: number }; navigate: (name: string) => void };
const HIDDEN = new Set(["Settings"]); // opens from the gear on Home, not part of the row

export function SwipeArea({ children, routeName, navigation }: { children: ReactNode; routeName: string; navigation: Nav }) {
  const pan = useMemo(() => PanResponder.create({
    // Only a clearly sideways move, and only if nothing inside wanted the touch.
    onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dx) > 28 && Math.abs(g.dx) > Math.abs(g.dy) * 2.2,
    onPanResponderTerminationRequest: () => true,
    onShouldBlockNativeResponder: () => false,
    onPanResponderRelease: (_e, g) => {
      const far = Math.abs(g.dx) > 70 || Math.abs(g.vx) > 0.45;
      if (!far || Math.abs(g.dx) < Math.abs(g.dy) * 1.5) return;
      const order = navigation.getState().routes.map((r) => r.name).filter((n) => !HIDDEN.has(n));
      const i = order.indexOf(routeName);
      if (i < 0) return;
      const next = order[i + (g.dx < 0 ? 1 : -1)];
      if (next) navigation.navigate(next);
    },
  }), [navigation, routeName]);
  if (HIDDEN.has(routeName)) return <>{children}</>;
  return <View style={{ flex: 1 }} {...pan.panHandlers}>{children}</View>;
}
