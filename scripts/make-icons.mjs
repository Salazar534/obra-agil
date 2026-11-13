import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const defs = `
  <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#E4F3FF"/><stop offset="1" stop-color="#9FD3F3"/>
  </linearGradient>
  <radialGradient id="glow" cx="0.5" cy="0.42" r="0.5">
    <stop offset="0" stop-color="#FFFFFF" stop-opacity="0.9"/><stop offset="1" stop-color="#FFFFFF" stop-opacity="0"/>
  </radialGradient>
  <linearGradient id="body" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#5EA0FF"/><stop offset="1" stop-color="#2F7BF6"/>
  </linearGradient>
  <linearGradient id="hat" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#FFDE59"/><stop offset="1" stop-color="#FFC400"/>
  </linearGradient>`;

const obi = `
  <rect x="66" y="182" width="30" height="20" rx="10" fill="#FF9500"/>
  <rect x="104" y="182" width="30" height="20" rx="10" fill="#FF9500"/>
  <path d="M100 50C142 50 164 86 164 128C164 168 138 194 100 194C62 194 36 168 36 128C36 86 58 50 100 50Z" fill="url(#body)"/>
  <ellipse cx="100" cy="160" rx="40" ry="29" fill="#EAF2FF"/>
  <rect x="33" y="118" width="26" height="46" rx="13" fill="#1C5FD4" transform="rotate(22 46 124)"/>
  <rect x="141" y="118" width="26" height="46" rx="13" fill="#1C5FD4" transform="rotate(-138 154 124)"/>
  <ellipse cx="80" cy="116" rx="16" ry="18" fill="#FFFFFF"/>
  <ellipse cx="120" cy="116" rx="16" ry="18" fill="#FFFFFF"/>
  <circle cx="83" cy="118" r="8.5" fill="#0E1726"/>
  <circle cx="117" cy="118" r="8.5" fill="#0E1726"/>
  <circle cx="86" cy="114" r="3" fill="#FFFFFF"/>
  <circle cx="120" cy="114" r="3" fill="#FFFFFF"/>
  <ellipse cx="62" cy="139" rx="9" ry="5.5" fill="#FF8BA7" opacity="0.65"/>
  <ellipse cx="138" cy="139" rx="9" ry="5.5" fill="#FF8BA7" opacity="0.65"/>
  <path d="M88 142 Q100 154 112 142" fill="none" stroke="#0E1726" stroke-width="4.5" stroke-linecap="round"/>
  <path d="M50 84C50 48 72 28 100 28C128 28 150 48 150 84Z" fill="url(#hat)"/>
  <rect x="93" y="28" width="14" height="56" rx="7" fill="#EBA300" opacity="0.4"/>
  <rect x="38" y="78" width="124" height="14" rx="7" fill="#EBA300"/>
  <ellipse cx="74" cy="50" rx="7" ry="12" fill="#FFFFFF" opacity="0.5" transform="rotate(-24 74 50)"/>`;

function placeObi(scale) {
  const centerY = 115 * scale;
  const tx = 512 - 100 * scale;
  const ty = 512 - centerY;
  return `<g transform="translate(${tx} ${ty}) scale(${scale})">${obi}</g>`;
}

function icon({ rounded = false, background = true, scale = 3.7 } = {}) {
  const radius = rounded ? 228 : 0;
  const backdrop = background
    ? `<rect width="1024" height="1024" rx="${radius}" fill="url(#bg)"/><circle cx="512" cy="470" r="430" fill="url(#glow)"/>`
    : "";
  const shadowY = 512 + 92 * scale;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
<defs>${defs}</defs>
${backdrop}
<ellipse cx="512" cy="${shadowY}" rx="${56 * scale}" ry="${7 * scale}" fill="#0E1726" opacity="0.12"/>
${placeObi(scale)}
</svg>`;
}

async function png(svg, size, file) {
  await mkdir(path.dirname(file), { recursive: true });
  await sharp(Buffer.from(svg)).resize(size, size).png().toFile(file);
  console.log(`${path.relative(process.cwd(), file)} ${size}px`);
}

const full = icon();
const maskable = icon({ scale: 2.7 });
const mascotOnly = icon({ background: false, scale: 2.7 });
const rounded = icon({ rounded: true });

await writeFile("public/favicon.svg", rounded);
await png(full, 180, "public/icons/apple-touch-icon.png");
await png(full, 192, "public/icons/icon-192.png");
await png(full, 512, "public/icons/icon-512.png");
await png(maskable, 512, "public/icons/maskable-512.png");

if (existsSync("mobile")) {
  await png(full, 1024, "mobile/assets/icon.png");
  await png(mascotOnly, 1024, "mobile/assets/adaptive-icon.png");
  await png(mascotOnly, 1024, "mobile/assets/splash-icon.png");
  await png(icon({ background: false, scale: 3.9 }), 512, "mobile/assets/obi.png");
  await png(rounded, 48, "mobile/assets/favicon.png");
}
