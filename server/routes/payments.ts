import { createHmac } from "node:crypto";
import type { Request } from "express";
import { z } from "zod";
import { config } from "../config.ts";
import { exec, many, one, tx } from "../db/pool.ts";
import { badRequest, HttpError, notFound, unavailable } from "../lib/errors.ts";
import { route } from "../lib/route.ts";
import { safeEqual } from "../lib/security.ts";
import { IdParams, PaymentMethod, serializePaymentMethod, type BusinessRow, type PaymentMethodRow, type UserRow } from "../models.ts";
import { sellerAccessToken } from "../services/mercadopago-oauth.ts";
import { applyPayment } from "../services/orders.ts";
import { fakeGateway, gateway, GatewayError } from "../services/payments.ts";

const List = { description: "Cartões salvos, o padrão primeiro", schema: z.array(PaymentMethod) };

async function listCards(userId: string) {
  const rows = await many<PaymentMethodRow>("select * from payment_methods where user_id = $1 order by is_default desc, created_at desc", [userId]);
  return rows.map(serializePaymentMethod);
}

function requireGateway() {
  if (!gateway.enabled) throw unavailable("payments_unavailable", "Os pagamentos ainda não foram configurados. Tente mais tarde.");
}

/** Mercado Pago signs `id:{data.id};request-id:{x-request-id};ts:{ts};` with the webhook secret. */
function validSignature(req: Request, dataId: string, secret: string) {
  const parts = Object.fromEntries(
    (req.get("x-signature") ?? "").split(",").map((part) => {
      const [key, ...value] = part.split("=");
      return [key.trim(), value.join("=").trim()];
    }),
  );
  if (!parts.ts || !parts.v1) return false;
  const requestId = req.get("x-request-id");
  const id = /^[a-z0-9]+$/i.test(dataId) ? dataId.toLowerCase() : dataId;
  const manifest = `${id ? `id:${id};` : ""}${requestId ? `request-id:${requestId};` : ""}ts:${parts.ts};`;
  return safeEqual(createHmac("sha256", secret).update(manifest).digest("hex"), parts.v1);
}

