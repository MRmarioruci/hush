import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AccessibilityInfo, AppState, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaProvider, useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import * as SplashScreen from "expo-splash-screen";
import { createAudioPlayer, setAudioModeAsync, useAudioPlayerStatus } from "expo-audio";
import { SvgXml } from "react-native-svg";
import { useFonts, Fredoka_500Medium, Fredoka_600SemiBold } from "@expo-google-fonts/fredoka";
import { Nunito_600SemiBold, Nunito_700Bold } from "@expo-google-fonts/nunito";

import { deviceVolume, type VolumeState } from "./modules/hush-native/src";
import { colors, fonts } from "./src/theme";
import { SOUNDS, beatIndex, soundById, type SoundId } from "./src/sounds";
import { LIMIT_DB, capGain, fullVolumeDb, levelAtCrib, safePlan } from "./src/safety";
import { DEFAULTS, loadSettings, saveSettings, type Settings } from "./src/storage";
import { Sky } from "./src/components/Sky";
import { Moon } from "./src/components/Moon";
import { Slider } from "./src/components/Slider";
import { MonitorScreen } from "./src/screens/MonitorScreen";

SplashScreen.preventAutoHideAsync().catch(() => {});

const TIMERS: [number, string][] = [[0, "Never"], [15, "15 min"], [30, "30 min"], [60, "1 hr"], [120, "2 hr"]];
const fmtDist = (m: number, unit: "m" | "ft") => (unit === "m" ? `${m.toFixed(1)} m` : `${Math.round(m * 3.281)} ft`);

export default function App() {
  return (
    <SafeAreaProvider>
      <Hush />
    </SafeAreaProvider>
  );
}

function Hush() {
  const insets = useSafeAreaInsets();
  const [fontsLoaded] = useFonts({ Fredoka_500Medium, Fredoka_600SemiBold, Nunito_600SemiBold, Nunito_700Bold });
  const [s, setS] = useState<Settings | null>(null);
  const [still, setStill] = useState(false);

  useEffect(() => {
    loadSettings().then(setS);
    AccessibilityInfo.isReduceMotionEnabled().then(setStill).catch(() => {});
  }, []);

  const ready = fontsLoaded && s != null;
  useEffect(() => {
    if (ready) SplashScreen.hideAsync().catch(() => {});
  }, [ready]);

  if (!ready) return <View style={{ flex: 1, backgroundColor: colors.bg }} />;
  return <Player initial={s} still={still} insets={insets} />;
}

