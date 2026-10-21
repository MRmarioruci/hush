// "Sleeping now": a tilted globe you spin with a finger. The night side follows the real time,
// and each place glows with how many babies are asleep there right now (an estimate from births
// and the local hour, until hush has real anonymous counts). Tap a moon for that place.
import { useEffect, useMemo, useRef, useState } from "react";
import { Modal, PanResponder, Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { useIsFocused } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Circle, ClipPath, Defs, G, Path, RadialGradient, Rect, Stop, Text as SvgText } from "react-native-svg";
import { geoCircle, geoDistance, geoGraticule10, geoOrthographic, geoPath } from "d3-geo";
import { feature } from "topojson-client";
import { presimplify, simplify } from "topojson-simplify";
import type { Topology } from "topojson-specification";
import landTopo from "world-atlas/land-110m.json";
import { colors, fonts } from "../theme";
import { t, useT, babyLabel } from "../i18n";
import { useMonitor } from "../state/monitor";
import { useNaps } from "../state/naps";
import { useSleep } from "../state/sleep";
import { useAppActive } from "../components/ui";
import { estimate, myArea, short, subsolar, type Spot } from "../globe/estimate";

// Coastlines thinned out once (to about 40% of the points): plenty for a phone-sized globe,
// and much less to redraw while it spins.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const TOPO = simplify(presimplify(landTopo as any), 0.5) as unknown as Topology;
const LAND = feature(TOPO, TOPO.objects.land);
const GRAT = geoGraticule10();
const TILT = -12;

function useNow(ms: number, on: boolean) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { if (!on) return; setNow(Date.now()); const id = setInterval(() => setNow(Date.now()), ms); return () => clearInterval(id); }, [ms, on]);
  return now;
}

