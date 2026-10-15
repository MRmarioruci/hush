import { useEffect, useRef, useState } from "react";
import { Animated, Easing, Modal, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import * as Notifications from "expo-notifications";
import { CameraView, useCameraPermissions } from "expo-camera";
import QRCode from "react-native-qrcode-svg";
import { cryDetector } from "../../modules/hush-native/src";
import { colors, fonts } from "../theme";
import { ALERT_AFTER, THRESHOLDS, getMyToken, loadAlerts, makePairCode, pairedBaby, readPairCode, recordAlert, sendPush, type AlertRecord, type Role, type Sensitivity } from "../monitor";
import { YAMNET_LABELS } from "../yamnetLabels";
import { MonitorHero } from "../components/MonitorHero";
import { useMonitor } from "../state/monitor";
import { Card, ICONS, Icon, Label, Screen } from "../components/ui";

const fmtTime = (t: number) => new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
const PLUS = '<path d="M12 5v14M5 12h14"/>';
const X = '<path d="M6 6l12 12M18 6 6 18"/>';
const SEND = '<path d="M4 12 20 4l-6 16-3-7z"/>';

export function MonitorScreen() {
  const { m, update, listening, toggleListening, baby } = useMonitor();

  const setRole = async (role: Role | null) => {
    if (role !== "nursery" && listening) await toggleListening(); // this phone stops listening if it's no longer the nursery phone
    update({ role });
  };

  return (
    <Screen title="Monitor">
      {m.role == null ? (
        <ChooseRole baby={baby} onPick={setRole} />
      ) : (
        <>
          <RoleBar role={m.role} baby={baby} onChange={() => setRole(null)} />
          {m.role === "nursery" ? <NurseryPhone /> : <ParentPhone />}
        </>
      )}
      <Text style={styles.foot}>A helper, not a medical device.</Text>
    </Screen>
  );
}

/* ---------------- first visit: which phone is this? ---------------- */

function ChooseRole({ baby, onPick }: { baby: string; onPick: (r: Role) => void }) {
  return (
    <>
      <MonitorHero baby={baby} />
      <View style={{ gap: 6, alignItems: "center", marginBottom: 4 }}>
        <Text style={styles.lead}>Hear {baby} from anywhere</Text>
        <Text style={styles.leadSub}>One phone stays in {baby}'s room and listens. Yours gets a notification when {baby} cries.</Text>
      </View>
      <Text style={styles.ask}>What will this phone do?</Text>
      <RoleCard
        art={ICONS.crib}
        tone={colors.sage}
        title={`Stay in ${baby}'s room`}
        sub="Listens for crying"
        onPress={() => onPick("nursery")}
      />
      <RoleCard art={ICONS.bell} tone={colors.peach} title="Get the alerts" sub="Notifies you when the baby cries" onPress={() => onPick("parent")} />
    </>
  );
}

function RoleCard({ art, tone, title, sub, onPress }: { art: string; tone: string; title: string; sub: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.roleCard, pressed && { transform: [{ scale: 0.98 }] }]}>
      <View style={[styles.roleIcon, { backgroundColor: tone }]}>
        <Icon d={art} size={26} color={colors.bg} width={2} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.roleTitle}>{title}</Text>
        <Text style={styles.roleSub}>{sub}</Text>
      </View>
      <Icon d={ICONS.chevron} size={20} />
    </Pressable>
  );
}

/** Always-visible reminder of what this phone is doing in the monitor. */
function RoleBar({ role, baby, onChange }: { role: Role; baby: string; onChange: () => void }) {
  const nursery = role === "nursery";
  return (
    <View style={styles.roleBar}>
      <View style={[styles.roleBarIcon, { backgroundColor: nursery ? colors.sage : colors.peach }]}>
        <Icon d={nursery ? ICONS.crib : ICONS.bell} size={18} color={colors.bg} width={2} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.roleBarKicker}>This phone</Text>
        <Text style={styles.roleBarTitle}>{nursery ? `Stays in ${baby}'s room` : "Gets the alerts"}</Text>
      </View>
      <Pressable onPress={onChange} hitSlop={10}>
        <Text style={styles.change}>Change</Text>
      </Pressable>
    </View>
  );
}

