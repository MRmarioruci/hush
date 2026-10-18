import { useEffect, useRef, useState, useCallback } from "react";
import { Alert, Animated, AppState, Easing, Modal, Pressable, Share, StyleSheet, Text, TextInput, View, Platform, Switch, ActivityIndicator } from "react-native";
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
import { stopLine } from "../stops";
import { EAR, ListenCard } from "../components/Listen";
import { SvgXml } from "react-native-svg";
import { TRIAL_DAYS, useUnlock } from "../state/unlock";
import { Card, ICONS, Icon, Label, Screen } from "../components/ui";
import { fmtTime, getLang, heardLabel, t, tIn, useT, babyLabel, babyLabelIn } from "../i18n";
import { SOUNDS } from "../sounds";
const PLUS = '<path d="M12 5v14M5 12h14"/>';
const X = '<path d="M6 6l12 12M18 6 6 18"/>';
const SEND = '<path d="M4 12 20 4l-6 16-3-7z"/>';

export function MonitorScreen() {
  const { members, listening } = useMonitor();
  useT();
  const alerts = useAlerts();
  return (
    <Screen title={t("monitor.title")}>
      {members.length === 0 ? (
        <FamilyStart />
      ) : listening ? (
        <>
          <ThisPhone />
          <OtherRooms alerts={alerts} onlyListening />
          <FamilyCard />
        </>
      ) : (
        <>
          <OtherRooms alerts={alerts} />
          <ThisPhone />
          <AlertsCard alerts={alerts} />
          <FamilyCard />
        </>
      )}
      <Text style={styles.foot}>{t("monitor.helper")}</Text>
    </Screen>
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
  const { m, update, listening, lastStop, status, lastCry, toggleListening, baby, members } = useMonitor();
  const sleep = useSleep();
  const [msg, setMsg] = useState<string | null>(null);
  const crying = !!status.crying;
  const toggle = async () => setMsg(await toggleListening());

  if (!listening) return (
    <Card style={{ gap: 14 }}>
      <View style={styles.hero}>
        <View style={styles.heroIcon}><Icon d={ICONS.crib} size={28} color={colors.muted} width={2} /></View>
        <View style={{ flex: 1, gap: 3 }}>
          <Text style={styles.listenTitle}>{t("here.title")}</Text>
          <Text style={styles.roleSub}>{stopLine(lastStop, t, fmtTime) ?? t("here.sub")}</Text>
        </View>
      </View>
      <Pressable onPress={toggle} style={({ pressed }) => [styles.startBtn, pressed && { transform: [{ scale: 0.98 }] }]} accessibilityRole="button">
        <Icon d={ICONS.mic} size={20} color={colors.bg} width={2} />
        <Text style={styles.primaryText}>{t("here.start")}</Text>
      </Pressable>
      <TrialNote />
      {msg && <Text style={styles.msg}>{msg}</Text>}
    </Card>
  );

  return (
    <>
      <View style={styles.orbWrap}>
        <Orb listening={listening} crying={crying} score={status.score ?? 0} onPress={toggle} baby={baby} />
        <Text style={styles.orbMeta}>{lastCry ? t("nursery.lastAlert", { time: fmtTime(lastCry) }) : t("nursery.quiet")}</Text>
        <View style={[styles.facts, { justifyContent: "center" }]}>
          <View style={styles.fact}>
            <Icon d={ICONS.bell} size={15} color={colors.peach} width={2} />
            <Text style={styles.factText} numberOfLines={1}>{t("nursery.alertsTo", { names: members.map((p, i) => p.name.trim() || t("fam.unnamed", { n: i + 2 })).join(", ") })}</Text>
          </View>
          <View style={styles.fact}>
            <Icon d={NOISE} size={15} color={sleep.playing ? colors.peach : colors.muted} width={2} />
            <Text style={styles.factText}>{sleep.playing ? t(`sound.${sleep.soundId}`) : t("remote.noiseOff")}</Text>
          </View>
          <View style={styles.fact}>
            <Icon d={EAR} size={15} color={m.allowListen ? colors.sage : colors.muted} width={2} />
            <Text style={styles.factText}>{m.allowListen ? t("listen.chipOn") : t("listen.chipOff")}</Text>
          </View>
        </View>
      </View>

      <TrialNote />
      <Hearing />
      <KeepAwake />

      <Card style={[{ gap: 16 }, styles.listenBorder, m.allowListen && styles.listenCardOn]}>
        <View style={styles.listenCard}>
          <View style={[styles.listenIcon, m.allowListen && { backgroundColor: colors.sage }]}>
            <Icon d={EAR} size={24} color={m.allowListen ? colors.bg : colors.muted} width={2} />
          </View>
          <View style={{ flex: 1, gap: 3 }}>
            <Text style={styles.listenTitle}>{t("listen.allow")}</Text>
            <Text style={styles.roleSub}>{m.allowListen ? t("listen.allowOn") : t("listen.allowOff")}</Text>
          </View>
          <Switch value={!!m.allowListen} onValueChange={(allowListen) => update({ allowListen })} trackColor={{ false: colors.card2, true: colors.sage }} thumbColor={colors.cream} accessibilityLabel={t("listen.allow")} />
        </View>
        {m.allowListen && (
          <View style={{ gap: 10 }}>
            <Label>{t("listen.withCry")}</Label>
            <Segmented
              options={[0, 5, 10].map((v) => ({ value: v, label: v ? t("listen.secs", { s: v }) : t("listen.none") }))}
              value={m.cryClip ?? CRY_CLIP_SECONDS}
              onChange={(cryClip) => update({ cryClip })}
            />
            <Text style={styles.roleSub}>
              {(m.cryClip ?? CRY_CLIP_SECONDS) ? t("listen.withCryOn", { s: m.cryClip ?? CRY_CLIP_SECONDS }) : t("listen.withCryOff")}
            </Text>
          </View>
        )}
      </Card>

      <Card style={{ gap: 16 }}>
        <Text style={styles.cardTitle}>{t("nursery.alertSettings")}</Text>
        <View style={{ gap: 10 }}>
          <Label>{t("nursery.alertAfter")}</Label>
          <Segmented options={ALERT_AFTER.map(([v]) => ({ value: v, label: t(`after.${v}`) }))} value={m.alertAfter} onChange={(alertAfter) => update({ alertAfter })} />
          <Text style={styles.roleSub}>
            {m.alertAfter === 0 ? t("nursery.afterNow") : t(m.alertAfter === 60 ? "nursery.after60" : "nursery.after10", { name: baby })}
          </Text>
        </View>
        <View style={{ gap: 10 }}>
          <Label>{t("nursery.sensitivity")}</Label>
          <Segmented options={(["low", "medium", "high"] as Sensitivity[]).map((v) => ({ value: v, label: t(`sens.${v}`) }))} value={m.sensitivity} onChange={(sensitivity) => update({ sensitivity })} />
        </View>
      </Card>
      {msg && <Text style={styles.msg}>{msg}</Text>}
    </>
  );
}

/** Reminders that keep the baby's phone listening all night: battery exemption and charging. */
function KeepAwake() {
  const [exempt, setExempt] = useState(() => cryDetector?.isBatteryExempt() ?? true);
  useEffect(() => {
    const sub = AppState.addEventListener("change", (st) => st === "active" && setExempt(cryDetector?.isBatteryExempt() ?? true));
    return () => sub.remove();
  }, []);
  return (
    <View style={styles.keep}>
      <Icon d='<path d="M13 3 6 14h5l-1 7 7-11h-5z"/>' size={18} color={exempt ? colors.moon : colors.rose} />
      <Text style={styles.keepText}>{Platform.OS === "ios" ? t("nursery.iosKeep") : exempt ? t("nursery.plugIn") : t("nursery.battery")}</Text>
      {!exempt && (
        <Pressable onPress={() => cryDetector?.requestBatteryExempt()} hitSlop={8} style={styles.keepBtn}>
          <Text style={styles.keepBtnText}>{t("nursery.batteryFix")}</Text>
        </Pressable>
      )}
    </View>
  );
}

/** Live view of what the baby's phone hears, so you can see the detector working. */
function Hearing() {
  const { m, status, baby } = useMonitor();
  const threshold = THRESHOLDS[m.sensitivity];
  const score = status.score ?? 0;
  const pct = Math.min(100, (score / Math.max(threshold * 2, 0.01)) * 100); // the line sits halfway
  const label = status.top != null && (status.topScore ?? 0) > 0.1 ? heardLabel(status.top, YAMNET_LABELS[status.top]) : t("hear.quiet");
  const hot = score >= threshold;
  return (
    <Card style={{ gap: 12 }}>
      <Label right={<Text style={styles.hearingNow} numberOfLines={1}>{label}</Text>}>{t("hear.title")}</Label>
      <View>
        <View style={styles.meter}>
          <View style={[styles.meterFill, { width: `${pct}%`, backgroundColor: hot ? colors.rose : colors.sage }]} />
          <View style={styles.meterLine} />
        </View>
        <View style={styles.meterLabels}>
          <Text style={styles.meterText}>{t("hear.calm")}</Text>
          <Text style={styles.meterText}>{t("hear.crying")}</Text>
        </View>
      </View>
      <Text style={styles.roleSub}>
        {t(m.alertAfter === 0 ? "hear.now" : m.alertAfter === 60 ? "hear.after60" : "hear.after10")} {t("hear.test")}
      </Text>
    </Card>
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

/** Big round listen button. Rings breathe slowly while listening and quicken when it hears crying. */
function Orb({ listening, crying, score, onPress, baby }: { listening: boolean; crying: boolean; score: number; onPress: () => void; baby: string }) {
  const a = useRef(new Animated.Value(0)).current;
  const b = useRef(new Animated.Value(0)).current;
  const press = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!listening) { a.setValue(0); b.setValue(0); return; }
    const dur = crying ? 1100 : 2800;
    const ring = (v: Animated.Value, delay: number) =>
      Animated.loop(Animated.sequence([Animated.delay(delay), Animated.timing(v, { toValue: 1, duration: dur, easing: Easing.out(Easing.quad), useNativeDriver: true }), Animated.timing(v, { toValue: 0, duration: 0, useNativeDriver: true })]));
    const l1 = ring(a, 0), l2 = ring(b, dur / 2);
    l1.start(); l2.start();
    return () => { l1.stop(); l2.stop(); };
  }, [listening, crying, a, b]);

  const tone = crying ? colors.rose : listening ? colors.sage : colors.card2;
  const ringStyle = (v: Animated.Value) => ({
    opacity: v.interpolate({ inputRange: [0, 1], outputRange: [0.45, 0] }),
    transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [1, 1.6 + Math.min(0.4, score)] }) }],
    borderColor: tone,
  });

  return (
    <View style={styles.orbBox}>
      {listening && <Animated.View style={[styles.ring, ringStyle(a)]} />}
      {listening && <Animated.View style={[styles.ring, ringStyle(b)]} />}
      <Pressable
        onPress={onPress}
        onPressIn={() => Animated.spring(press, { toValue: 0.95, useNativeDriver: true, speed: 40 }).start()}
        onPressOut={() => Animated.spring(press, { toValue: 1, useNativeDriver: true, friction: 4 }).start()}
        accessibilityRole="switch"
        accessibilityState={{ checked: listening }}
        accessibilityLabel={t("orb.a11y")}
      >
        <Animated.View style={[styles.orb, { backgroundColor: tone, transform: [{ scale: press }] }]}>
          <Icon d={ICONS.mic} size={30} color={listening ? colors.bg : colors.cream} width={1.9} />
          <Text style={[styles.orbTitle, listening && { color: colors.bg }]}>
            {crying ? t("orb.crying", { name: baby }) : listening ? t("orb.listening") : t("orb.start")}
          </Text>
          {listening && <Text style={styles.orbSub}>{t("orb.tapStop")}</Text>}
        </Animated.View>
      </Pressable>
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

/** The baby's phone at a glance: listening or not, white noise, battery, and how fresh that is. */
function RoomHero({ r, lastAlert }: { r: Remote; lastAlert: AlertRecord | null }) {
  const { targetName, targetBaby } = useMonitor();
  const room = r.room;
  const [, tick] = useState(0);
  useEffect(() => { const id = setInterval(() => tick((x) => x + 1), 30_000); return () => clearInterval(id); }, []);
  const checking = !room && r.waiting;
  // It reports every 10 minutes while listening; much longer than that means something's wrong.
  const heard = room?.got ?? room?.at ?? 0;
  const stale = !!room && (r.noReply || (room.listening && Date.now() - heard > 25 * 60_000));
  const recentCry = lastAlert && Date.now() - lastAlert.at < 15 * 60_000;
  const on = !!room?.listening && !stale;
  const tone = recentCry ? colors.rose : stale ? colors.peach : on ? colors.sage : colors.muted;
  return (
    <Card style={{ gap: 14 }}>
      <View style={styles.hero}>
        <View style={[styles.heroIcon, (on || recentCry || stale) && { backgroundColor: tone }]}>
          <Icon d={ICONS.crib} size={28} color={on || recentCry || stale ? colors.bg : colors.muted} width={2} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={styles.heroTitle} numberOfLines={1}>{targetBaby ? t("hero.room", { name: babyLabel(targetBaby) }) : targetName || t("fam.unnamed", { n: 2 })}</Text>
          <Text style={[styles.heroStatus, { color: tone }]} numberOfLines={2}>
            {recentCry ? lastAlert!.body
              : !room ? (checking ? t("remote.waiting") : t("remote.noState"))
              : stale ? t("remote.stale", { time: fmtTime(heard) })
              : on ? t("remote.listening") : t("remote.notListening")}
          </Text>
        </View>
        <Pressable onPress={() => r.send("status")} hitSlop={10} style={styles.refresh} accessibilityRole="button" accessibilityLabel={t("remote.refresh")}>
          {checking ? <ActivityIndicator color={colors.cream} size="small" /> : <Icon d={REFRESH} size={18} color={colors.cream} width={2} />}
        </Pressable>
      </View>
      {room && (
        <View style={styles.facts}>
          <View style={styles.fact}>
            <Icon d={NOISE} size={16} color={room.playing ? colors.peach : colors.muted} width={2} />
            <Text style={styles.factText} numberOfLines={1}>{room.playing ? t(`sound.${room.sound}`) : t("remote.noiseOff")}</Text>
          </View>
          {room.battery != null && (
            <View style={styles.fact}>
              <Icon d={BATTERY} size={16} color={room.battery <= 20 && !room.charging ? colors.rose : colors.muted} width={2} />
              <Text style={styles.factText}>{room.battery}%{room.charging ? ` · ${t("remote.charging")}` : ""}</Text>
            </View>
          )}
          <View style={styles.fact}>
            <Text style={[styles.factText, { color: colors.muted }]}>{t("remote.checked", { when: ago(heard) })}</Text>
          </View>
        </View>
      )}
    </Card>
  );
}

/** White noise on the baby's phone: play/stop and the sound. */
function NoiseCard({ r }: { r: Remote }) {
  const room = r.room;
  const playing = !!room?.playing;
  const busy = !!r.cmdOpen;
  return (
    <Card style={{ gap: 14 }}>
      <Label>{t("remote.noise")}</Label>
      <View style={styles.roomRow}>
        <Pressable onPress={() => r.send(playing ? "stop" : "play")} disabled={busy} style={[styles.roomBtn, playing && { backgroundColor: colors.peach }]} accessibilityRole="button" accessibilityLabel={playing ? t("remote.stop") : t("remote.play")}>
          {busy ? <ActivityIndicator color={playing ? colors.bg : colors.cream} /> : (
            <Icon d={playing ? '<rect x="7" y="6" width="3.5" height="12" rx="1"/><rect x="13.5" y="6" width="3.5" height="12" rx="1"/>' : '<path d="M8 5.5v13l11-6.5z"/>'} size={26} color={playing ? colors.bg : colors.cream} width={2} />
          )}
        </Pressable>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={styles.roleTitle}>{busy ? t("remote.waiting") : playing ? t("remote.playing", { sound: t(`sound.${room!.sound}`) }) : t("remote.off")}</Text>
          <Text style={styles.roleSub}>{busy ? " " : playing ? t("remote.tapStop") : t("remote.tapPlay")}</Text>
        </View>
      </View>
      <View style={styles.soundGrid}>
        {SOUNDS.map((x) => {
          const on = room?.sound === x.id;
          return (
            <Pressable key={x.id} onPress={() => r.send("sound", x.id)} style={({ pressed }) => [styles.soundTile, on && { backgroundColor: colors.peach }, pressed && { transform: [{ scale: 0.95 }] }]} accessibilityRole="button" accessibilityState={{ selected: on }}>
              <SvgXml width={20} height={20} xml={`<svg viewBox="0 0 24 24" fill="none" stroke="${on ? colors.bg : colors.muted}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${x.icon}</svg>`} />
              <Text style={[styles.soundTileText, on && { color: colors.bg }]} numberOfLines={1}>{t(`sound.${x.id}`)}</Text>
            </Pressable>
          );
        })}
      </View>
    </Card>
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
function OtherRooms({ alerts, onlyListening }: { alerts: AlertRecord[]; onlyListening?: boolean }) {
  const { rooms, target, setFocus } = useMonitor();
  const remote = useRemote();
  if (onlyListening && !rooms.length) return null;
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
      <RoomHero r={remote} lastAlert={alerts[0] ?? null} />
      <ListenCard />
      <NoiseCard r={remote} />
    </>
  );
}

function AlertsCard({ alerts }: { alerts: AlertRecord[] }) {
  return (
    <Card style={{ gap: 4 }}>
      <Label>{t("parent.alerts")}</Label>
      {alerts.length === 0 ? (
        <Text style={styles.empty}>{t("parent.none")}</Text>
      ) : (
        alerts.slice(0, 8).map((a) => (
          <View key={a.id} style={styles.alertRow}>
            <View style={styles.alertDot} />
            <Text style={styles.personName}>{a.body}</Text>
            <Text style={styles.time}>{fmtTime(a.at)}</Text>
          </View>
        ))
      )}
    </Card>
  );
}

const ORB = 184;
const REFRESH = '<path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/>';
const styles = StyleSheet.create({
  cardTitle: { fontFamily: fonts.display, fontSize: 18, color: colors.cream },
  listenCard: { flexDirection: "row", alignItems: "center", gap: 14 },
  listenBorder: { borderWidth: 1.5, borderColor: "transparent" },
  listenCardOn: { borderColor: "rgba(169,214,189,0.45)" },
  listenIcon: { width: 48, height: 48, borderRadius: 16, backgroundColor: colors.card2, alignItems: "center", justifyContent: "center" },
  hero: { flexDirection: "row", alignItems: "center", gap: 14 },
  facts: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  fact: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: colors.card2, borderRadius: 99, paddingHorizontal: 12, paddingVertical: 7 },
  factText: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.cream, fontVariant: ["tabular-nums"] },
  another: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-end", marginTop: -4, marginBottom: -4, paddingHorizontal: 4 },
  heroIcon: { width: 60, height: 60, borderRadius: 20, backgroundColor: colors.card2, alignItems: "center", justifyContent: "center" },
  heroTitle: { fontFamily: fonts.display, fontSize: 20, color: colors.cream },
  heroStatus: { fontFamily: fonts.bodyBold, fontSize: 14.5 },
  heroMeta: { fontFamily: fonts.body, fontSize: 12.5, color: colors.muted, fontVariant: ["tabular-nums"] },
  refresh: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.card2, alignItems: "center", justifyContent: "center" },
  soundGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  soundTile: { flexBasis: "22%", flexGrow: 1, alignItems: "center", gap: 5, backgroundColor: colors.card2, borderRadius: 16, paddingVertical: 11 },
  soundTileText: { fontFamily: fonts.bodyBold, fontSize: 11.5, color: colors.muted },
  listenTitle: { fontFamily: fonts.display, fontSize: 17, color: colors.cream },
  roomRow: { flexDirection: "row", alignItems: "center", gap: 14 },
  roomBtn: { width: 58, height: 58, borderRadius: 29, backgroundColor: colors.card2, alignItems: "center", justifyContent: "center" },
  soundChip: { backgroundColor: colors.card2, borderRadius: 99, paddingHorizontal: 14, paddingVertical: 9 },
  soundChipText: { fontFamily: fonts.bodyBold, fontSize: 13.5, color: colors.cream },
  secondary: { backgroundColor: colors.card2, borderRadius: 99, paddingVertical: 13, alignItems: "center" },
  secondaryText: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.cream },
  startBtn: { flexDirection: "row", gap: 10, alignItems: "center", justifyContent: "center", backgroundColor: colors.sage, borderRadius: 99, minHeight: 52 },
  youTag: { fontFamily: fonts.bodyBold, fontSize: 12, color: colors.muted, backgroundColor: colors.card2, borderRadius: 99, paddingHorizontal: 10, paddingVertical: 4, overflow: "hidden" },
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
  seg2On: { backgroundColor: "#463d63" },
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
