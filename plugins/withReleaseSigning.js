// Signs release builds with the Play upload key when it is provided through
// environment variables (GitHub secrets in CI). Without them, release builds keep
// Expo's default debug signing, which is fine for sideloaded test APKs.
//
//   HUSH_UPLOAD_STORE_FILE      absolute path to the .jks keystore
//   HUSH_UPLOAD_STORE_PASSWORD  keystore password
//   HUSH_UPLOAD_KEY_ALIAS       key alias (hush)
//   HUSH_UPLOAD_KEY_PASSWORD    key password (defaults to the store password)
const { withAppBuildGradle } = require("expo/config-plugins");

const MARK = "// hush: upload signing";

module.exports = function withReleaseSigning(config) {
  return withAppBuildGradle(config, (cfg) => {
    let g = cfg.modResults.contents;
    if (g.includes(MARK)) return cfg;

    g = g.replace(
      /signingConfigs\s*\{/,
      `signingConfigs {
        ${MARK}
        if (System.getenv("HUSH_UPLOAD_STORE_FILE")) {
            upload {
                storeFile file(System.getenv("HUSH_UPLOAD_STORE_FILE"))
                storePassword System.getenv("HUSH_UPLOAD_STORE_PASSWORD")
                keyAlias System.getenv("HUSH_UPLOAD_KEY_ALIAS") ?: "hush"
                keyPassword System.getenv("HUSH_UPLOAD_KEY_PASSWORD") ?: System.getenv("HUSH_UPLOAD_STORE_PASSWORD")
            }
        }`
    );

    // Point the release build type at the upload key when it exists. Templates write
    // either `signingConfig signingConfigs.debug` or `signingConfig = signingConfigs.debug`.
    const release = /(release\s*\{[^}]*?)signingConfig\s*=?\s*signingConfigs\.debug/;
    if (!release.test(g)) {
      throw new Error("withReleaseSigning: couldn't find the release signingConfig in app/build.gradle");
    }
    g = g.replace(
      release,
      `$1signingConfig = System.getenv("HUSH_UPLOAD_STORE_FILE") ? signingConfigs.upload : signingConfigs.debug`
    );

    cfg.modResults.contents = g;
    return cfg;
  });
};