/* ---------------- this phone stays with the baby ---------------- */

function NurseryPhone() {
  const { m, update, listening, status, lastCry, toggleListening, baby } = useMonitor();
  const [msg, setMsg] = useState<string | null>(null);
  const [showCode, setShowCode] = useState(false);
  const tokens = m.parents.map((p) => p.token);
  const crying = !!status.crying;
  const paired = m.parents.length > 0;

  // Close the code once a new parent connects.
  const count = useRef(m.parents.length);
  useEffect(() => {
    if (m.parents.length > count.current) {
      setShowCode(false);
      setMsg(`${m.parents[m.parents.length - 1].name} connected`);
    }
    count.current = m.parents.length;
  }, [m.parents]);

  const test = async () => {
    if (!cryDetector || !tokens.length) return;
    setMsg("Sending…");
    const r = await cryDetector.sendAlert(tokens, `Test alert from ${baby}'s phone`, "test");
    setMsg(r.ok ? "Test sent" : "Couldn't send. Check the internet connection.");
  };

  return (
    <>
      {!paired || showCode ? (
        <PairCodeCard baby={baby} onCancel={paired ? () => setShowCode(false) : undefined} />
      ) : (
        <View style={styles.orbWrap}>
          <Orb listening={listening} crying={crying} score={status.score ?? 0} onPress={async () => setMsg(await toggleListening())} baby={baby} />
          <Text style={styles.orbMeta}>
            {listening ? (lastCry ? `Last alert ${fmtTime(lastCry)}` : "Quiet so far") : "Keep it near the crib. Works with the screen locked."}
          </Text>
        </View>
      )}

      {paired && listening && !showCode && <Hearing />}

      {paired && (
        <Card style={{ gap: 4 }}>
          <Label right={<Pressable onPress={test} hitSlop={10} style={styles.inline}><Icon d={SEND} size={15} color={colors.peach} /><Text style={styles.inlineText}>Test</Text></Pressable>}>
            Sends alerts to
          </Label>
          {m.parents.map((p) => (
            <View key={p.token} style={styles.person}>
              <View style={styles.avatar}><Text style={styles.avatarText}>{p.name.slice(0, 1).toUpperCase()}</Text></View>
              <Text style={styles.personName}>{p.name}</Text>
              <Pressable onPress={() => update({ parents: m.parents.filter((x) => x.token !== p.token) })} hitSlop={12} accessibilityLabel={`Remove ${p.name}`}>
                <Icon d={X} size={18} />
              </Pressable>
            </View>
          ))}
          {!showCode && (
            <Pressable onPress={() => setShowCode(true)} style={styles.person}>
              <View style={[styles.avatar, { backgroundColor: colors.card2 }]}><Icon d={PLUS} size={18} color={colors.peach} width={2.2} /></View>
              <Text style={[styles.personName, { color: colors.peach }]}>Add another phone</Text>
            </Pressable>
          )}
        </Card>
      )}

      {paired && (
        <Card style={{ gap: 16 }}>
          <View style={{ gap: 10 }}>
            <Label>Alert after</Label>
            <Segmented
              options={ALERT_AFTER.map(([v, l]) => ({ value: v, label: l }))}
              value={m.alertAfter}
              onChange={(alertAfter) => update({ alertAfter })}
            />
            <Text style={styles.roleSub}>
              {m.alertAfter === 0
                ? "As soon as it hears crying."
                : `Only if ${baby} keeps crying for ${m.alertAfter === 60 ? "a minute" : "10 seconds"}. Short fusses are ignored.`}
            </Text>
          </View>
          <View style={{ gap: 10 }}>
            <Label>Sensitivity</Label>
            <Segmented
              options={(["low", "medium", "high"] as Sensitivity[]).map((v) => ({ value: v, label: v[0].toUpperCase() + v.slice(1) }))}
              value={m.sensitivity}
              onChange={(sensitivity) => update({ sensitivity })}
            />
          </View>
        </Card>
      )}

      {msg && <Text style={styles.msg}>{msg}</Text>}
    </>
  );
}