export function GlobeScreen() {
  useT();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const focused = useIsFocused();
  const active = useAppActive();
  const live = focused && active;
  const now = useNow(60_000, live);
  const spots = useMemo(() => estimate(now), [now]);
  const total = spots.reduce((a, s) => a + s.n, 0);
  const night = spots.filter((s) => s.night).reduce((a, s) => a + s.n, 0);
  const mine = useMemo(() => myArea(spots, now), [spots, now]);
  const { m } = useMonitor();
  const { s } = useSleep();
  const naps = useNaps();
  const baby = babyLabel(m.babyName);
  const showMe = s.globe !== false;
  // The tag on this phone's area: the baby's name, or "Your baby".
  const tag = (m.babyName.trim() || t("globe.yourBaby")).slice(0, 18);
  const tagW = 16 + tag.length * 5.6;

  // Rotation: start facing this phone's side of the world.
  const [rot, setRot] = useState<[number, number]>(() => [-(mine?.lon ?? 20), -Math.max(-40, Math.min(40, (mine?.lat ?? 30) - 8))]);
  const rotRef = useRef(rot);
  rotRef.current = rot;
  const vel = useRef(0);
  const touching = useRef(false);
  const lastTouch = useRef(0);
  const [picked, setPicked] = useState<Spot | null>(null);

  const size = Math.min(width - 24, 380);
  const r = size / 2 - 6;
  const proj = useMemo(() => geoOrthographic().scale(r).translate([size / 2, size / 2]).rotate([rot[0], rot[1], TILT]).clipAngle(90), [r, size, rot]);
  const path = useMemo(() => geoPath(proj).digits(1), [proj]);
  const [slon, slat] = subsolar(now);
  const nightPath = useMemo(() => path(geoCircle().center([slon + 180, -slat]).radius(90)()) ?? "", [path, slon, slat]);
  const center: [number, number] = [-rot[0], -rot[1]];
  const visible = spots
    .map((sp) => ({ sp, d: geoDistance([sp.lon, sp.lat], center), xy: proj([sp.lon, sp.lat]) }))
    .filter((v) => v.d < Math.PI / 2 - 0.06 && v.xy && v.sp.n > 0) as { sp: Spot; d: number; xy: [number, number] }[];
  const maxN = Math.max(1, ...spots.map((x) => x.n));
  // Numbers on the three biggest, away from the rim (where they'd crowd), not overlapping.
  const top3 = new Set<string>();
  for (const v of [...visible].filter((v) => v.d < 1.15).sort((a, b) => b.sp.n - a.sp.n)) {
    if (top3.size >= 3) break;
    const clash = visible.some((o) => top3.has(o.sp.name) && Math.abs(o.xy[0] - v.xy[0]) < 52 && Math.abs(o.xy[1] - v.xy[1]) < 24);
    if (!clash) top3.add(v.sp.name);
  }

  // A flick keeps it turning for a moment, then it settles. The loop runs only while it spins
  // (nothing ticks while the globe is still, or off screen).
  const spin = useRef(0);
  const stopSpin = () => { if (spin.current) cancelAnimationFrame(spin.current); spin.current = 0; };
  const startSpin = () => {
    stopSpin();
    let last = Date.now();
    const step = () => {
      const t0 = Date.now(), dt = Math.min(50, t0 - last); last = t0;
      vel.current *= Math.pow(0.92, dt / 16);
      if (touching.current || Math.abs(vel.current) < 0.003) { vel.current = 0; spin.current = 0; setMoving(false); return; }
      setRot(([l, p]) => [l + vel.current * dt, p]);
      spin.current = requestAnimationFrame(step);
    };
    spin.current = requestAnimationFrame(step);
  };
  useEffect(() => { if (!live) { stopSpin(); vel.current = 0; setMoving(false); } }, [live]);
  // A slow drift when nobody's touching it (a full turn in about 90 s): only while the World tab
  // is on screen, 20 steps a second, paused while a finger or a flick is moving it.
  useEffect(() => {
    if (!live) return;
    const id = setInterval(() => {
      if (touching.current || spin.current || Date.now() - lastTouch.current < 2500) return;
      setRot(([l, p]) => [l + 0.2, p]);
    }, 50);
    return () => clearInterval(id);
  }, [live]);
  useEffect(() => () => { stopSpin(); if (frame.current) cancelAnimationFrame(frame.current); }, []);

  const start = useRef<[number, number]>([0, 0]);
  const want = useRef<[number, number] | null>(null);
  const frame = useRef(0);
  const [moving, setMoving] = useState(false);
  const pan = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderTerminationRequest: () => false,
    onPanResponderGrant: () => { stopSpin(); touching.current = true; vel.current = 0; start.current = rotRef.current; want.current = null; setMoving(true); },
    onPanResponderMove: (_e, g) => {
      const k = 180 / (Math.PI * r); // drag the surface under the finger
      want.current = [start.current[0] + g.dx * k, Math.max(-60, Math.min(60, start.current[1] - g.dy * k))];
      // At most one redraw per frame, however many touch events arrive.
      if (!frame.current) frame.current = requestAnimationFrame(() => { frame.current = 0; if (want.current) setRot(want.current); });
    },
    onPanResponderRelease: (e, g) => {
      touching.current = false;
      lastTouch.current = Date.now();
      const k = 180 / (Math.PI * r);
      vel.current = Math.max(-0.6, Math.min(0.6, g.vx * k)); // ° per ms
      if (Math.abs(vel.current) >= 0.003) startSpin(); else setMoving(false);
      if (Math.abs(g.dx) + Math.abs(g.dy) < 6) {
        // A tap: the nearest moon under the finger.
        const { locationX: x, locationY: y } = e.nativeEvent;
        const hit = visibleRef.current
          .map((v) => ({ v, dist: Math.hypot(v.xy[0] - x, v.xy[1] - y) }))
          .sort((a, b) => a.dist - b.dist)[0];
        if (hit && hit.dist < 30) setPicked(hit.v.sp);
      }
    },
    onPanResponderTerminate: () => { touching.current = false; lastTouch.current = Date.now(); setMoving(false); },
  }), [r]);
  const visibleRef = useRef(visible);
  visibleRef.current = visible;

  const stars = useMemo(() => {
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    return Array.from({ length: Math.round(size / 8) }, () => ({ x: rnd() * size, y: rnd() * size, r: 0.5 + rnd() * 0.9, o: 0.2 + rnd() * 0.45 }));
  }, [size]);

  return (
    <View style={[styles.root, { paddingTop: insets.top + 16 }]}>
      <Text style={styles.title}>{t("globe.title")}</Text>
      <View style={{ alignItems: "center", marginTop: 6 }}>
        <Text style={styles.big}>{t("globe.about", { n: short(total) })}</Text>
        <Text style={styles.sub}>{t("globe.sub")}</Text>
      </View>

      <View style={{ alignItems: "center", marginTop: 8 }} {...pan.panHandlers}>
        <Svg width={size} height={size}>
          <Defs>
            <RadialGradient id="atm" cx="50%" cy="50%" r="50%"><Stop offset="0.86" stopColor="#9d8cff" stopOpacity="0.3" /><Stop offset="1" stopColor="#9d8cff" stopOpacity="0" /></RadialGradient>
            <RadialGradient id="sea" cx="38%" cy="32%" r="75%"><Stop offset="0" stopColor="#4b3f8e" /><Stop offset="1" stopColor="#2a2160" /></RadialGradient>
            <RadialGradient id="shine" cx="34%" cy="28%" r="70%"><Stop offset="0" stopColor="#fff" stopOpacity="0.16" /><Stop offset="0.55" stopColor="#fff" stopOpacity="0" /><Stop offset="1" stopColor="#000" stopOpacity="0.25" /></RadialGradient>
            <ClipPath id="sph"><Circle cx={size / 2} cy={size / 2} r={r} /></ClipPath>
            <ClipPath id="nt"><Path d={nightPath} /></ClipPath>
          </Defs>
          <Circle cx={size / 2} cy={size / 2} r={size / 2} fill="url(#atm)" />
          <Circle cx={size / 2} cy={size / 2} r={r} fill="url(#sea)" />
          <G clipPath="url(#sph)">
            {!moving && <Path d={path(GRAT) ?? ""} fill="none" stroke="#fff" strokeOpacity={0.05} strokeWidth={1} />}
            <Path d={path(LAND) ?? ""} fill="#7a6cc4" />
            <Path d={nightPath} fill="#0f0b28" opacity={0.6} />
            {!moving && <G clipPath="url(#nt)">{stars.map((st, i) => <Circle key={i} cx={st.x} cy={st.y} r={st.r} fill="#fff4d6" opacity={st.o} />)}</G>}
            <Path d={nightPath} fill="none" stroke={colors.peach} strokeOpacity={0.3} strokeWidth={1.2} />
            <Circle cx={size / 2} cy={size / 2} r={r} fill="url(#shine)" />
          </G>
          {visible.sort((a, b) => a.sp.n - b.sp.n).map(({ sp, d, xy: [x, y] }) => {
            const rr = 2.6 + 9 * Math.sqrt(sp.n / maxN);
            const fade = Math.max(0.35, 1 - Math.max(0, d - 1) * 1.2);
            const sel = picked?.name === sp.name;
            return (
              <G key={sp.name}>
                {sp.night ? (
                  <>
                    <Circle cx={x} cy={y} r={rr * 1.9} fill={colors.peach} opacity={0.13 * fade} />
                    <Path d={`M${x + rr * 0.25} ${y - rr} A${rr} ${rr} 0 1 0 ${x + rr * 0.25} ${y + rr} A${rr * 0.38} ${rr} 0 0 1 ${x + rr * 0.25} ${y - rr}Z`} fill={colors.peach} opacity={fade} />
                  </>
                ) : (
                  <>
                    <Circle cx={x} cy={y} r={rr * 1.8} fill="#fff" opacity={0.15 * fade} />
                    <Circle cx={x} cy={y} r={rr * 0.7} fill="#fff" opacity={0.9 * fade} />
                  </>
                )}
                {sel && <Circle cx={x} cy={y} r={rr * 2.4} fill="none" stroke={colors.cream} strokeWidth={1.8} />}
                {!moving && top3.has(sp.name) && !sel && (
                  <G>
                    <Rect x={x - 22} y={y - rr - 22} width={44} height={16} rx={8} fill="#140f33" opacity={0.85} />
                    <SvgText x={x} y={y - rr - 10.5} textAnchor="middle" fontFamily={fonts.bodyBold} fontSize={10.5} fill={sp.night ? colors.peach : "#fff"}>{short(sp.n)}</SvgText>
                  </G>
                )}
                {showMe && mine?.name === sp.name && (
                  <G>
                    <Rect x={x - tagW / 2} y={y + rr + 4} width={tagW} height={16} rx={8} fill={colors.sage} />
                    <SvgText x={x} y={y + rr + 15.5} textAnchor="middle" fontFamily={fonts.bodyBold} fontSize={9.5} fill="#1e4a39">{tag}</SvgText>
                  </G>
                )}
              </G>
            );
          })}
        </Svg>
      </View>

      <View style={styles.legend}>
        <View style={styles.key}><Svg width={14} height={14} viewBox="0 0 24 24"><Path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" fill={colors.peach} /></Svg><Text style={styles.keyText}>{t("globe.night", { n: short(night) })}</Text></View>
        <View style={styles.key}><Svg width={14} height={14}><Circle cx={7} cy={7} r={4} fill="#fff" /></Svg><Text style={styles.keyText}>{t("globe.naps", { n: short(total - night) })}</Text></View>
      </View>

      {mine && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>{showMe && naps.state.asleep ? t("globe.oneOf", { name: baby, n: short(mine.n) }) : t("globe.near", { n: short(mine.n) })}</Text>
          <Text style={styles.cardSub}>{t(mine.night ? "globe.nearNight" : "globe.nearDay", { place: mine.name })}</Text>
        </View>
      )}
      <Text style={styles.note}>{t("globe.estimate")}</Text>
      <View style={[styles.privacy, { marginBottom: insets.bottom + 96 }]}>
        <Svg width={14} height={14} viewBox="0 0 24 24"><Path d="M12 3l7 3v5c0 5-3.5 8.5-7 10-3.5-1.5-7-5-7-10V6z" fill="none" stroke="#8f86bf" strokeWidth={2} strokeLinejoin="round" /><Path d="M9 12l2 2 4-4" fill="none" stroke="#8f86bf" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" /></Svg>
        <Text style={styles.privacyText}>{t("globe.privacy")}</Text>
      </View>

      <Modal visible={!!picked} transparent animationType="slide" onRequestClose={() => setPicked(null)}>
        <Pressable style={styles.sheetBack} onPress={() => setPicked(null)} accessibilityLabel={t("common.close")} />
        {picked && (
          <View style={[styles.sheet, { paddingBottom: insets.bottom + 24 }]}>
            <View style={styles.grab} />
            <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
              <View style={styles.sheetIcon}>
                {picked.night
                  ? <Svg width={28} height={28} viewBox="0 0 24 24"><Path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" fill={colors.peach} /></Svg>
                  : <Svg width={28} height={28}><Circle cx={14} cy={14} r={7} fill="#fff" /></Svg>}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.sheetTitle}>{picked.name}</Text>
                <Text style={styles.cardSub}>{t(picked.night ? "globe.thereNight" : "globe.thereDay", { time: new Date(now).toLocaleTimeString(undefined, { timeZone: picked.tz, hour: "numeric", minute: "2-digit" }) })}</Text>
              </View>
            </View>
            <View style={styles.sheetStat}>
              <Text style={styles.sheetN}>{short(picked.n)}</Text>
              <Text style={styles.cardSub}>{t(picked.night ? "globe.asleepThere" : "globe.nappingThere")}</Text>
            </View>
          </View>
        )}
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: 20 },
  title: { fontFamily: fonts.display, fontSize: 30, color: colors.cream },
  big: { fontFamily: fonts.display, fontSize: 36, color: colors.peach },
  sub: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.muted, marginTop: 2 },
  legend: { flexDirection: "row", justifyContent: "center", gap: 22, marginTop: 4 },
  key: { flexDirection: "row", alignItems: "center", gap: 6 },
  keyText: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.muted },
  card: { backgroundColor: colors.card, borderRadius: 24, paddingVertical: 14, paddingHorizontal: 16, marginTop: 14, gap: 3 },
  cardTitle: { fontFamily: fonts.display, fontSize: 17, color: colors.cream },
  cardSub: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.muted },
  note: { fontFamily: fonts.body, fontSize: 12, color: "#8f86bf", textAlign: "center", marginTop: 10 },
  privacy: { flexDirection: "row", gap: 6, justifyContent: "center", alignItems: "center", marginTop: 8 },
  privacyText: { fontFamily: fonts.bodyBold, fontSize: 12, color: "#8f86bf", flexShrink: 1, textAlign: "center" },
  sheetBack: { flex: 1, backgroundColor: "rgba(12,8,32,0.35)" },
  sheet: { backgroundColor: colors.card, borderTopLeftRadius: 30, borderTopRightRadius: 30, paddingHorizontal: 22, paddingTop: 12, gap: 16 },
  grab: { width: 44, height: 5, borderRadius: 3, backgroundColor: colors.card2, alignSelf: "center", marginBottom: 4 },
  sheetIcon: { width: 54, height: 54, borderRadius: 27, backgroundColor: colors.card2, alignItems: "center", justifyContent: "center" },
  sheetTitle: { fontFamily: fonts.display, fontSize: 21, color: colors.cream },
  sheetStat: { backgroundColor: colors.card2, borderRadius: 20, padding: 16, flexDirection: "row", alignItems: "baseline", gap: 10 },
  sheetN: { fontFamily: fonts.display, fontSize: 30, color: colors.peach },
});
