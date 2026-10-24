// Dynamic Expo config, same shape as abfall's.
const fs = require("fs");

// Push alerts for the baby monitor. google-services.json comes from the Firebase
// project; the Expo project ID and owner come from expo.dev.
const EXPO_PROJECT_ID = process.env.EXPO_PROJECT_ID || "3ff0084b-2451-476b-8b98-37acf2c1a20b";
const EXPO_OWNER = process.env.EXPO_OWNER || undefined;
const hasFirebase = fs.existsSync("./google-services.json");
// Firebase Storage bucket for "listen in" clips (same Firebase project as push).
const STORAGE_BUCKET = process.env.HUSH_STORAGE_BUCKET
  || (hasFirebase ? JSON.parse(fs.readFileSync("./google-services.json", "utf8")).project_info?.storage_bucket : undefined);
// The family's shared room (Firestore, src/cloud.ts): the same Firebase project, read from google-services.json.
const FIREBASE = (() => {
  if (!hasFirebase) return undefined;
  const g = JSON.parse(fs.readFileSync("./google-services.json", "utf8"));
  const c = g.client?.[0];
  const apiKey = c?.api_key?.[0]?.current_key;
  return apiKey ? { apiKey, projectId: g.project_info.project_id, appId: c.client_info.mobilesdk_app_id, storageBucket: g.project_info.storage_bucket } : undefined;
})();

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
  backgroundColor: "#221b45",
  scheme: "hush",
  ios: {
    // iPhone only: an iPad isn't a baby monitor, and it saves the iPad screenshots in App Store Connect.
    supportsTablet: false,
    bundleIdentifier: "com.mrmarioruci.hush",
    buildNumber: String(VERSION_CODE),
    infoPlist: {
      // White noise and listening keep going with the screen locked; silent pushes carry sync and remote control.
      UIBackgroundModes: ["audio", "remote-notification"],
      ITSAppUsesNonExemptEncryption: false,
    },
    entitlements: {
      // Crying alerts break through Focus. (Critical alerts need Apple's approval first: see store/APP_STORE.md.)
      "com.apple.developer.usernotifications.time-sensitive": true,
    },
  },
  android: {
    adaptiveIcon: {
      backgroundColor: "#221b45",
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
    storageBucket: STORAGE_BUCKET,
    firebase: FIREBASE,
  },
  web: {
    favicon: "./assets/favicon.png",
  },
  plugins: [
    "./plugins/withReleaseSigning",
    "./plugins/withMediaIcon",
    "./plugins/withWidgetFonts",
    // Google Play Billing / StoreKit for the one-time baby monitor unlock (src/state/unlock.tsx).
    "expo-iap",
    "expo-font",
    [
      // Long-press shortcuts on the app icon (set at runtime in src/actions.tsx).
      "expo-quick-actions",
      {
        androidIcons: {
          qa_listen: "./assets/qa/listen.png",
          qa_noise: "./assets/qa/noise.png",
          qa_sleep: "./assets/qa/sleep.png",
          qa_monitor: "./assets/qa/monitor.png",
        },
      },
    ],
    [
      // Home-screen widget (src/widget): the baby's status and quick buttons.
      "react-native-android-widget",
      {
        widgets: [
          {
            name: "Hush",
            label: "hush",
            description: "Your baby's status, listen in, white noise and sleep",
            minWidth: "250dp",
            minHeight: "110dp",
            targetCellWidth: 4,
            targetCellHeight: 2,
            resizeMode: "horizontal|vertical",
            updatePeriodMillis: 1800000,
            previewImage: "./assets/widget-preview.png",
          },
          {
            name: "HushSmall",
            label: "hush (small)",
            description: "Your baby's status and one button",
            minWidth: "110dp",
            minHeight: "110dp",
            targetCellWidth: 2,
            targetCellHeight: 2,
            resizeMode: "horizontal|vertical",
            updatePeriodMillis: 1800000,
            previewImage: "./assets/widget-preview-small.png",
          },
        ],

      },
    ],
    "expo-status-bar",
    [
      "expo-audio",
      {
        // iOS text for the mic prompt (Android declares the mic in modules/hush-native).
        microphonePermission: "hush listens for your baby crying on this phone, and can turn the white noise up when your baby cries. Sound is checked on the phone and never recorded or sent anywhere.",
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
        color: "#ffd68c",
        // Crying-alert chime (Android res/raw, iOS app bundle).
        sounds: ["./assets/alert.wav"],
        // iOS: silent pushes (sync, remote control) reach the app; release builds use production APNs.
        enableBackgroundRemoteNotifications: true,
        mode: process.env.APNS_MODE || "production",
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
        backgroundColor: "#221b45",
      },
    ],
  ],
});