/** The baby's phone shows this; the parent's phone scans it. */
function PairCodeCard({ baby, onCancel }: { baby: string; onCancel?: () => void }) {
  const [token, setToken] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { getMyToken().then(setToken, (e) => setErr(e.message)); }, []);
  return (
    <Card style={{ alignItems: "center", gap: 14 }}>
      <Text style={styles.stepTitle}>Scan this with your phone</Text>
      <View style={styles.qr}>
        {token ? (
          <QRCode value={makePairCode(token, baby)} size={188} backgroundColor={colors.cream} color={colors.bg} />
        ) : (
          <Text style={styles.qrWait}>{err ?? "Getting ready…"}</Text>
        )}
      </View>
      <View style={{ gap: 10, alignSelf: "stretch" }}>
        <Step n={1} text="Open hush on your phone" />
        <Step n={2} text={'Monitor → "Get the alerts" → Scan'} />
      </View>
      <Text style={styles.roleSub}>Keep this screen open until it connects.</Text>
      {onCancel && (
        <Pressable onPress={onCancel} hitSlop={10}>
          <Text style={styles.change}>Cancel</Text>
        </Pressable>
      )}
    </Card>
  );
}

/** Live view of what the baby's phone hears, so you can see the detector working. */
function Hearing() {
  const { m, status, baby } = useMonitor();
  const threshold = THRESHOLDS[m.sensitivity];
  const score = status.score ?? 0;
  const pct = Math.min(100, (score / Math.max(threshold * 2, 0.01)) * 100); // the line sits halfway
  const label = status.top != null && (status.topScore ?? 0) > 0.1 ? YAMNET_LABELS[status.top] : "Quiet";
  const hot = score >= threshold;
  return (
    <Card style={{ gap: 12 }}>
      <Label right={<Text style={styles.hearingNow} numberOfLines={1}>{label}</Text>}>Hearing</Label>
      <View>
        <View style={styles.meter}>
          <View style={[styles.meterFill, { width: `${pct}%`, backgroundColor: hot ? colors.rose : colors.sage }]} />
          <View style={styles.meterLine} />
        </View>
        <View style={styles.meterLabels}>
          <Text style={styles.meterText}>Calm</Text>
          <Text style={styles.meterText}>Crying</Text>
        </View>
      </View>
      <Text style={styles.roleSub}>
        {m.alertAfter === 0
          ? "Alerts when it stays past the line for about 2 seconds."
          : `Alerts when crying keeps going for ${m.alertAfter === 60 ? "a minute" : "10 seconds"}.`}{" "}
        To test, play a video of a baby crying near this phone.
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
        accessibilityLabel="Listen for crying"
      >
        <Animated.View style={[styles.orb, { backgroundColor: tone, transform: [{ scale: press }] }]}>
          <Icon d={ICONS.mic} size={30} color={listening ? colors.bg : colors.cream} width={1.9} />
          <Text style={[styles.orbTitle, listening && { color: colors.bg }]}>
            {crying ? `${baby} is crying` : listening ? "Listening" : "Start listening"}
          </Text>
          {listening && <Text style={styles.orbSub}>Tap to stop</Text>}
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
          <Text style={styles.scanText}>Allow the camera to scan</Text>
        )}
        <View style={styles.scanFrame} pointerEvents="none" />
        <Text style={styles.scanHint}>Scan the code on the baby's phone</Text>
        <Pressable onPress={onClose} style={styles.scanClose}>
          <Text style={styles.scanCloseText}>Cancel</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

/* ---------------- this phone gets the alerts ---------------- */

