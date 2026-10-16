import AsyncStorage from "@react-native-async-storage/async-storage";

export type Settings = {
  sound: string;
  timer: number;
  dist: number;
  unit: "m" | "ft";
  vol: number;
  /** Smart lowers the noise once the baby settles and raises it when the baby cries. */
  mode: "smart" | "manual";
  /** Smart mode listens for crying on this phone to react to it. */
  smartCry: boolean;
  /** First-time setup finished. */
  onboarded: boolean;
};
const KEY = "hush:settings";
export const DEFAULTS: Settings = { sound: "womb", timer: 0, dist: 2, unit: "m", vol: 70, mode: "smart", smartCry: true, onboarded: false };

export async function loadSettings(): Promise<Settings> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? { ...DEFAULTS, ...JSON.parse(raw) } : DEFAULTS;
  } catch {
    return DEFAULTS;
  }
}

export function saveSettings(s: Settings) {
  AsyncStorage.setItem(KEY, JSON.stringify(s)).catch(() => {});
}
