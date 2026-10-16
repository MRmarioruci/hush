import { useCallback, useEffect, useState } from "react";
import { AppState, PermissionsAndroid, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Notifications from "expo-notifications";
import { SvgXml } from "react-native-svg";
import { cryDetector } from "../../modules/hush-native/src";
import { colors, fonts } from "../theme";
import { LIMIT_DB } from "../safety";
import { useSleep, fmtDist } from "../state/sleep";
import { useMonitor } from "../state/monitor";
import { useT } from "../i18n";
import { Slider } from "../components/Slider";
import { ICONS, Icon, Pill } from "../components/ui";
import { LanguagePicker, useLangLabel } from "../components/LanguagePicker";

type Job = "sounds" | "nursery" | "parent";
const MOON = `<svg viewBox="0 0 24 24"><path fill="${colors.moon}" d="M15.5 3.2a9 9 0 1 0 5.3 13.9A7.2 7.2 0 0 1 15.5 3.2z"/></svg>`;
const GLOBE = '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z"/>';

/** First-time setup: name, what this phone does, distance to the crib, and only the permissions that job needs. */
export function OnboardingScreen({ onDone }: { onDone: () => void }) {
  const insets = useSafeAreaInsets();
  const t = useT();
  const sleep = useSleep();
  const mon = useMonitor();
  const [step, setStep] = useState(0);
  const [job, setJob] = useState<Job | null>(mon.m.role ?? null);
  const [picking, setPicking] = useState(false);
  const langLabel = useLangLabel();
  const baby = mon.m.babyName.trim() || t("baby.default");

  // Steps depend on the job: the parent's phone doesn't need the distance, the sounds-only phone needs no permissions.
  const steps: string[] = ["welcome", "name", "job"];
  if (job !== "parent") steps.push("distance");
  if (job === "nursery" || job === "parent") steps.push("perms");
  const id = steps[Math.min(step, steps.length - 1)];
  const last = step >= steps.length - 1;

  const next = () => (last ? finish() : setStep((s) => s + 1));
  const finish = () => {
    mon.update({ role: job === "sounds" ? null : job });
    onDone();
  };
  const canNext = id !== "job" || job != null;

  return (
    <View style={[styles.root, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 16 }]}>
      {id !== "welcome" && (
        <View style={styles.dots}>
          {steps.slice(1).map((s, i) => <View key={s} style={[styles.dot, i + 1 <= step && styles.dotOn]} />)}
        </View>
      )}

      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        {id === "welcome" && (
          <View style={styles.welcome}>
            <View style={styles.moonGlow}>
              <SvgXml width={92} height={92} xml={MOON} />
            </View>
            <Text style={styles.brand}>hush</Text>
            <Text style={styles.title}>{t("ob.welcome")}</Text>
            <Text style={styles.sub}>{t("ob.welcomeSub")}</Text>
            <Pressable onPress={() => setPicking(true)} style={styles.langBtn} accessibilityLabel={t("settings.language")}>
              <Icon d={GLOBE} size={18} color={colors.cream} />
              <Text style={styles.langText} numberOfLines={1}>{langLabel}</Text>
            </Pressable>
          </View>
        )}

        {id === "name" && (
          <View style={styles.stepBox}>
            <Text style={styles.title}>{t("ob.nameTitle")}</Text>
            <Text style={styles.sub}>{t("ob.nameSub", { example: mon.m.babyName.trim() || "Leo" })}</Text>
            <TextInput
              value={mon.m.babyName}
              onChangeText={(babyName) => mon.update({ babyName })}
              placeholder={t("settings.babyName")}
              placeholderTextColor={colors.muted}
              style={styles.nameInput}
              maxLength={24}
              autoCapitalize="words"
              autoFocus
              returnKeyType="next"
              onSubmitEditing={next}
            />
          </View>
        )}

        {id === "job" && (
          <View style={styles.stepBox}>
            <Text style={styles.title}>{t("ob.jobTitle")}</Text>
            <View style={{ gap: 10, marginTop: 8 }}>
              <JobCard on={job === "sounds"} icon={ICONS.sounds} tone={colors.moon} title={t("ob.jobSounds")} sub={t("ob.jobSoundsSub")} onPress={() => setJob("sounds")} />
              <JobCard on={job === "nursery"} icon={ICONS.crib} tone={colors.sage} title={t("ob.jobNursery", { name: baby })} sub={t("ob.jobNurserySub")} onPress={() => setJob("nursery")} />
              <JobCard on={job === "parent"} icon={ICONS.bell} tone={colors.peach} title={t("ob.jobParent")} sub={t("ob.jobParentSub")} onPress={() => setJob("parent")} />
            </View>
          </View>
        )}

        {id === "distance" && (
          <View style={styles.stepBox}>
            <Text style={styles.title}>{t("ob.distTitle")}</Text>
            <Text style={styles.sub}>{t("ob.distSub", { db: LIMIT_DB })}</Text>
            <View style={styles.distCard}>
              <Text style={styles.distValue}>{fmtDist(sleep.s.dist, sleep.s.unit)}</Text>
              <Slider label={t("sounds.phoneToCrib")} value={sleep.s.dist} min={0.3} max={4} step={0.1} onChange={(v) => sleep.set({ dist: v })} />
              <View style={styles.distRow}>
                <Pill
                  label={sleep.s.dist < 1 ? t("sounds.tagClose") : sleep.s.dist < 2 ? t("sounds.tagSoft") : t("sounds.tagLovely")}
                  color={sleep.s.dist < 1 ? colors.rose : sleep.s.dist < 2 ? colors.moon : colors.sage}
                />
                <View style={styles.units}>
                  {(["m", "ft"] as const).map((u) => (
                    <Pressable key={u} onPress={() => sleep.set({ unit: u })} style={[styles.unit, sleep.s.unit === u && styles.unitOn]}>
                      <Text style={[styles.unitText, sleep.s.unit === u && { color: colors.bg }]}>{u}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            </View>
          </View>
        )}

        {id === "perms" && job && <Permissions job={job} />}
      </ScrollView>

      <View style={styles.footer}>
        {step > 0 ? (
          <Pressable onPress={() => setStep((s) => s - 1)} hitSlop={10} style={styles.backBtn}>
            <Text style={styles.backText}>{t("common.back")}</Text>
          </Pressable>
        ) : <View />}
        <Pressable
          onPress={next}
          disabled={!canNext}
          style={({ pressed }) => [styles.nextBtn, !canNext && { opacity: 0.35 }, pressed && { transform: [{ scale: 0.97 }] }]}
        >
          <Text style={styles.nextText}>{id === "welcome" ? t("ob.start") : last ? t("ob.finish") : t("common.next")}</Text>
        </Pressable>
      </View>
      <LanguagePicker visible={picking} onClose={() => setPicking(false)} />
    </View>
  );
}

function JobCard({ on, icon, tone, title, sub, onPress }: { on: boolean; icon: string; tone: string; title: string; sub: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ checked: on }}
      style={({ pressed }) => [styles.job, on && styles.jobOn, pressed && { transform: [{ scale: 0.98 }] }]}
    >
      <View style={[styles.jobIcon, { backgroundColor: tone }]}>
        <Icon d={icon} size={24} color={colors.bg} width={2} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.jobTitle}>{title}</Text>
        <Text style={styles.jobSub}>{sub}</Text>
      </View>
      <View style={[styles.radio, on && styles.radioOn]}>{on && <View style={styles.radioDot} />}</View>
    </Pressable>
  );
}

