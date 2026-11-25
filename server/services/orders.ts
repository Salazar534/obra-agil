import { exec, many, one, tx, type Db } from "../db/pool.ts";
import { conflict, forbidden } from "../lib/errors.ts";
import type { Role } from "../lib/session.ts";
import type { OrderOut } from "../models.ts";
import { publishOrder } from "./events.ts";
import { sellerAccessToken } from "./mercadopago-oauth.ts";
import { brandName, gateway, GatewayError, type GatewayPayment } from "./payments.ts";
import { config } from "../config.ts";
import type { BusinessRow } from "../models.ts";

type Status = OrderOut["status"];

export const ACTIVE_STATUSES: Status[] = ["awaiting_payment", "pending", "accepted", "on_the_way", "delivered"];

/** Who may move an order from one status to the next. */
const allowed: Record<Role, Partial<Record<Status, Status[]>>> = {
  business: {
    pending: ["accepted", "declined"],
    accepted: ["on_the_way", "cancelled"],
    on_the_way: ["delivered"],
    delivered: ["returned"],
  },
  customer: {
    awaiting_payment: ["cancelled"],
    pending: ["cancelled"],
    accepted: ["cancelled"],
  },
};

async function tokenForOrder(orderId: string) {
  if (config.paymentsDriver === "fake") return null;
  const business = await one<BusinessRow>("select b.* from orders o join businesses b on b.id = o.business_id where o.id = $1", [orderId]);
  return business ? sellerAccessToken(business) : null;
}

async function tokenForPayment(paymentId: string) {
  if (config.paymentsDriver === "fake") return null;
  const business = await one<BusinessRow>("select b.* from orders o join businesses b on b.id = o.business_id where o.mp_payment_id = $1", [paymentId]);
  return business ? sellerAccessToken(business) : null;
}

export function paymentLabel(payment: GatewayPayment, fallbackMethodId: string | null) {
  const id = payment.paymentMethodId ?? fallbackMethodId;
  if (id === "pix") return "Pix";
  if (id === "bolbradesco") return "Boleto";
  if (id === "pec") return "Lotérica";
  if (id === "account_money") return "Saldo Mercado Pago";
  const brand = brandName(id);
  const last = payment.card?.lastFour ? ` •••• ${payment.card.lastFour}` : "";
  return `${brand}${last}${payment.installments > 1 ? ` · ${payment.installments}x` : ""}`;
}

export async function recordStatus(db: Db, orderId: string, status: Status, actorId: string | null) {
  await exec("update orders set status = $2, updated_at = now() where id = $1", [orderId, status], db);
  await exec("insert into order_events (order_id, status, actor_id) values ($1, $2, $3)", [orderId, status, actorId], db);
}

type Locked = {
  id: string;
  status: Status;
  payment_status: string;
  total_cents: number;
  deposit_cents: number;
  refunded_cents: number;
  refund_due_cents: number;
  mp_payment_id: string | null;
  item_id: string;
  customer_id: string;
  owner_id: string;
};

export async function changeStatus(orderId: string, to: Status, actor: { id: string; role: Role }) {
  const before = await tx(async (db) => {
    const order = await one<Locked>(
      `select o.id, o.status, o.payment_status, o.total_cents, o.deposit_cents, o.refunded_cents, o.refund_due_cents,
              o.mp_payment_id, o.item_id, o.customer_id, b.owner_id
         from orders o join businesses b on b.id = o.business_id
        where o.id = $1 for update of o`,
      [orderId],
      db,
    );
    if (!order) throw conflict("order_missing", "Pedido não encontrado.");
    const mine = actor.role === "customer" ? order.customer_id === actor.id : order.owner_id === actor.id;
    if (!mine) throw forbidden();
    if (order.status === to) return order;
    if (!allowed[actor.role][order.status]?.includes(to)) {
      throw conflict("invalid_transition", "Esse pedido já mudou de etapa. Atualize a tela.");
    }
    await recordStatus(db, orderId, to, actor.id);
    if (to === "accepted") await exec("update items set rentals = rentals + 1 where id = $1", [order.item_id], db);
    if (order.payment_status === "approved" || order.payment_status === "partially_refunded") {
      const remaining = order.total_cents - order.refunded_cents - order.refund_due_cents;
      const due = to === "declined" || to === "cancelled" ? remaining : to === "returned" ? Math.min(order.deposit_cents, remaining) : 0;
      if (due > 0) await exec("update orders set refund_due_cents = refund_due_cents + $2 where id = $1", [orderId, due], db);
    }
    if (to === "cancelled" && order.status === "awaiting_payment") {
      await exec("update orders set payment_status = 'cancelled', updated_at = now() where id = $1", [orderId], db);
    }
    return order;
  });
  if (to === "cancelled" && before.status === "awaiting_payment" && before.mp_payment_id) {
    await gateway.cancelPayment(before.mp_payment_id, await tokenForOrder(orderId)).catch((error) => console.error("[payments] cancel failed", orderId, error));
  }
  await sendRefund(orderId);
  await publishOrder(orderId);
}

