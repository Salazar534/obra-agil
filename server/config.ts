import { z } from "zod";

const optional = z
  .string()
  .trim()
  .transform((value) => value || null)
  .nullable()
  .default(null);

const schema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3001),
  APP_URL: z.url().default("http://localhost:5173"),
  PUBLIC_URL: optional,
  // Shared by app.obiagil.com.br and api.obiagil.com.br. Empty in local development.
  COOKIE_DOMAIN: optional,
  TRUST_PROXY: z.string().default("loopback"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  TWILIO_ACCOUNT_SID: optional,
  TWILIO_AUTH_TOKEN: optional,
  TWILIO_VERIFY_SERVICE_SID: optional,
  SMTP_URL: optional,
  MAIL_FROM: z.string().default("Obi Ágil <nao-responda@obraagil.com.br>"),
  MP_PUBLIC_KEY: optional,
  MP_ACCESS_TOKEN: optional,
  MP_CLIENT_ID: optional,
  MP_CLIENT_SECRET: optional,
  MP_REDIRECT_URL: optional,
  MP_WEBHOOK_SECRET: optional,
  PAYMENTS_DRIVER: z.enum(["mercadopago", "fake"]).default("mercadopago"),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error("Invalid environment:", z.prettifyError(parsed.error));
  process.exit(1);
}
const env = parsed.data;

if (env.PAYMENTS_DRIVER === "fake" && env.NODE_ENV !== "test") {
  console.error("PAYMENTS_DRIVER=fake is only allowed with NODE_ENV=test");
  process.exit(1);
}

export const config = {
  env: env.NODE_ENV,
  isProduction: env.NODE_ENV === "production",
  port: env.PORT,
  appUrl: env.APP_URL.replace(/\/$/, ""),
  publicUrl: env.PUBLIC_URL?.replace(/\/$/, "") ?? null,
  cookieDomain: env.COOKIE_DOMAIN ? (env.COOKIE_DOMAIN.startsWith(".") ? env.COOKIE_DOMAIN : `.${env.COOKIE_DOMAIN}`) : null,
  trustProxy: env.TRUST_PROXY,
  databaseUrl: env.DATABASE_URL,
  twilio:
    env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN && env.TWILIO_VERIFY_SERVICE_SID
      ? { accountSid: env.TWILIO_ACCOUNT_SID, authToken: env.TWILIO_AUTH_TOKEN, serviceSid: env.TWILIO_VERIFY_SERVICE_SID }
      : null,
  smtpUrl: env.SMTP_URL,
  mailFrom: env.MAIL_FROM,
  mercadoPago:
    env.MP_ACCESS_TOKEN && env.MP_PUBLIC_KEY
      ? { accessToken: env.MP_ACCESS_TOKEN, publicKey: env.MP_PUBLIC_KEY, webhookSecret: env.MP_WEBHOOK_SECRET }
      : null,
  /** OAuth so each store receives payments in its own Mercado Pago account. */
  mercadoPagoOAuth:
    env.MP_CLIENT_ID && env.MP_CLIENT_SECRET
      ? {
          clientId: env.MP_CLIENT_ID,
          clientSecret: env.MP_CLIENT_SECRET,
          redirectUrl: env.MP_REDIRECT_URL ?? `http://localhost:${env.PORT}/api/mercadopago/callback`,
        }
      : null,
  paymentsDriver: env.PAYMENTS_DRIVER,
  /** Platform fee charged to the customer on top of the rent. */
  serviceFeeRate: 0.05,
  sessionDays: 30,
};
