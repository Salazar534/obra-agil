import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { qrcode } from "vite-plugin-qrcode";

const api = { target: process.env.API_URL ?? "http://127.0.0.1:3001", xfwd: true };

export default defineConfig({
  plugins: [react(), tailwindcss(), qrcode({ filter: (url) => /\/\/(192\.168|10)\./.test(url) })],
  server: {
    host: true,
    port: 5173,
    strictPort: true,
    allowedHosts: [".trycloudflare.com"],
    proxy: { "/api": api, "/uploads": api },
    watch: { ignored: ["**/.postgres/**", "**/server/**", "**/mobile/**"] },
  },
});
