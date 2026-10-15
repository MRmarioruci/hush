import { useEffect, useRef, useState } from "react";
import { Animated, Easing, Modal, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import * as Notifications from "expo-notifications";
import { CameraView, useCameraPermissions } from "expo-camera";
import QRCode from "react-native-qrcode-svg";
import { cryDetector } from "../../modules/hush-native/src";
import { colors, fonts } from "../theme";
import { getMyToken, loadAlerts, makePairCode, readPairCode, recordAlert, type AlertRecord, type Sensitivity } from "../monitor";
import { useMonitor } from "../state/monitor";
import { Card, Icon, Label, Screen } from "../components/ui";

type Role = "baby" | "parent";
const fmtTime = (t: number) => new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
const MIC = '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21"/>';
const PLUS = '<path d="M12 5v14M5 12h14"/>';
const X = '<path d="M6 6l12 12M18 6 6 18"/>';
const SEND = '<path d="M4 12 20 4l-6 16-3-7z"/>';

export function MonitorScreen() {
  const [role, setRole] = useState<Role>("baby");
  return (
    <Screen title="Monitor">
      <View style={styles.seg}>
        {([["baby", "Baby's phone"], ["parent", "Parent's phone"]] as const).map(([r, label]) => (
          <Pressable key={r} onPress={() => setRole(r)} style={[styles.segItem, role === r && styles.segOn]}>
            <Text style={[styles.segText, role === r && { color: colors.bg }]}>{label}</Text>
          </Pressable>
        ))}
      </View>
      {role === "baby" ? <BabySide /> : <ParentSide />}
      <Text style={styles.foot}>A helper, not a medical device.</Text>
    </Screen>
  );
}

/* ---------------- baby's phone ---------------- */

function BabySide() {
  const { m, update, listening, status, lastCry, toggleListening, baby } = useMonitor();
  const [msg, setMsg] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const tokens = m.parents.map((p) => p.token);
  const crying = !!status.crying;

  const test = async () => {
    if (!cryDetector || !tokens.length) return;
    setMsg("Sending…");
    const r = await cryDetector.sendAlert(tokens, `Test alert from ${baby}'s monitor`, "test");
    setMsg(r.ok ? "Test sent" : "Couldn't send. Check the internet connection.");
  };

  const onScanned = (raw: string) => {
    setScanning(false);
    const code = readPairCode(raw);
    if (!code) return setMsg("That's not a hush code");
    if (m.parents.some((p) => p.token === code.token)) return setMsg(`${code.name} is already paired`);
    update({ parents: [...m.parents, { token: code.token, name: code.name || "Parent", addedAt: Date.now() }] });
    cryDetector?.sendAlert([code.token], `You're paired with ${baby}'s monitor`, "paired");
    setMsg(`${code.name || "Parent"} paired`);
  };

  return (
    <>
      <View style={styles.orbWrap}>
        <Orb listening={listening} crying={crying} score={status.score ?? 0} onPress={async () => setMsg(await toggleListening())} baby={baby} />
        <Text style={styles.orbMeta}>
          {listening ? (lastCry ? `Last alert ${fmtTime(lastCry)}` : "Quiet so far") : "Works with the screen locked"}
        </Text>
      </View>

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

      <Card style={{ gap: 4 }}>
        <Label right={m.parents.length ? <Pressable onPress={test} hitSlop={10} style={styles.inline}><Icon d={SEND} size={15} color={colors.peach} /><Text style={styles.inlineText}>Test</Text></Pressable> : undefined}>
          Parent phones
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
          <View style={[styles.avatar, { backgroundColor: colors.peach }]}><Icon d={PLUS} size={18} color={colors.bg} width={2.2} /></View>
          <Text style={[styles.personName, { color: colors.peach }]}>Add a parent phone</Text>
        </Pressable>
      </Card>

      {msg && <Text style={styles.msg}>{msg}</Text>}
      <Scanner visible={scanning} onClose={() => setScanning(false)} onCode={onScanned} />
    </>
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
          <Icon d={MIC} size={30} color={listening ? colors.bg : colors.cream} width={1.9} />
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

/* ---------------- parent's phone ---------------- */

function ParentSide() {
  const { m, update } = useMonitor();
  const [token, setToken] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [alerts, setAlerts] = useState<AlertRecord[]>([]);

  useEffect(() => {
    getMyToken().then(setToken, (e) => setErr(e.message));
    (async () => {
      const shown = await Notifications.getPresentedNotificationsAsync().catch(() => []);
      for (const n of shown) await recordAlert(n);
      setAlerts(await loadAlerts());
    })();
    const sub = Notifications.addNotificationReceivedListener(async (n) => {
      const next = await recordAlert(n);
      if (next) setAlerts(next);
    });
    return () => sub.remove();
  }, []);

  return (
    <>
      <Card style={{ alignItems: "center", gap: 16 }}>
        <View style={styles.qr}>
          {token ? (
            <QRCode value={makePairCode(token, m.myName.trim() || "Parent")} size={188} backgroundColor={colors.cream} color={colors.bg} />
          ) : (
            <Text style={styles.qrWait}>{err ?? "Getting ready…"}</Text>
          )}
        </View>
        <Text style={styles.qrCaption}>Scan this from the baby's phone</Text>
        <TextInput
          value={m.myName}
          onChangeText={(myName) => update({ myName })}
          placeholder="Your name"
          placeholderTextColor={colors.muted}
          style={styles.input}
          maxLength={30}
        />
      </Card>

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
  seg: { flexDirection: "row", backgroundColor: colors.card, borderRadius: 99, padding: 4 },
  segItem: { flex: 1, alignItems: "center", paddingVertical: 10, borderRadius: 99 },
  segOn: { backgroundColor: colors.cream },
  segText: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.muted },
  foot: { fontFamily: fonts.body, fontSize: 12, color: colors.muted, textAlign: "center", opacity: 0.7 },
  msg: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.cream, textAlign: "center" },

  orbWrap: { alignItems: "center", gap: 14, paddingVertical: 18 },
  orbBox: { width: ORB * 1.5, height: ORB * 1.2, alignItems: "center", justifyContent: "center" },
  ring: { position: "absolute", width: ORB, height: ORB, borderRadius: ORB / 2, borderWidth: 2 },
  orb: { width: ORB, height: ORB, borderRadius: ORB / 2, alignItems: "center", justifyContent: "center", gap: 6 },
  orbTitle: { fontFamily: fonts.displayBold, fontSize: 19, color: colors.cream, textAlign: "center", paddingHorizontal: 18 },
  orbSub: { fontFamily: fonts.body, fontSize: 12.5, color: colors.bg, opacity: 0.65 },
  orbMeta: { fontFamily: fonts.body, fontSize: 13.5, color: colors.muted },

  seg2: { flexDirection: "row", backgroundColor: colors.card2, borderRadius: 14, padding: 3 },
  seg2Item: { flex: 1, alignItems: "center", paddingVertical: 9, borderRadius: 11 },
  seg2On: { backgroundColor: "#463d63" },
  seg2Text: { fontFamily: fonts.bodyBold, fontSize: 13.5, color: colors.muted },

  person: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 7 },
  avatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.card2, alignItems: "center", justifyContent: "center" },
  avatarText: { fontFamily: fonts.displayBold, fontSize: 15, color: colors.cream },
  personName: { flex: 1, fontFamily: fonts.bodyBold, fontSize: 15, color: colors.cream },
  inline: { flexDirection: "row", alignItems: "center", gap: 5 },
  inlineText: { fontFamily: fonts.bodyBold, fontSize: 13.5, color: colors.peach },

  qr: { backgroundColor: colors.cream, borderRadius: 22, padding: 14, width: 216, height: 216, alignItems: "center", justifyContent: "center" },
  qrWait: { fontFamily: fonts.body, fontSize: 13, color: colors.bg, textAlign: "center", padding: 12 },
  qrCaption: { fontFamily: fonts.display, fontSize: 16, color: colors.cream },
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
