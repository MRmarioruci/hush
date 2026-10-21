import { useEffect, useState } from "react";
import { AccessibilityInfo, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import * as SplashScreen from "expo-splash-screen";
import { diag } from "./modules/hush-native/src";
import { DarkTheme, NavigationContainer, createNavigationContainerRef } from "@react-navigation/native";
import { QuickActionsHub } from "./src/actions";
import { DialogHost } from "./src/components/Dialog";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { useFonts, Fredoka_500Medium, Fredoka_600SemiBold } from "@expo-google-fonts/fredoka";
import { Quicksand_600SemiBold, Quicksand_700Bold } from "@expo-google-fonts/quicksand";

import { colors } from "./src/theme";
import { loadSettings, type Settings } from "./src/storage";
import { SleepProvider, useSleep } from "./src/state/sleep";
import { LangProvider, applyLang, getLang, loadLangChoice, type Lang } from "./src/i18n";
import { OnboardingScreen } from "./src/screens/OnboardingScreen";
import { MonitorProvider } from "./src/state/monitor";
import { UnlockProvider } from "./src/state/unlock";
import { NapsProvider } from "./src/state/naps";
import { Sky } from "./src/components/Sky";
import { TabBar } from "./src/components/TabBar";
import { HomeScreen } from "./src/screens/HomeScreen";
import { SleepScreen } from "./src/screens/SleepScreen";
import { MonitorScreen } from "./src/screens/MonitorScreen";
import { SettingsScreen } from "./src/screens/SettingsScreen";
import { GlobeScreen } from "./src/screens/GlobeScreen";
import { SwipeArea } from "./src/components/SwipeTabs";
import { NightsScreen } from "./src/screens/NightsScreen";

SplashScreen.preventAutoHideAsync().catch(() => {});

const Tab = createBottomTabNavigator();
const navRef = createNavigationContainerRef<Record<string, object | undefined>>();
const theme = {
  ...DarkTheme,
  colors: { ...DarkTheme.colors, background: "transparent", card: colors.bg, primary: colors.peach, text: colors.cream },
};

export default function App() {
  const [fontsLoaded] = useFonts({ Fredoka_500Medium, Fredoka_600SemiBold, Quicksand_600SemiBold, Quicksand_700Bold });
  const [settings, setSettings] = useState<Settings | null>(null);
  const [still, setStill] = useState(false);
  const [choice, setChoice] = useState<Lang | "auto" | null>(null);
  const [lang, setLang] = useState<Lang>(getLang());

  useEffect(() => {
    loadSettings().then(setSettings);
    loadLangChoice().then((c) => { applyLang(c); setLang(getLang()); setChoice(c); });
    AccessibilityInfo.isReduceMotionEnabled().then(setStill).catch(() => {});
  }, []);

  // Never wait on the splash screen for long: fonts fall back to the system font after 4 s.
  const [waited, setWaited] = useState(false);
  useEffect(() => { const id = setTimeout(() => setWaited(true), 4000); return () => clearTimeout(id); }, []);
  const ready = (fontsLoaded || waited) && settings != null && choice != null;
  const pickLang = (c: Lang | "auto") => { applyLang(c); setChoice(c); setLang(getLang()); };
  useEffect(() => { diag.mark("app mounted"); }, []);
  useEffect(() => {
    if (!ready) return;
    diag.mark(`ready${fontsLoaded ? "" : " (fonts timed out)"}`);
    SplashScreen.hideAsync().catch(() => {});
  }, [ready]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <SafeAreaProvider>
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <StatusBar style="light" />
        {ready && (
          <LangProvider lang={lang} choice={choice ?? "auto"} setChoice={pickLang}>
            <UnlockProvider>
              <MonitorProvider>
                <SleepProvider initial={settings} still={still}>
                  <NapsProvider>
                    <Sky still={still} />
                    <Shell />
                    <DialogHost />
                  </NapsProvider>
                </SleepProvider>
              </MonitorProvider>
            </UnlockProvider>
          </LangProvider>
        )}
      </View>
    </SafeAreaProvider>
  );
}

/** First-time setup until it's finished, then the tabs. */
function Shell() {
  const { s, set } = useSleep();
  if (!s.onboarded) return <OnboardingScreen onDone={() => set({ onboarded: true })} />;
  const f = s.features;
  return (
    <NavigationContainer theme={theme} ref={navRef}>
      <QuickActionsHub nav={navRef} />
      <Tab.Navigator
        tabBar={(props) => <TabBar {...props} />}
        screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: "transparent" }, animation: "shift" }}
        // Swipe left / right to move between tabs.
        screenLayout={({ children, route, navigation }) => <SwipeArea routeName={route.name} navigation={navigation as never}>{children}</SwipeArea>}
      >
        <Tab.Screen name="Home" component={HomeScreen} />
        {f.sounds && <Tab.Screen name="Sounds" component={SleepScreen} />}
        {f.monitor && <Tab.Screen name="Monitor" component={MonitorScreen} />}
        {(f.naps || f.monitor) && <Tab.Screen name="Nights" component={NightsScreen} />}
        <Tab.Screen name="Globe" component={GlobeScreen} />
        <Tab.Screen name="Settings" component={SettingsScreen} />
      </Tab.Navigator>
    </NavigationContainer>
  );
}