/** Sends whatever refund is due. Failures stay due and are retried by the sweeper. */
export async function sendRefund(orderId: string) {
  const claim = await one<{ due: number; refunded_cents: number; total_cents: number; mp_payment_id: string | null }>(
    `with due as (select id, refund_due_cents from orders where id = $1 and refund_due_cents > 0 for update)
     update orders o set refund_due_cents = 0 from due where o.id = due.id
     returning due.refund_due_cents as due, o.refunded_cents, o.total_cents, o.mp_payment_id`,
    [orderId],
  );
  if (!claim) return;
  if (!claim.mp_payment_id) {
    console.error("[payments] refund due without payment id", orderId);
    return;
  }
  const refunded = claim.refunded_cents + claim.due;
  try {
    await gateway.refund(claim.mp_payment_id, refunded >= claim.total_cents && claim.refunded_cents === 0 ? null : claim.due / 100, await tokenForOrder(orderId));
    await exec(
      "update orders set refunded_cents = $2, payment_status = $3, updated_at = now() where id = $1",
      [orderId, refunded, refunded >= claim.total_cents ? "refunded" : "partially_refunded"],
    );
  } catch (error) {
    await exec("update orders set refund_due_cents = refund_due_cents + $2 where id = $1", [orderId, claim.due]);
    console.error("[payments] refund failed, will retry", orderId, error instanceof GatewayError ? error.body : error);
  }
}

/** Brings an order in line with what Mercado Pago says about its payment. */
export async function applyPayment(payment: GatewayPayment) {
  const orderId = payment.externalReference;
  if (!orderId || !/^[0-9a-f-]{36}$/i.test(orderId)) return;
  const changed = await tx(async (db) => {
    const order = await one<{ status: Status; payment_status: string; mp_payment_id: string | null; payment_method: string }>(
      "select status, payment_status, mp_payment_id, payment_method from orders where id = $1 for update",
      [orderId],
      db,
    );
    if (!order || (order.mp_payment_id && order.mp_payment_id !== payment.id)) return false;
    if (order.status === "awaiting_payment") {
      if (payment.status === "approved") {
        await exec(
          `update orders set payment_status = 'approved', payment_detail = $2, mp_payment_id = $3, payment_label = $4,
                  money_release_at = coalesce($5, money_release_at), updated_at = now()
            where id = $1`,
          [orderId, payment.statusDetail, payment.id, paymentLabel(payment, null), payment.releaseAt],
          db,
        );
        await recordStatus(db, orderId, "pending", null);
        return true;
      }
      if (payment.status === "rejected" || payment.status === "cancelled") {
        await exec("update orders set payment_status = $2, payment_detail = $3, mp_payment_id = $4, updated_at = now() where id = $1", [
          orderId,
          payment.status,
          payment.statusDetail,
          payment.id,
        ], db);
        await recordStatus(db, orderId, "cancelled", null);
        return true;
      }
      return false;
    }
    if (payment.status === "refunded" && order.payment_status !== "refunded") {
      await exec("update orders set payment_status = 'refunded', updated_at = now() where id = $1", [orderId], db);
      return true;
    }
    return false;
  });
  if (changed) await publishOrder(orderId);
  return changed;
}

export async function refreshPayment(orderId: string) {
  const order = await one<{ mp_payment_id: string | null; status: Status }>("select mp_payment_id, status from orders where id = $1", [orderId]);
  if (!order?.mp_payment_id || order.status !== "awaiting_payment") return;
  await applyPayment(await gateway.getPayment(order.mp_payment_id, await tokenForOrder(orderId)));
}

/** Background upkeep: pending Pix, expired Pix, half-created orders and refunds that failed. */
export async function sweep() {
  if (!gateway.enabled) return;
  const waiting = await many<{ id: string; mp_payment_id: string | null; pix_expires_at: Date | null; created_at: Date }>(
    `select id, mp_payment_id, pix_expires_at, created_at from orders
      where status = 'awaiting_payment' and created_at > now() - interval '3 days'
      order by created_at limit 100`,
  );
  for (const order of waiting) {
    try {
      if (!order.mp_payment_id) {
        if (Date.now() - order.created_at.getTime() < 2 * 60_000) continue;
        const found = await gateway.findByReference(order.id, await tokenForOrder(order.id));
        if (found) {
          await exec("update orders set mp_payment_id = $2 where id = $1 and mp_payment_id is null", [order.id, found.id]);
          await applyPayment(found);
        } else if (Date.now() - order.created_at.getTime() > 5 * 60_000) {
          await expire(order.id, null);
        }
        continue;
      }
      const payment = await gateway.getPayment(order.mp_payment_id, await tokenForOrder(order.id));
      const changed = await applyPayment(payment);
      if (!changed && payment.status === "pending" && order.pix_expires_at && order.pix_expires_at.getTime() < Date.now() - 60_000) {
        await expire(order.id, order.mp_payment_id);
      }
    } catch (error) {
      console.error("[payments] sweep failed for", order.id, error instanceof GatewayError ? error.body : error);
    }
  }
  const refunds = await many<{ id: string }>("select id from orders where refund_due_cents > 0 order by updated_at limit 50");
  for (const order of refunds) await sendRefund(order.id);
}

async function expire(orderId: string, paymentId: string | null) {
  if (paymentId) await gateway.cancelPayment(paymentId, await tokenForPayment(paymentId)).catch(() => {});
  const changed = await tx(async (db) => {
    const order = await one<{ status: Status }>("select status from orders where id = $1 for update", [orderId], db);
    if (order?.status !== "awaiting_payment") return false;
    await exec("update orders set payment_status = 'cancelled', payment_detail = 'expired', updated_at = now() where id = $1", [orderId], db);
    await recordStatus(db, orderId, "cancelled", null);
    return true;
  });
  if (changed) await publishOrder(orderId);
}
