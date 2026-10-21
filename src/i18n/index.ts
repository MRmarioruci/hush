// Tiny translation layer: follows the phone's language unless the user picks one in Settings.
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getLocales } from "expo-localization";
import { en, type Key } from "./en";
import { el } from "./el";
import { de } from "./de";
import { fr } from "./fr";
import { es } from "./es";
import { pt } from "./pt";
import { zh } from "./zh";

export type Lang = "en" | "el" | "de" | "fr" | "es" | "pt" | "zh";
export const LANGS: { code: Lang; name: string }[] = [
  { code: "en", name: "English" },
  { code: "el", name: "Ελληνικά" },
  { code: "de", name: "Deutsch" },
  { code: "fr", name: "Français" },
  { code: "es", name: "Español" },
  { code: "pt", name: "Português" },
  { code: "zh", name: "中文" },
];
const DICTS: Record<Lang, Record<Key, string>> = { en, el, de, fr, es, pt, zh };
const KEY = "hush:lang";

export function deviceLang(): Lang {
  try {
    for (const l of getLocales()) {
      const code = (l.languageCode ?? "").toLowerCase() as Lang;
      if (code in DICTS) return code;
    }
  } catch {}
  return "en";
}

let current: Lang = deviceLang();
export const getLang = () => current;
/** BCP-47 tag for dates and times. */
export const dateLocale = () => ({ en: "en", el: "el-GR", de: "de-DE", fr: "fr-FR", es: "es-ES", pt: "pt-BR", zh: "zh-CN" })[current];

/** "auto" follows the phone. */
export async function loadLangChoice(): Promise<Lang | "auto"> {
  try {
    const v = await AsyncStorage.getItem(KEY);
    return v && (v === "auto" || v in DICTS) ? (v as Lang | "auto") : "auto";
  } catch {
    return "auto";
  }
}
export function applyLang(choice: Lang | "auto") {
  current = choice === "auto" ? deviceLang() : choice;
  AsyncStorage.setItem(KEY, choice).catch(() => {});
}

type Vars = Record<string, string | number>;

/** Translate a key. Pass `count` in vars to pick the _one / _other form. */
/** How each language says "the baby" when no name is set. */
const THE_BABY: Record<Lang, string> = { en: "the baby", el: "το μωρό", de: "das Baby", fr: "le bébé", es: "el bebé", pt: "o bebê", zh: "宝宝" };
/** Contractions that "the baby" needs after a preposition. */
const THE_BABY_FIX: Partial<Record<Lang, [RegExp, string][]>> = {
  fr: [[/\bde le bébé/g, "du bébé"], [/\bà le bébé/g, "au bébé"]],
  es: [[/\bde el bebé/g, "del bebé"], [/\ba el bebé/g, "al bebé"]],
  pt: [[/\bde o bebê/g, "do bebê"], [/\ba o bebê/g, "ao bebê"], [/\bem o bebê/g, "no bebê"]],
  de: [[/\bvon das Baby/g, "vom Baby"], [/\bHilft das Baby/g, "Hilft dem Baby"]],
};
/** The baby's name, or "the baby" in the current language when none is set. */
export const babyLabel = (name?: string | null) => babyLabelIn(current, name);
export const babyLabelIn = (lang: Lang, name?: string | null) => (name ?? "").trim() || THE_BABY[lang];

export function t(key: Key | string, vars: Vars = {}): string {
  return tIn(current, key, vars);
}

/** Like t(), in a given language (for messages sent to a phone set to another language). */
export function tIn(lang: Lang, key: Key | string, vars: Vars = {}): string {
  const current = lang in DICTS ? lang : "en";
  const dict = DICTS[current];
  let k = key;
  if (typeof vars.count === "number" && `${key}_other` in en) {
    const one = current === "fr" ? vars.count <= 1 : vars.count === 1;
    k = `${key}_${one && current !== "zh" ? "one" : "other"}`;
  }
  const text = (dict as Record<string, string>)[k] ?? (en as Record<string, string>)[k] ?? k;
  let out = text.replace(/\{(\w+)\}/g, (_, v) => (vars[v] != null ? String(vars[v]) : `{${v}}`));
  if (vars.name === THE_BABY[current]) {
    for (const [re, to] of THE_BABY_FIX[current] ?? []) out = out.replace(re, to);
    out = out.charAt(0).toLocaleUpperCase(current) + out.slice(1);
  }
  return out;
}

