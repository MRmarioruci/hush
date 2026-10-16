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
  /** The parent chose to go past the safe level at the crib (after a warning). */
  allowLoud: boolean;
  /** Which parts of hush this phone uses. Each works on its own. */
  features: Features;
  /** Baby's birthday, YYYY-MM-DD, for nap timing. */
  birthday: string | null;
  /** Remind this phone shortly before the next nap's sweet spot. */
  napReminders: boolean;
  /** Starting a sound marks the baby as asleep (nap times on). */
  soundStartsSleep: boolean;
};
export type Features = { sounds: boolean; naps: boolean; monitor: boolean };
const KEY = "hush:settings";
export const DEFAULTS: Settings = { sound: "womb", timer: 0, dist: 2, unit: "m", vol: 70, mode: "smart", smartCry: true, onboarded: false, allowLoud: false, features: { sounds: true, naps: true, monitor: true }, birthday: null, napReminders: true, soundStartsSleep: true };

export async function loadSettings(): Promise<Settings> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return DEFAULTS;
    const saved = JSON.parse(raw);
    return { ...DEFAULTS, ...saved, features: { ...DEFAULTS.features, ...(saved.features ?? {}) } };
  } catch {
    return DEFAULTS;
  }
}

export function saveSettings(s: Settings) {
  AsyncStorage.setItem(KEY, JSON.stringify(s)).catch(() => {});
}
