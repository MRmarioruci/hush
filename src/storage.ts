import AsyncStorage from "@react-native-async-storage/async-storage";

export type Settings = { sound: string; timer: number; dist: number; unit: "m" | "ft"; vol: number };
const KEY = "hush:settings";
export const DEFAULTS: Settings = { sound: "womb", timer: 0, dist: 2, unit: "m", vol: 70 };

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
