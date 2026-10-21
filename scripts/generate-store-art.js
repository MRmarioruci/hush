// Renders the Play Store graphics into store/. Run with `npm run store-art`.
// The app's own fonts come from node_modules through a private fontconfig file,
// so nothing has to be installed on the machine.
const fs = require("fs");
const os = require("os");
const path = require("path");

const fontDirs = ["fredoka/600SemiBold", "nunito/700Bold"].map((d) =>
  path.join(__dirname, "..", "node_modules", "@expo-google-fonts", d)
);
const fcFile = path.join(os.tmpdir(), "hush-store-fonts.conf");
fs.writeFileSync(
  fcFile,
  `<?xml version="1.0"?><!DOCTYPE fontconfig SYSTEM "fonts.dtd"><fontconfig>${fontDirs
    .map((d) => `<dir>${d}</dir>`)
    .join("")}<cachedir>${path.join(os.tmpdir(), "hush-fc-cache")}</cachedir></fontconfig>`
);
process.env.FONTCONFIG_FILE = fcFile; // must be set before sharp loads

const sharp = require("sharp");
const out = (f) => path.join(__dirname, "..", "store", f);
fs.mkdirSync(path.join(__dirname, "..", "store"), { recursive: true });

const BG = "#1b1727", MOON = "#f6e2b0", STAR = "#f6c7b0", CREAM = "#f5eee3", MUTED = "#a49bb6";
const crescent = `
  <path fill="${MOON}" d="M600 210a330 330 0 1 0 214 520A270 270 0 0 1 600 210z"/>
  <circle cx="760" cy="300" r="22" fill="${STAR}"/>
  <circle cx="830" cy="420" r="12" fill="${STAR}" opacity=".8"/>`;

// A few faint stars, placed by hand so every run draws the same picture.
const stars = [[90, 70, 2], [210, 410, 1.5], [470, 60, 1.8], [560, 450, 1.4], [930, 80, 2.2], [980, 300, 1.6], [700, 40, 1.2], [40, 300, 1.4]]
  .map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${CREAM}" opacity=".45"/>`)
  .join("");

const feature = `
<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="500" viewBox="0 0 1024 500">
  <defs>
    <radialGradient id="glow" cx="0.27" cy="0.5" r="0.45">
      <stop offset="0" stop-color="${MOON}" stop-opacity=".16"/>
      <stop offset="1" stop-color="${MOON}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="1024" height="500" fill="${BG}"/>
  <rect width="1024" height="500" fill="url(#glow)"/>
  ${stars}
  <g transform="translate(275 250) scale(0.42) translate(-512 -512)">${crescent}</g>
  <text x="500" y="235" font-family="Fredoka" font-weight="600" font-size="112" fill="${MOON}">hush</text>
  <text x="504" y="295" font-family="Nunito" font-weight="700" font-size="30" fill="${CREAM}">Calm white noise for babies</text>
  <text x="504" y="340" font-family="Nunito" font-weight="700" font-size="24" fill="${MUTED}">With a volume limit for the crib</text>
</svg>`;

const icon = `
<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <rect width="1024" height="1024" fill="${BG}"/>
  <g transform="translate(512 512) scale(0.78) translate(-512 -512)">${crescent}</g>
</svg>`;

(async () => {
  await sharp(Buffer.from(feature)).png().toFile(out("feature-graphic.png"));
  await sharp(Buffer.from(icon)).resize(512, 512).png().toFile(out("icon-512.png"));
  console.log("store art written");
})();