/** Ask only for what this phone's job needs, each with its own Allow button. */
function Permissions({ job }: { job: Job }) {
  const t = useT();
  const nursery = job === "nursery";
  const [mic, setMic] = useState(false);
  const [notif, setNotif] = useState(false);
  const [battery, setBattery] = useState(() => cryDetector?.isBatteryExempt() ?? true);

  const refresh = useCallback(async () => {
    if (Platform.OS === "android") {
      setMic(await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO).catch(() => false));
    }
    setNotif((await Notifications.getPermissionsAsync().catch(() => ({ granted: false }))).granted);
    setBattery(cryDetector?.isBatteryExempt() ?? true);
  }, []);
  useEffect(() => {
    refresh();
    const sub = AppState.addEventListener("change", (s) => s === "active" && refresh());
    return () => sub.remove();
  }, [refresh]);

  return (
    <View style={styles.stepBox}>
      <Text style={styles.title}>{t("ob.permTitle")}</Text>
      <Text style={styles.sub}>{t("ob.permSub")}</Text>
      <View style={styles.permList}>
        {nursery && Platform.OS === "android" && (
          <PermRow
            title={t("ob.mic")}
            sub={t("ob.micSub")}
            ok={mic}
            onAllow={async () => {
              await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO).catch(() => null);
              refresh();
            }}
          />
        )}
        <PermRow
          title={t("ob.notif")}
          sub={nursery ? t("ob.notifNursery") : t("ob.notifParent")}
          ok={notif}
          onAllow={async () => {
            await Notifications.requestPermissionsAsync().catch(() => null);
            refresh();
          }}
        />
        {nursery && Platform.OS === "android" && (
          <PermRow title={t("ob.battery")} sub={t("ob.batterySub")} ok={battery} onAllow={() => cryDetector?.requestBatteryExempt()} />
        )}
      </View>
      {nursery && (
        <View style={styles.tip}>
          <Icon d='<path d="M13 3 6 14h5l-1 7 7-11h-5z"/>' size={18} color={colors.moon} />
          <Text style={styles.tipText}>{t("ob.tip")}</Text>
        </View>
      )}
    </View>
  );
}

