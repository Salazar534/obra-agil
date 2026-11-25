import { config } from "../config.ts";
import { exec, one } from "../db/pool.ts";
import { badRequest, HttpError, tooMany, unavailable } from "../lib/errors.ts";
import { safeEqual, sha256, sixDigitCode } from "../lib/security.ts";
import { formatPhone } from "../lib/text.ts";

/** twilio: real SMS via Twilio Verify. console: development only, the code is printed in the API terminal. */
export const smsMode: "twilio" | "console" | "disabled" =
  config.env === "test" ? "console" : config.twilio ? "twilio" : config.isProduction ? "disabled" : "console";

const RESEND_SECONDS = 30;
const CODE_MINUTES = 10;
const MAX_ATTEMPTS = 5;
/** Brazilian Portuguese for every Verify channel: SMS, voice call, RCS, and WhatsApp. */
const VERIFY_LOCALE = "pt-BR";

async function twilio(path: "Verifications" | "VerificationCheck", form: Record<string, string>) {
  const { accountSid, authToken, serviceSid } = config.twilio!;
  const response = await fetch(`https://verify.twilio.com/v2/Services/${serviceSid}/${path}`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(form),
    signal: AbortSignal.timeout(15_000),
  });
  const data = (await response.json().catch(() => ({}))) as { status?: string; code?: number; message?: string };
  return { ok: response.ok, httpStatus: response.status, data };
}

export async function sendCode(phone: string, ip: string | null) {
  if (smsMode === "disabled") {
    throw unavailable("sms_unavailable", "Entrar com celular está indisponível agora. Use e-mail e senha.");
  }
  const recent = await one<{ last: Date | null; phone_hour: number; ip_hour: number }>(
    `select max(created_at) filter (where phone = $1) as last,
            count(*) filter (where phone = $1)::int as phone_hour,
            count(*) filter (where ip = $2)::int as ip_hour
       from sms_codes where created_at > now() - interval '1 hour'`,
    [phone, ip],
  );
  if (recent?.last && Date.now() - recent.last.getTime() < RESEND_SECONDS * 1000) {
    const wait = Math.ceil(RESEND_SECONDS - (Date.now() - recent.last.getTime()) / 1000);
    throw new HttpError(429, "resend_too_soon", `Espere ${wait} s para pedir outro código.`, { retryIn: wait });
  }
  if ((recent?.phone_hour ?? 0) >= 5 || (recent?.ip_hour ?? 0) >= 20) throw tooMany("Muitos códigos pedidos. Tente de novo em uma hora.");

  if (smsMode === "twilio") {
    const result = await twilio("Verifications", { To: `+55${phone}`, Channel: "sms", Locale: VERIFY_LOCALE });
    if (!result.ok) {
      console.error("[sms] Twilio error", result.httpStatus, result.data);
      if (result.httpStatus === 429 || result.data.code === 60203) throw tooMany("Muitos códigos para esse número. Tente mais tarde.");
      if (result.data.code === 60200 || result.data.code === 21211) throw badRequest("invalid_phone", "Esse número não recebe SMS. Confira o celular.");
      throw unavailable("sms_failed", "Não conseguimos enviar o SMS agora. Tente de novo em instantes.");
    }
    await exec("insert into sms_codes (phone, code_hash, ip, expires_at) values ($1, null, $2, now() + make_interval(mins => $3))", [
      phone,
      ip,
      CODE_MINUTES,
    ]);
  } else {
    const code = sixDigitCode();
    await exec("insert into sms_codes (phone, code_hash, ip, expires_at) values ($1, $2, $3, now() + make_interval(mins => $4))", [
      phone,
      sha256(`${phone}:${code}`),
      ip,
      CODE_MINUTES,
    ]);
    console.log(`\n[sms] Código para +55 ${formatPhone(phone)}: ${code}  (modo desenvolvimento, nenhum SMS foi enviado)\n`);
  }
  return { resendIn: RESEND_SECONDS };
}

/** Checks the latest code sent to the phone; throws when there is none or it is used up. */
export async function checkCode(phone: string, code: string) {
  const row = await one<{ id: string; code_hash: string | null; attempts: number }>(
    `select id, code_hash, attempts from sms_codes
      where phone = $1 and verified_at is null and expires_at > now()
      order by created_at desc limit 1`,
    [phone],
  );
  if (!row) throw badRequest("code_expired", "Esse código expirou. Peça um novo.");
  if (row.attempts >= MAX_ATTEMPTS) throw tooMany("Muitas tentativas com esse código. Peça um novo.");
  await exec("update sms_codes set attempts = attempts + 1 where id = $1", [row.id]);

  let valid: boolean;
  if (row.code_hash === null) {
    if (!config.twilio) throw badRequest("code_expired", "Esse código expirou. Peça um novo.");
    const result = await twilio("VerificationCheck", { To: `+55${phone}`, Code: code });
    if (result.httpStatus === 404) throw badRequest("code_expired", "Esse código expirou. Peça um novo.");
    if (!result.ok) {
      console.error("[sms] Twilio check error", result.httpStatus, result.data);
      throw unavailable("sms_failed", "Não conseguimos conferir o código agora. Tente de novo.");
    }
    valid = result.data.status === "approved";
  } else {
    valid = safeEqual(row.code_hash, sha256(`${phone}:${code}`));
  }
  if (!valid) throw badRequest("invalid_code", "Código incorreto. Confira o SMS e tente de novo.");
  await exec("update sms_codes set verified_at = now() where id = $1", [row.id]);
}
