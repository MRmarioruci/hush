// What the home-screen widget shows, written by the app whenever something changes and read by
// the widget (which can draw itself while the app is closed).
import AsyncStorage from "@react-native-async-storage/async-storage";

export const SNAP = "hush:widget";
/** The picture in the big circle. */
export type Scene = "asleep" | "awake" | "cry" | "mic" | "moon";
/** The colour of the status line and the circle's glow. */
export type Tone = "sage" | "rose" | "peach" | "lav" | "muted";

export type Snap = {
  role: "parent" | "nursery" | null;
  title: string; // "Sebastian's room" / "Sebastian"
  status: string; // "Asleep · 1h 12m", "Crying · since 21:12"
  line: string | null; // a quieter second line
  short: string; // the compact widget's one line
  scene: Scene;
  tone: Tone;
  playing: boolean; // white noise (here, or in the baby's room for a parent)
  asleep: boolean;
  monitorOn: boolean;
  showMonitor: boolean;
  showNoise: boolean;
  showSleep: boolean;
  showListen: boolean;
  /** Parent's phone, about the baby's room. */
  crying?: boolean;
  ackBy?: string | null; // someone's on it ("" = this phone)
  /** A recording was asked for at this time and hasn't arrived yet: the Listen ring fills. */
  fetching?: { at: number } | null;
  clipReady?: boolean; // a recording arrived recently: Play
  noAnswer?: boolean; // asked, nothing came back
  /** Parent's phone: lets the widget talk to the baby's phone without opening hush. */
  myToken?: string;
  myName?: string;
  pairedToken?: string;
  pending?: number; // a widget command sent at this time, waiting for the baby's phone
  /** A button that's working (drawn as a loader until the app or the widget clears it). */
  busy?: { action: string; at: number };
  /** Shown instead of the status for a little while after a button ("Open hush first"). */
  note?: { text: string; at: number };
  /** Paired phones to tell about sleep, with ready texts ({time}, {dur} filled in by the widget). */
  peers?: { token: string; asleep: string; awake: string }[];
  roomAsleep?: boolean; // asleep only because the other phone says so
  labels: {
    listen: string; noiseOn: string; noiseOff: string; asleep: string; woke: string; monitorOn: string; monitorOff: string;
    empty: string; fetching: string; openApp: string; sent: string; working: string; noAnswer: string;
    onit: string; onitDone: string; play: string; retry: string; listening: string; arrives: string;
  };
};

export async function readSnap(): Promise<Snap | null> {
  try { return JSON.parse((await AsyncStorage.getItem(SNAP)) ?? "null"); } catch { return null; }
}
export async function writeSnap(s: Snap) {
  await AsyncStorage.setItem(SNAP, JSON.stringify(s)).catch(() => {});
}
