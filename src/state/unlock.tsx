// Baby monitor unlock: a 4-day free trial on the baby's phone, then a one-time
// purchase in Google Play or the App Store. Everything else is always free.
//
// The trial starts the first time this phone starts listening as the baby's
// phone. Copies not installed from a store (the GitHub APK, simulators) are always unlocked.
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { ActivityIndicator, AppState, Linking, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Notifications from "expo-notifications";
import { cryDetector } from "../../modules/hush-native/src";
import { colors, fonts } from "../theme";
import { useT } from "../i18n";
import { ICONS, Icon } from "../components/ui";

export const PRODUCT_ID = "hush_unlock";
export const TRIAL_DAYS = 4;
/**
 * Launch price: until this date the unlock screen shows the regular price struck through next to
 * the store's price (set the product to €2.99 in Play for the launch, then €4.99 after; regular
 * prices in other currencies are worked out from the store's price with the same ratio).
 */
export const LAUNCH_UNTIL = new Date(2027, 0, 31).getTime();
const REGULAR_EUR = 4.99, LAUNCH_EUR = 2.99;
const TRIAL_NOTE = "trial-ended";
const KEY = "hush:unlock";
const DAY = 86_400_000;

/** Only copies installed from Google Play or the App Store (incl. TestFlight) sell anything. */
const INSTALLER = cryDetector?.installer() ?? "";
export const IS_STORE_BUILD = Platform.OS === "android" ? INSTALLER === "com.android.vending" : Platform.OS === "ios" && (INSTALLER === "appstore" || INSTALLER === "testflight");

type Saved = { trialStartedAt: number | null; unlocked: boolean };
type Status = "unlocked" | "notStarted" | "trial" | "expired";

type UnlockCtx = {
  status: Status;
  /** Whole days left in the trial (1–3) while status is "trial". */
  daysLeft: number;
  price: string | null;
  /** The regular price while the launch price runs (shown struck through), else null. */
  regular: string | null;
  pending: boolean;
  /** Call before the baby's phone starts listening. Starts the trial if needed. False = blocked (paywall shown). */
  beforeListen: () => Promise<boolean>;
  showPaywall: () => void;
  restore: () => Promise<void>;
};

const Ctx = createContext<UnlockCtx | null>(null);
export const useUnlock = () => {
  const c = useContext(Ctx);
  if (!c) throw new Error("useUnlock outside UnlockProvider");
  return c;
};

// Loaded lazily so web and non-Play builds never touch the billing module.
type Iap = typeof import("expo-iap");
const loadIap = (): Iap | null => {
  if (!IS_STORE_BUILD) return null;
  try { return require("expo-iap") as Iap; } catch { return null; }
};

export function UnlockProvider({ children }: { children: ReactNode }) {
  const t = useT();
  const [saved, setSaved] = useState<Saved>({ trialStartedAt: null, unlocked: !IS_STORE_BUILD });
  const [price, setPrice] = useState<string | null>(null);
  // The regular price in the store's currency, shown struck through while the launch price runs.
  const [regular, setRegular] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [coding, setCoding] = useState(false);
  const [code, setCode] = useState("");
  const [now, setNow] = useState(Date.now());
  const iap = useRef<Iap | null>(null);

  const save = useCallback((next: Partial<Saved>) => {
    setSaved((s) => {
      const merged = { ...s, ...next };
      AsyncStorage.setItem(KEY, JSON.stringify(merged)).catch(() => {});
      return merged;
    });
  }, []);

  // Saved trial / unlock state.
  useEffect(() => {
    AsyncStorage.getItem(KEY).then((raw) => {
      if (!raw) return;
      try { const s = JSON.parse(raw) as Saved; setSaved((cur) => ({ trialStartedAt: s.trialStartedAt ?? null, unlocked: cur.unlocked || !!s.unlocked })); } catch {}
    }).catch(() => {});
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  // Google Play: price, existing purchases, and purchase updates.
  useEffect(() => {
    const lib = loadIap();
    if (!lib) return;
    iap.current = lib;
    let alive = true;
    const subs: { remove: () => void }[] = [];

    const accept = async (p: { productId: string; purchaseState: string }) => {
      if (p.productId !== PRODUCT_ID) return;
      if (p.purchaseState === "pending") { setPending(true); return; }
      if (p.purchaseState !== "purchased") return;
      try { await lib.finishTransaction({ purchase: p as never, isConsumable: false }); } catch {}
      setPending(false);
      save({ unlocked: true });
      setOpen(false);
      setBusy(false);
    };

    (async () => {
      try {
        await lib.initConnection();
        subs.push(lib.purchaseUpdatedListener((p) => { accept(p); }));
        subs.push(lib.purchaseErrorListener((e) => {
          setBusy(false);
          if (!lib.isUserCancelledError(e)) setError(t("unlock.error"));
        }));
        const owned = await lib.getAvailablePurchases();
        for (const p of owned ?? []) await accept(p);
        // Codes redeemed in the store arrive as purchases; check again whenever hush comes back.
        subs.push(AppState.addEventListener("change", async (st) => {
          if (st !== "active") return;
          try { for (const p of (await lib.getAvailablePurchases()) ?? []) await accept(p); } catch {}
        }));
        const products = await lib.fetchProducts({ skus: [PRODUCT_ID], type: "in-app" });
        const product = (products ?? []).find((p) => p.id === PRODUCT_ID);
        if (alive && product) {
          setPrice(product.displayPrice);
          const p = product as unknown as { price?: number; currency?: string };
          if (Date.now() < LAUNCH_UNTIL && typeof p.price === "number" && p.currency && p.price > 0) {
            // Same ratio as €2.99 → €4.99, ending in .99 where that's how prices look.
            const raw = p.price * (REGULAR_EUR / LAUNCH_EUR);
            const val = raw >= 10 ? Math.ceil(raw) - 0.01 : Math.ceil(raw * 10) / 10 - 0.01;
            try { setRegular(new Intl.NumberFormat(undefined, { style: "currency", currency: p.currency }).format(val)); } catch {}
          }
        }
      } catch {
        // Store not reachable (offline, or Play not on this phone): keep what we saved.
      }
    })();
    return () => { alive = false; subs.forEach((s) => s.remove()); lib.endConnection().catch(() => {}); };
  }, [save, t]);

  const status: Status = saved.unlocked
    ? "unlocked"
    : saved.trialStartedAt == null
      ? "notStarted"
      : now - saved.trialStartedAt < TRIAL_DAYS * DAY ? "trial" : "expired";
  const daysLeft = saved.trialStartedAt == null ? TRIAL_DAYS : Math.max(1, Math.ceil((saved.trialStartedAt + TRIAL_DAYS * DAY - now) / DAY));

  // One gentle reminder: the morning after the free trial ends (9:30), with one tap to the unlock
  // screen. Nothing before that, nothing after, and none once unlocked.
  useEffect(() => {
    if (Platform.OS === "web" || !IS_STORE_BUILD) return;
    if (status === "unlocked" || saved.trialStartedAt == null) { Notifications.cancelScheduledNotificationAsync(TRIAL_NOTE).catch(() => {}); return; }
    const end = new Date(saved.trialStartedAt + TRIAL_DAYS * DAY);
    const at = new Date(end.getFullYear(), end.getMonth(), end.getDate() + (end.getHours() >= 9 ? 1 : 0), 9, 30).getTime();
    if (at <= Date.now()) return;
    Notifications.scheduleNotificationAsync({
      identifier: TRIAL_NOTE,
      content: { title: "hush", body: price ? t("unlock.notif", { price }) : t("unlock.notifNoPrice"), data: { type: "unlock" } },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: new Date(at), channelId: "hush-info-2" },
    }).catch(() => {});
  }, [status, saved.trialStartedAt, price]); // eslint-disable-line react-hooks/exhaustive-deps

  const beforeListen = useCallback(async () => {
    if (status === "unlocked" || status === "trial") return true;
    if (status === "notStarted") { save({ trialStartedAt: Date.now() }); return true; }
    setError(null);
    setOpen(true);
    return false;
  }, [status, save]);

  const buy = useCallback(async () => {
    const lib = iap.current;
    if (!lib) return;
    setError(null);
    setBusy(true);
    try {
      await lib.requestPurchase({ request: { google: { skus: [PRODUCT_ID] }, apple: { sku: PRODUCT_ID } }, type: "in-app" });
    } catch {
      setBusy(false);
      setError(t("unlock.error"));
    }
  }, [t]);

  const restore = useCallback(async () => {
    const lib = iap.current;
    if (!lib) return;
    setError(null);
    setBusy(true);
    try {
      const owned = await lib.getAvailablePurchases();
      const mine = (owned ?? []).find((p) => p.productId === PRODUCT_ID && p.purchaseState === "purchased");
      if (mine) { save({ unlocked: true }); setOpen(false); } else setError(t("unlock.nothing"));
    } catch {
      setError(t("unlock.error"));
    }
    setBusy(false);
  }, [save, t]);

  // Play: type the code here (opens Play's redeem page). App Store: Apple's own code sheet (offer codes).
  const redeem = useCallback(async () => {
    if (Platform.OS !== "ios") { setCoding((c) => !c); return; }
    const lib = iap.current;
    if (!lib) return;
    try { await lib.openRedeemOfferCode(); } catch { setError(t("unlock.error")); }
  }, [t]);

  return (
    <Ctx.Provider value={{ status, daysLeft, price, regular, pending, beforeListen, showPaywall: () => { setError(null); setOpen(true); }, restore }}>
      {children}
      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)} />
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <View style={styles.badge}><Icon d={ICONS.monitor} size={30} color={colors.bg} width={2} /></View>
          <Text style={styles.title}>{status === "unlocked" ? t("unlock.thanks") : status === "expired" ? t("unlock.endedTitle") : t("unlock.title")}</Text>
          <Text style={styles.body}>{t("unlock.body", { days: TRIAL_DAYS })}</Text>
          <View style={styles.points}>
            {(["unlock.p1", "unlock.p2", "unlock.p3"] as const).map((k) => (
              <View key={k} style={styles.point}>
                <Icon d={ICONS.check} size={18} color={colors.sage} width={2.6} />
                <Text style={styles.pointText}>{t(k)}</Text>
              </View>
            ))}
          </View>
          {status !== "unlocked" && (
            <>
              {regular && price && (
                <View style={styles.launch}>
                  <Text style={styles.launchTag}>{t("unlock.launch")}</Text>
                  <Text style={styles.was}>{regular}</Text>
                  <Text style={styles.now}>{price}</Text>
                </View>
              )}
              <Pressable onPress={buy} disabled={busy || pending || !iap.current} style={({ pressed }) => [styles.buy, (pressed || busy) && { opacity: 0.7 }, !iap.current && { opacity: 0.4 }]} accessibilityRole="button">
                {busy ? <ActivityIndicator color={colors.bg} /> : (
                  <Text style={styles.buyText}>{pending ? t("unlock.pending") : price ? t("unlock.buy", { price }) : t("unlock.buyNoPrice")}</Text>
                )}
              </Pressable>
              <Text style={styles.small}>{t("unlock.once")}</Text>
              {error && <Text style={styles.error}>{error}</Text>}
              {coding ? (
                <View style={styles.codeRow}>
                  <TextInput
                    value={code}
                    onChangeText={(v) => setCode(v.toUpperCase().replace(/\s/g, ""))}
                    placeholder={t("unlock.codePlaceholder")}
                    placeholderTextColor={colors.muted}
                    autoCapitalize="characters"
                    autoCorrect={false}
                    style={styles.codeInput}
                    onSubmitEditing={() => code && Linking.openURL(`https://play.google.com/redeem?code=${encodeURIComponent(code)}`)}
                  />
                  <Pressable
                    onPress={() => code && Linking.openURL(`https://play.google.com/redeem?code=${encodeURIComponent(code)}`)}
                    disabled={!code}
                    style={[styles.codeBtn, !code && { opacity: 0.4 }]}
                  >
                    <Text style={styles.codeBtnText}>{t("unlock.redeem")}</Text>
                  </Pressable>
                </View>
              ) : null}
              <View style={styles.links}>
                <Pressable onPress={redeem} hitSlop={10}><Text style={styles.link}>{t("unlock.haveCode")}</Text></Pressable>
                <Pressable onPress={restore} disabled={busy} hitSlop={10}><Text style={styles.link}>{t("unlock.restore")}</Text></Pressable>
              </View>
              {coding && <Text style={styles.small}>{t("unlock.codeHint")}</Text>}
            </>
          )}
        </View>
      </Modal>
    </Ctx.Provider>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(14,10,36,0.6)" },
  sheet: { backgroundColor: colors.card, borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 24, paddingBottom: 36, paddingTop: 10, alignItems: "center", gap: 12 },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: "#4a3f86", marginBottom: 8 },
  badge: { width: 64, height: 64, borderRadius: 32, backgroundColor: colors.peach, alignItems: "center", justifyContent: "center" },
  title: { fontFamily: fonts.display, fontSize: 24, color: colors.cream, textAlign: "center" },
  body: { fontFamily: fonts.body, fontSize: 15, lineHeight: 22, color: colors.muted, textAlign: "center" },
  points: { alignSelf: "stretch", gap: 10, paddingVertical: 6 },
  point: { flexDirection: "row", alignItems: "center", gap: 10 },
  pointText: { flex: 1, fontFamily: fonts.bodyBold, fontSize: 15, color: colors.cream },
  buy: { alignSelf: "stretch", backgroundColor: colors.peach, borderRadius: 99, paddingVertical: 16, alignItems: "center", minHeight: 54, justifyContent: "center" },
  buyText: { fontFamily: fonts.bodyBold, fontSize: 17, color: colors.bg },
  small: { fontFamily: fonts.body, fontSize: 12.5, color: colors.muted, textAlign: "center" },
  error: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.rose, textAlign: "center" },
  links: { flexDirection: "row", gap: 24 },
  codeRow: { alignSelf: "stretch", flexDirection: "row", gap: 8 },
  codeInput: { flex: 1, backgroundColor: colors.bg, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, fontFamily: fonts.bodyBold, fontSize: 16, color: colors.cream, letterSpacing: 1 },
  codeBtn: { backgroundColor: colors.card2, borderRadius: 14, paddingHorizontal: 18, justifyContent: "center" },
  codeBtnText: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.peach },
  link: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.peach, paddingVertical: 4 },
  launch: { flexDirection: "row", alignItems: "center", gap: 10 },
  launchTag: { fontFamily: fonts.bodyBold, fontSize: 12.5, color: colors.bg, backgroundColor: colors.sage, borderRadius: 99, paddingHorizontal: 10, paddingVertical: 4, overflow: "hidden" },
  was: { fontFamily: fonts.bodyBold, fontSize: 16, color: colors.muted, textDecorationLine: "line-through" },
  now: { fontFamily: fonts.display, fontSize: 22, color: colors.cream },
});
