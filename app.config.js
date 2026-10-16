// Dynamic Expo config, same shape as abfall's.
const fs = require("fs");

// Push alerts for the baby monitor. google-services.json comes from the Firebase
// project; the Expo project ID and owner come from expo.dev.
const EXPO_PROJECT_ID = process.env.EXPO_PROJECT_ID || "3ff0084b-2451-476b-8b98-37acf2c1a20b";
const EXPO_OWNER = process.env.EXPO_OWNER || undefined;
const hasFirebase = fs.existsSync("./google-services.json");

// Play needs a higher versionCode for every upload: 1.5.0 -> 10500, 1.5.1 -> 10501.
const VERSION = require("./package.json").version;
const [MA, MI, PA] = VERSION.split(".").map(Number);
const VERSION_CODE = MA * 10000 + MI * 100 + PA;

module.exports = ({ config }) => ({
  ...config,
  name: "hush",
  slug: "hush",
  version: VERSION,
  orientation: "portrait",
  icon: "./assets/icon.png",
  userInterfaceStyle: "dark",
  backgroundColor: "#1b1727",
  scheme: "hush",
  ios: {
    supportsTablet: true,
    bundleIdentifier: "com.mrmarioruci.hush",
  },
  android: {
    adaptiveIcon: {
      backgroundColor: "#1b1727",
      foregroundImage: "./assets/android-icon-foreground.png",
      backgroundImage: "./assets/android-icon-background.png",
      monochromeImage: "./assets/android-icon-monochrome.png",
    },
    predictiveBackGestureEnabled: false,
    package: "com.mrmarioruci.hush",
    versionCode: VERSION_CODE,
    ...(hasFirebase ? { googleServicesFile: "./google-services.json" } : {}),
    // Keep plugins from adding permissions hush doesn't use. (The mic is used by the
    // baby monitor and declared by modules/hush-native.)
    blockedPermissions: [
      "android.permission.SYSTEM_ALERT_WINDOW",
      "android.permission.READ_EXTERNAL_STORAGE",
      "android.permission.WRITE_EXTERNAL_STORAGE",
    ],
  },
  owner: EXPO_OWNER,
  extra: {
    ...(config.extra || {}),
    eas: EXPO_PROJECT_ID ? { projectId: EXPO_PROJECT_ID } : undefined,
  },
  web: {
    favicon: "./assets/favicon.png",
  },
  plugins: [
    "./plugins/withReleaseSigning",
    // Google Play Billing for the one-time baby monitor unlock (src/state/unlock.tsx).
    "expo-iap",
    "expo-font",
    "expo-status-bar",
    [
      "expo-audio",
      {
        microphonePermission: false,
        recordAudioAndroid: false,
        enableBackgroundPlayback: true,
      },
    ],
    [
      // Smaller APK: strip unused code and build only for 64-bit ARM phones.
      // Resource shrinking stays off so the bundled sounds are never dropped
      // (every Android phone from the last several years).
      "expo-build-properties",
      {
        android: {
          enableMinifyInReleaseBuilds: true,
          buildArchs: ["arm64-v8a"],
        },
      },
    ],
    [
      "expo-notifications",
      {
        icon: "./assets/notification-icon.png",
        color: "#f6c7b0",
        // Crying-alert chime (res/raw/alert.wav).
        sounds: ["./assets/alert.wav"],
      },
    ],
    [
      "expo-camera",
      {
        cameraPermission: "hush uses the camera to scan the pairing code shown on the baby's phone.",
        microphonePermission: false,
        recordAudioAndroid: false,
        barcodeScannerEnabled: true,
      },
    ],
    [
      "expo-splash-screen",
      {
        image: "./assets/splash-icon.png",
        imageWidth: 160,
        backgroundColor: "#1b1727",
      },
    ],
  ],
});