/** Common sounds the baby's phone may hear, translated. Others show in English. */
const HEARD: Partial<Record<Lang, Record<number, string>>> = {
  el: { 0: "Ομιλία", 1: "Ομιλία παιδιού", 13: "Γέλιο", 14: "Γέλιο μωρού", 19: "Κλάμα", 20: "Κλάμα μωρού", 21: "Κλαψούρισμα", 132: "Μουσική", 494: "Ησυχία", 507: "Θόρυβος", 514: "Λευκός θόρυβος", 515: "Ροζ θόρυβος", 59: "Χτύπος καρδιάς", 283: "Βροχή", 288: "Θάλασσα", 406: "Ανεμιστήρας" },
  de: { 0: "Sprache", 1: "Kinderstimme", 13: "Lachen", 14: "Babylachen", 19: "Weinen", 20: "Babyweinen", 21: "Wimmern", 132: "Musik", 494: "Stille", 507: "Rauschen", 514: "Weißes Rauschen", 515: "Rosa Rauschen", 59: "Herzschlag", 283: "Regen", 288: "Meer", 406: "Ventilator" },
  fr: { 0: "Parole", 1: "Voix d'enfant", 13: "Rire", 14: "Rire de bébé", 19: "Pleurs", 20: "Pleurs de bébé", 21: "Gémissement", 132: "Musique", 494: "Silence", 507: "Bruit", 514: "Bruit blanc", 515: "Bruit rose", 59: "Battements de cœur", 283: "Pluie", 288: "Océan", 406: "Ventilateur" },
  es: { 0: "Voz", 1: "Voz infantil", 13: "Risa", 14: "Risa de bebé", 19: "Llanto", 20: "Llanto de bebé", 21: "Quejido", 132: "Música", 494: "Silencio", 507: "Ruido", 514: "Ruido blanco", 515: "Ruido rosa", 59: "Latidos", 283: "Lluvia", 288: "Mar", 406: "Ventilador" },
  pt: { 0: "Fala", 1: "Fala de criança", 13: "Risada", 14: "Risada de bebê", 19: "Choro", 20: "Choro de bebê", 21: "Resmungo", 132: "Música", 494: "Silêncio", 507: "Ruído", 514: "Ruído branco", 515: "Ruído rosa", 59: "Batimentos", 283: "Chuva", 288: "Mar", 406: "Ventilador" },
  zh: { 0: "说话声", 1: "儿童说话声", 13: "笑声", 14: "婴儿笑声", 19: "哭声", 20: "婴儿哭声", 21: "呜咽", 132: "音乐", 494: "安静", 507: "噪音", 514: "白噪音", 515: "粉噪音", 59: "心跳声", 283: "雨声", 288: "海浪", 406: "风扇" },
};
export function heardLabel(index: number, english: string) {
  return HEARD[current]?.[index] ?? english;
}

/* ---------- React glue: screens re-render when the language changes ---------- */
import { createContext, createElement, useContext, type ReactNode } from "react";
const LangCtx = createContext<Lang>(current);
type Choice = Lang | "auto";
const ChoiceCtx = createContext<{ choice: Choice; setChoice: (c: Choice) => void }>({ choice: "auto", setChoice: () => {} });
export function LangProvider({ lang, choice, setChoice, children }: { lang: Lang; choice: Choice; setChoice: (c: Choice) => void; children: ReactNode }) {
  return createElement(ChoiceCtx.Provider, { value: { choice, setChoice } }, createElement(LangCtx.Provider, { value: lang }, children));
}
/** The language setting ("auto" = phone language) and a setter that switches the whole app. */
export const useLangChoice = () => useContext(ChoiceCtx);
/** Use in components: re-renders on language change and returns the translate function. */
export function useT() {
  useContext(LangCtx);
  return t;
}
export const useLang = () => useContext(LangCtx);
export const fmtTime = (ms: number) => new Date(ms).toLocaleTimeString(dateLocale(), { hour: "2-digit", minute: "2-digit" });
