// Renders the app icons from one drawing: the sleepy crescent moon from the play button.
// Run with `npm run icons`.
const sharp = require("sharp");
const path = require("path");
const out = (f) => path.join(__dirname, "..", "assets", f);

const BG = "#221b45", MOON = "#ffd68c", INK = "#5b4320", CHEEK = "#ff9db0", Z = "#c9bfff";
// The moon is drawn on a 150 box (same as src/components/Moon.tsx) and scaled onto 1024.
// `scale` shrinks it into the adaptive-icon safe zone; `face` off for tiny monochrome uses.
const art = (scale, bg, { face = true, mono } = {}) => {
  const m = mono ?? MOON;
  return `
<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  ${bg ? `<rect width="1024" height="1024" fill="${bg}"/>` : ""}
  <g transform="translate(512 512) scale(${scale * 1024 / 150}) translate(-78 -75)">
    <path fill="${m}" d="M98 22a58 58 0 1 0 30 78A48 48 0 0 1 98 22z"/>
    ${face ? `
    <path d="M50 78q7 6 14 0" stroke="${INK}" stroke-width="4.5" fill="none" stroke-linecap="round"/>
    <path d="M78 86q7 6 14 0" stroke="${INK}" stroke-width="4.5" fill="none" stroke-linecap="round"/>
    <ellipse cx="48" cy="94" rx="7" ry="4.5" fill="${CHEEK}"/>
    <ellipse cx="96" cy="102" rx="7" ry="4.5" fill="${CHEEK}"/>
    <path d="M66 104q5 4 10 1" stroke="${INK}" stroke-width="4" fill="none" stroke-linecap="round"/>` : ""}
    <circle cx="122" cy="34" r="4.5" fill="${mono ?? Z}"/>
    <circle cx="134" cy="52" r="2.6" fill="${mono ?? Z}" opacity=".85"/>
  </g>
</svg>`;
};

(async () => {
  await sharp(Buffer.from(art(0.8, BG))).png().toFile(out("icon.png"));
  await sharp(Buffer.from(art(0.58, null))).png().toFile(out("android-icon-foreground.png"));
  await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024"><rect width="1024" height="1024" fill="${BG}"/></svg>`)).png().toFile(out("android-icon-background.png"));
  await sharp(Buffer.from(art(0.58, null, { face: false, mono: "#000" }))).png().toFile(out("android-icon-monochrome.png"));
  await sharp(Buffer.from(art(0.55, null))).png().toFile(out("splash-icon.png"));
  // Android notification icon: white silhouette on transparent.
  await sharp(Buffer.from(art(0.95, null, { face: false, mono: "#fff" }))).resize(96, 96).png().toFile(out("notification-icon.png"));
  await sharp(Buffer.from(art(0.85, BG))).resize(48, 48).png().toFile(out("favicon.png"));
  await sharp(Buffer.from(art(0.8, BG))).resize(512, 512).png().toFile(path.join(__dirname, "..", "store", "graphics", "icon-512.png"));
  console.log("icons written");
})();