export const paymentRoutes = [
  route({
    method: "get",
    path: "/payment-methods",
    tag: "Payments",
    summary: "Cartões salvos",
    auth: "customer",
    responses: { 200: List },
    handler: ({ user }) => listCards(user.id),
  }),

  route({
    method: "post",
    path: "/payment-methods",
    tag: "Payments",
    summary: "Salvar cartão",
    description:
      "Recebe o token criado pelo MercadoPago.js (campos seguros) e guarda o cartão no cliente do Mercado Pago. " +
      "O número completo e o código de segurança nunca passam pelo nosso servidor.",
    auth: "customer",
    body: z.object({ token: z.string().min(8).max(200) }),
    responses: { 201: List },
    handler: async ({ body, user }) => {
      requireGateway();
      const me = (await one<UserRow>("select * from users where id = $1", [user.id]))!;
      if (!me.email) throw badRequest("email_required", "Adicione um e-mail no perfil para salvar cartões.");
      try {
        let customerId = me.mp_customer_id;
        if (!customerId) {
          customerId = await gateway.ensureCustomer(me.email, me.name);
          await exec("update users set mp_customer_id = $2 where id = $1", [user.id, customerId]);
        }
        const card = await gateway.saveCard(customerId, body.token);
        await tx(async (db) => {
          const count = await one<{ n: number }>("select count(*)::int as n from payment_methods where user_id = $1", [user.id], db);
          await exec(
            `insert into payment_methods (user_id, mp_card_id, payment_method_id, brand, issuer_id, first_six, last_four, exp_month, exp_year, holder, is_default)
             values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
             on conflict (user_id, mp_card_id) do update
               set exp_month = excluded.exp_month, exp_year = excluded.exp_year, holder = excluded.holder`,
            [
              user.id,
              card.cardId,
              card.paymentMethodId,
              card.brand,
              card.issuerId,
              card.firstSix,
              card.lastFour,
              card.expMonth,
              card.expYear,
              card.holder,
              (count?.n ?? 0) === 0,
            ],
            db,
          );
        });
      } catch (error) {
        if (error instanceof GatewayError) {
          console.error("[payments] save card failed", error.status, JSON.stringify(error.body));
          throw error.status >= 500
            ? new HttpError(502, "payment_failed", "Não conseguimos falar com o Mercado Pago. Tente de novo.")
            : new HttpError(422, "card_invalid", "Não foi possível salvar esse cartão. Confira os dados e tente de novo.");
        }
        throw error;
      }
      return listCards(user.id);
    },
  }),

  route({
    method: "patch",
    path: "/payment-methods/:id",
    tag: "Payments",
    summary: "Tornar cartão padrão",
    auth: "customer",
    params: IdParams,
    body: z.object({ isDefault: z.literal(true) }),
    responses: { 200: List },
    handler: async ({ params, user }) => {
      const updated = await tx(async (db) => {
        const found = await one("select 1 from payment_methods where id = $1 and user_id = $2", [params.id, user.id], db);
        if (!found) return false;
        await exec("update payment_methods set is_default = (id = $2) where user_id = $1", [user.id, params.id], db);
        return true;
      });
      if (!updated) throw notFound("Cartão não encontrado.");
      return listCards(user.id);
    },
  }),

  route({
    method: "delete",
    path: "/payment-methods/:id",
    tag: "Payments",
    summary: "Remover cartão",
    description: "Apaga o cartão também do Mercado Pago.",
    auth: "customer",
    params: IdParams,
    responses: { 200: List },
    handler: async ({ params, user }) => {
      const card = await one<PaymentMethodRow & { mp_customer_id: string | null }>(
        "select p.*, u.mp_customer_id from payment_methods p join users u on u.id = p.user_id where p.id = $1 and p.user_id = $2",
        [params.id, user.id],
      );
      if (!card) throw notFound("Cartão não encontrado.");
      if (card.mp_customer_id && gateway.enabled) {
        await gateway.deleteCard(card.mp_customer_id, card.mp_card_id).catch((error) => {
          if (!(error instanceof GatewayError && error.status === 404)) console.error("[payments] delete card failed", error);
        });
      }
      await tx(async (db) => {
        await exec("delete from payment_methods where id = $1", [params.id], db);
        if (card.is_default) {
          await exec(
            "update payment_methods set is_default = true where id = (select id from payment_methods where user_id = $1 order by created_at desc limit 1)",
            [user.id],
            db,
          );
        }
      });
      return listCards(user.id);
    },
  }),

  route({
    method: "get",
    path: "/payments/installments",
    tag: "Payments",
    summary: "Opções de parcelamento",
    description: "Parcelas de crédito (1x a 12x) ou débito à vista, pelo BIN do cartão.",
    auth: "customer",
    query: z.object({
      amount: z.coerce.number().min(1).max(1_000_000).describe("Valor total em reais."),
      bin: z.string().regex(/^\d{6,8}$/, "Use os primeiros dígitos do cartão.").describe("6 a 8 primeiros dígitos do cartão."),
      type: z.enum(["credit", "debit"]).optional().describe("credit (padrão) ou debit."),
    }),
    responses: {
      200: {
        description: "Bandeira, banco e parcelas",
        schema: z
          .object({
            paymentMethodId: z.string(),
            brand: z.string(),
            paymentTypeId: z.string(),
            issuerId: z.string().nullable(),
            issuerName: z.string().nullable(),
            options: z.array(
              z.object({
                installments: z.number().int(),
                installmentAmount: z.number(),
                totalAmount: z.number(),
                rate: z.number().describe("Juros em %; 0 = sem juros."),
                label: z.string().describe("Ex.: 3x de R$ 41,30 sem juros"),
              }),
            ),
          })
          .meta({ id: "Installments" }),
      },
    },
    handler: async ({ query }) => {
      requireGateway();
      try {
        return await gateway.installments(query.amount, query.bin, query.type === "debit" ? "debit_card" : "credit_card");
      } catch (error) {
        if (error instanceof GatewayError) {
          console.error("[payments] installments failed", error.status, JSON.stringify(error.body));
          throw new HttpError(error.status >= 500 ? 502 : 422, "installments_failed", "Não conseguimos ver as parcelas desse cartão. Confira o número.");
        }
        throw error;
      }
    },
  }),

  route({
    method: "post",
    path: "/webhooks/mercadopago",
    tag: "Webhooks",
    summary: "Notificação do Mercado Pago",
    description:
      "Configure no painel do Mercado Pago como PUBLIC_URL/api/webhooks/mercadopago (tópico Pagamentos). Com MP_WEBHOOK_SECRET, a assinatura x-signature é conferida. " +
      "O status sempre é lido de novo na API do Mercado Pago, então o corpo da notificação não altera nada sozinho.",
    auth: "none",
    responses: { 200: { description: "Recebido" }, 401: { description: "Assinatura inválida" } },
    handler: async ({ req }) => {
      const body = (req.body ?? {}) as { type?: string; action?: string; data?: { id?: string | number } };
      const type = String(req.query.type ?? req.query.topic ?? body.type ?? "");
      const dataId = String(req.query["data.id"] ?? body.data?.id ?? req.query.id ?? "");
      const secret = config.mercadoPago?.webhookSecret;
      if (secret && !validSignature(req, dataId, secret)) throw new HttpError(401, "invalid_signature", "Assinatura inválida.");
      await exec("insert into webhook_events (provider, topic, resource_id, payload) values ('mercadopago', $1, $2, $3)", [
        type,
        dataId || null,
        JSON.stringify(body),
      ]);
      if (type === "payment" && /^\d+$/.test(dataId) && gateway.enabled) {
        try {
          const business = await one<BusinessRow>("select b.* from orders o join businesses b on b.id = o.business_id where o.mp_payment_id = $1", [dataId]);
          const sellerToken = business && config.paymentsDriver !== "fake" ? await sellerAccessToken(business) : null;
          await applyPayment(await gateway.getPayment(dataId, sellerToken));
        } catch (error) {
          console.error("[payments] webhook processing failed", dataId, error instanceof GatewayError ? error.body : error);
        }
      }
      return { ok: true };
    },
  }),
];

/** Only mounted with the fake gateway (NODE_ENV=test). */
export const testRoutes = [
  route({
    method: "post",
    path: "/test/payments/:id/approve",
    tag: "Test",
    summary: "Approve a fake Pix payment",
    auth: "none",
    params: z.object({ id: z.string() }),
    responses: { 200: { description: "Applied" } },
    handler: async ({ params }) => {
      fakeGateway()?.approve(params.id);
      await applyPayment(await gateway.getPayment(params.id));
      return { ok: true };
    },
  }),
];
