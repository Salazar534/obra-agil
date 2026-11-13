import type pg from "pg";
import { z } from "zod";
import { config } from "../config.ts";
import { exec, many, one, tx } from "../db/pool.ts";
import { badRequest, conflict, HttpError, notFound, unavailable } from "../lib/errors.ts";
import { route } from "../lib/route.ts";
import type { SessionUser } from "../lib/session.ts";
import { addDays, distanceKm, isValidCpf, todayInBrazil } from "../lib/text.ts";
import {
  AddressInput,
  Cpf,
  Email,
  Id,
  IdParams,
  loadOrder,
  Message,
  Order,
  ORDER_SELECT,
  OrderStatus,
  Review,
  serializeOrder,
  type BusinessRow,
  type ItemRow,
  type MessageOut,
  type OrderRow,
  type PaymentMethodRow,
  type UserRow,
} from "../models.ts";
import { publishMessage, publishOrder } from "../services/events.ts";
import { ACTIVE_STATUSES, applyPayment, changeStatus, paymentLabel, refreshPayment } from "../services/orders.ts";
import { gateway, GatewayError, rejectionMessage, type GatewayPayment, type Payer } from "../services/payments.ts";
import { shortName } from "./explore.ts";

const OrderResponse = { description: "Pedido", schema: Order };

async function visibleOrder(orderId: string, user: SessionUser) {
  const row = await loadOrder(orderId, user.role);
  const mine = row && (user.role === "customer" ? row.customer_id === user.id : row.owner_id === user.id && row.status !== "awaiting_payment");
  if (!row || !mine) throw notFound("Pedido não encontrado.");
  return row;
}

function gatewayFailure(error: GatewayError) {
  console.error("[payments] Mercado Pago error", error.status, JSON.stringify(error.body));
  if (error.status >= 500) return new HttpError(502, "payment_failed", "Não conseguimos falar com o Mercado Pago. Tente de novo em instantes.");
  return new HttpError(422, "payment_invalid", "O Mercado Pago não aceitou esses dados de pagamento. Confira e tente de novo.");
}

const CardPayment = z.object({
  method: z.literal("card"),
  token: z.string().min(8).max(200).describe("Token criado pelo MercadoPago.js (mp.fields.createCardToken). Vale uma vez."),
  paymentMethodId: z.string().min(2).max(40).describe("Ex.: master, visa. Vem de /payments/installments."),
  issuerId: z.string().max(40).nullable().optional(),
  installments: z.number().int().min(1).max(12),
  savedCardId: Id.optional().describe("Id do cartão salvo quando o token foi criado com createCardToken({ cardId })."),
});

