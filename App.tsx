import { useEffect, useState } from "react";
import { AccessibilityInfo, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import * as SplashScreen from "expo-splash-screen";
import { DarkTheme, NavigationContainer } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { useFonts, Fredoka_500Medium, Fredoka_600SemiBold } from "@expo-google-fonts/fredoka";
import { Nunito_600SemiBold, Nunito_700Bold } from "@expo-google-fonts/nunito";

import { colors } from "./src/theme";
import { loadSettings, type Settings } from "./src/storage";
import { SleepProvider, useSleep } from "./src/state/sleep";
import { LangProvider, applyLang, getLang, loadLangChoice, type Lang } from "./src/i18n";
import { OnboardingScreen } from "./src/screens/OnboardingScreen";
import { MonitorProvider } from "./src/state/monitor";
import { Sky } from "./src/components/Sky";
import { TabBar } from "./src/components/TabBar";
import { HomeScreen } from "./src/screens/HomeScreen";
import { SleepScreen } from "./src/screens/SleepScreen";
import { MonitorScreen } from "./src/screens/MonitorScreen";
import { SettingsScreen } from "./src/screens/SettingsScreen";
import { NightsScreen } from "./src/screens/NightsScreen";

SplashScreen.preventAutoHideAsync().catch(() => {});

const Tab = createBottomTabNavigator();
const theme = {
  ...DarkTheme,
  colors: { ...DarkTheme.colors, background: "transparent", card: colors.bg, primary: colors.peach, text: colors.cream },
};

export default function App() {
  const [fontsLoaded] = useFonts({ Fredoka_500Medium, Fredoka_600SemiBold, Nunito_600SemiBold, Nunito_700Bold });
  const [settings, setSettings] = useState<Settings | null>(null);
  const [still, setStill] = useState(false);
  const [choice, setChoice] = useState<Lang | "auto" | null>(null);
  const [lang, setLang] = useState<Lang>(getLang());

  useEffect(() => {
    loadSettings().then(setSettings);
    loadLangChoice().then((c) => { applyLang(c); setLang(getLang()); setChoice(c); });
    AccessibilityInfo.isReduceMotionEnabled().then(setStill).catch(() => {});
  }, []);

  const ready = fontsLoaded && settings != null && choice != null;
  const pickLang = (c: Lang | "auto") => { applyLang(c); setChoice(c); setLang(getLang()); };
  useEffect(() => {
    if (ready) SplashScreen.hideAsync().catch(() => {});
  }, [ready]);

  return (
    <SafeAreaProvider>
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <StatusBar style="light" />
        {ready && (
          <LangProvider lang={lang} choice={choice ?? "auto"} setChoice={pickLang}>
            <MonitorProvider>
              <SleepProvider initial={settings} still={still}>
                <Sky still={still} />
                <Shell />
              </SleepProvider>
            </MonitorProvider>
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
  return (
    <NavigationContainer theme={theme}>
      <Tab.Navigator
        tabBar={(props) => <TabBar {...props} />}
        screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: "transparent" }, animation: "fade" }}
      >
        <Tab.Screen name="Home" component={HomeScreen} />
        <Tab.Screen name="Sounds" component={SleepScreen} />
        <Tab.Screen name="Monitor" component={MonitorScreen} />
        <Tab.Screen name="Nights" component={NightsScreen} />
        <Tab.Screen name="Settings" component={SettingsScreen} />
      </Tab.Navigator>
    </NavigationContainer>
  );
}
