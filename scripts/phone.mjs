// Opens public HTTPS tunnels (Cloudflare quick tunnels) to the web app and to Expo, starts Expo through them
// and prints a QR code for each, so a phone on any network (Wi-Fi or 4G) can open the app.
// Needs `npm run dev` running and cloudflared installed (Windows: winget install Cloudflare.cloudflared).
// Usage: npm run phone   (Ctrl+C closes the tunnels and Expo)
import { spawn, spawnSync } from "node:child_process";
import { join, resolve } from "node:path";
import QRCode from "qrcode";

const root = resolve(import.meta.dirname, "..");
const cloudflared = process.env.CLOUDFLARED ?? "cloudflared";
const children = [];

function kill(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  if (process.platform === "win32") spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
  else child.kill();
}

function stopAll() {
  for (const child of children) kill(child);
}

process.on("SIGINT", () => process.exit(0));
process.on("exit", stopAll);

function tunnel(port) {
  return new Promise((done, fail) => {
    const child = spawn(cloudflared, ["tunnel", "--no-autoupdate", "--url", `http://localhost:${port}`], { stdio: ["ignore", "pipe", "pipe"] });
    children.push(child);
    let log = "";
    const read = (chunk) => {
      log += chunk;
      const url = log.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/)?.[0];
      if (url) done(url);
    };
    child.stdout.on("data", read);
    child.stderr.on("data", read);
    child.on("error", () => fail(new Error("cloudflared não foi encontrado. Instale com: winget install Cloudflare.cloudflared")));
    child.on("exit", (code) => fail(new Error(`cloudflared parou (código ${code}).\n${log.slice(-600)}`)));
    setTimeout(() => fail(new Error("O túnel não abriu em 60 segundos. Confira a internet.")), 60_000);
  });
}

async function printQr(title, url) {
  const qr = await QRCode.toString(url, { type: "terminal", small: true });
  console.log(`\n  ${title}\n  ${url}\n\n${qr.replace(/^/gm, "  ")}`);
}

try {
  await fetch("http://localhost:5173/", { signal: AbortSignal.timeout(3000) });
} catch {
  console.error("O app não está rodando em http://localhost:5173. Abra outro terminal e rode `npm run dev` primeiro.");
  process.exit(1);
}

console.log("Abrindo os túneis...");
const [web, metro] = await Promise.all([tunnel(5173), tunnel(8081)]).catch((error) => {
  console.error(error.message);
  process.exit(1);
});

const expo = spawn("npx", ["expo", "start", "--clear"], {
  cwd: join(root, "mobile"),
  shell: true,
  stdio: ["ignore", "pipe", "pipe"],
  env: { ...process.env, CI: "1", EXPO_PACKAGER_PROXY_URL: metro, EXPO_PUBLIC_WEB_URL: web },
});
children.push(expo);
expo.stdout.pipe(process.stdout);
expo.stderr.pipe(process.stderr);
expo.on("exit", (code) => process.exit(code ?? 0));

await printQr("App no navegador do celular (Safari ou Chrome)", web);
await printQr("Expo Go (no app Expo Go: Scan QR code, ou a câmera do iPhone)", `exp://${new URL(metro).host}:443`);
console.log("  Os links mudam cada vez que você roda este comando. Ctrl+C fecha tudo.\n");
