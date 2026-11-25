import { randomBytes } from "node:crypto";
import { config } from "../config.ts";
import { exec, one } from "../db/pool.ts";
import { unavailable } from "../lib/errors.ts";
import type { BusinessRow } from "../models.ts";

type TokenResponse = {
  access_token: string;
  refresh_token: string;
  public_key?: string;
  user_id?: number | string;
  expires_in?: number;
};

function oauth() {
  if (!config.mercadoPagoOAuth) {
    throw unavailable(
      "oauth_unavailable",
      "A conexão das lojas ainda não está pronta. Falta o Client Secret do aplicativo no servidor.",
    );
  }
  return config.mercadoPagoOAuth;
}

export function authorizationUrl(state: string) {
  const { clientId, redirectUrl } = oauth();
  const url = new URL("https://auth.mercadopago.com.br/authorization");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("platform_id", "mp");
  url.searchParams.set("state", state);
  url.searchParams.set("redirect_uri", redirectUrl);
  return url.toString();
}

async function tokenRequest(body: Record<string, string>) {
  const response = await fetch("https://api.mercadopago.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(25_000),
  });
  const data = (await response.json().catch(() => null)) as TokenResponse | { message?: string } | null;
  if (!response.ok || !data || !("access_token" in data)) {
    throw unavailable("oauth_failed", "O Mercado Pago não autorizou a conexão da loja. Tente de novo.");
  }
  return data;
}

export async function beginConnect(businessId: string) {
  const state = randomBytes(24).toString("base64url");
  await exec("delete from mp_oauth_states where expires_at < now()");
  await exec("insert into mp_oauth_states (state, business_id, expires_at) values ($1, $2, now() + interval '15 minutes')", [state, businessId]);
  return authorizationUrl(state);
}

async function saveToken(businessId: string, token: TokenResponse) {
  const expiresAt = new Date(Date.now() + (token.expires_in ?? 15_552_000) * 1000);
  await exec(
    `update businesses
        set mp_user_id = $2, mp_access_token = $3, mp_refresh_token = $4, mp_public_key = $5, mp_expires_at = $6, updated_at = now()
      where id = $1`,
    [businessId, token.user_id ? String(token.user_id) : null, token.access_token, token.refresh_token, token.public_key ?? null, expiresAt],
  );
}

export async function finishConnect(code: string, state: string) {
  const { clientId, clientSecret, redirectUrl } = oauth();
  const pending = await one<{ business_id: string }>("delete from mp_oauth_states where state = $1 and expires_at > now() returning business_id", [state]);
  if (!pending) return null;
  const token = await tokenRequest({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUrl,
  });
  await saveToken(pending.business_id, token);
  return pending.business_id;
}

/** Renews a store token that expires within a week. Returns the token to charge with, or null when the store is not connected. */
export async function sellerAccessToken(business: Pick<BusinessRow, "id" | "mp_access_token" | "mp_refresh_token" | "mp_expires_at">) {
  if (!business.mp_access_token) return null;
  const expiring = business.mp_expires_at && business.mp_expires_at.getTime() < Date.now() + 7 * 86_400_000;
  if (!expiring || !business.mp_refresh_token || !config.mercadoPagoOAuth) return business.mp_access_token;
  try {
    const token = await tokenRequest({
      client_id: config.mercadoPagoOAuth.clientId,
      client_secret: config.mercadoPagoOAuth.clientSecret,
      grant_type: "refresh_token",
      refresh_token: business.mp_refresh_token,
    });
    await saveToken(business.id, token);
    return token.access_token;
  } catch (error) {
    console.error("[payments] could not refresh store token", business.id, error);
    return business.mp_access_token;
  }
}
