// Renders the app icons from one crescent drawing. Run with `npm run icons`.
const sharp = require("sharp");
const path = require("path");
const out = (f) => path.join(__dirname, "..", "assets", f);

const BG = "#1b1727", MOON = "#f6e2b0", STAR = "#f6c7b0";
// Crescent + two small stars, drawn on a 1024 canvas. `scale` shrinks it into the adaptive-icon safe zone.
const art = (scale, bg) => `
<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  ${bg ? `<rect width="1024" height="1024" fill="${bg}"/>` : ""}
  <g transform="translate(512 512) scale(${scale}) translate(-512 -512)">
    <path fill="${MOON}" d="M600 210a330 330 0 1 0 214 520A270 270 0 0 1 600 210z"/>
    <circle cx="760" cy="300" r="22" fill="${STAR}"/>
    <circle cx="830" cy="420" r="12" fill="${STAR}" opacity=".8"/>
  </g>
</svg>`;

(async () => {
  await sharp(Buffer.from(art(0.78, BG))).png().toFile(out("icon.png"));
  await sharp(Buffer.from(art(0.55, null))).png().toFile(out("android-icon-foreground.png"));
  await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024"><rect width="1024" height="1024" fill="${BG}"/></svg>`)).png().toFile(out("android-icon-background.png"));
  await sharp(Buffer.from(art(0.55, null).replaceAll(MOON, "#000").replaceAll(STAR, "#000"))).png().toFile(out("android-icon-monochrome.png"));
  await sharp(Buffer.from(art(0.5, null))).png().toFile(out("splash-icon.png"));
  await sharp(Buffer.from(art(0.8, BG))).resize(48, 48).png().toFile(out("favicon.png"));
  console.log("icons written");
})();
