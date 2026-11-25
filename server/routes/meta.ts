import { z } from "zod";
import { config } from "../config.ts";
import { one } from "../db/pool.ts";
import { route } from "../lib/route.ts";
import { subscribe } from "../services/events.ts";
import { mailMode } from "../services/mail.ts";
import { gateway } from "../services/payments.ts";
import { smsMode } from "../services/sms.ts";

export const metaRoutes = [
  route({
    method: "get",
    path: "/config",
    tag: "Meta",
    summary: "Configuração pública do app",
    description: "O que está ligado neste servidor: pagamentos (e a chave pública do Mercado Pago), SMS e e-mail.",
    auth: "none",
    responses: {
      200: {
        description: "Configuração",
        schema: z
          .object({
            payments: z.object({ enabled: z.boolean(), provider: z.literal("mercadopago"), publicKey: z.string().nullable(), maxInstallments: z.number().int() }),
            sms: z.object({ enabled: z.boolean(), mode: z.enum(["twilio", "console", "disabled"]).describe("console: código no terminal da API (desenvolvimento).") }),
            email: z.object({ enabled: z.boolean(), mode: z.enum(["smtp", "console", "disabled"]) }),
            serviceFeeRate: z.number().describe("Taxa de serviço sobre o aluguel (0.05 = 5%)."),
            apiPage: z.string().nullable().describe("Página da API, só com sessão. Nula em desenvolvimento."),
          })
          .meta({ id: "PublicConfig" }),
      },
    },
    handler: () => ({
      payments: { enabled: gateway.enabled, provider: "mercadopago" as const, publicKey: gateway.publicKey, maxInstallments: 12 },
      sms: { enabled: smsMode !== "disabled", mode: smsMode },
      email: { enabled: mailMode !== "disabled", mode: mailMode },
      serviceFeeRate: config.serviceFeeRate,
      apiPage: config.publicUrl,
    }),
  }),

  route({
    method: "get",
    path: "/health",
    tag: "Meta",
    summary: "Saúde do servidor",
    auth: "none",
    responses: { 200: { description: "Servidor e banco respondendo", schema: z.object({ ok: z.boolean(), db: z.boolean() }) } },
    handler: async () => ({ ok: true, db: (await one<{ ok: number }>("select 1 as ok"))?.ok === 1 }),
  }),

  route({
    method: "get",
    path: "/events",
    tag: "Events",
    summary: "Atualizações ao vivo (Server-Sent Events)",
    description:
      "Mantém a conexão aberta (text/event-stream). Eventos: `order` (dados: Order, sempre que um pedido seu muda), " +
      "`message` (dados: Message, mensagem nova num pedido seu) e `ping` (a cada 25 s). Se nada chegar por mais de um minuto, " +
      "a conexão caiu: reconecte e recarregue os pedidos. Use EventSource('/api/events').",
    auth: "user",
    responses: { 200: { description: "Fluxo text/event-stream" } },
    handler: ({ res, user }) => {
      subscribe(user.id, res);
    },
  }),
];
