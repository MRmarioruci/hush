// Putting phones in the same room: one phone invites (6-digit code + QR), the other types or scans it,
// the inviting phone taps Allow, and both land on "You're in Sebastian's room".
import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Animated, Easing, Modal, Pressable, Share, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CameraView, useCameraPermissions } from "expo-camera";
import QRCode from "react-native-qrcode-svg";
import Svg, { Circle, Path, SvgXml } from "react-native-svg";
import { colors, fonts } from "../theme";
import { useMonitor } from "../state/monitor";
import { inviteLink, readInvite } from "../family";
import { CODE_MINUTES, publishCode, readCode } from "../pairing";
import { babyLabel, t } from "../i18n";
import { Icon } from "./ui";

export type PairMode = "start" | "invite" | "join";

const CRIB = '<svg viewBox="0 0 96 84"><rect x="10" y="38" width="76" height="36" rx="13" fill="#3e3378"/><circle cx="40" cy="42" r="16" fill="#ffe1cf"/><path d="M32 42q3.5 3.5 7 0M42 42q3.5 3.5 7 0" stroke="#5b4320" stroke-width="2.6" fill="none" stroke-linecap="round"/><ellipse cx="31" cy="48" rx="3.4" ry="2.2" fill="#ff9db0"/><ellipse cx="50" cy="48" rx="3.4" ry="2.2" fill="#ff9db0"/><path d="M22 56h64v13a6 6 0 0 1-6 6H28a6 6 0 0 1-6-6z" fill="#c9bfff"/></svg>';
const PHONE = '<rect x="7" y="3" width="10" height="18" rx="2.5"/>';
const X = '<path d="M6 6l12 12M18 6 6 18"/>';
const PLUS = '<path d="M12 5v14M5 12h14"/>';
const KEY = '<circle cx="8" cy="15" r="4"/><path d="M11 12l9-9M17 6l3 3M15 8l2 2"/>';
const SEND = '<path d="M4 12 20 4l-6 16-3-7z"/>';
const CHECK = '<path d="M5 12.5l4.5 4.5L19 7"/>';
const ALERT = '<circle cx="12" cy="12" r="9"/><path d="M12 7.5v5.5M12 16.5v.01"/>';

const useRoom = () => {
  const { m } = useMonitor();
  return m.babyName.trim() ? t("hero.room", { name: babyLabel(m.babyName) }) : t("rx.room");
};

/** The two big choices when no phones are together yet (shown inline on Monitor). */
export function PairStart({ onPick }: { onPick: (m: "invite" | "join") => void }) {
  const room = useRoom();
  return (
    <View style={{ alignItems: "center", gap: 10 }}>
      <View style={styles.roomCircle}>
        <SvgXml xml={CRIB} width={104} height={91} />
        <View style={[styles.sideBadge, { left: -14, backgroundColor: colors.peach }]}><Icon d={PHONE} size={18} color={colors.bg} width={2.2} /></View>
        <View style={[styles.sideBadge, { right: -14, backgroundColor: "#c9bfff" }]}><Icon d={PHONE} size={18} color={colors.bg} width={2.2} /></View>
      </View>
      <Text style={[styles.h1, { marginTop: 18 }]}>{room}</Text>
      <Text style={styles.sub}>{t("pair.startSub")}</Text>
      <View style={{ alignSelf: "stretch", gap: 12, marginTop: 14 }}>
        <Choice icon={PLUS} tint={colors.peach} title={t("pair.invite")} sub={t("pair.inviteSub", { room })} onPress={() => onPick("invite")} />
        <Choice icon={KEY} tint="#c9bfff" title={t("pair.join")} sub={t("pair.joinSub")} onPress={() => onPick("join")} />
      </View>
    </View>
  );
}

function Choice({ icon, tint, title, sub, onPress }: { icon: string; tint: string; title: string; sub: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.choice, pressed && { transform: [{ scale: 0.98 }] }]} accessibilityRole="button">
      <View style={[styles.choiceIcon, { backgroundColor: tint }]}><Icon d={icon} size={26} color={colors.bg} width={2.3} /></View>
      <View style={{ flex: 1, gap: 3 }}>
        <Text style={styles.choiceTitle}>{title}</Text>
        <Text style={styles.choiceSub}>{sub}</Text>
      </View>
    </Pressable>
  );
}

