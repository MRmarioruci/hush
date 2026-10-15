import { useEffect, useRef, useState } from "react";
import { Animated, Easing, Modal, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import * as Notifications from "expo-notifications";
import { CameraView, useCameraPermissions } from "expo-camera";
import QRCode from "react-native-qrcode-svg";
import { cryDetector, type CryStatus } from "../../modules/hush-native/src";
import { colors, fonts } from "../theme";
import {
  THRESHOLDS,
  askMicAndNotifications,
  getMyToken,
  loadAlerts,
  loadMonitor,
  makePairCode,
  readPairCode,
  recordAlert,
  saveMonitor,
  type AlertRecord,
  type MonitorSettings,
  type Sensitivity,
} from "../monitor";

type Role = "baby" | "parent";
const fmtTime = (t: number) => new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

export function MonitorScreen() {
  const [m, setM] = useState<MonitorSettings | null>(null);
  const [role, setRole] = useState<Role>("baby");
  useEffect(() => { loadMonitor().then(setM); }, []);
  const update = (patch: Partial<MonitorSettings>) =>
    setM((prev) => {
      const next = { ...prev!, ...patch };
      saveMonitor(next);
      return next;
    });
  if (!m) return null;

  return (
    <View style={{ gap: 18 }}>
      <View style={styles.roles}>
        {([["baby", "Baby's phone"], ["parent", "Parent's phone"]] as const).map(([r, label]) => (
          <Pressable key={r} onPress={() => setRole(r)} style={[styles.role, role === r && styles.roleOn]}>
            <Text style={[styles.roleText, role === r && { color: colors.bg }]}>{label}</Text>
          </Pressable>
        ))}
      </View>
      {role === "baby" ? <BabySide m={m} update={update} /> : <ParentSide m={m} update={update} />}
      <Text style={styles.note}>
        hush is a helper, not a medical device. Alerts can be delayed or missed if a phone is offline, in battery saver
        or on Do Not Disturb, so keep checking on your baby as usual.
      </Text>
    </View>
  );
}

/* ---------------- baby side ---------------- */

function BabySide({ m, update }: { m: MonitorSettings; update: (p: Partial<MonitorSettings>) => void }) {
  const [listening, setListening] = useState(() => cryDetector?.isListening() ?? false);
  const [status, setStatus] = useState<CryStatus>({});
  const [lastCry, setLastCry] = useState<number | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const tokens = m.parents.map((p) => p.token);

  useEffect(() => {
    cryDetector?.configure(THRESHOLDS[m.sensitivity], m.room.trim() || "the nursery", tokens);
  }, [m.sensitivity, m.room, tokens.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!cryDetector) return;
    const a = cryDetector.onStatus((s) => {
      setStatus(s);
      if (s.error) { setListening(false); setMsg(s.error); }
    });
    const b = cryDetector.onCry((e) => setLastCry(e.at));
    return () => { a.remove(); b.remove(); };
  }, []);

  const toggle = async () => {
    setMsg(null);
    if (!cryDetector) return setMsg("Listening for crying works on Android phones.");
    if (listening) {
      cryDetector.stop();
      setListening(false);
      setStatus({});
      return;
    }
    const problem = await askMicAndNotifications();
    if (problem) return setMsg(problem);
    cryDetector.configure(THRESHOLDS[m.sensitivity], m.room.trim() || "the nursery", tokens);
    cryDetector.start();
    setListening(true);
    if (!tokens.length) setMsg("Listening, but no parent phones are paired yet. Add one below to get alerts.");
  };

  const test = async () => {
    if (!cryDetector) return;
    setMsg("Sending…");
    const r = await cryDetector.sendAlert(tokens, `Test alert from ${m.room.trim() || "the nursery"}`, "test");
    setMsg(r.ok ? "Test alert sent. Check the parent phones." : `Couldn't send: ${r.detail.slice(0, 120)}`);
  };

  const onScanned = async (raw: string) => {
    const code = readPairCode(raw);
    setScanning(false);
    if (!code) return setMsg("That QR code isn't a hush pairing code.");
    if (m.parents.some((p) => p.token === code.token)) return setMsg(`${code.name || "That phone"} is already paired.`);
    const parents = [...m.parents, { token: code.token, name: code.name || "Parent phone", addedAt: Date.now() }];
    update({ parents });
    cryDetector?.sendAlert([code.token], `Paired with ${m.room.trim() || "the nursery"}. You'll get crying alerts here.`, "paired");
    setMsg(`${code.name || "Parent phone"} paired.`);
  };

  const crying = !!status.crying;
  const score = Math.min(1, (status.score ?? 0) / Math.max(0.05, THRESHOLDS[m.sensitivity]));

  return (
    <>
      <View style={styles.card}>
        <Pressable onPress={toggle} style={[styles.listenBtn, listening && styles.listenOn, crying && styles.listenCry]}>
          <Pulse active={listening} crying={crying} />
          <Text style={[styles.listenText, listening && { color: colors.bg }]}>
            {listening ? (crying ? "Crying detected" : "Listening…") : "Start listening"}
          </Text>
          <Text style={[styles.listenSub, listening && { color: colors.bg, opacity: 0.7 }]}>
            {listening ? "Tap to stop" : "Works with the screen locked and white noise playing"}
          </Text>
        </Pressable>

        {listening && (
          <View style={{ gap: 6 }}>
            <View style={styles.row}>
              <Text style={styles.small}>How cry-like it sounds</Text>
              <Text style={styles.small}>{lastCry ? `Last alert ${fmtTime(lastCry)}` : "No alerts yet"}</Text>
            </View>
            <View style={styles.meter}>
              <View style={[styles.meterFill, { width: `${Math.round(score * 100)}%`, backgroundColor: score >= 1 ? colors.rose : colors.sage }]} />
            </View>
          </View>
        )}

        <View style={{ gap: 8 }}>
          <Text style={styles.label}>Room name</Text>
          <TextInput
            value={m.room}
            onChangeText={(room) => update({ room })}
            placeholder="the nursery"
            placeholderTextColor={colors.muted}
            style={styles.input}
            maxLength={40}
          />
        </View>

        <View style={{ gap: 8 }}>
          <Text style={styles.label}>Sensitivity</Text>
          <View style={styles.chips}>
            {(["low", "medium", "high"] as Sensitivity[]).map((s) => (
              <Pressable key={s} onPress={() => update({ sensitivity: s })} style={[styles.chip, m.sensitivity === s && styles.chipOn]}>
                <Text style={[styles.chipText, m.sensitivity === s && { color: colors.bg }]}>{s[0].toUpperCase() + s.slice(1)}</Text>
              </Pressable>
            ))}
          </View>
          <Text style={styles.hint}>Higher catches quiet whimpers but may alert on other sounds.</Text>
        </View>
      </View>

      <View style={styles.card}>
        <View style={styles.row}>
          <Text style={styles.label}>Parent phones</Text>
          <Text style={styles.small}>{m.parents.length}</Text>
        </View>
        {m.parents.length === 0 && <Text style={styles.hint}>On each parent's phone, open hush → Monitor → Parent's phone, then scan its code here.</Text>}
        {m.parents.map((p) => (
          <View key={p.token} style={styles.parentRow}>
            <Text style={styles.parentName}>{p.name}</Text>
            <Pressable onPress={() => update({ parents: m.parents.filter((x) => x.token !== p.token) })} hitSlop={10}>
              <Text style={styles.remove}>Remove</Text>
            </Pressable>
          </View>
        ))}
        <View style={styles.btnRow}>
          <Pressable onPress={() => setScanning(true)} style={[styles.btn, styles.btnMain]}>
            <Text style={[styles.btnText, { color: colors.bg }]}>Add parent phone</Text>
          </Pressable>
          <Pressable onPress={test} disabled={!m.parents.length} style={[styles.btn, !m.parents.length && { opacity: 0.4 }]}>
            <Text style={styles.btnText}>Send test alert</Text>
          </Pressable>
        </View>
      </View>

      {msg && <Text style={styles.msg}>{msg}</Text>}
      <Scanner visible={scanning} onClose={() => setScanning(false)} onCode={onScanned} />
    </>
  );
}

