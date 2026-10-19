import { useEffect, useRef, useState, useCallback } from "react";
import { Alert, Animated, AppState, Easing, Modal, Pressable, ScrollView, Share, StyleSheet, Text, TextInput, View, Platform, Switch, ActivityIndicator } from "react-native";
import * as Notifications from "expo-notifications";
import { CameraView, useCameraPermissions } from "expo-camera";
import QRCode from "react-native-qrcode-svg";
import { cryDetector } from "../../modules/hush-native/src";
import { colors, fonts } from "../theme";
import { ALERT_AFTER, CRY_CLIP_SECONDS, THRESHOLDS, addPushListener, getMyToken, loadAlerts, recordAlert, sendData, type AlertRecord, type Sensitivity } from "../monitor";
import { inviteLink } from "../family";
import { YAMNET_LABELS } from "../yamnetLabels";
import { MonitorHero } from "../components/MonitorHero";
import { useMonitor } from "../state/monitor";
import { useFocusEffect } from "@react-navigation/native";
import { useSleep } from "../state/sleep";
import { useNaps } from "../state/naps";
import { stopLine } from "../stops";
import { EAR, ListenRound, RoundBtn } from "../components/Listen";
import { Ring } from "../components/Ring";
import { MoonFace } from "../components/MoonFace";
import Svg, { Circle, SvgXml } from "react-native-svg";
import { TRIAL_DAYS, useUnlock } from "../state/unlock";
import { Card, ICONS, Icon, Label, Screen } from "../components/ui";
import { fmtTime, getLang, heardLabel, t, tIn, useT, babyLabel, babyLabelIn } from "../i18n";
import { SOUNDS } from "../sounds";
const PLUS = '<path d="M12 5v14M5 12h14"/>';
const X = '<path d="M6 6l12 12M18 6 6 18"/>';
const SEND = '<path d="M4 12 20 4l-6 16-3-7z"/>';

export function MonitorScreen() {
  const { members, listening, rooms } = useMonitor();
  useT();
  const alerts = useAlerts();
  const [fam, setFam] = useState(false);
  return (
    <Screen title={t("monitor.title")} right={members.length ? <Avatars onPress={() => setFam(true)} /> : undefined}>
      {members.length === 0 ? (
        <FamilyStart />
      ) : listening ? (
        <>
          <ThisPhone />
          {rooms.length > 0 && <OtherRooms alerts={alerts} />}
        </>
      ) : (
        <>
          <OtherRooms alerts={alerts} />
          <StartHere />
        </>
      )}
      <Modal visible={fam} transparent animationType="slide" onRequestClose={() => setFam(false)}>
        <Pressable style={styles.sheetBack} onPress={() => setFam(false)} accessibilityLabel={t("common.close")} />
        <View style={styles.sheet}>
          <View style={styles.grab} />
          <ScrollView contentContainerStyle={{ gap: 14, paddingBottom: 30 }} keyboardShouldPersistTaps="handled"><FamilyCard /></ScrollView>
        </View>
      </Modal>
    </Screen>
  );
}

/** The family's phones as overlapping initials, top right. Opens the phones sheet. */
function Avatars({ onPress }: { onPress: () => void }) {
  const { m, members } = useMonitor();
  const names = [m.myName.trim() || t("fam.thisPhone"), ...members.map((p, i) => p.name.trim() || t("fam.unnamed", { n: i + 2 }))];
  const tints = [colors.peach, "#c9bfff", colors.sage, colors.rose];
  return (
    <Pressable onPress={onPress} hitSlop={8} style={{ flexDirection: "row" }} accessibilityRole="button" accessibilityLabel={t("fam.title")}>
      {names.slice(0, 4).map((n, i) => (
        <View key={i} style={[styles.headAvatar, { backgroundColor: tints[i % tints.length], marginLeft: i ? -10 : 0 }]}>
          <Text style={styles.headAvatarText}>{n.slice(0, 1).toUpperCase()}</Text>
        </View>
      ))}
      {names.length > 4 && <View style={[styles.headAvatar, { backgroundColor: colors.card2, marginLeft: -10 }]}><Text style={[styles.headAvatarText, { color: colors.cream }]}>+{names.length - 4}</Text></View>}
    </Pressable>
  );
}

/** Not listening here: one small button to make this phone the monitor. */
function StartHere() {
  const { toggleListening, lastStop } = useMonitor();
  const [msg, setMsg] = useState<string | null>(null);
  const last = stopLine(lastStop, t, fmtTime);
  return (
    <View style={{ alignItems: "center", gap: 8, marginTop: 6 }}>
      <Pressable onPress={async () => setMsg(await toggleListening())} style={({ pressed }) => [styles.useHere, pressed && { transform: [{ scale: 0.97 }] }]} accessibilityRole="button">
        <Icon d={ICONS.mic} size={18} color={colors.sage} width={2} />
        <Text style={styles.useHereText}>{t("here.useThis")}</Text>
      </Pressable>
      {last && <Text style={styles.meta}>{last}</Text>}
      <TrialNote />
      {msg && <Text style={styles.msg}>{msg}</Text>}
    </View>
  );
}

/* ---------------- no family yet: join the phones ---------------- */

function FamilyStart() {
  const { m, update, baby, join, joining } = useMonitor();
  const [showCode, setShowCode] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const onCode = async (raw: string) => { setScanning(false); setErr(await join(raw)); };
  return (
    <>
      <MonitorHero baby={baby} />
      <View style={{ gap: 6, alignItems: "center", marginBottom: 4 }}>
        <Text style={styles.lead}>{t("fam.startTitle")}</Text>
        <Text style={styles.leadSub}>{t("fam.startSub")}</Text>
      </View>
      <Card style={{ gap: 12 }}>
        <TextInput value={m.myName} onChangeText={(myName) => update({ myName })} placeholder={t("fam.myName")} placeholderTextColor={colors.muted} style={styles.input} maxLength={30} />
        {showCode ? (
          <CodeCard onClose={() => setShowCode(false)} bare />
        ) : (
          <View style={{ flexDirection: "row", gap: 10 }}>
            <Pressable onPress={() => setShowCode(true)} style={[styles.primary, { flex: 1 }]}><Text style={styles.primaryText}>{t("fam.showCode")}</Text></Pressable>
            <Pressable onPress={() => setScanning(true)} style={[styles.secondary, { flex: 1 }]}><Text style={styles.secondaryText}>{t("fam.scan")}</Text></Pressable>
          </View>
        )}
        <JoinStatus err={err} joining={joining} />
      </Card>
      <Scanner visible={scanning} onClose={() => setScanning(false)} onCode={onCode} />
    </>
  );
}

