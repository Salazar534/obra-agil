import { many, one } from "../db/pool.ts";
import { toReais } from "../lib/text.ts";

const ACTIVE = ["pending", "accepted", "on_the_way", "delivered"];

export type StoreMovement = {
  id: string;
  code: string;
  item: string;
  at: number;
  amount: number;
  bucket: "waiting" | "receiving" | "available" | "refunded";
};

export type StoreBalance = {
  waiting: number;
  receiving: number;
  available: number;
  serviceFee: number;
  refunded: number;
  depositHeld: number;
  connected: boolean;
  withdrawUrl: string;
  movements: StoreMovement[];
};

type Row = {
  id: string;
  number: number;
  item_name: string;
  created_at: Date;
  status: string;
  payment_status: string;
  total_cents: number;
  service_fee_cents: number;
  deposit_cents: number;
  refunded_cents: number;
  money_release_at: Date | null;
  mp_user_id: string | null;
};

/** What stays with the store after the platform fee and whatever was already refunded. */
function storeNet(row: Row) {
  return Math.max(0, row.total_cents - row.service_fee_cents - row.refunded_cents);
}

function bucket(row: Row): StoreMovement["bucket"] {
  if (row.payment_status === "pending") return "waiting";
  if (row.payment_status === "refunded" || storeNet(row) === 0) return "refunded";
  if (row.money_release_at && row.money_release_at.getTime() > Date.now()) return "receiving";
  return "available";
}

/** Statement of the store's Mercado Pago money. The platform never holds the withdrawal. */
export async function storeBalance(businessId: string): Promise<StoreBalance> {
  const rows = await many<Row>(
    `select o.id, o.number, o.item_name, o.created_at, o.status, o.payment_status,
            o.total_cents, o.service_fee_cents, o.deposit_cents, o.refunded_cents, o.money_release_at,
            b.mp_user_id
       from orders o
       join businesses b on b.id = o.business_id
      where o.business_id = $1
        and o.payment_status in ('pending', 'approved', 'partially_refunded', 'refunded')
      order by o.created_at desc`,
    [businessId],
  );
  const totals = { waiting: 0, receiving: 0, available: 0, serviceFee: 0, refunded: 0, depositHeld: 0 };
  const movements: StoreMovement[] = [];
  for (const row of rows) {
    const place = bucket(row);
    const net = storeNet(row);
    if (place !== "refunded") totals[place] += net;
    if (row.payment_status === "approved" || row.payment_status === "partially_refunded") totals.serviceFee += row.service_fee_cents;
    totals.refunded += row.refunded_cents;
    if (ACTIVE.includes(row.status) && row.payment_status !== "pending") {
      totals.depositHeld += Math.min(row.deposit_cents, net);
    }
    movements.push({
      id: row.id,
      code: `#${row.number}`,
      item: row.item_name,
      at: row.created_at.getTime(),
      amount: place === "refunded" ? toReais(row.refunded_cents) : toReais(net),
      bucket: place,
    });
  }
  const connected = Boolean(rows[0]?.mp_user_id ?? (await one<{ mp_user_id: string | null }>("select mp_user_id from businesses where id = $1", [businessId]))?.mp_user_id);
  return {
    waiting: toReais(totals.waiting),
    receiving: toReais(totals.receiving),
    available: toReais(totals.available),
    serviceFee: toReais(totals.serviceFee),
    refunded: toReais(totals.refunded),
    depositHeld: toReais(totals.depositHeld),
    connected,
    withdrawUrl: "https://www.mercadopago.com.br/balance",
    movements: movements.slice(0, 12),
  };
}