function PermRow({ title, sub, ok, onAllow }: { title: string; sub: string; ok: boolean; onAllow: () => void }) {
  const t = useT();
  return (
    <View style={styles.perm}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={styles.jobTitle}>{title}</Text>
        <Text style={styles.jobSub}>{sub}</Text>
      </View>
      {ok ? (
        <View style={styles.allowed}>
          <Icon d={ICONS.check} size={16} color={colors.bg} width={2.6} />
          <Text style={styles.allowedText}>{t("ob.allowed")}</Text>
        </View>
      ) : (
        <Pressable onPress={onAllow} style={styles.allow}>
          <Text style={styles.allowText}>{t("ob.allow")}</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingHorizontal: 22, maxWidth: 480, width: "100%", alignSelf: "center" },
  dots: { flexDirection: "row", gap: 6, justifyContent: "center", paddingVertical: 8 },
  dot: { width: 22, height: 4, borderRadius: 2, backgroundColor: colors.card2 },
  dotOn: { backgroundColor: colors.peach },
  body: { flexGrow: 1, justifyContent: "center", paddingVertical: 20 },

  welcome: { alignItems: "center", gap: 10 },
  moonGlow: { width: 150, height: 150, borderRadius: 75, backgroundColor: "rgba(246,226,176,0.08)", alignItems: "center", justifyContent: "center", marginBottom: 6 },
  brand: { fontFamily: fonts.displayBold, fontSize: 44, color: colors.moon, lineHeight: 50 },
  langBtn: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.card, borderRadius: 99, paddingHorizontal: 16, paddingVertical: 10, marginTop: 18, maxWidth: "100%" },
  langText: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.cream, flexShrink: 1 },

  stepBox: { gap: 10 },
  title: { fontFamily: fonts.displayBold, fontSize: 27, lineHeight: 33, color: colors.cream, textAlign: "center" },
  sub: { fontFamily: fonts.body, fontSize: 15, lineHeight: 22, color: colors.muted, textAlign: "center", paddingHorizontal: 8 },
  nameInput: {
    marginTop: 22, fontFamily: fonts.display, fontSize: 28, color: colors.cream, textAlign: "center",
    paddingVertical: 10, borderBottomWidth: 2, borderBottomColor: colors.peach, outlineWidth: 0,
  } as object,

  job: { flexDirection: "row", alignItems: "center", gap: 14, backgroundColor: colors.card, borderRadius: 22, padding: 16, borderWidth: 2, borderColor: "transparent" },
  jobOn: { borderColor: colors.peach },
  jobIcon: { width: 48, height: 48, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  jobTitle: { fontFamily: fonts.display, fontSize: 17, color: colors.cream },
  jobSub: { fontFamily: fonts.body, fontSize: 13.5, lineHeight: 19, color: colors.muted },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: "#463d63", alignItems: "center", justifyContent: "center" },
  radioOn: { borderColor: colors.peach },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.peach },

  distCard: { backgroundColor: colors.card, borderRadius: 24, padding: 18, gap: 12, marginTop: 14 },
  distValue: { fontFamily: fonts.displayBold, fontSize: 40, color: colors.cream, textAlign: "center", fontVariant: ["tabular-nums"] },
  distRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  units: { flexDirection: "row", backgroundColor: colors.card2, borderRadius: 99, padding: 3 },
  unit: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 99 },
  unitOn: { backgroundColor: colors.cream },
  unitText: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.muted },

  permList: { backgroundColor: colors.card, borderRadius: 22, paddingHorizontal: 16, marginTop: 14 },
  perm: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#3a3352" },
  allow: { backgroundColor: colors.peach, borderRadius: 99, paddingHorizontal: 16, paddingVertical: 9 },
  allowText: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.bg },
  allowed: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: colors.sage, borderRadius: 99, paddingHorizontal: 12, paddingVertical: 8 },
  allowedText: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.bg },
  tip: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 6, marginTop: 6 },
  tipText: { flex: 1, fontFamily: fonts.body, fontSize: 13.5, lineHeight: 19, color: colors.muted },

  footer: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingTop: 10 },
  backBtn: { paddingHorizontal: 6, paddingVertical: 10 },
  backText: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.muted },
  nextBtn: { backgroundColor: colors.peach, borderRadius: 99, paddingHorizontal: 28, paddingVertical: 15, minWidth: 140, alignItems: "center" },
  nextText: { fontFamily: fonts.bodyBold, fontSize: 16, color: colors.bg },
});