function JoinStatus({ err, joining }: { err: string | null; joining: string | null }) {
  if (err) return <Text style={[styles.msg, { color: colors.rose }]}>{err}</Text>;
  if (joining === "failed") return <Text style={[styles.msg, { color: colors.rose }]}>{t("fam.joinFailed")}</Text>;
  if (joining) return (
    <View style={{ flexDirection: "row", gap: 10, alignItems: "center", justifyContent: "center" }}>
      <ActivityIndicator color={colors.cream} size="small" />
      <Text style={styles.msg}>{t("fam.joining")}</Text>
    </View>
  );
  return null;
}

/** The code other phones scan (or the same thing as a link to send). */
function CodeCard({ onClose, bare }: { onClose?: () => void; bare?: boolean }) {
  const { invite, members } = useMonitor();
  const [code, setCode] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { invite().then(setCode, (e) => setErr((e as Error).message)); }, [invite]);
  // Close once a new phone has joined.
  const count = useRef(members.length);
  useEffect(() => { if (members.length > count.current) onClose?.(); count.current = members.length; }, [members.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const body = (
    <View style={{ alignItems: "center", gap: 14 }}>
      <Text style={styles.stepTitle}>{t("fam.codeTitle")}</Text>
      <View style={styles.qr}>
        {code ? <QRCode value={code} size={188} backgroundColor={colors.cream} color={colors.bg} /> : <Text style={styles.qrWait}>{err ?? t("pair.ready")}</Text>}
      </View>
      <View style={{ gap: 10, alignSelf: "stretch" }}>
        <Step n={1} text={t("fam.codeStep1")} />
        <Step n={2} text={t("fam.codeStep2")} />
      </View>
      {code && (
        <Pressable onPress={() => Share.share({ message: t("fam.shareMsg", { link: inviteLink(code) }) }).catch(() => {})} style={styles.inline} hitSlop={8}>
          <Icon d={SEND} size={15} color={colors.peach} />
          <Text style={styles.inlineText}>{t("fam.shareLink")}</Text>
        </Pressable>
      )}
      {onClose && <Pressable onPress={onClose} hitSlop={10}><Text style={styles.change}>{t("common.cancel")}</Text></Pressable>}
    </View>
  );
  return bare ? body : <Card>{body}</Card>;
}

/* ---------------- the family: every phone that joined ---------------- */

function FamilyCard() {
  const { m, update, members, removeMember, leaveFamily, join, joining, baby } = useMonitor();
  const [showCode, setShowCode] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const onCode = async (raw: string) => { setScanning(false); setErr(await join(raw)); };
  const nameOf = (name: string, i: number) => name.trim() || t("fam.unnamed", { n: i + 2 });
  const test = async () => {
    if (!cryDetector || !members.length) return;
    setMsg(t("nursery.sending"));
    let ok = true;
    for (const L of [...new Set(members.map((p) => p.lang ?? getLang()))]) {
      const to = members.filter((p) => (p.lang ?? getLang()) === L).map((p) => p.token);
      const r = await cryDetector.sendAlert(to, tIn(L, "nursery.testBody", { name: babyLabelIn(L, m.babyName) }), "test");
      ok = ok && r.ok;
    }
    setMsg(ok ? t("nursery.testSent") : t("nursery.testFail"));
  };
  return (
    <>
      <Card style={{ gap: 4 }}>
        <Label right={<Pressable onPress={test} hitSlop={10} style={styles.inline}><Icon d={SEND} size={15} color={colors.peach} /><Text style={styles.inlineText}>{t("fam.test")}</Text></Pressable>}>
          {t("fam.title")}
        </Label>
        <Pressable onPress={() => setEditing(true)} style={styles.person}>
          <View style={[styles.avatar, { backgroundColor: colors.sage }]}><Icon d={ICONS.mic} size={16} color={colors.bg} width={2} /></View>
          {editing ? (
            <TextInput autoFocus value={m.myName} onChangeText={(myName) => update({ myName })} onBlur={() => setEditing(false)} placeholder={t("fam.myName")} placeholderTextColor={colors.muted} style={[styles.input, { flex: 1, textAlign: "left", paddingVertical: 7 }]} maxLength={30} />
          ) : (
            <Text style={styles.personName} numberOfLines={1}>{m.myName.trim() || t("fam.thisPhone")}</Text>
          )}
          <Text style={styles.youTag}>{t("fam.thisPhone")}</Text>
        </Pressable>
        {members.map((p, i) => (
          <View key={p.token} style={styles.person}>
            <View style={styles.avatar}><Text style={styles.avatarText}>{nameOf(p.name, i).slice(0, 1).toUpperCase()}</Text></View>
            <Text style={styles.personName} numberOfLines={1}>{nameOf(p.name, i)}</Text>
            <Pressable
              onPress={() => Alert.alert(nameOf(p.name, i), t("fam.removeAsk", { name: nameOf(p.name, i) }), [{ text: t("common.cancel"), style: "cancel" }, { text: t("fam.remove"), style: "destructive", onPress: () => removeMember(p.token) }])}
              hitSlop={12}
              accessibilityLabel={t("nursery.remove", { name: nameOf(p.name, i) })}
            >
              <Icon d={X} size={18} />
            </Pressable>
          </View>
        ))}
        {!showCode && (
          <Pressable onPress={() => setShowCode(true)} style={styles.person}>
            <View style={[styles.avatar, { backgroundColor: colors.card2 }]}><Icon d={PLUS} size={18} color={colors.peach} width={2.2} /></View>
            <Text style={[styles.personName, { color: colors.peach }]}>{t("fam.add")}</Text>
          </Pressable>
        )}
        {showCode && <View style={{ paddingTop: 10 }}><CodeCard onClose={() => setShowCode(false)} bare /></View>}
        <View style={styles.famLinks}>
          <Pressable onPress={() => setScanning(true)} hitSlop={8}><Text style={styles.change}>{t("fam.scan")}</Text></Pressable>
          <Pressable
            onPress={() => Alert.alert(t("fam.leave"), t("fam.leaveAsk", { name: baby }), [{ text: t("common.cancel"), style: "cancel" }, { text: t("fam.leave"), style: "destructive", onPress: leaveFamily }])}
            hitSlop={8}
          >
            <Text style={[styles.change, { color: colors.muted }]}>{t("fam.leave")}</Text>
          </Pressable>
        </View>
        <JoinStatus err={err} joining={joining} />
        {msg && <Text style={styles.msg}>{msg}</Text>}
      </Card>
      <Scanner visible={scanning} onClose={() => setScanning(false)} onCode={onCode} />
    </>
  );
}

/* ---------------- this phone stays with the baby ---------------- */

/** Trial / unlock status on the baby's phone. Hidden once unlocked. */
function TrialNote() {
  const u = useUnlock();
  if (u.status === "unlocked") return null;
  const text = u.status === "notStarted" ? t("unlock.noteStart", { count: TRIAL_DAYS })
    : u.status === "trial" ? t("unlock.noteLeft", { count: u.daysLeft })
    : t("unlock.noteEnded");
  return (
    <Pressable onPress={u.showPaywall} style={({ pressed }) => [styles.trial, pressed && { opacity: 0.7 }]} accessibilityRole="button">
      <View style={[styles.trialDot, u.status === "expired" && { backgroundColor: colors.rose }]} />
      <Text style={styles.trialText}>{text}</Text>
      <Text style={styles.trialLink}>{t("unlock.unlock")}</Text>
    </Pressable>
  );
}

/** This phone as the baby monitor: a card to start, or everything about it while it listens. */
function ThisPhone() {
  const { m, update, listening, status, toggleListening, baby, members } = useMonitor();
  const [msg, setMsg] = useState<string | null>(null);
  const crying = !!status.crying;
  const toggle = async () => setMsg(await toggleListening());
  if (!listening) return null;
  const threshold = THRESHOLDS[m.sensitivity];
  const score = status.score ?? 0;
  const level = Math.min(1, score / Math.max(threshold * 2, 0.01)); // the alert line sits halfway round
  const hears = status.top != null && (status.topScore ?? 0) > 0.1 ? heardLabel(status.top, YAMNET_LABELS[status.top]) : null;
  const clipSecs = m.cryClip ?? CRY_CLIP_SECONDS;
  const cycle = <T,>(xs: T[], v: T) => xs[(xs.indexOf(v) + 1) % xs.length];
  // Listen-in: off -> on -> on with a clip on crying alerts (5 s, 10 s) -> off.
  const listenStep = !m.allowListen ? 0 : clipSecs === 0 ? 1 : clipSecs === 5 ? 2 : 3;
  const nextListen = () => {
    const n = (listenStep + 1) % 4;
    update(n === 0 ? { allowListen: false } : { allowListen: true, cryClip: [0, 0, 5, 10][n] });
  };
  const names = members.map((p, i) => p.name.trim() || t("fam.unnamed", { n: i + 2 })).join(", ");
  return (
    <>
      <View style={{ alignItems: "center" }}>
        <ListeningOrb level={level} hot={score >= threshold} crying={crying} baby={baby} onPress={toggle} />
        <Text style={styles.orbMeta} numberOfLines={1}>{hears ?? t("rt.ringHint")}</Text>
      </View>

      <View style={styles.toggles}>
        <RoundBtn size={64} onPress={nextListen} bg={m.allowListen ? "#c9bfff" : colors.card}
          label={listenStep === 0 ? t("rt.listenOff") : listenStep === 1 ? t("rt.listenOn") : t("rt.listenClip", { s: clipSecs })} a11y={t("listen.allow")}>
          <Icon d={EAR} size={26} color={m.allowListen ? colors.bg : "#c9bfff"} width={2} />
        </RoundBtn>
        <RoundBtn size={64} onPress={() => update({ alertAfter: cycle(ALERT_AFTER.map(([v]) => v), m.alertAfter) })} bg="#c9bfff"
          label={m.alertAfter === 0 ? t("rt.alertNow") : t("rt.alertAfter", { after: t(`after.${m.alertAfter}`) })}>
          <Icon d={BELL} size={26} color={colors.bg} width={2} />
        </RoundBtn>
        <RoundBtn size={64} onPress={() => update({ sensitivity: cycle(["low", "medium", "high"] as Sensitivity[], m.sensitivity) })}
          label={t("rt.sensitivity", { level: t(`sens.${m.sensitivity}`) })}>
          <Icon d={SLIDERS} size={26} color="#c9bfff" width={2} />
        </RoundBtn>
      </View>

      <PowerPill names={names} />
      <TrialNote />
      {msg && <Text style={styles.msg}>{msg}</Text>}
    </>
  );
}

const BELL = '<path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15zM10 20a2 2 0 0 0 4 0"/>';
const SLIDERS = '<path d="M4 7h10M18 7h2M4 17h4M12 17h8M16 5v4M10 15v4"/>';
const BOLT = '<path d="M13 3 6 14h5l-1 7 7-11h-5z"/>';
const MIC = '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21"/>';

/** The listening button: a mint circle inside a ring that fills as the room gets louder. Tap to stop. */
function ListeningOrb({ level, hot, crying, baby, onPress }: { level: number; hot: boolean; crying: boolean; baby: string; onPress: () => void }) {
  const tone = crying ? colors.rose : colors.sage;
  const ink = crying ? "#5a1f2b" : "#1e4a39";
  const breathe = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(breathe, { toValue: 1, duration: crying ? 600 : 2200, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      Animated.timing(breathe, { toValue: 0, duration: crying ? 600 : 2200, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [crying, breathe]);
  const C = 2 * Math.PI * 90;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [{ width: 250, height: 250, alignItems: "center", justifyContent: "center" }, pressed && { transform: [{ scale: 0.97 }] }]}
      accessibilityRole="switch" accessibilityState={{ checked: true }} accessibilityLabel={t("orb.a11y")}>
      <Animated.View style={{ position: "absolute", left: 0, top: 0, opacity: breathe.interpolate({ inputRange: [0, 1], outputRange: [0.55, 1] }) }}>
        <Svg width={250} height={250}>
          <Circle cx={125} cy={125} r={118} stroke={tone} strokeWidth={2} opacity={0.18} fill="none" />
          <Circle cx={125} cy={125} r={104} stroke={tone} strokeWidth={2} opacity={0.35} fill="none" />
        </Svg>
      </Animated.View>
      <Svg width={250} height={250} style={{ position: "absolute", left: 0, top: 0 }}>
        <Circle cx={125} cy={125} r={90} stroke={colors.card} strokeWidth={10} fill="none" />
        {level > 0.01 && <Circle cx={125} cy={125} r={90} stroke={hot ? colors.rose : colors.sage} strokeWidth={10} fill="none" strokeLinecap="round"
          strokeDasharray={`${C} ${C}`} strokeDashoffset={C * (1 - level)} transform="rotate(-90 125 125)" />}
      </Svg>
      <View style={[styles.listenOrb, { backgroundColor: tone }]}>
        <Icon d={MIC} size={34} color={ink} width={2} />
        <Text style={[styles.listenOrbText, { color: ink }]} numberOfLines={2}>{crying ? t("orb.crying", { name: baby }) : t("orb.listening")}</Text>
      </View>
    </Pressable>
  );
}

/** One line at the bottom: charging and battery, and who gets the alerts. Asks for the battery exemption when missing. */
function PowerPill({ names }: { names: string }) {
  const [exempt, setExempt] = useState(() => cryDetector?.isBatteryExempt() ?? true);
  const [bat, setBat] = useState(() => cryDetector?.battery?.() ?? null);
  useEffect(() => {
    const id = setInterval(() => setBat(cryDetector?.battery?.() ?? null), 60_000);
    const sub = AppState.addEventListener("change", (st) => { if (st === "active") { setExempt(cryDetector?.isBatteryExempt() ?? true); setBat(cryDetector?.battery?.() ?? null); } });
    return () => { clearInterval(id); sub.remove(); };
  }, []);
  const pct = bat && bat[0] >= 0 ? bat[0] : null;
  const plugged = !!bat?.[1];
  const low = !plugged && pct != null && pct <= 30;
  if (!exempt) return (
    <Pressable onPress={() => cryDetector?.requestBatteryExempt()} style={[styles.power, { backgroundColor: "rgba(255,157,176,0.16)" }]} accessibilityRole="button">
      <Icon d={BOLT} size={22} color={colors.rose} width={2} />
      <Text style={[styles.powerText, { color: colors.cream }]} numberOfLines={2}>{t("nursery.battery")}</Text>
      <Text style={[styles.powerRight, { color: colors.rose }]}>{t("nursery.batteryFix")}</Text>
    </Pressable>
  );
  return (
    <View style={styles.power}>
      <Icon d={BOLT} size={22} color={low ? colors.rose : plugged ? colors.peach : colors.muted} width={2} />
      <Text style={[styles.powerText, low && { color: colors.rose }]} numberOfLines={1}>
        {plugged ? (pct != null ? t("rt.plugged", { pct }) : t("rt.pluggedNoPct")) : pct != null ? t("rt.onBattery", { pct }) : t("nursery.plugIn")}
      </Text>
      {!!names && <Text style={styles.powerRight} numberOfLines={1}>{t("rt.alertsTo", { names })}</Text>}
    </View>
  );
}

function Segmented<T extends string | number>({ options, value, onChange }: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <View style={styles.seg2}>
      {options.map((o) => (
        <Pressable key={String(o.value)} onPress={() => onChange(o.value)} style={[styles.seg2Item, value === o.value && styles.seg2On]}>
          <Text style={[styles.seg2Text, value === o.value && { color: colors.cream }]}>{o.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

function Step({ n, text }: { n: number; text: string }) {
  return (
    <View style={styles.step}>
      <View style={styles.stepNum}><Text style={styles.stepNumText}>{n}</Text></View>
      <Text style={styles.stepText}>{text}</Text>
    </View>
  );
}

function Scanner({ visible, onClose, onCode }: { visible: boolean; onClose: () => void; onCode: (raw: string) => void }) {
  const [perm, ask] = useCameraPermissions();
  const done = useRef(false);
  useEffect(() => { if (visible) { done.current = false; if (!perm?.granted) ask(); } }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.scanRoot}>
        {perm?.granted ? (
          <CameraView
            style={StyleSheet.absoluteFill}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
            onBarcodeScanned={({ data }) => {
              if (done.current) return;
              done.current = true;
              onCode(data);
            }}
          />
        ) : (
          <Text style={styles.scanText}>{t("scan.allowCam")}</Text>
        )}
        <View style={styles.scanFrame} pointerEvents="none" />
        <Text style={styles.scanHint}>{t("scan.hint")}</Text>
        <Pressable onPress={onClose} style={styles.scanClose}>
          <Text style={styles.scanCloseText}>{t("common.cancel")}</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

/* ---------------- remote control of the baby's phone ---------------- */

let myTokenCache: string | null = null;
const myToken = async () => (myTokenCache ??= await getMyToken());
/** Parent's phone: ask the baby's phone to play, stop, switch sound, or report. */
export async function roomCmd(to: string, cmd: string, sound?: string) {
  try { await sendData([to], { type: "cmd", cmd, sound, from: await myToken() }); } catch {}
}

/** The baby's room as last reported, with play/stop and the sounds. */
/** Parent's phone: talk to the baby's phone (play, stop, sound, status) and track the reply. */
function useRemote() {
  const { target, room, members } = useMonitor();
  const heard = room?.got ?? 0; // when the last report arrived here
  const [asks, setAsks] = useState<{ cmd: string; at: number }[]>([]);
  const [, tick] = useState(0);
  // Requests sent since the last report arrived.
  const open = asks.filter((a) => a.at > heard);
  const firstOpen = open.length ? open[0].at : 0;
  const cmdOpen = open.find((a) => a.cmd !== "status");
  const lastCmd = open.length ? open[open.length - 1].cmd : "";
  const waiting = !!firstOpen && Date.now() - firstOpen < 15000;
  // Only "no answer" when nothing came back for a while, polls included.
  const noReply = !!firstOpen && Date.now() - firstOpen >= 25000;
  const send = useCallback(async (cmd: string, sound?: string) => {
    if (!target) return;
    const at = Date.now();
    setAsks((xs) => [...xs.filter((x) => at - x.at < 120_000), { cmd, at }]);
    setTimeout(() => tick((x) => x + 1), 15500);
    setTimeout(() => tick((x) => x + 1), 25500);
    await roomCmd(target, cmd, sound);
  }, [target]);
  // Opening the page: ask every phone in the family, to find the ones listening.
  const tokens = members.map((p) => p.token).join(",");
  useFocusEffect(useCallback(() => {
    if (!tokens) return;
    myToken().then((me) => sendData(tokens.split(","), { type: "cmd", cmd: "status", from: me })).catch(() => {});
  }, [tokens]));
  // While this page is open, keep in step with the room shown: ask every 10 seconds.
  useFocusEffect(useCallback(() => {
    if (!target) return;
    const id = setInterval(() => send("status"), 10_000);
    return () => clearInterval(id);
  }, [target, send]));
  return { room, send, waiting, noReply, lastCmd, cmdOpen: cmdOpen && Date.now() - cmdOpen.at < 15000 ? cmdOpen.cmd : null };
}
type Remote = ReturnType<typeof useRemote>;

const ago = (ms: number) => {
  const min = Math.round((Date.now() - ms) / 60_000);
  return min < 1 ? t("ago.now") : min < 60 ? t("ago.min", { n: min }) : fmtTime(ms);
};
const BATTERY = '<rect x="3" y="7" width="16" height="10" rx="2"/><path d="M21 11v2"/>';
const NOISE = '<path d="M4 10v4M8 7v10M12 4v16M16 7v10M20 10v4"/>';

/** The baby asleep in the crib (or awake after a cry), drawn small. */
function CribBaby({ size, awake }: { size: number; awake: boolean }) {
  const face = awake
    ? '<circle cx="35" cy="41" r="2.4" fill="#5b4320"/><circle cx="45" cy="41" r="2.4" fill="#5b4320"/><ellipse cx="40" cy="48" rx="2.4" ry="2" fill="#5b4320"/>'
    : '<path d="M32 42q3.5 3.5 7 0M42 42q3.5 3.5 7 0" stroke="#5b4320" stroke-width="2.6" fill="none" stroke-linecap="round"/>';
  const zz = awake ? '' : '<text x="62" y="26" font-family="Fredoka" font-weight="600" font-size="16" fill="#9ee6c4">z</text><text x="74" y="14" font-family="Fredoka" font-weight="600" font-size="12" fill="#9ee6c4">z</text>';
  const xml = `<svg viewBox="0 0 96 84"><rect x="10" y="38" width="76" height="36" rx="13" fill="#3e3378"/><circle cx="40" cy="42" r="16" fill="#ffe1cf"/>${face}<ellipse cx="31" cy="48" rx="3.4" ry="2.2" fill="#ff9db0"/><ellipse cx="50" cy="48" rx="3.4" ry="2.2" fill="#ff9db0"/><path d="M22 56h64v13a6 6 0 0 1-6 6H28a6 6 0 0 1-6-6z" fill="#c9bfff"/>${zz}</svg>`;
  return <SvgXml width={size} height={size * 84 / 96} xml={xml} />;
}

/** The baby's room as one big glowing circle. Tap it to check again. */
function RoomCircle({ r, lastAlert, onSound }: { r: Remote; lastAlert: AlertRecord | null; onSound: () => void }) {
  const room = r.room;
  const [, tick] = useState(0);
  useEffect(() => { const id = setInterval(() => tick((x) => x + 1), 30_000); return () => clearInterval(id); }, []);
  const checking = r.waiting && !r.cmdOpen;
  // It reports every 10 minutes while listening; much longer than that means something's wrong.
  const heard = room?.got ?? room?.at ?? 0;
  const stale = !!room && (r.noReply || (room.listening && Date.now() - heard > 25 * 60_000));
  const recentCry = !!lastAlert && Date.now() - lastAlert.at < 15 * 60_000;
  const on = !!room?.listening && !stale;
  const tone = recentCry ? colors.rose : stale ? colors.peach : on ? colors.sage : colors.muted;
  const glow = recentCry ? "255,157,176" : stale ? "255,214,140" : on ? "158,230,196" : "183,174,224";
  const lowBattery = room?.battery != null && room.battery <= 20 && !room.charging;
  const status = recentCry ? t("room.cried", { time: fmtTime(lastAlert!.at) })
    : !room ? (checking ? t("remote.waiting") : t("room.tapCheck"))
    : stale ? t("room.stale", { time: fmtTime(heard) })
    : on ? t("room.quiet") : t("room.off");
  return (
    <View style={{ alignItems: "center", gap: 18 }}>
      <Pressable onPress={() => r.send("status")} style={({ pressed }) => [{ marginVertical: 26 }, pressed && { transform: [{ scale: 0.97 }] }]} accessibilityRole="button" accessibilityLabel={`${status}. ${t("remote.refresh")}`}>
        <View style={[styles.glow2, { backgroundColor: `rgba(${glow},0.04)` }]} />
        <View style={[styles.glow1, { backgroundColor: `rgba(${glow},0.08)` }]} />
        <View style={styles.crib}>
          <CribBaby size={120} awake={recentCry} />
          <Text style={[styles.cribStatus, tone !== colors.muted && tone !== colors.sage && { color: tone }]} numberOfLines={2}>{status}</Text>
          {checking && <ActivityIndicator color={colors.muted} size="small" style={{ position: "absolute", bottom: 18 }} />}
        </View>
      </Pressable>
      {room && (
        <View style={styles.statusIcons}>
          {room.battery != null && (
            <View style={styles.statusIcon}>
              <Icon d={BATTERY} size={16} color={lowBattery ? colors.rose : colors.sage} width={2} />
              <Text style={[styles.statusText, lowBattery && { color: colors.rose }]}>{room.battery}%{room.charging ? " ⚡" : ""}</Text>
            </View>
          )}
          <Pressable onPress={onSound} hitSlop={8} style={styles.statusIcon} accessibilityRole="button" accessibilityLabel={t("remote.noise")}>
            <Icon d={NOISE} size={16} color={colors.peach} width={2} />
            <Text style={styles.statusText}>{room.playing ? t(`sound.${room.sound}`) : t("orb.off")}</Text>
          </Pressable>
          <View style={styles.statusIcon}>
            <Icon d={CLOCK} size={16} color="#c9bfff" width={2} />
            <Text style={styles.statusText}>{ago(heard)}</Text>
          </View>
        </View>
      )}
    </View>
  );
}
const SUN_D = '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2"/>';
const MOON_D = '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>';
const CLOCK = '<circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 2"/>';

/** The last 12 hours as a line, with a dot for each cry and the "now" dot at the end. */
function Tonight({ alerts }: { alerts: AlertRecord[] }) {
  const end = Date.now(), start = end - 12 * 3600_000;
  const cries = alerts.filter((a) => a.at > start);
  return (
    <View style={{ alignSelf: "stretch", paddingHorizontal: 6, marginTop: 4 }}>
      <View style={styles.tonightHead}>
        <Text style={styles.tonightText}>{t("room.last12")}</Text>
        <Text style={styles.tonightText}>{cries.length ? t("room.tonight", { n: cries.length }) : t("room.noCries")}</Text>
      </View>
      <View style={{ height: 26, marginTop: 8 }}>
        <View style={styles.tonightLine} />
        {cries.map((a) => <View key={a.id} style={[styles.tonightDot, { left: `${((a.at - start) / (end - start)) * 94}%` }]} />)}
        <View style={styles.tonightNow} />
      </View>
      <View style={styles.tonightHead}>
        <Text style={styles.tonightText}>{fmtTime(start)}</Text>
        <Text style={styles.tonightText}>{t("ago.now")}</Text>
      </View>
    </View>
  );
}

/** The sounds on the baby's phone, as a strip of circles. */
function SoundStrip({ r }: { r: Remote }) {
  const room = r.room;
  const strip = useRef<ScrollView>(null);
  return (
    <ScrollView ref={strip} horizontal showsHorizontalScrollIndicator={false} style={styles.strip} contentContainerStyle={styles.stripRow}
      onLayout={() => strip.current?.scrollTo({ x: Math.max(0, SOUNDS.findIndex((x) => x.id === room?.sound) - 2) * 62, animated: false })}>
      {SOUNDS.map((x) => {
        const on = room?.sound === x.id;
        return (
          <Pressable key={x.id} onPress={() => r.send("sound", x.id)} style={styles.stripItem} accessibilityRole="button" accessibilityState={{ selected: on }} accessibilityLabel={t(`sound.${x.id}`)}>
            <View style={[styles.stripIcon, on && { backgroundColor: colors.peach }]}>
              <SvgXml width={20} height={20} xml={`<svg viewBox="0 0 24 24" fill="none" stroke="${on ? colors.bg : colors.muted}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${x.icon}</svg>`} />
            </View>
            <Text style={[styles.stripText, on && { color: colors.cream }]} numberOfLines={1}>{t(`sound.${x.id}`)}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

/* ---------------- the other phones' rooms ---------------- */

/** Crying alerts received on this phone (newest first). */
function useAlerts() {
  const [alerts, setAlerts] = useState<AlertRecord[]>([]);
  useEffect(() => {
    const handle = async (n: Notifications.Notification) => {
      const next = await recordAlert(n);
      if (next) setAlerts(next);
    };
    (async () => {
      const shown = await Notifications.getPresentedNotificationsAsync().catch(() => []);
      for (const n of shown) await handle(n);
      setAlerts(await loadAlerts());
    })();
    const sub = addPushListener(handle);
    return () => sub.remove();
  }, []);
  return alerts;
}

/** The room the remote acts on (pick one when several phones listen), with listen-in and white noise. */
function OtherRooms({ alerts }: { alerts: AlertRecord[] }) {
  const { rooms, target, setFocus } = useMonitor();
  const remote = useRemote();
  const naps = useNaps();
  const napsOn = useSleep().s.features.naps;
  const [sounds, setSounds] = useState(false);
  const playing = !!remote.room?.playing;
  if (!target) return (
    <Card style={{ gap: 6 }}>
      <Label>{t("rooms.title")}</Label>
      <Text style={styles.roleSub}>{t("rooms.none")}</Text>
    </Card>
  );
  return (
    <>
      {rooms.length > 1 && (
        <View style={styles.roomPicker}>
          {rooms.map((r) => {
            const on = r.token === target;
            const label = r.room?.baby ? t("hero.room", { name: babyLabel(r.room.baby) }) : r.name || r.room?.name || "hush";
            return (
              <Pressable key={r.token} onPress={() => setFocus(r.token)} style={[styles.roomChip, on && { backgroundColor: colors.cream }]} accessibilityRole="tab" accessibilityState={{ selected: on }}>
                <Text style={[styles.roomChipText, on && { color: colors.bg }]} numberOfLines={1}>{label}</Text>
              </Pressable>
            );
          })}
        </View>
      )}
      <RoomCircle r={remote} lastAlert={alerts[0] ?? null} onSound={() => setSounds((x) => !x)} />
      <ListenRound>
        <RoundBtn onPress={() => remote.send(playing ? "stop" : "play")} disabled={!!remote.cmdOpen} bg={playing ? colors.peach : colors.card}
          label={playing ? t("rt.pause") : t("remote.noise")} a11y={playing ? t("remote.stop") : t("remote.play")}>
          {remote.cmdOpen ? <ActivityIndicator color={playing ? "#4a3412" : colors.cream} /> : (
            <Icon d={playing ? '<path d="M8 5v14M16 5v14"/>' : '<path d="M8 5.5v13l11-6.5z"/>'} size={28} color={playing ? "#4a3412" : colors.cream} width={2.2} />
          )}
        </RoundBtn>
        {napsOn && (
          <RoundBtn onPress={() => (naps.state.asleep ? naps.wokeUp() : naps.fellAsleep())} label={naps.state.asleep ? t("nap.wokeUp") : t("nap.fellAsleep")}>
            <Icon d={naps.state.asleep ? SUN_D : MOON_D} size={28} color="#c9bfff" width={2} />
          </RoundBtn>
        )}
      </ListenRound>
      {sounds && <SoundStrip r={remote} />}
      <Tonight alerts={alerts} />
    </>
  );
}

const ORB = 184;
const xstyles = StyleSheet.create({
  toggles: { flexDirection: "row", justifyContent: "center", gap: 14, marginTop: 8 },
  statusIcons: { flexDirection: "row", alignItems: "center", gap: 16 },
  statusIcon: { flexDirection: "row", alignItems: "center", gap: 5 },
  statusText: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.muted, fontVariant: ["tabular-nums"] },
  crib: { width: 230, height: 230, borderRadius: 115, backgroundColor: colors.card, alignItems: "center", justifyContent: "center", gap: 4 },
  glow1: { position: "absolute", left: -16, top: -16, width: 262, height: 262, borderRadius: 131 },
  glow2: { position: "absolute", left: -34, top: -34, width: 298, height: 298, borderRadius: 149 },
  cribStatus: { fontFamily: fonts.display, fontSize: 22, color: colors.cream, textAlign: "center", maxWidth: 180 },
  tonightHead: { flexDirection: "row", justifyContent: "space-between" },
  tonightText: { fontFamily: fonts.bodyBold, fontSize: 12, color: "#8f86bf", fontVariant: ["tabular-nums"] },
  tonightLine: { position: "absolute", left: 0, right: 0, top: 11, height: 4, borderRadius: 2, backgroundColor: colors.card },
  tonightDot: { position: "absolute", top: 6, width: 14, height: 14, borderRadius: 7, backgroundColor: colors.rose },
  tonightNow: { position: "absolute", right: 0, top: 4, width: 18, height: 18, borderRadius: 9, backgroundColor: colors.sage, shadowColor: colors.sage, shadowOpacity: 0.6, shadowRadius: 6 },
  listenOrb: { width: 160, height: 160, borderRadius: 80, alignItems: "center", justifyContent: "center", gap: 4, paddingHorizontal: 14 },
  listenOrbText: { fontFamily: fonts.display, fontSize: 20, textAlign: "center" },
  power: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: colors.card, borderRadius: 22, paddingVertical: 12, paddingHorizontal: 16, marginTop: 10 },
  powerText: { flex: 1, fontFamily: fonts.bodyBold, fontSize: 13.5, color: colors.muted },
  powerRight: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.sage, maxWidth: "45%" },
  headAvatar: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center", borderWidth: 3, borderColor: colors.bg },
  headAvatarText: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.bg },
  useHere: { flexDirection: "row", alignItems: "center", gap: 8, height: 48, paddingHorizontal: 20, borderRadius: 24, backgroundColor: colors.card },
  useHereText: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.cream },
  sheetBack: { flex: 1, backgroundColor: "rgba(10,6,30,0.55)" },
  sheet: { maxHeight: "85%", backgroundColor: colors.bg, borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 16, paddingTop: 10 },
  grab: { alignSelf: "center", width: 40, height: 5, borderRadius: 3, backgroundColor: colors.card2, marginBottom: 12 },
});
const REFRESH = '<path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/>';
const styles = StyleSheet.create({
  ...xstyles,
  cardTitle: { fontFamily: fonts.display, fontSize: 18, color: colors.cream },
  listenCard: { flexDirection: "row", alignItems: "center", gap: 14 },
  listenBorder: { borderWidth: 1.5, borderColor: "transparent" },
  listenCardOn: { borderColor: "rgba(158,230,196,0.45)" },
  listenIcon: { width: 48, height: 48, borderRadius: 16, backgroundColor: colors.card2, alignItems: "center", justifyContent: "center" },
  hero: { flexDirection: "row", alignItems: "center", gap: 14 },
  facts: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  fact: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: colors.card2, borderRadius: 99, paddingHorizontal: 12, paddingVertical: 7 },
  factText: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.cream, fontVariant: ["tabular-nums"] },
  another: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-end", marginTop: -4, marginBottom: -4, paddingHorizontal: 4 },
  heroIcon: { width: 60, height: 60, borderRadius: 20, backgroundColor: colors.card2, alignItems: "center", justifyContent: "center" },
  heroTitle: { fontFamily: fonts.display, fontSize: 21, color: colors.cream },
  heroStatus: { fontFamily: fonts.bodyBold, fontSize: 14.5 },
  heroMeta: { fontFamily: fonts.body, fontSize: 12.5, color: colors.muted, fontVariant: ["tabular-nums"] },
  refresh: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  soundGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  soundTile: { flexBasis: "22%", flexGrow: 1, alignItems: "center", gap: 5, backgroundColor: colors.card2, borderRadius: 16, paddingVertical: 11 },
  soundTileText: { fontFamily: fonts.bodyBold, fontSize: 11.5, color: colors.muted },
  listenTitle: { fontFamily: fonts.display, fontSize: 17, color: colors.cream },
  roomRow: { flexDirection: "row", alignItems: "center", gap: 14 },
  roomBtn: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.card2, alignItems: "center", justifyContent: "center" },
  soundChip: { backgroundColor: colors.card2, borderRadius: 99, paddingHorizontal: 14, paddingVertical: 9 },
  soundChipText: { fontFamily: fonts.bodyBold, fontSize: 13.5, color: colors.cream },
  secondary: { backgroundColor: colors.card2, borderRadius: 99, paddingVertical: 13, alignItems: "center" },
  secondaryText: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.cream },
  startBtn: { flexDirection: "row", gap: 7, alignItems: "center", backgroundColor: colors.sage, borderRadius: 99, paddingHorizontal: 16, minHeight: 44 },
  startText: { fontFamily: fonts.bodyBold, fontSize: 14.5, color: colors.bg },
  rowTitle: { fontFamily: fonts.bodyBold, fontSize: 15.5, color: colors.cream },
  meta: { fontFamily: fonts.body, fontSize: 13, color: colors.muted, fontVariant: ["tabular-nums"] },
  rule: { height: StyleSheet.hairlineWidth, backgroundColor: "rgba(247,241,255,0.12)" },
  heroDot: { width: 12, height: 12, borderRadius: 6 },
  strip: { marginHorizontal: -18, flexGrow: 0 },
  stripRow: { flexDirection: "row", gap: 4, paddingHorizontal: 12 },
  stripItem: { alignItems: "center", gap: 5, width: 58 },
  stripIcon: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(247,241,255,0.06)" },
  stripText: { fontFamily: fonts.bodyBold, fontSize: 11.5, color: colors.muted },
  youTag: { fontFamily: fonts.body, fontSize: 13, color: colors.muted },
  famLinks: { flexDirection: "row", justifyContent: "space-between", paddingTop: 12, paddingHorizontal: 2 },
  roomPicker: { flexDirection: "row", backgroundColor: colors.card, borderRadius: 99, padding: 4, gap: 4 },
  roomChip: { flex: 1, alignItems: "center", paddingVertical: 10, paddingHorizontal: 8, borderRadius: 99 },
  roomChipText: { fontFamily: fonts.bodyBold, fontSize: 13.5, color: colors.muted },
  trial: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: colors.card, borderRadius: 18, paddingVertical: 12, paddingHorizontal: 14 },
  trialDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: colors.sage },
  trialText: { flex: 1, fontFamily: fonts.body, fontSize: 13.5, color: colors.muted },
  trialLink: { fontFamily: fonts.bodyBold, fontSize: 13.5, color: colors.peach },
  foot: { fontFamily: fonts.body, fontSize: 12, color: colors.muted, textAlign: "center", opacity: 0.7 },
  msg: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.cream, textAlign: "center" },

  lead: { fontFamily: fonts.displayBold, fontSize: 24, color: colors.cream, textAlign: "center" },
  leadSub: { fontFamily: fonts.body, fontSize: 14.5, lineHeight: 21, color: colors.muted, textAlign: "center", paddingHorizontal: 10 },
  ask: { fontFamily: fonts.bodyBold, fontSize: 12.5, color: colors.muted, letterSpacing: 0.6, textTransform: "uppercase", marginLeft: 6, marginTop: 6 },
  keep: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: colors.card, borderRadius: 18, paddingVertical: 12, paddingHorizontal: 14 },
  keepText: { flex: 1, fontFamily: fonts.body, fontSize: 13.5, lineHeight: 19, color: colors.muted },
  keepBtn: { backgroundColor: colors.peach, borderRadius: 99, paddingHorizontal: 12, paddingVertical: 7 },
  keepBtnText: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.bg },
  hearingNow: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.cream, maxWidth: 200 },
  meter: { height: 10, borderRadius: 99, backgroundColor: colors.card2, overflow: "hidden" },
  meterFill: { height: 10, borderRadius: 99 },
  meterLine: { position: "absolute", left: "50%", top: 0, bottom: 0, width: 2, backgroundColor: colors.cream },
  meterLabels: { flexDirection: "row", justifyContent: "space-between", marginTop: 6 },
  meterText: { fontFamily: fonts.body, fontSize: 12, color: colors.muted },

  roleCard: { flexDirection: "row", alignItems: "center", gap: 14, backgroundColor: colors.card, borderRadius: 22, padding: 16 },
  roleIcon: { width: 48, height: 48, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  roleTitle: { fontFamily: fonts.display, fontSize: 17, color: colors.cream },
  roleSub: { fontFamily: fonts.body, fontSize: 13.5, color: colors.muted, textAlign: "left" },

  roleBar: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: colors.card, borderRadius: 18, paddingVertical: 10, paddingHorizontal: 12 },
  roleBarIcon: { width: 36, height: 36, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  roleBarKicker: { fontFamily: fonts.body, fontSize: 12, color: colors.muted },
  roleBarTitle: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.cream },
  change: { fontFamily: fonts.bodyBold, fontSize: 13.5, color: colors.peach },

  stepTitle: { fontFamily: fonts.display, fontSize: 17, color: colors.cream, textAlign: "center" },
  step: { flexDirection: "row", alignItems: "center", gap: 12 },
  stepNum: { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.card2, alignItems: "center", justifyContent: "center" },
  stepNumText: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.cream },
  stepText: { flex: 1, fontFamily: fonts.body, fontSize: 14.5, color: colors.cream },
  primary: { backgroundColor: colors.peach, borderRadius: 99, paddingVertical: 13, alignItems: "center" },
  primaryText: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.bg },

  orbWrap: { alignItems: "center", gap: 12, paddingVertical: 10 },
  orbBox: { width: ORB * 1.5, height: ORB * 1.2, alignItems: "center", justifyContent: "center" },
  ring: { position: "absolute", width: ORB, height: ORB, borderRadius: ORB / 2, borderWidth: 2 },
  orb: { width: ORB, height: ORB, borderRadius: ORB / 2, alignItems: "center", justifyContent: "center", gap: 6 },
  orbTitle: { fontFamily: fonts.displayBold, fontSize: 19, color: colors.cream, textAlign: "center", paddingHorizontal: 18 },
  orbSub: { fontFamily: fonts.body, fontSize: 12.5, color: colors.bg, opacity: 0.65 },
  orbMeta: { fontFamily: fonts.body, fontSize: 13.5, color: colors.muted, textAlign: "center", paddingHorizontal: 20 },

  seg2: { flexDirection: "row", backgroundColor: colors.card2, borderRadius: 14, padding: 3 },
  seg2Item: { flex: 1, alignItems: "center", paddingVertical: 9, borderRadius: 11 },
  seg2On: { backgroundColor: "#4a3f86" },
  seg2Text: { fontFamily: fonts.bodyBold, fontSize: 13.5, color: colors.muted },

  person: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 7 },
  avatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.peach, alignItems: "center", justifyContent: "center" },
  avatarText: { fontFamily: fonts.displayBold, fontSize: 15, color: colors.bg },
  personName: { flex: 1, fontFamily: fonts.bodyBold, fontSize: 15, color: colors.cream },
  inline: { flexDirection: "row", alignItems: "center", gap: 5 },
  inlineText: { fontFamily: fonts.bodyBold, fontSize: 13.5, color: colors.peach },

  connected: { flexDirection: "row", alignItems: "center", gap: 14 },
  checkCircle: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.sage, alignItems: "center", justifyContent: "center" },
  qr: { backgroundColor: colors.cream, borderRadius: 22, padding: 14, width: 216, height: 216, alignItems: "center", justifyContent: "center" },
  qrWait: { fontFamily: fonts.body, fontSize: 13, color: colors.bg, textAlign: "center", padding: 12 },
  input: { alignSelf: "stretch", backgroundColor: colors.card2, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 11, color: colors.cream, fontFamily: fonts.body, fontSize: 15, textAlign: "center" },
  empty: { fontFamily: fonts.body, fontSize: 14, color: colors.muted, paddingVertical: 6 },
  alertRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 7 },
  alertDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.rose },
  time: { fontFamily: fonts.body, fontSize: 13, color: colors.muted, fontVariant: ["tabular-nums"] },

  scanRoot: { flex: 1, backgroundColor: "#000", alignItems: "center", justifyContent: "center" },
  scanText: { fontFamily: fonts.body, fontSize: 15, color: colors.cream, textAlign: "center", padding: 32 },
  scanFrame: { width: 240, height: 240, borderRadius: 28, borderWidth: 3, borderColor: colors.peach },
  scanHint: { position: "absolute", bottom: 140, fontFamily: fonts.bodyBold, fontSize: 15, color: colors.cream },
  scanClose: { position: "absolute", bottom: 60, backgroundColor: colors.card2, borderRadius: 99, paddingVertical: 12, paddingHorizontal: 28 },
  scanCloseText: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.cream },
});
