// Silent pushes (remote control, listen in, sync, "woke up") while hush is in the background
// or the screen is locked. expo-notifications only calls in-app listeners while the app is in
// the foreground; everything else arrives through this background task. It runs inside the app
// when it's alive (the baby's phone stays alive while it listens or plays), so the same
// handlers as in the foreground take it from here.
import { Platform } from "react-native";
import * as TaskManager from "expo-task-manager";
import * as Notifications from "expo-notifications";

export const PUSH_TASK = "hush-push";
type Listener = (data: Record<string, unknown>) => void;
const listeners = new Set<Listener>();

/** Subscribe to pushes delivered through the background task. */
export function onBackgroundPush(cb: Listener) {
  listeners.add(cb);
  return { remove: () => { listeners.delete(cb); } };
}

/** Finds the hush message ({ type, … }) wherever the platform put it. */
function extract(x: unknown, depth = 0): Record<string, unknown> | null {
  if (depth > 4 || x == null) return null;
  if (typeof x === "string") {
    if (!x.startsWith("{")) return null;
    try { return extract(JSON.parse(x), depth + 1); } catch { return null; }
  }
  if (typeof x !== "object") return null;
  const o = x as Record<string, unknown>;
  if (typeof o.type === "string") return o;
  for (const k of ["dataString", "body", "data", "message"]) {
    const found = extract(o[k], depth + 1);
    if (found) return found;
  }
  return null;
}

if (Platform.OS === "android") {
  TaskManager.defineTask<Notifications.NotificationTaskPayload>(PUSH_TASK, async ({ data }) => {
    if (!data || "actionIdentifier" in data) return;
    const msg = extract(data);
    if (msg) listeners.forEach((l) => { try { l(msg); } catch {} });
  });
  Notifications.registerTaskAsync(PUSH_TASK).catch(() => {});
}
