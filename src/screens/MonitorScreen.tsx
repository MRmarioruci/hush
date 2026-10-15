import { useEffect, useRef, useState } from "react";
import { Animated, Easing, Modal, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import * as Notifications from "expo-notifications";
import { CameraView, useCameraPermissions } from "expo-camera";
import QRCode from "react-native-qrcode-svg";
import { cryDetector } from "../../modules/hush-native/src";
import { colors, fonts } from "../theme";
import { getMyToken, loadAlerts, makePairCode, pairedBaby, readPairCode, recordAlert, type AlertRecord, type Role, type Sensitivity } from "../monitor";
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
      <View style={styles.diagram}>
        <PhoneGlyph icon={ICONS.mic} label={`With ${baby}`} tone={colors.sage} />
        <View style={styles.wire}>
          <View style={styles.wireLine} />
          <Text style={styles.wireText}>alert</Text>
        </View>
        <PhoneGlyph icon={ICONS.bell} label="With you" tone={colors.peach} />
      </View>
      <Text style={styles.lead}>Use two phones. Which one is this?</Text>

      <RoleCard
        icon={ICONS.mic}
        tone={colors.sage}
        title={`It stays with ${baby}`}
        sub="Listens for crying"
        onPress={() => onPick("nursery")}
      />
      <RoleCard icon={ICONS.bell} tone={colors.peach} title="It's mine" sub="Gets the alerts" onPress={() => onPick("parent")} />
    </>
  );
}

function PhoneGlyph({ icon, label, tone }: { icon: string; label: string; tone: string }) {
  return (
    <View style={{ alignItems: "center", gap: 8 }}>
      <View style={[styles.glyph, { borderColor: tone }]}>
        <Icon d={icon} size={24} color={tone} />
      </View>
      <Text style={styles.glyphLabel}>{label}</Text>
    </View>
  );
}

