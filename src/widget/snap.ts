// What the home-screen widget shows, written by the app whenever something changes and read by
// the widget (which can draw itself while the app is closed).
import AsyncStorage from "@react-native-async-storage/async-storage";

export const SNAP = "hush:widget";
export type Snap = {
  role: "parent" | "nursery" | null;
  title: string; // "Sebastian" / "Leo's room"
  status: string; // "Listening for crying", "Asleep since 20:35"
  tone: "on" | "off" | "cry" | "warn";
  line: string | null; // second line: white noise, next nap
  playing: boolean; // white noise (here, or in the baby's room for a parent)
  asleep: boolean;
  monitorOn: boolean;
  showMonitor: boolean;
  showNoise: boolean;
  showSleep: boolean;
  showListen: boolean;
  /** Parent's phone: lets the widget switch the baby's white noise without opening hush. */
  myToken?: string;
  pairedToken?: string;
  pending?: number; // a widget command sent at this time, waiting for the baby's phone
  labels: { listen: string; noiseOn: string; noiseOff: string; asleep: string; woke: string; monitorOn: string; monitorOff: string; empty: string };
};

export async function readSnap(): Promise<Snap | null> {
  try { return JSON.parse((await AsyncStorage.getItem(SNAP)) ?? "null"); } catch { return null; }
}
export async function writeSnap(s: Snap) {
  await AsyncStorage.setItem(SNAP, JSON.stringify(s)).catch(() => {});
}