function ParentPhone() {
  const { m, update } = useMonitor();
  const [alerts, setAlerts] = useState<AlertRecord[]>([]);
  const [scanning, setScanning] = useState(false);
  const [state, setState] = useState<"idle" | "connecting" | "failed">("idle");
  const [err, setErr] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const handle = async (n: Notifications.Notification) => {
      const who = pairedBaby(n);
      if (who) {
        update({ pairedWith: who });
        setState("idle");
        if (timer.current) clearTimeout(timer.current);
      }
      const next = await recordAlert(n);
      if (next) setAlerts(next);
    };
    (async () => {
      const shown = await Notifications.getPresentedNotificationsAsync().catch(() => []);
      for (const n of shown) await handle(n);
      setAlerts(await loadAlerts());
    })();
    const sub = Notifications.addNotificationReceivedListener(handle);
    return () => { sub.remove(); if (timer.current) clearTimeout(timer.current); };
  }, [update]);

  const onScanned = async (raw: string) => {
    setScanning(false);
    setErr(null);
    const code = readPairCode(raw);
    if (!code) return setErr("That's not a hush code. Scan the code on the baby's phone.");
    let mine: string;
    try {
      mine = await getMyToken();
    } catch (e) {
      return setErr((e as Error).message);
    }
    setState("connecting");
    const ok = await sendPush([code.token], `${m.myName.trim() || "A parent"} connected`, { type: "pair-request", token: mine, name: m.myName.trim() || "Parent" });
    if (!ok) { setState("failed"); return; }
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setState((s) => (s === "connecting" ? "failed" : s)), 20000);
  };

  const connected = !!m.pairedWith && state === "idle";

  return (
    <>
      {connected ? (
        <Card style={styles.connected}>
          <View style={styles.checkCircle}><Icon d={ICONS.check} size={22} color={colors.bg} width={2.4} /></View>
          <View style={{ flex: 1 }}>
            <Text style={styles.roleTitle}>Connected to {m.pairedWith}'s phone</Text>
            <Text style={styles.roleSub}>You'll get a notification when {m.pairedWith} cries</Text>
          </View>
        </Card>
      ) : (
        <Card style={{ gap: 14 }}>
          <Text style={styles.stepTitle}>
            {state === "connecting" ? "Connecting…" : state === "failed" ? "Couldn't connect" : "Connect to the baby's phone"}
          </Text>
          {state === "failed" ? (
            <Text style={[styles.roleSub, { textAlign: "center" }]}>Make sure hush is open on the baby's phone with its code showing, then scan again.</Text>
          ) : (
            <>
              <Step n={1} text={'On the baby\'s phone, open Monitor and pick "Stay in the baby\'s room"'} />
              <Step n={2} text="Scan the code it shows" />
            </>
          )}
          <TextInput
            value={m.myName}
            onChangeText={(myName) => update({ myName })}
            placeholder="Your name (shown on the baby's phone)"
            placeholderTextColor={colors.muted}
            style={styles.input}
            maxLength={30}
          />
          <Pressable onPress={() => setScanning(true)} style={[styles.primary, state === "connecting" && { opacity: 0.5 }]} disabled={state === "connecting"}>
            <Text style={styles.primaryText}>Scan code</Text>
          </Pressable>
        </Card>
      )}
      {connected && (
        <Pressable onPress={() => setScanning(true)} style={{ alignSelf: "center" }} hitSlop={10}>
          <Text style={styles.change}>Connect another baby's phone</Text>
        </Pressable>
      )}
      {err && <Text style={styles.msg}>{err}</Text>}

      <Card style={{ gap: 4 }}>
        <Label>Alerts</Label>
        {alerts.length === 0 ? (
          <Text style={styles.empty}>None yet</Text>
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
      <Scanner visible={scanning} onClose={() => setScanning(false)} onCode={onScanned} />
    </>
  );
}

const ORB = 184;
const styles = StyleSheet.create({
  foot: { fontFamily: fonts.body, fontSize: 12, color: colors.muted, textAlign: "center", opacity: 0.7 },
  msg: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.cream, textAlign: "center" },

  lead: { fontFamily: fonts.displayBold, fontSize: 24, color: colors.cream, textAlign: "center" },
  leadSub: { fontFamily: fonts.body, fontSize: 14.5, lineHeight: 21, color: colors.muted, textAlign: "center", paddingHorizontal: 10 },
  ask: { fontFamily: fonts.bodyBold, fontSize: 12.5, color: colors.muted, letterSpacing: 0.6, textTransform: "uppercase", marginLeft: 6, marginTop: 6 },
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