function RoleCard({ icon, tone, title, sub, onPress }: { icon: string; tone: string; title: string; sub: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.roleCard, pressed && { transform: [{ scale: 0.98 }] }]}>
      <View style={[styles.roleIcon, { backgroundColor: tone }]}>
        <Icon d={icon} size={24} color={colors.bg} width={2} />
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
        <Icon d={nursery ? ICONS.mic : ICONS.bell} size={18} color={colors.bg} width={2} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.roleBarKicker}>This phone</Text>
        <Text style={styles.roleBarTitle}>{nursery ? `Stays with ${baby}` : "Gets the alerts"}</Text>
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
  const [scanning, setScanning] = useState(false);
  const tokens = m.parents.map((p) => p.token);
  const crying = !!status.crying;
  const paired = m.parents.length > 0;

  const test = async () => {
    if (!cryDetector || !tokens.length) return;
    setMsg("Sending…");
    const r = await cryDetector.sendAlert(tokens, `Test alert from ${baby}'s phone`, "test");
    setMsg(r.ok ? "Test sent" : "Couldn't send. Check the internet connection.");
  };

  const onScanned = (raw: string) => {
    setScanning(false);
    const code = readPairCode(raw);
    if (!code) return setMsg("That's not a hush code");
    if (m.parents.some((p) => p.token === code.token)) return setMsg(`${code.name} is already connected`);
    update({ parents: [...m.parents, { token: code.token, name: code.name || "Parent", addedAt: Date.now() }] });
    cryDetector?.sendAlert([code.token], `Connected to ${baby}'s phone`, "paired");
    setMsg(`${code.name || "Parent"} connected`);
  };

  return (
    <>
      {!paired ? (
        <Card style={{ gap: 14 }}>
          <Text style={styles.stepTitle}>Connect a parent's phone</Text>
          <Step n={1} text={'On your phone, open Monitor and pick "It\'s mine"'} />
          <Step n={2} text="Scan the code it shows" />
          <Pressable onPress={() => setScanning(true)} style={styles.primary}>
            <Text style={styles.primaryText}>Scan code</Text>
          </Pressable>
        </Card>
      ) : (
        <View style={styles.orbWrap}>
          <Orb listening={listening} crying={crying} score={status.score ?? 0} onPress={async () => setMsg(await toggleListening())} baby={baby} />
          <Text style={styles.orbMeta}>
            {listening ? (lastCry ? `Last alert ${fmtTime(lastCry)}` : "Quiet so far") : "Keep it near the crib. Works with the screen locked."}
          </Text>
        </View>
      )}

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
          <Pressable onPress={() => setScanning(true)} style={styles.person}>
            <View style={[styles.avatar, { backgroundColor: colors.card2 }]}><Icon d={PLUS} size={18} color={colors.peach} width={2.2} /></View>
            <Text style={[styles.personName, { color: colors.peach }]}>Add another phone</Text>
          </Pressable>
        </Card>
      )}

      {paired && (
        <Card>
          <Label>Sensitivity</Label>
          <View style={styles.seg2}>
            {(["low", "medium", "high"] as Sensitivity[]).map((s) => (
              <Pressable key={s} onPress={() => update({ sensitivity: s })} style={[styles.seg2Item, m.sensitivity === s && styles.seg2On]}>
                <Text style={[styles.seg2Text, m.sensitivity === s && { color: colors.cream }]}>{s[0].toUpperCase() + s.slice(1)}</Text>
              </Pressable>
            ))}
          </View>
        </Card>
      )}

      {msg && <Text style={styles.msg}>{msg}</Text>}
      <Scanner visible={scanning} onClose={() => setScanning(false)} onCode={onScanned} />
    </>
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
        <Text style={styles.scanHint}>Scan the code on the parent's phone</Text>
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
  const [token, setToken] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [alerts, setAlerts] = useState<AlertRecord[]>([]);
  const [showCode, setShowCode] = useState(false);

  useEffect(() => {
    getMyToken().then(setToken, (e) => setErr(e.message));
    const handle = async (n: Notifications.Notification) => {
      const who = pairedBaby(n);
      if (who) update({ pairedWith: who });
      const next = await recordAlert(n);
      if (next) setAlerts(next);
    };
    (async () => {
      const shown = await Notifications.getPresentedNotificationsAsync().catch(() => []);
      for (const n of shown) await handle(n);
      setAlerts(await loadAlerts());
    })();
    const sub = Notifications.addNotificationReceivedListener(handle);
    return () => sub.remove();
  }, [update]);

  const connected = !!m.pairedWith;

  return (
    <>
      {connected && !showCode ? (
        <Card style={styles.connected}>
          <View style={styles.checkCircle}><Icon d={ICONS.check} size={22} color={colors.bg} width={2.4} /></View>
          <View style={{ flex: 1 }}>
            <Text style={styles.roleTitle}>Connected to {m.pairedWith}'s phone</Text>
            <Text style={styles.roleSub}>You'll get a notification when {m.pairedWith} cries</Text>
          </View>
        </Card>
      ) : (
        <Card style={{ alignItems: "center", gap: 14 }}>
          <Text style={styles.stepTitle}>Show this to the phone that stays with the baby</Text>
          <View style={styles.qr}>
            {token ? (
              <QRCode value={makePairCode(token, m.myName.trim() || "Parent")} size={188} backgroundColor={colors.cream} color={colors.bg} />
            ) : (
              <Text style={styles.qrWait}>{err ?? "Getting ready…"}</Text>
            )}
          </View>
          <Text style={styles.roleSub}>On that phone: Monitor → Scan code</Text>
          <TextInput
            value={m.myName}
            onChangeText={(myName) => update({ myName })}
            placeholder="Your name"
            placeholderTextColor={colors.muted}
            style={styles.input}
            maxLength={30}
          />
        </Card>
      )}
      {connected && (
        <Pressable onPress={() => setShowCode((v) => !v)} style={{ alignSelf: "center" }} hitSlop={10}>
          <Text style={styles.change}>{showCode ? "Done" : "Connect another baby phone"}</Text>
        </Pressable>
      )}

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
    </>
  );
}

const ORB = 184;
const styles = StyleSheet.create({
  foot: { fontFamily: fonts.body, fontSize: 12, color: colors.muted, textAlign: "center", opacity: 0.7 },
  msg: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.cream, textAlign: "center" },

  diagram: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingTop: 14 },
  glyph: { width: 64, height: 96, borderRadius: 16, borderWidth: 2, alignItems: "center", justifyContent: "center", backgroundColor: colors.card },
  glyphLabel: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.muted },
  wire: { width: 92, alignItems: "center", marginBottom: 26, gap: 4 },
  wireLine: { height: 2, alignSelf: "stretch", borderRadius: 1, backgroundColor: colors.card2 },
  wireText: { fontFamily: fonts.body, fontSize: 12, color: colors.muted },
  lead: { fontFamily: fonts.display, fontSize: 20, color: colors.cream, textAlign: "center", marginVertical: 6 },

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
