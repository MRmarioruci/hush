// Widget buttons reach the running app through here (the widget's background task shares the
// app's JavaScript when hush is alive). With no app listening, the widget handles it alone.
type Handler = (action: string) => void;
let handler: Handler | null = null;
export function onWidgetAction(h: Handler) {
  handler = h;
  return { remove: () => { if (handler === h) handler = null; } };
}
/** True if the running app took it. */
export function widgetAction(action: string): boolean {
  if (!handler) return false;
  try { handler(action); } catch {}
  return true;
}
