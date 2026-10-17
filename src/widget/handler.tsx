// Draws the widget and handles its buttons while hush may be closed (headless JS on Android).
import type { WidgetTaskHandlerProps } from "react-native-android-widget";
import { HushWidget } from "./HushWidget";
import { readSnap, writeSnap } from "./snap";

export async function widgetTaskHandler({ widgetAction, clickAction, renderWidget }: WidgetTaskHandlerProps) {
  let snap = await readSnap();
  if (widgetAction === "WIDGET_CLICK" && clickAction === "noise" && snap?.pairedToken && snap.myToken) {
    // Switch the white noise in the baby's room straight from the widget.
    const cmd = snap.playing ? "stop" : "play";
    try {
      await fetch("https://exp.host/--/api/v2/push/send", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify([{ to: snap.pairedToken, priority: "high", _contentAvailable: true, data: { type: "cmd", cmd, from: snap.myToken, _id: `w${Date.now()}` } }]),
      });
      snap = { ...snap, playing: !snap.playing, pending: Date.now() };
      await writeSnap(snap);
    } catch {}
  }
  if (widgetAction !== "WIDGET_DELETED") renderWidget(<HushWidget snap={snap} />);
}