export const orderRoutes = [
  route({
    method: "get",
    path: "/orders",
    tag: "Orders",
    summary: "Meus pedidos",
    description: "Cliente: os pedidos que fez. Empresa: os pedidos pagos da sua loja.",
    auth: "user",
    responses: { 200: { description: "Do mais recente ao mais antigo", schema: z.array(Order) } },
    handler: async ({ user }) => {
      const rows =
        user.role === "customer"
          ? await many<OrderRow>(
              `${ORDER_SELECT} where o.customer_id = $2
                 and not (o.status = 'cancelled' and o.payment_status in ('cancelled', 'rejected'))
               order by o.created_at desc limit 200`,
              ["customer", user.id],
            )
          : await many<OrderRow>(
              `${ORDER_SELECT} where b.owner_id = $2 and o.status <> 'awaiting_payment' order by o.created_at desc limit 300`,
              ["business", user.id],
            );
      return rows.map(serializeOrder);
    },
  }),

  route({
    method: "post",
    path: "/orders",
    tag: "Orders",
    summary: "Fazer pedido e pagar",
    description:
      "Calcula os valores no servidor (aluguel + entrega + taxa de serviço de 5% + caução), confere se o equipamento está livre nas datas e cobra no Mercado Pago. " +
      "Cartão: aprovado vira pending (vai para a loja); recusado devolve 402 e o pedido não é criado. " +
      "Pix: o pedido fica awaiting_payment com o QR code em payment.pix por 30 minutos e anda sozinho quando o pagamento cai.",
    auth: "customer",
    body: z.object({
      itemId: Id,
      start: z.iso.date().describe("Primeiro dia, YYYY-MM-DD, de hoje até 60 dias."),
      days: z.number().int().min(1).max(30),
      mode: z.enum(["delivery", "pickup"]),
      address: AddressInput.optional().describe("Obrigatório quando mode = delivery."),
      payment: z.discriminatedUnion("method", [CardPayment, z.object({ method: z.literal("pix") })]),
      payer: z
        .object({ email: Email.optional(), cpf: Cpf.optional() })
        .optional()
        .describe("Completa o perfil quando ainda não tem e-mail ou CPF."),
    }),
    responses: {
      201: OrderResponse,
      402: { description: "Pagamento recusado (error.code = payment_rejected)" },
      409: { description: "Equipamento indisponível nessas datas" },
    },
    handler: async ({ body, user }) => {
      if (!gateway.enabled) throw unavailable("payments_unavailable", "Os pagamentos ainda não foram configurados. Tente mais tarde.");
      const today = todayInBrazil();
      if (body.start < today) throw badRequest("invalid_start", "Escolha uma data a partir de hoje.");
      if (body.start > addDays(today, 60)) throw badRequest("invalid_start", "Agende com até 60 dias de antecedência.");

      const me = (await one<UserRow>("select * from users where id = $1", [user.id]))!;
      if (body.payer?.cpf && !isValidCpf(body.payer.cpf)) throw badRequest("invalid_cpf", "Esse CPF não é válido.");
      if (body.payer?.email && !me.email) {
        try {
          await exec("update users set email = $2 where id = $1", [user.id, body.payer.email]);
          me.email = body.payer.email;
        } catch (error) {
          if ((error as pg.DatabaseError).code === "23505") throw conflict("email_taken", "Esse e-mail já está em outra conta.");
          throw error;
        }
      }
      if (body.payer?.cpf && !me.cpf) {
        await exec("update users set cpf = $2 where id = $1", [user.id, body.payer.cpf]);
        me.cpf = body.payer.cpf;
      }
      if (!me.email) throw badRequest("email_required", "Informe um e-mail para receber o comprovante do pagamento.");

      const item = await one<ItemRow>("select * from items where id = $1 and deleted_at is null", [body.itemId]);
      if (!item) throw notFound("Equipamento não encontrado. Ele pode ter sido removido pela loja.");
      if (!item.available) throw conflict("item_paused", "A loja pausou esse equipamento. Escolha outro.");
      const business = (await one<BusinessRow>("select * from businesses where id = $1", [item.business_id]))!;

      let address = { label: business.address_label, detail: business.address_detail, lat: business.lat, lng: business.lng };
      if (body.mode === "delivery") {
        if (!body.address) throw badRequest("address_required", "Escolha o endereço de entrega.");
        if (distanceKm(business, body.address) > business.radius_km) {
          throw badRequest("out_of_range", `Esse endereço está fora da área de entrega da loja (${business.radius_km} km). Escolha retirada.`);
        }
        address = body.address;
      }

      let savedCard: PaymentMethodRow | null = null;
      if (body.payment.method === "card" && body.payment.savedCardId) {
        savedCard = await one<PaymentMethodRow>("select * from payment_methods where id = $1 and user_id = $2", [body.payment.savedCardId, user.id]);
        if (!savedCard || !me.mp_customer_id) throw notFound("Cartão salvo não encontrado.");
      }

      const rent = item.price_cents * body.days;
      const deliveryFee = body.mode === "delivery" ? business.delivery_fee_cents : 0;
      const serviceFee = Math.round(rent * config.serviceFeeRate);
      const deposit = item.deposit_cents;
      const total = rent + deliveryFee + serviceFee + deposit;
      const installments = body.payment.method === "card" ? body.payment.installments : 1;

      const orderId = await tx(async (db) => {
        await exec("select id from items where id = $1 for update", [item.id], db);
        const busy = await one<{ n: number }>(
          `select count(*)::int as n from orders
            where item_id = $1 and status = any($2::text[])
              and daterange(start_date, start_date + days) && daterange($3::date, $3::date + $4::int)`,
          [item.id, ACTIVE_STATUSES, body.start, body.days],
          db,
        );
        if ((busy?.n ?? 0) >= item.quantity) {
          throw conflict("unavailable_dates", "Esse equipamento já está reservado nessas datas. Escolha outro dia.");
        }
        const row = await one<{ id: string }>(
          `insert into orders (customer_id, business_id, item_id, item_name, item_image_url, price_cents, start_date, days, mode,
                               address_label, address_detail, lat, lng, rent_cents, delivery_fee_cents, service_fee_cents, deposit_cents,
                               total_cents, status, payment_method, payment_label, installments)
           values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, 'awaiting_payment', $19, $20, $21)
           returning id`,
          [
            user.id,
            business.id,
            item.id,
            item.name,
            item.image_url,
            item.price_cents,
            body.start,
            body.days,
            body.mode,
            address.label,
            address.detail,
            address.lat,
            address.lng,
            rent,
            deliveryFee,
            serviceFee,
            deposit,
            total,
            body.payment.method,
            body.payment.method === "pix" ? "Pix" : savedCard ? `${savedCard.brand} •••• ${savedCard.last_four}` : "Cartão de crédito",
            installments,
          ],
          db,
        );
        await exec("insert into order_events (order_id, status, actor_id) values ($1, 'awaiting_payment', $2)", [row!.id, user.id], db);
        return row!.id;
      });

      const [firstName, ...rest] = me.name.trim().split(/\s+/);
      const payer: Payer = { email: me.email, firstName, lastName: rest.join(" "), cpf: me.cpf, customerId: savedCard ? me.mp_customer_id : null };
      const description = `Aluguel: ${item.name} (${body.days} ${body.days === 1 ? "dia" : "dias"})`;
      const common = { amount: total / 100, description, orderId, payer, item: { id: item.id, title: item.name } };

      let payment: GatewayPayment;
      try {
        payment =
          body.payment.method === "card"
            ? await gateway.createCardPayment({
                ...common,
                token: body.payment.token,
                paymentMethodId: savedCard?.payment_method_id ?? body.payment.paymentMethodId,
                issuerId: savedCard?.issuer_id ?? body.payment.issuerId ?? null,
                installments,
              })
            : await gateway.createPixPayment({ ...common, expiresAt: new Date(Date.now() + 31 * 60_000) });
      } catch (error) {
        await exec("delete from orders where id = $1", [orderId]);
        throw error instanceof GatewayError ? gatewayFailure(error) : error;
      }

      if (payment.status === "rejected" || payment.status === "cancelled") {
        await exec("delete from orders where id = $1", [orderId]);
        throw new HttpError(402, "payment_rejected", rejectionMessage(payment.statusDetail), { statusDetail: payment.statusDetail });
      }
      await exec(
        `update orders set mp_payment_id = $2, payment_label = $3, payment_detail = $4,
                pix_qr_code = $5, pix_qr_base64 = $6, pix_ticket_url = $7, pix_expires_at = $8, updated_at = now()
          where id = $1`,
        [
          orderId,
          payment.id,
          paymentLabel(payment, savedCard?.payment_method_id ?? null),
          payment.statusDetail,
          payment.pix?.qrCode ?? null,
          payment.pix?.qrCodeBase64 ?? null,
          payment.pix?.ticketUrl ?? null,
          payment.pix?.expiresAt ?? null,
        ],
      );
      await applyPayment(payment);
      return serializeOrder((await loadOrder(orderId, "customer"))!);
    },
  }),

  route({
    method: "get",
    path: "/orders/:id",
    tag: "Orders",
    summary: "Detalhes do pedido",
    auth: "user",
    params: IdParams,
    responses: { 200: OrderResponse },
    handler: async ({ params, user }) => serializeOrder(await visibleOrder(params.id, user)),
  }),

  route({
    method: "post",
    path: "/orders/:id/status",
    tag: "Orders",
    summary: "Mudar a etapa do pedido",
    description:
      "Empresa: pending → accepted | declined; accepted → on_the_way | cancelled; on_the_way → delivered; delivered → returned. " +
      "Cliente: awaiting_payment | pending | accepted → cancelled. Recusar ou cancelar um pedido pago estorna tudo; returned estorna a caução.",
    auth: "user",
    params: IdParams,
    body: z.object({ status: OrderStatus }),
    responses: { 200: OrderResponse, 409: { description: "Mudança não permitida a partir da etapa atual" } },
    handler: async ({ params, body, user }) => {
      await visibleOrder(params.id, user);
      await changeStatus(params.id, body.status, user);
      return serializeOrder(await visibleOrder(params.id, user));
    },
  }),

  route({
    method: "post",
    path: "/orders/:id/payment/refresh",
    tag: "Orders",
    summary: "Conferir se o Pix foi pago",
    description: "Consulta o Mercado Pago na hora. O servidor também confere sozinho a cada 30 segundos e pelo webhook.",
    auth: "customer",
    params: IdParams,
    responses: { 200: OrderResponse },
    handler: async ({ params, user }) => {
      await visibleOrder(params.id, user);
      await refreshPayment(params.id).catch((error) => console.error("[payments] refresh failed", error instanceof GatewayError ? error.body : error));
      return serializeOrder(await visibleOrder(params.id, user));
    },
  }),

  route({
    method: "get",
    path: "/orders/:id/messages",
    tag: "Orders",
    summary: "Mensagens do pedido",
    auth: "user",
    params: IdParams,
    responses: { 200: { description: "Da mais antiga à mais nova", schema: z.array(Message) } },
    handler: async ({ params, user }) => {
      await visibleOrder(params.id, user);
      const rows = await many<{ id: string; sender_role: "customer" | "business"; body: string; created_at: Date }>(
        "select id, sender_role, body, created_at from messages where order_id = $1 order by created_at, id",
        [params.id],
      );
      return rows.map((row): MessageOut => ({ id: row.id, orderId: params.id, from: row.sender_role, text: row.body, at: row.created_at.getTime() }));
    },
  }),

  route({
    method: "post",
    path: "/orders/:id/messages",
    tag: "Orders",
    summary: "Enviar mensagem",
    description: "Chega na hora para o outro lado pelo /events.",
    auth: "user",
    params: IdParams,
    body: z.object({ text: z.string().trim().min(1, "Escreva uma mensagem.").max(2000) }),
    responses: { 201: { description: "Mensagem enviada", schema: Message } },
    handler: async ({ params, body, user }) => {
      const order = await visibleOrder(params.id, user);
      if (order.status === "awaiting_payment") throw conflict("chat_closed", "A conversa com a loja abre depois do pagamento.");
      const row = await one<{ id: string; created_at: Date }>(
        "insert into messages (order_id, sender_id, sender_role, body) values ($1, $2, $3, $4) returning id, created_at",
        [params.id, user.id, user.role, body.text],
      );
      await exec(`update orders set ${user.role === "customer" ? "read_customer_at" : "read_business_at"} = $2 where id = $1`, [params.id, row!.created_at]);
      const message: MessageOut = { id: row!.id, orderId: params.id, from: user.role, text: body.text, at: row!.created_at.getTime() };
      publishMessage([order.customer_id, order.owner_id], message);
      return message;
    },
  }),

  route({
    method: "post",
    path: "/orders/:id/read",
    tag: "Orders",
    summary: "Marcar mensagens como lidas",
    auth: "user",
    params: IdParams,
    responses: { 204: { description: "Lidas" } },
    handler: async ({ params, user }) => {
      await visibleOrder(params.id, user);
      await exec(`update orders set ${user.role === "customer" ? "read_customer_at" : "read_business_at"} = now() where id = $1`, [params.id]);
    },
  }),

  route({
    method: "post",
    path: "/orders/:id/review",
    tag: "Orders",
    summary: "Avaliar a loja",
    description: "Uma avaliação por pedido, depois da devolução.",
    auth: "customer",
    params: IdParams,
    body: z.object({ stars: z.number().int().min(1).max(5), text: z.string().trim().max(500).default("") }),
    responses: { 201: { description: "Avaliação publicada", schema: Review } },
    handler: async ({ params, body, user }) => {
      const order = await visibleOrder(params.id, user);
      if (order.status !== "returned") throw conflict("not_returned", "Você pode avaliar depois de devolver o equipamento.");
      const review = await tx(async (db) => {
        const marked = await exec("update orders set reviewed = true where id = $1 and reviewed = false", [params.id], db);
        if (!marked) throw conflict("already_reviewed", "Você já avaliou este pedido.");
        const row = await one<{ id: string; created_at: Date }>(
          "insert into reviews (order_id, business_id, author_id, stars, body) values ($1, $2, $3, $4, $5) returning id, created_at",
          [params.id, order.business_id, user.id, body.stars, body.text],
          db,
        );
        await exec("update businesses set rating_sum = rating_sum + $2, rating_count = rating_count + 1 where id = $1", [order.business_id, body.stars], db);
        return row!;
      });
      const author = (await one<{ name: string; photo_url: string | null }>("select name, photo_url from users where id = $1", [user.id]))!;
      await publishOrder(params.id);
      return {
        id: review.id,
        businessId: order.business_id,
        orderId: params.id,
        author: shortName(author.name),
        authorPhoto: author.photo_url,
        stars: body.stars,
        text: body.text,
        at: review.created_at.getTime(),
      };
    },
  }),
];