/** The full-screen flow. */
export function PairFlow({ mode, onClose }: { mode: PairMode | null; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState<PairMode | "done">("start");
  useEffect(() => { if (mode) setStep(mode); }, [mode]);
  const { listening, rooms } = useMonitor();
  // "Which phone stays by the crib?" only on the inviting phone, only when the room was just made
  // (its first other phone), and only if no phone is the baby monitor yet. Otherwise just close.
  const invited = (first: boolean) => {
    const hasMonitor = listening || rooms.length > 0; // rooms: other phones listening now
    if (first && !hasMonitor) setStep("done"); else onClose();
  };
  return (
    <Modal visible={!!mode} animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={[styles.root, { paddingTop: insets.top + 14, paddingBottom: insets.bottom + 18 }]}>
        {step === "start" && <View style={{ flex: 1, justifyContent: "center" }}><PairStart onPick={setStep} /></View>}
        {step === "invite" && <Invite onClose={onClose} onDone={invited} />}
        {step === "join" && <Join onClose={onClose} onDone={onClose} />}
        {step === "done" && <Done onClose={onClose} />}
      </View>
    </Modal>
  );
}

function Head({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <View style={styles.head}>
      <Pressable onPress={onClose} style={styles.close} hitSlop={8} accessibilityRole="button" accessibilityLabel={t("common.close")}>
        <Icon d={X} size={18} color={colors.cream} width={2.4} />
      </Pressable>
      <Text style={styles.headTitle} numberOfLines={1}>{title}</Text>
    </View>
  );
}

function Status({ text, tone = colors.sage, spin }: { text: string; tone?: string; spin?: boolean }) {
  return (
    <View style={styles.status}>
      {spin ? <ActivityIndicator size="small" color={tone} /> : <View style={[styles.statusDot, { backgroundColor: tone }]} />}
      <Text style={styles.statusText}>{text}</Text>
    </View>
  );
}

function Problem({ title, body }: { title: string; body?: string }) {
  return (
    <View style={styles.problem} accessibilityRole="alert">
      <Icon d={ALERT} size={22} color={colors.rose} width={2.2} />
      <View style={{ flex: 1, gap: 3 }}>
        <Text style={styles.problemTitle}>{title}</Text>
        {!!body && <Text style={styles.problemBody}>{body}</Text>}
      </View>
    </View>
  );
}

/* ---------------- the inviting phone ---------------- */

function Invite({ onClose, onDone }: { onClose: () => void; onDone: (first: boolean) => void }) {
  const { invite, members, m } = useMonitor();
  const room = useRoom();
  const [inv, setInv] = useState<string | null>(null);
  const [code, setCode] = useState<{ code: string; exp: number } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [, tick] = useState(0);
  const count = useRef(members.length);

  const make = useCallback(async () => {
    setErr(null);
    try {
      const slow = setTimeout(() => setErr((e) => e ?? t("pair.slow")), 20_000);
      const i = await invite().finally(() => clearTimeout(slow));
      setErr(null);
      setInv(i);
      const r = await publishCode(i, m.myName.trim(), m.babyName.trim());
      if (r === "offline") setErr(t("pair.offline"));
      else if (r === "setup") setErr(t("pair.codeSetup"));
      else setCode(r);
    } catch (e) { setErr((e as Error).message); }
  }, [invite, m.myName, m.babyName]);
  useEffect(() => { make(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // A new code when this one runs out.
  useEffect(() => {
    const id = setInterval(() => {
      tick((x) => x + 1);
      if (code && Date.now() > code.exp) { setCode(null); make(); }
    }, 1000);
    return () => clearInterval(id);
  }, [code, make]);
  // Someone was let in: done.
  useEffect(() => { if (members.length > count.current) onDone(count.current === 0); count.current = members.length; }, [members.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const left = code ? Math.max(0, code.exp - Date.now()) : 0;
  const frac = left / (CODE_MINUTES * 60_000);
  const R = 100, C = 2 * Math.PI * R;
  const pretty = code ? `${code.code.slice(0, 3)} ${code.code.slice(3)}` : "";
  return (
    <View style={{ flex: 1, alignItems: "center" }}>
      <Head title={t("pair.inviteTitle", { room })} onClose={onClose} />
      <Text style={[styles.sub, { marginTop: 14 }]}>{t("pair.inviteHow")}</Text>
      <View style={{ width: 216, height: 216, marginTop: 16, alignItems: "center", justifyContent: "center" }}>
        <Svg width={216} height={216} style={StyleSheet.absoluteFill}>
          <Circle cx={108} cy={108} r={R} fill={colors.card} stroke={colors.card2} strokeWidth={7} />
          {code && <Circle cx={108} cy={108} r={R} fill="none" stroke={colors.peach} strokeWidth={7} strokeLinecap="round" strokeDasharray={`${C} ${C}`} strokeDashoffset={C * (1 - frac)} transform="rotate(-90 108 108)" />}
        </Svg>
        {code ? (
          <>
            <Text style={styles.codeLabel}>{t("pair.typeThis")}</Text>
            <Text style={styles.code} accessibilityLabel={code.code.split("").join(" ")}>{pretty}</Text>
            <Text style={styles.codeLeft}>{t("pair.left", { time: `${Math.floor(left / 60000)}:${String(Math.floor((left % 60000) / 1000)).padStart(2, "0")}` })}</Text>
          </>
        ) : err ? <Icon d={ALERT} size={34} color={colors.rose} width={2} /> : <ActivityIndicator color={colors.peach} />}
      </View>
      {inv && (
        <>
          <View style={styles.orRow}><View style={styles.orLine} /><Text style={styles.orText}>{t("pair.orScan")}</Text><View style={styles.orLine} /></View>
          <View style={styles.qr}><QRCode value={inviteLink(inv)} size={124} backgroundColor={colors.cream} color={colors.bg} /></View>
        </>
      )}
      <View style={{ marginTop: 14, alignSelf: "stretch", alignItems: "center", gap: 10 }}>
        {err ? (
          <>
            <Problem title={err} />
            <Pressable onPress={make} style={styles.soft}><Text style={styles.softText}>{t("common.tryAgain")}</Text></Pressable>
          </>
        ) : <Status text={t("pair.waiting")} />}
      </View>
      <View style={{ flex: 1 }} />
      {code && (
        <Pressable onPress={() => Share.share({ message: t("pair.shareMsg", { code: pretty, room, link: inv ? inviteLink(inv) : "" }) }).catch(() => {})} style={[styles.soft, { alignSelf: "stretch" }]} accessibilityRole="button">
          <Icon d={SEND} size={18} color={colors.peach} width={2} />
          <Text style={styles.softText}>{t("pair.send")}</Text>
        </Pressable>
      )}
      <Text style={[styles.small, { marginTop: 10 }]}>{t("pair.keepOpen")}</Text>
    </View>
  );
}

/* ---------------- the joining phone ---------------- */

type Found = { name: string; baby: string; invite: string };

function Join({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const { join, joining, cancelJoin, members } = useMonitor();
  const [tab, setTab] = useState<"type" | "scan">("type");
  const [digits, setDigits] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<{ title: string; body?: string } | null>(null);
  const [found, setFound] = useState<Found | null>(null);
  const [asked, setAsked] = useState(false);
  const fails = useRef<number[]>([]);
  const shake = useRef(new Animated.Value(0)).current;

  const doShake = () => Animated.sequence([-1, 1, -1, 1, 0].map((v) => Animated.timing(shake, { toValue: v, duration: 60, easing: Easing.linear, useNativeDriver: true }))).start();

  const ask = useCallback(async (f: Found) => {
    setFound(f);
    setProblem(null);
    const err = await join(f.invite);
    if (err) { setProblem({ title: err }); setFound(null); return; }
    setAsked(true);
  }, [join]);

  // The answer: let in (joining clears and the other phone is a member), said no, or no answer.
  useEffect(() => {
    if (!asked) return;
    if (joining === null && members.length > 0) { setAsked(false); onDone(); }
    else if (joining === "denied") { setAsked(false); cancelJoin(); setFound(null); setProblem({ title: t("pair.denied", { name: found?.name || t("rt.otherPhone") }) }); }
    else if (joining === "failed") { setAsked(false); cancelJoin(); setProblem({ title: t("pair.noAnswer", { name: found?.name || t("rt.otherPhone") }), body: t("pair.noAnswerBody") }); }
  }, [joining, asked, members.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const check = async (code: string) => {
    const now = Date.now();
    fails.current = fails.current.filter((x) => now - x < 60_000);
    if (fails.current.length >= 5) { setProblem({ title: t("pair.tooMany") }); return; }
    setBusy(true);
    const r = await readCode(code);
    setBusy(false);
    if (r === "missing" || r === "expired") {
      fails.current.push(now);
      setProblem(r === "missing" ? { title: t("pair.noCode"), body: t("pair.noCodeBody", { min: CODE_MINUTES }) } : { title: t("pair.expired") });
      doShake();
      return;
    }
    if (r === "offline") { setProblem({ title: t("pair.offline") }); return; }
    ask({ name: r.name, baby: r.baby, invite: r.invite });
  };
  const press = (k: string) => {
    if (busy || found) return;
    setProblem(null);
    const next = k === "del" ? digits.slice(0, -1) : (digits + k).slice(0, 6);
    setDigits(next);
    if (next.length === 6) check(next);
  };
  const onScan = (raw: string) => {
    const inv = readInvite(raw);
    if (!inv) { setProblem({ title: t("family.notCode") }); return; }
    ask({ name: inv.name, baby: "", invite: raw });
  };

  if (found) return (
    <View style={{ flex: 1, alignItems: "center" }}>
      <Head title={t("pair.join")} onClose={() => { if (asked) cancelJoin(); onClose(); }} />
      <View style={[styles.roomCircle, { marginTop: 60, width: 220, height: 220, borderRadius: 110 }]}>
        <SvgXml xml={CRIB} width={120} height={105} />
      </View>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 26 }}>
        <Icon d={CHECK} size={16} color={colors.sage} width={2.6} />
        <Text style={[styles.small, { color: colors.sage }]}>{t("pair.found")}</Text>
      </View>
      <Text style={[styles.h1, { marginTop: 6 }]}>{found.baby ? t("hero.room", { name: babyLabel(found.baby) }) : t("rx.room")}</Text>
      <Text style={styles.sub}>{t("pair.invitedBy", { name: found.name || t("rt.otherPhone") })}</Text>
      <View style={{ marginTop: 22 }}><Status text={t("pair.asking", { name: found.name || t("rt.otherPhone") })} tone="#c9bfff" spin /></View>
      <View style={{ flex: 1 }} />
      <Text style={styles.small}>{t("pair.askingHint", { name: found.name || t("rt.otherPhone") })}</Text>
      <Pressable onPress={() => { cancelJoin(); setAsked(false); setFound(null); setDigits(""); }} style={[styles.soft, { marginTop: 14, paddingHorizontal: 30 }]}><Text style={styles.softText}>{t("common.cancel")}</Text></Pressable>
    </View>
  );

  return (
    <View style={{ flex: 1, alignItems: "center" }}>
      <Head title={t("pair.join")} onClose={onClose} />
      <View style={styles.tabs} accessibilityRole="tablist">
        {(["type", "scan"] as const).map((k) => (
          <Pressable key={k} onPress={() => { setTab(k); setProblem(null); }} style={[styles.tab, tab === k && styles.tabOn]} accessibilityRole="tab" accessibilityState={{ selected: tab === k }}>
            <Text style={[styles.tabText, tab === k && { color: colors.bg }]}>{t(k === "type" ? "pair.tabType" : "pair.tabScan")}</Text>
          </Pressable>
        ))}
      </View>
      {tab === "type" ? (
        <>
          <Text style={[styles.sub, { marginTop: 18 }]}>{t("pair.typeHow")}</Text>
          <Animated.View style={[styles.digits, { transform: [{ translateX: shake.interpolate({ inputRange: [-1, 1], outputRange: [-8, 8] }) }] }]} accessibilityLabel={digits.split("").join(" ")}>
            {Array.from({ length: 6 }, (_, i) => {
              const v = digits[i] ?? "";
              const bad = !!problem && digits.length === 6;
              return (
                <View key={i} style={[styles.digit, v ? styles.digitOn : null, !v && i === digits.length && styles.digitNext, bad && styles.digitBad, i === 2 && { marginRight: 10 }]}>
                  <Text style={[styles.digitText, bad && { color: "#ffd0da" }]}>{v}</Text>
                </View>
              );
            })}
          </Animated.View>
          <View style={{ marginTop: 16, alignSelf: "stretch", minHeight: 60 }}>
            {busy ? <View style={{ alignItems: "center" }}><Status text={t("pair.checking")} tone={colors.peach} spin /></View> : problem ? <Problem title={problem.title} body={problem.body} /> : null}
          </View>
          <View style={{ flex: 1 }} />
          <View style={styles.pad}>
            {["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "del"].map((k, i) => (
              k === "" ? <View key={i} style={styles.key} /> :
              <Pressable key={i} onPress={() => press(k)} onLongPress={k === "del" ? () => setDigits("") : undefined} style={({ pressed }) => [styles.key, k !== "del" && styles.keyOn, pressed && { opacity: 0.7 }]} accessibilityRole="button" accessibilityLabel={k === "del" ? t("pair.delete") : k}>
                {k === "del" ? <Icon d='<path d="M9 6h11v12H9l-5-6z"/><path d="M12 10l4 4M16 10l-4 4"/>' size={26} color={colors.muted} width={2} /> : <Text style={styles.keyText}>{k}</Text>}
              </Pressable>
            ))}
          </View>
        </>
      ) : (
        <Scan onCode={onScan} problem={problem} />
      )}
    </View>
  );
}

function Scan({ onCode, problem }: { onCode: (raw: string) => void; problem: { title: string; body?: string } | null }) {
  const [perm, askPerm] = useCameraPermissions();
  const done = useRef(false);
  useEffect(() => { done.current = false; if (perm && !perm.granted) askPerm(); }, [perm?.granted]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (problem) done.current = false; }, [problem]);
  return (
    <>
      <Text style={[styles.sub, { marginTop: 18 }]}>{t("pair.scanHow")}</Text>
      <View style={styles.camera}>
        {perm?.granted ? (
          <CameraView style={StyleSheet.absoluteFill} facing="back" barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
            onBarcodeScanned={({ data }) => { if (done.current) return; done.current = true; onCode(data); }} />
        ) : (
          <Pressable onPress={askPerm} style={{ padding: 30 }}><Text style={[styles.sub, { color: colors.cream }]}>{t("scan.allowCam")}</Text></Pressable>
        )}
        <Svg width={190} height={190} style={{ position: "absolute" }} pointerEvents="none">
          <Path d="M10 50V22a12 12 0 0 1 12-12h28M140 10h28a12 12 0 0 1 12 12v28M180 140v28a12 12 0 0 1-12 12h-28M50 180H22a12 12 0 0 1-12-12v-28" fill="none" stroke={colors.peach} strokeWidth={6} strokeLinecap="round" />
        </Svg>
      </View>
      <View style={{ marginTop: 18, alignSelf: "stretch", alignItems: "center" }}>
        {problem ? <Problem title={problem.title} body={problem.body} /> : <Status text={t("pair.looking")} tone={colors.peach} />}
      </View>
      <View style={{ flex: 1 }} />
      <Text style={styles.small}>{t("pair.scanHint")}</Text>
    </>
  );
}

/* ---------------- both phones: in the room ---------------- */

function Done({ onClose }: { onClose: () => void }) {
  const { m, members, listening, toggleListening } = useMonitor();
  const room = useRoom();
  const [msg, setMsg] = useState<string | null>(null);
  const names = [m.myName.trim() || t("fam.thisPhone"), ...members.map((p, i) => p.name.trim() || t("fam.unnamed", { n: i + 2 }))];
  return (
    <View style={{ flex: 1, alignItems: "center" }}>
      <View style={[styles.roomCircle, { marginTop: 40, width: 230, height: 230, borderRadius: 115, shadowColor: colors.sage }]}>
        <SvgXml xml={CRIB} width={120} height={105} />
        <View style={[styles.avatar, { left: -18, backgroundColor: colors.peach }]}><Text style={styles.avatarText}>{names[0].slice(0, 1).toUpperCase()}</Text></View>
        <View style={[styles.avatar, { right: -18, backgroundColor: "#c9bfff" }]}><Text style={styles.avatarText}>{(names[1] ?? "?").slice(0, 1).toUpperCase()}</Text></View>
        <View style={styles.doneBadge}><Icon d={CHECK} size={20} color="#1e4a39" width={3} /></View>
      </View>
      <Text style={[styles.h1, { marginTop: 30 }]}>{t("pair.inRoom", { room })}</Text>
      <Text style={styles.sub}>{t("pair.inRoomSub", { names: names.join(" · ") })}</Text>
      <View style={styles.crib}>
        <Text style={styles.cribQ}>{t("pair.whichPhone")}</Text>
        <View style={{ flexDirection: "row", gap: 28 }}>
          <Pressable onPress={async () => { if (!listening) setMsg(await toggleListening()); }} style={styles.cribOpt} accessibilityRole="button" accessibilityState={{ selected: listening }}>
            <View style={[styles.cribIcon, listening && { backgroundColor: colors.sage }]}>
              <Icon d='<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21"/>' size={26} color={listening ? colors.bg : colors.sage} width={2} />
            </View>
            <Text style={styles.cribName}>{t("pair.thisPhone")}</Text>
          </Pressable>
          <Pressable onPress={onClose} style={styles.cribOpt} accessibilityRole="button">
            <View style={styles.cribIcon}><Text style={[styles.avatarText, { color: colors.peach }]}>{(names[1] ?? "?").slice(0, 1).toUpperCase()}</Text></View>
            <Text style={styles.cribName} numberOfLines={1}>{names[1] ?? t("rt.otherPhone")}</Text>
          </Pressable>
        </View>
        {msg && <Text style={[styles.small, { color: colors.rose }]}>{msg}</Text>}
      </View>
      <View style={{ flex: 1 }} />
      <Pressable onPress={onClose} style={styles.primary} accessibilityRole="button"><Text style={styles.primaryText}>{t("pair.done")}</Text></Pressable>
      <Text style={[styles.small, { marginTop: 10 }]}>{t("pair.changeLater")}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: 20 },
  head: { alignSelf: "stretch", flexDirection: "row", alignItems: "center", gap: 12 },
  close: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.card, alignItems: "center", justifyContent: "center" },
  headTitle: { flex: 1, fontFamily: fonts.display, fontSize: 21, color: colors.cream },
  h1: { fontFamily: fonts.display, fontSize: 26, color: colors.cream, textAlign: "center" },
  sub: { fontFamily: fonts.bodyBold, fontSize: 14.5, lineHeight: 21, color: colors.muted, textAlign: "center", maxWidth: 320 },
  small: { fontFamily: fonts.bodyBold, fontSize: 12.5, lineHeight: 18, color: "#8f86bf", textAlign: "center" },
  roomCircle: { width: 170, height: 170, borderRadius: 85, backgroundColor: colors.card, alignItems: "center", justifyContent: "center" },
  sideBadge: { position: "absolute", top: 58, width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", borderWidth: 4, borderColor: colors.bg },
  choice: { flexDirection: "row", alignItems: "center", gap: 16, backgroundColor: colors.card, borderRadius: 26, padding: 18 },
  choiceIcon: { width: 56, height: 56, borderRadius: 28, alignItems: "center", justifyContent: "center" },
  choiceTitle: { fontFamily: fonts.display, fontSize: 19, color: colors.cream },
  choiceSub: { fontFamily: fonts.bodyBold, fontSize: 13.5, color: colors.muted },
  codeLabel: { fontFamily: fonts.bodyBold, fontSize: 12, letterSpacing: 1, color: colors.muted },
  code: { fontFamily: fonts.display, fontSize: 46, letterSpacing: 2, color: colors.cream, fontVariant: ["tabular-nums"] },
  codeLeft: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.peach, fontVariant: ["tabular-nums"] },
  orRow: { flexDirection: "row", alignItems: "center", gap: 12, alignSelf: "stretch", marginTop: 14 },
  orLine: { flex: 1, height: 2, backgroundColor: colors.card },
  orText: { fontFamily: fonts.bodyBold, fontSize: 13, color: "#8f86bf" },
  qr: { marginTop: 12, padding: 12, borderRadius: 24, backgroundColor: colors.cream },
  status: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: colors.card, borderRadius: 20, paddingVertical: 10, paddingHorizontal: 16 },
  statusDot: { width: 9, height: 9, borderRadius: 5 },
  statusText: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.cream },
  problem: { alignSelf: "stretch", flexDirection: "row", gap: 12, alignItems: "flex-start", backgroundColor: "rgba(255,157,176,0.14)", borderRadius: 20, padding: 14 },
  problemTitle: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.cream },
  problemBody: { fontFamily: fonts.bodyBold, fontSize: 13.5, lineHeight: 19, color: "#e8dcff" },
  soft: { flexDirection: "row", gap: 8, alignItems: "center", justifyContent: "center", height: 52, borderRadius: 26, backgroundColor: colors.card, paddingHorizontal: 20 },
  softText: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.cream },
  tabs: { marginTop: 18, flexDirection: "row", backgroundColor: colors.card, borderRadius: 26, padding: 4, alignSelf: "stretch" },
  tab: { flex: 1, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  tabOn: { backgroundColor: "#c9bfff" },
  tabText: { fontFamily: fonts.bodyBold, fontSize: 14.5, color: colors.muted },
  digits: { flexDirection: "row", gap: 8, marginTop: 20 },
  digit: { width: 46, height: 58, borderRadius: 23, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: colors.card2 },
  digitOn: { backgroundColor: colors.card, borderColor: colors.card },
  digitNext: { borderColor: colors.peach },
  digitBad: { backgroundColor: "rgba(255,157,176,0.12)", borderColor: colors.rose },
  digitText: { fontFamily: fonts.display, fontSize: 30, color: colors.cream },
  pad: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", columnGap: 26, rowGap: 14, width: 290 },
  key: { width: 76, height: 76, borderRadius: 38, alignItems: "center", justifyContent: "center" },
  keyOn: { backgroundColor: colors.card },
  keyText: { fontFamily: fonts.display, fontSize: 30, color: colors.cream },
  camera: { marginTop: 18, width: 280, height: 280, borderRadius: 140, overflow: "hidden", backgroundColor: "#15112e", alignItems: "center", justifyContent: "center" },
  avatar: { position: "absolute", top: 88, width: 52, height: 52, borderRadius: 26, alignItems: "center", justifyContent: "center", borderWidth: 4, borderColor: colors.bg },
  avatarText: { fontFamily: fonts.bodyBold, fontSize: 22, color: colors.bg },
  doneBadge: { position: "absolute", bottom: 18, width: 40, height: 40, borderRadius: 20, backgroundColor: colors.sage, alignItems: "center", justifyContent: "center", borderWidth: 4, borderColor: colors.card },
  crib: { alignSelf: "stretch", marginTop: 26, backgroundColor: colors.card, borderRadius: 26, padding: 18, alignItems: "center", gap: 14 },
  cribQ: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.cream, textAlign: "center" },
  cribOpt: { alignItems: "center", gap: 8, width: 110 },
  cribIcon: { width: 64, height: 64, borderRadius: 32, backgroundColor: colors.card2, alignItems: "center", justifyContent: "center" },
  cribName: { fontFamily: fonts.bodyBold, fontSize: 13.5, color: colors.cream },
  primary: { alignSelf: "stretch", height: 56, borderRadius: 28, backgroundColor: colors.peach, alignItems: "center", justifyContent: "center" },
  primaryText: { fontFamily: fonts.bodyBold, fontSize: 16, color: colors.bg },
});
