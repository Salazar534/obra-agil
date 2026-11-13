import type { Response } from "express";
import { loadOrder, serializeOrder, type MessageOut } from "../models.ts";

const clients = new Map<string, Set<Response>>();

export function subscribe(userId: string, res: Response) {
  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.write("retry: 3000\n\n");
  const set = clients.get(userId) ?? new Set<Response>();
  set.add(res);
  clients.set(userId, set);
  const ping = setInterval(() => res.write("event: ping\ndata: {}\n\n"), 25_000);
  res.on("close", () => {
    clearInterval(ping);
    set.delete(res);
    if (set.size === 0) clients.delete(userId);
  });
}

function send(userId: string, event: string, data: unknown) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of clients.get(userId) ?? []) res.write(payload);
}

/** Sends the order to both sides, each serialized from their own point of view. */
export async function publishOrder(orderId: string) {
  const [asCustomer, asBusiness] = await Promise.all([loadOrder(orderId, "customer"), loadOrder(orderId, "business")]);
  if (asCustomer) send(asCustomer.customer_id, "order", serializeOrder(asCustomer));
  if (asBusiness && asBusiness.status !== "awaiting_payment") send(asBusiness.owner_id, "order", serializeOrder(asBusiness));
}

export function publishMessage(userIds: string[], message: MessageOut) {
  for (const id of userIds) send(id, "message", message);
}

export function connectedCount() {
  let total = 0;
  for (const set of clients.values()) total += set.size;
  return total;
}