function Player({ initial, still, insets }: { initial: Settings; still: boolean; insets: { top: number; bottom: number } }) {
  const [s, setRaw] = useState<Settings>({ ...DEFAULTS, ...initial });
  const set = useCallback((patch: Partial<Settings>) => {
    setRaw((prev) => {
      const next = { ...prev, ...patch };
      saveSettings(next);
      return next;
    });
  }, []);
  const [tab, setTab] = useState<"sleep" | "monitor">("sleep");
  const soundId = (SOUNDS.some((x) => x.id === s.sound) ? s.sound : "womb") as SoundId;
  const sound = soundById(soundId);

  /* ---------- audio ---------- */
  const player = useMemo(() => createAudioPlayer(sound.file, { updateInterval: 1000 }), []); // eslint-disable-line react-hooks/exhaustive-deps
  const status = useAudioPlayerStatus(player);
  const playing = status.playing;

  useEffect(() => {
    setAudioModeAsync({ playsInSilentMode: true, shouldPlayInBackground: true, interruptionMode: "doNotMix" }).catch(() => {});
    player.loop = true;
    return () => player.remove();
  }, [player]);

  const loaded = useRef<SoundId>(soundId);
  useEffect(() => {
    if (loaded.current === soundId) return;
    loaded.current = soundId;
    const wasPlaying = player.playing;
    player.replace(sound.file);
    player.loop = true;
    if (wasPlaying) player.play();
    try { player.updateLockScreenMetadata({ title: `${sound.name} noise`, artist: "hush" }); } catch {}
  }, [soundId, sound, player]);

  /* ---------- phone volume + safety ---------- */
  const [dev, setDev] = useState<VolumeState | null>(() => deviceVolume?.get() ?? null);
  useEffect(() => {
    if (!deviceVolume) return;
    const sub = deviceVolume.onChange(setDev);
    const app = AppState.addEventListener("change", (st) => st === "active" && setDev(deviceVolume!.get()));
    return () => { sub.remove(); app.remove(); };
  }, []);

  const plan = dev ? safePlan(s.dist, dev.max) : null;
  const appGain = plan ? plan.appGain : capGain(s.dist) * (s.vol / 100);
  const level = dev
    ? levelAtCrib(s.dist, dev.step, dev.max, plan!.appGain)
    : s.vol > 0 ? fullVolumeDb(s.dist) + 20 * Math.log10(appGain) : null;

  // While playing, the phone's media volume can't go past the safe step. Enforced natively,
  // so it holds with the screen locked too.
  useEffect(() => {
    if (!deviceVolume || !plan) return;
    const st = deviceVolume.setCeiling(playing ? plan.ceiling : -1);
    setDev(st);
  }, [playing, plan?.ceiling]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ---------- sleep timer ---------- */
  const stopAt = useRef(0);
  const [, force] = useState(0);
  useEffect(() => {
    stopAt.current = playing && s.timer ? Date.now() + s.timer * 60000 : 0;
  }, [playing, s.timer]);

  const gainRef = useRef(appGain);
  gainRef.current = appGain;
  const checkTimer = useCallback(() => {
    let fade = 1;
    if (stopAt.current) {
      const left = stopAt.current - Date.now();
      if (left <= 0) { stopAt.current = 0; player.pause(); }
      else if (left < 60000) fade = left / 60000; // gentle fade over the last minute
    }
    player.volume = gainRef.current * fade;
  }, [player]);

  useEffect(checkTimer, [appGain, status.currentTime, checkTimer]); // status updates keep arriving while locked
  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => { checkTimer(); force((n) => n + 1); }, 1000);
    return () => clearInterval(id);
  }, [playing, checkTimer]);

  /* ---------- ripples in time with the sound ---------- */
  const [beat, setBeat] = useState(-1);
  useEffect(() => {
    if (!playing || still) return;
    const id = setInterval(() => {
      if (AppState.currentState !== "active") return;
      setBeat(beatIndex(soundId, player.currentTime));
    }, 80);
    return () => clearInterval(id);
  }, [playing, still, soundId, player]);

  const toggle = () => {
    if (player.playing) {
      player.pause();
      return;
    }
    player.volume = appGain;
    player.play();
    try { player.setActiveForLockScreen(true, { title: `${sound.name} noise`, artist: "hush" }); } catch {}
  };

  /* ---------- copy ---------- */
  let sub = sound.sub;
  if (playing && stopAt.current) {
    const l = Math.max(0, stopAt.current - Date.now());
    sub = `Stops in ${Math.floor(l / 60000)}:${String(Math.floor((l % 60000) / 1000)).padStart(2, "0")}`;
  }
  const tag =
    s.dist < 1 ? { t: "A little close", c: colors.rose }
    : s.dist < 2 ? { t: "Okay, keep it soft", c: colors.moon }
    : { t: "Lovely spot", c: colors.sage };
  const volLabel = dev
    ? dev.step === 0 ? "Off" : dev.step >= plan!.ceiling ? "Max safe" : `${Math.round((dev.step / plan!.ceiling) * 100)}%`
    : s.vol === 100 ? "Max safe" : `${s.vol}%`;

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <Sky still={still} />
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: insets.top + 18, paddingBottom: insets.bottom + 36 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <View style={styles.logo}>
            <Text style={styles.h1}>hush</Text>
            <SvgXml
              width={17}
              height={17}
              style={{ marginTop: -2, marginLeft: 2, transform: [{ rotate: "-14deg" }] }}
              xml={`<svg viewBox="0 0 24 24"><path fill="${colors.moon}" d="M15.5 3.2a9 9 0 1 0 5.3 13.9A7.2 7.2 0 0 1 15.5 3.2z"/></svg>`}
            />
          </View>
          <View style={[styles.units, tab !== "sleep" && { opacity: 0 }]} pointerEvents={tab === "sleep" ? "auto" : "none"}>
            {(["m", "ft"] as const).map((u) => (
              <Pressable key={u} onPress={() => set({ unit: u })} style={[styles.unit, s.unit === u && styles.unitOn]}>
                <Text style={[styles.unitText, s.unit === u && { color: colors.cream }]}>{u}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        <View style={styles.tabs}>
          {(["sleep", "monitor"] as const).map((t) => (
            <Pressable key={t} onPress={() => setTab(t)} style={[styles.tab, tab === t && styles.tabOn]}>
              <Text style={[styles.tabText, tab === t && { color: colors.cream }]}>{t === "sleep" ? "Sleep" : "Monitor"}</Text>
            </Pressable>
          ))}
        </View>

        {tab === "monitor" && <MonitorScreen />}

        <View style={[styles.sleep, tab !== "sleep" && { display: "none" }]}>
        <View style={styles.stage}>
          <Moon
            playing={playing}
            beat={beat}
            softBeat={soundId === "womb" && beat % 2 === 1}
            slow={soundId === "ocean"}
            still={still}
            onPress={toggle}
          />
          <View style={styles.now}>
            <Text style={styles.nowName}>{sound.name}</Text>
            <Text style={styles.nowSub}>{sub}</Text>
          </View>
        </View>

        <View>
          <Text style={styles.h2}>Sound</Text>
          <View style={styles.grid}>
            {SOUNDS.map((x) => {
              const on = x.id === soundId;
              return (
                <Pressable
                  key={x.id}
                  onPress={() => set({ sound: x.id })}
                  style={({ pressed }) => [styles.tile, on && styles.tileOn, pressed && { transform: [{ scale: 0.95 }] }]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                >
                  <SvgXml
                    width={28}
                    height={28}
                    xml={`<svg viewBox="0 0 24 24" fill="none" stroke="${on ? colors.bg : colors.muted}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${x.icon}</svg>`}
                  />
                  <Text style={[styles.tileText, on && { color: colors.bg }]}>{x.name}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={styles.card}>
          <View>
            <View style={styles.row}>
              <Text style={[styles.h2, { marginBottom: 0 }]}>Phone to crib</Text>
              <Text style={styles.val}>{fmtDist(s.dist, s.unit)}</Text>
            </View>
            <Slider label="Distance from phone to crib" value={s.dist} min={0.3} max={4} step={0.1} onChange={(v) => set({ dist: v })} />
          </View>

          <View style={[styles.tag, { backgroundColor: tag.c }]}>
            <Text style={styles.tagText}>{tag.t}</Text>
          </View>

          <View style={styles.levels}>
            <View style={styles.lvl}>
              <Text style={styles.lvlLabel}>{dev ? "At the crib now" : "At the crib, at most"}</Text>
              <Text style={[styles.lvlNum, { color: colors.sage }]}>
                {level == null ? "–" : Math.round(Math.max(20, level))}
                <Text style={styles.lvlUnit}> dB</Text>
              </Text>
            </View>
            <View style={styles.lvl}>
              <Text style={styles.lvlLabel}>Safe limit</Text>
              <Text style={styles.lvlNum}>
                {LIMIT_DB}
                <Text style={styles.lvlUnit}> dB</Text>
              </Text>
            </View>
          </View>
          <Gauge level={level} />

          <View>
            <View style={styles.row}>
              <Text style={[styles.h2, { marginBottom: 0 }]}>{dev ? "Phone volume" : "Volume"}</Text>
              <Text style={styles.val}>{volLabel}</Text>
            </View>
            {dev ? (
              <Slider
                label="Phone volume"
                value={dev.step}
                min={0}
                max={dev.max}
                limit={plan!.ceiling}
                onChange={(v) => setDev(deviceVolume!.setStep(v))}
              />
            ) : (
              <Slider label="Volume" value={s.vol} min={0} max={100} onChange={(v) => set({ vol: v })} />
            )}
          </View>
          <Text style={styles.hint}>
            {dev
              ? `While Hush plays, your phone's volume buttons can't go past the line, so it stays under ${LIMIT_DB} dB at the crib.`
              : `Volume is locked so it can't pass ${LIMIT_DB} dB at the crib, even with your phone turned all the way up.`}
            {s.dist < 2 ? ` Moving the phone to ${fmtDist(2, s.unit)} or more lets it play fuller.` : ""}
          </Text>
        </View>

        <View>
          <Text style={styles.h2}>Stop after</Text>
          <View style={styles.chips}>
            {TIMERS.map(([m, l]) => (
              <Pressable
                key={m}
                onPress={() => {
                  set({ timer: m });
                  stopAt.current = m && playing ? Date.now() + m * 60000 : 0;
                }}
                style={({ pressed }) => [styles.chip, s.timer === m && styles.chipOn, pressed && { transform: [{ scale: 0.94 }] }]}
              >
                <Text style={[styles.chipText, s.timer === m && { color: colors.bg }]}>{l}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        <Text style={styles.note}>
          Levels are estimates for a typical phone speaker. For an exact number, hold a decibel‑meter app at the crib.
        </Text>
        </View>
      </ScrollView>
    </View>
  );
}

/** 20–80 dB bar with the 50 dB line marked. */
function Gauge({ level }: { level: number | null }) {
  const pos = (x: number) => Math.max(0, Math.min(100, ((x - 20) / 60) * 100));
  return (
    <View style={styles.gauge}>
      <View style={[styles.gaugeFill, { width: `${level == null ? 0 : pos(level)}%` }]} />
      <View style={[styles.gaugeMark, { left: `${pos(LIMIT_DB)}%` }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: 20, gap: 26, maxWidth: 460, width: "100%", alignSelf: "center" },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  logo: { flexDirection: "row", alignItems: "flex-start" },
  h1: { fontFamily: fonts.displayBold, fontSize: 28, color: colors.moon, lineHeight: 32 },
  units: { flexDirection: "row", backgroundColor: colors.card, borderRadius: 99, padding: 3 },
  tabs: { flexDirection: "row", gap: 22, marginTop: -8 },
  tab: { paddingVertical: 4, borderBottomWidth: 2, borderBottomColor: "transparent" },
  tabOn: { borderBottomColor: colors.peach },
  tabText: { fontFamily: fonts.display, fontSize: 17, color: colors.muted },
  sleep: { gap: 26 },
  unit: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 99 },
  unitOn: { backgroundColor: colors.card2 },
  unitText: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.muted },

  stage: { alignItems: "center", gap: 6, marginTop: -10 },
  now: { alignItems: "center", gap: 2 },
  nowName: { fontFamily: fonts.display, fontSize: 23, color: colors.cream },
  nowSub: { fontFamily: fonts.body, fontSize: 13.5, color: colors.muted, fontVariant: ["tabular-nums"] },

  h2: { fontFamily: fonts.display, fontSize: 15, color: colors.muted, marginBottom: 12 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  tile: {
    flexBasis: "31%",
    flexGrow: 1,
    backgroundColor: colors.card,
    borderRadius: 20,
    paddingTop: 15,
    paddingBottom: 12,
    alignItems: "center",
    gap: 7,
  },
  tileOn: { backgroundColor: colors.peach },
  tileText: { fontFamily: fonts.bodyBold, fontSize: 13.5, color: colors.muted },

  card: { backgroundColor: colors.card, borderRadius: 24, padding: 18, gap: 16 },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 },
  val: { fontFamily: fonts.display, fontSize: 17, color: colors.cream, fontVariant: ["tabular-nums"] },
  tag: { alignSelf: "flex-start", borderRadius: 99, paddingHorizontal: 10, paddingVertical: 4 },
  tagText: { fontFamily: fonts.bodyBold, fontSize: 12.5, color: colors.bg },
  levels: { flexDirection: "row", gap: 8 },
  lvl: { flex: 1, backgroundColor: colors.card2, borderRadius: 18, paddingHorizontal: 14, paddingVertical: 12, gap: 2 },
  lvlLabel: { fontFamily: fonts.body, fontSize: 12.5, color: colors.muted },
  lvlNum: { fontFamily: fonts.display, fontSize: 30, color: colors.cream, fontVariant: ["tabular-nums"] },
  lvlUnit: { fontFamily: fonts.body, fontSize: 14, color: colors.muted },
  gauge: { height: 8, borderRadius: 99, backgroundColor: colors.card2 },
  gaugeFill: { position: "absolute", left: 0, top: 0, bottom: 0, borderRadius: 99, backgroundColor: colors.sage },
  gaugeMark: { position: "absolute", top: -5, bottom: -5, width: 3, marginLeft: -1.5, borderRadius: 2, backgroundColor: colors.cream },
  hint: { fontFamily: fonts.body, fontSize: 13.5, lineHeight: 20, color: colors.muted, marginTop: -4 },

  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { backgroundColor: colors.card, borderRadius: 99, paddingHorizontal: 15, paddingVertical: 9 },
  chipOn: { backgroundColor: colors.cream },
  chipText: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.muted },
  note: { fontFamily: fonts.body, fontSize: 12.5, lineHeight: 19, color: colors.muted, textAlign: "center", opacity: 0.8 },
});
