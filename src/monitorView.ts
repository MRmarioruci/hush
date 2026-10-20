// "Show the Monitor's main view": a notification about crying was tapped, so whatever screen or
// sub-view was open (Remote control, the phones list), land where the cry and its recording are.
const subs = new Set<() => void>();
export function showMonitorMain() { for (const f of subs) f(); }
export function onShowMonitorMain(f: () => void) { subs.add(f); return () => { subs.delete(f); }; }
