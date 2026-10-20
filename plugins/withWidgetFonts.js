// The app's fonts for the home-screen widget's text: react-native-android-widget looks them up in
// android/app/src/main/assets/fonts by file name (fontFamily "Fredoka_600SemiBold").
// (Its own "fonts" option writes to android/android/…, so they're copied here instead.)
const { withDangerousMod } = require("expo/config-plugins");
const fs = require("fs");
const path = require("path");

const FONTS = [
  "node_modules/@expo-google-fonts/fredoka/600SemiBold/Fredoka_600SemiBold.ttf",
  "node_modules/@expo-google-fonts/quicksand/700Bold/Quicksand_700Bold.ttf",
];

module.exports = (config) =>
  withDangerousMod(config, ["android", (cfg) => {
    const dir = path.join(cfg.modRequest.platformProjectRoot, "app/src/main/assets/fonts");
    fs.mkdirSync(dir, { recursive: true });
    for (const f of FONTS) fs.copyFileSync(path.join(cfg.modRequest.projectRoot, f), path.join(dir, path.basename(f)));
    return cfg;
  }]);
