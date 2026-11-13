import { z } from "zod";
import { createApp } from "./app.ts";
import { config } from "./config.ts";
import { migrate } from "./db/migrate.ts";
import { pool } from "./db/pool.ts";
import { mailMode } from "./services/mail.ts";
import { sweep } from "./services/orders.ts";
import { gateway } from "./services/payments.ts";
import { smsMode } from "./services/sms.ts";

z.config(z.locales.pt());

await migrate();

const host = process.env.HOST ?? (config.isProduction ? "0.0.0.0" : "127.0.0.1");
const server = createApp().listen(config.port, host, () => {
  console.log(`[api] listening on http://${host}:${config.port}  (docs: /api/docs)`);
  console.log(`[api] sms: ${smsMode} · email: ${mailMode} · payments: ${gateway.enabled ? config.paymentsDriver : "not configured (set MP_PUBLIC_KEY and MP_ACCESS_TOKEN)"}`);
});

let sweeping = false;
const timer = setInterval(async () => {
  if (sweeping) return;
  sweeping = true;
  try {
    await sweep();
  } catch (error) {
    console.error("[payments] sweep error", error);
  } finally {
    sweeping = false;
  }
}, 30_000);

function shutdown() {
  clearInterval(timer);
  server.close(() => void pool.end().finally(() => process.exit(0)));
  setTimeout(() => process.exit(0), 3_000).unref();
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