function Pulse({ active, crying }: { active: boolean; crying: boolean }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!active) return;
    const loop = Animated.loop(Animated.timing(v, { toValue: 1, duration: crying ? 900 : 2200, easing: Easing.out(Easing.quad), useNativeDriver: true }));
    v.setValue(0);
    loop.start();
    return () => loop.stop();
  }, [active, crying, v]);
  return (
    <View style={styles.pulseBox}>
      {active && (
        <Animated.View
          style={[styles.pulseRing, {
            borderColor: crying ? colors.bg : colors.bg,
            opacity: v.interpolate({ inputRange: [0, 1], outputRange: [0.5, 0] }),
            transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [1, 2.2] }) }],
          }]}
        />
      )}
      <View style={[styles.pulseDot, { backgroundColor: active ? colors.bg : colors.peach }]} />
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
          <Text style={styles.scanText}>Allow the camera to scan the parent phone's code.</Text>
        )}
        <View style={styles.scanFrame} pointerEvents="none" />
        <Text style={styles.scanHint}>Point at the code on the parent's phone</Text>
        <Pressable onPress={onClose} style={styles.scanClose}>
          <Text style={styles.btnText}>Cancel</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

/* ---------------- parent side ---------------- */

function ParentSide({ m, update }: { m: MonitorSettings; update: (p: Partial<MonitorSettings>) => void }) {
  const [token, setToken] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [alerts, setAlerts] = useState<AlertRecord[]>([]);

  useEffect(() => {
    getMyToken().then(setToken, (e) => setErr(e.message));
    const sync = async () => {
      const shown = await Notifications.getPresentedNotificationsAsync().catch(() => []);
      for (const n of shown) await recordAlert(n);
      setAlerts(await loadAlerts());
    };
    sync();
    const sub = Notifications.addNotificationReceivedListener(async (n) => {
      const next = await recordAlert(n);
      if (next) setAlerts(next);
    });
    return () => sub.remove();
  }, []);

  return (
    <>
      <View style={[styles.card, { alignItems: "center" }]}>
        <Text style={[styles.label, { alignSelf: "flex-start" }]}>Your name</Text>
        <TextInput
          value={m.myName}
          onChangeText={(myName) => update({ myName })}
          placeholder="e.g. Mario"
          placeholderTextColor={colors.muted}
          style={[styles.input, { alignSelf: "stretch" }]}
          maxLength={30}
        />
        <View style={styles.qrBox}>
          {token ? (
            <QRCode value={makePairCode(token, m.myName.trim() || "Parent phone")} size={196} backgroundColor={colors.cream} color={colors.bg} />
          ) : (
            <Text style={[styles.hint, { textAlign: "center", padding: 20 }]}>{err ?? "Getting this phone ready…"}</Text>
          )}
        </View>
        <Text style={[styles.hint, { textAlign: "center" }]}>
          On the baby's phone, open Monitor → Baby's phone → Add parent phone, and scan this code. You'll get a
          confirmation here.
        </Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>Recent alerts</Text>
        {alerts.length === 0 ? (
          <Text style={styles.hint}>No alerts yet.</Text>
        ) : (
          alerts.slice(0, 8).map((a) => (
            <View key={a.id} style={styles.parentRow}>
              <Text style={styles.parentName}>{a.body}</Text>
              <Text style={styles.small}>{fmtTime(a.at)}</Text>
            </View>
          ))
        )}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  roles: { flexDirection: "row", backgroundColor: colors.card, borderRadius: 99, padding: 4 },
  role: { flex: 1, alignItems: "center", paddingVertical: 9, borderRadius: 99 },
  roleOn: { backgroundColor: colors.cream },
  roleText: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.muted },

  card: { backgroundColor: colors.card, borderRadius: 24, padding: 18, gap: 16 },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" },
  label: { fontFamily: fonts.display, fontSize: 15, color: colors.muted },
  small: { fontFamily: fonts.body, fontSize: 12.5, color: colors.muted },
  hint: { fontFamily: fonts.body, fontSize: 13.5, lineHeight: 20, color: colors.muted },
  msg: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20, color: colors.cream, textAlign: "center" },
  note: { fontFamily: fonts.body, fontSize: 12.5, lineHeight: 19, color: colors.muted, textAlign: "center", opacity: 0.8 },

  listenBtn: { backgroundColor: colors.card2, borderRadius: 20, paddingVertical: 22, paddingHorizontal: 16, alignItems: "center", gap: 6 },
  listenOn: { backgroundColor: colors.sage },
  listenCry: { backgroundColor: colors.rose },
  listenText: { fontFamily: fonts.displayBold, fontSize: 20, color: colors.cream },
  listenSub: { fontFamily: fonts.body, fontSize: 13, color: colors.muted, textAlign: "center" },
  pulseBox: { width: 28, height: 28, alignItems: "center", justifyContent: "center", marginBottom: 4 },
  pulseRing: { position: "absolute", width: 20, height: 20, borderRadius: 10, borderWidth: 2 },
  pulseDot: { width: 12, height: 12, borderRadius: 6 },
  meter: { height: 8, borderRadius: 99, backgroundColor: colors.card2, overflow: "hidden" },
  meterFill: { height: 8, borderRadius: 99 },

  input: {
    backgroundColor: colors.card2,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 11,
    color: colors.cream,
    fontFamily: fonts.body,
    fontSize: 15,
  },
  chips: { flexDirection: "row", gap: 8 },
  chip: { backgroundColor: colors.card2, borderRadius: 99, paddingHorizontal: 15, paddingVertical: 9 },
  chipOn: { backgroundColor: colors.cream },
  chipText: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.muted },

  parentRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 10 },
  parentName: { fontFamily: fonts.body, fontSize: 15, color: colors.cream, flexShrink: 1 },
  remove: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.rose },
  btnRow: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  btn: { flexGrow: 1, alignItems: "center", backgroundColor: colors.card2, borderRadius: 99, paddingVertical: 12, paddingHorizontal: 16 },
  btnMain: { backgroundColor: colors.peach },
  btnText: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.cream },

  qrBox: { backgroundColor: colors.cream, borderRadius: 20, padding: 14, minWidth: 224, minHeight: 224, alignItems: "center", justifyContent: "center" },

  scanRoot: { flex: 1, backgroundColor: "#000", alignItems: "center", justifyContent: "center" },
  scanText: { fontFamily: fonts.body, fontSize: 15, color: colors.cream, textAlign: "center", padding: 32 },
  scanFrame: { width: 240, height: 240, borderRadius: 28, borderWidth: 3, borderColor: colors.peach },
  scanHint: { position: "absolute", bottom: 140, fontFamily: fonts.body, fontSize: 15, color: colors.cream },
  scanClose: { position: "absolute", bottom: 60, backgroundColor: colors.card2, borderRadius: 99, paddingVertical: 12, paddingHorizontal: 28 },
});
