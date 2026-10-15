// Dynamic Expo config, same shape as abfall's.
module.exports = ({ config }) => ({
  ...config,
  name: "hush",
  slug: "hush",
  version: "1.0.2",
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
    // Hush only plays sound. Keep plugins from adding anything it doesn't use.
    blockedPermissions: [
      "android.permission.RECORD_AUDIO",
      "android.permission.SYSTEM_ALERT_WINDOW",
      "android.permission.READ_EXTERNAL_STORAGE",
      "android.permission.WRITE_EXTERNAL_STORAGE",
    ],
  },
  web: {
    favicon: "./assets/favicon.png",
  },
  plugins: [
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
      "expo-splash-screen",
      {
        image: "./assets/splash-icon.png",
        imageWidth: 160,
        backgroundColor: "#1b1727",
      },
    ],
  ],
});
