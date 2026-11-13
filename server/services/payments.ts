import { randomUUID } from "node:crypto";
import { config } from "../config.ts";
import { HttpError, unavailable } from "../lib/errors.ts";

export type GatewayStatus = "approved" | "pending" | "rejected" | "cancelled" | "refunded";

export type GatewayPayment = {
  id: string;
  status: GatewayStatus;
  statusDetail: string | null;
  externalReference: string | null;
  paymentMethodId: string | null;
  installments: number;
  card: { firstSix: string | null; lastFour: string | null } | null;
  refundedAmount: number;
  pix: { qrCode: string; qrCodeBase64: string; ticketUrl: string | null; expiresAt: Date } | null;
};

export type InstallmentOption = { installments: number; installmentAmount: number; totalAmount: number; rate: number; label: string };

export type Installments = {
  paymentMethodId: string;
  brand: string;
  paymentTypeId: string;
  issuerId: string | null;
  issuerName: string | null;
  options: InstallmentOption[];
};

export type SavedCard = {
  cardId: string;
  paymentMethodId: string;
  brand: string;
  issuerId: string | null;
  firstSix: string;
  lastFour: string;
  expMonth: number;
  expYear: number;
  holder: string;
};

export type Payer = { email: string; firstName: string; lastName: string; cpf: string | null; customerId: string | null };

export type CardPaymentInput = {
  amount: number;
  description: string;
  orderId: string;
  token: string;
  paymentMethodId: string;
  issuerId: string | null;
  installments: number;
  payer: Payer;
  item: { id: string; title: string };
};

export type PixPaymentInput = { amount: number; description: string; orderId: string; payer: Payer; expiresAt: Date; item: { id: string; title: string } };

export interface Gateway {
  readonly enabled: boolean;
  readonly publicKey: string | null;
  installments(amount: number, bin: string): Promise<Installments>;
  ensureCustomer(email: string, name: string): Promise<string>;
  saveCard(customerId: string, token: string): Promise<SavedCard>;
  deleteCard(customerId: string, cardId: string): Promise<void>;
  createCardPayment(input: CardPaymentInput): Promise<GatewayPayment>;
  createPixPayment(input: PixPaymentInput): Promise<GatewayPayment>;
  getPayment(id: string): Promise<GatewayPayment>;
  /** Latest payment created for an order, used when the payment id never reached our database. */
  findByReference(orderId: string): Promise<GatewayPayment | null>;
  cancelPayment(id: string): Promise<void>;
  /** amount null refunds everything that is left. */
  refund(id: string, amount: number | null): Promise<void>;
}

/** Thrown when Mercado Pago answers with an error. */
export class GatewayError extends Error {
  readonly status: number;
  readonly body: unknown;
  constructor(status: number, body: unknown) {
    super(`Mercado Pago ${status}: ${JSON.stringify(body)}`);
    this.status = status;
    this.body = body;
  }
}

const brands: Record<string, string> = {
  visa: "Visa",
  master: "Mastercard",
  amex: "American Express",
  elo: "Elo",
  hipercard: "Hipercard",
  cabal: "Cabal",
  diners: "Diners",
  debvisa: "Visa Débito",
  debmaster: "Mastercard Débito",
  debelo: "Elo Débito",
  pix: "Pix",
};

export function brandName(paymentMethodId: string | null) {
  if (!paymentMethodId) return "Cartão";
  return brands[paymentMethodId] ?? paymentMethodId.charAt(0).toUpperCase() + paymentMethodId.slice(1);
}

const money = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function installmentLabel(option: Omit<InstallmentOption, "label">) {
  if (option.installments === 1) return `À vista · ${money(option.totalAmount)}`;
  return option.rate === 0
    ? `${option.installments}x de ${money(option.installmentAmount)} sem juros`
    : `${option.installments}x de ${money(option.installmentAmount)} · total ${money(option.totalAmount)}`;
}

/** Rejection reasons from Mercado Pago, in words a customer can act on. */
export function rejectionMessage(detail: string | null) {
  const messages: Record<string, string> = {
    cc_rejected_bad_filled_card_number: "Confira o número do cartão.",
    cc_rejected_bad_filled_date: "Confira a validade do cartão.",
    cc_rejected_bad_filled_security_code: "Confira o código de segurança do cartão.",
    cc_rejected_bad_filled_other: "Confira os dados do cartão.",
    cc_rejected_call_for_authorize: "O banco pediu sua autorização. Libere o pagamento no app do banco e tente de novo.",
    cc_rejected_card_disabled: "Esse cartão está bloqueado. Ative com o banco ou use outro.",
    cc_rejected_duplicated_payment: "Você acabou de fazer um pagamento igual. Confira seus pedidos.",
    cc_rejected_insufficient_amount: "Limite insuficiente. Tente outro cartão ou Pix.",
    cc_rejected_invalid_installments: "Esse cartão não aceita esse número de parcelas.",
    cc_rejected_max_attempts: "Limite de tentativas atingido. Use outro cartão.",
    cc_rejected_high_risk: "O pagamento foi recusado por segurança. Tente outro cartão ou Pix.",
    cc_rejected_blacklist: "O pagamento foi recusado. Tente outro cartão ou Pix.",
    cc_rejected_card_error: "O cartão não pôde ser processado. Tente outro.",
  };
  return (detail && messages[detail]) || "O pagamento não foi aprovado. Tente outro cartão ou Pix.";
}

/** Mercado Pago wants local Brasília time with offset, e.g. 2026-11-11T12:00:00.000-03:00. */
function mpDate(date: Date) {
  return new Date(date.getTime() - 3 * 3_600_000).toISOString().replace("Z", "-03:00");
}

type MpPayment = {
  id: number;
  status: string;
  status_detail: string | null;
  external_reference: string | null;
  payment_method_id: string | null;
  installments: number | null;
  transaction_amount_refunded?: number;
  card?: { first_six_digits?: string | null; last_four_digits?: string | null } | null;
  date_of_expiration?: string | null;
  point_of_interaction?: { transaction_data?: { qr_code?: string; qr_code_base64?: string; ticket_url?: string } };
};

function mapStatus(status: string): GatewayStatus {
  if (status === "approved" || status === "authorized") return "approved";
  if (status === "rejected") return "rejected";
  if (status === "cancelled") return "cancelled";
  if (status === "refunded" || status === "charged_back") return "refunded";
  return "pending";
}

function fromMp(payment: MpPayment): GatewayPayment {
  const pix = payment.point_of_interaction?.transaction_data;
  return {
    id: String(payment.id),
    status: mapStatus(payment.status),
    statusDetail: payment.status_detail,
    externalReference: payment.external_reference,
    paymentMethodId: payment.payment_method_id,
    installments: payment.installments ?? 1,
    card: payment.card ? { firstSix: payment.card.first_six_digits ?? null, lastFour: payment.card.last_four_digits ?? null } : null,
    refundedAmount: payment.transaction_amount_refunded ?? 0,
    pix:
      pix?.qr_code && payment.date_of_expiration
        ? { qrCode: pix.qr_code, qrCodeBase64: pix.qr_code_base64 ?? "", ticketUrl: pix.ticket_url ?? null, expiresAt: new Date(payment.date_of_expiration) }
        : null,
  };
}

function payerBody(payer: Payer) {
  if (payer.customerId) return { type: "customer", id: payer.customerId, email: payer.email };
  return {
    email: payer.email,
    first_name: payer.firstName,
    last_name: payer.lastName,
    ...(payer.cpf ? { identification: { type: "CPF", number: payer.cpf } } : {}),
  };
}

function notificationUrl() {
  return config.publicUrl?.startsWith("https://") ? `${config.publicUrl}/api/webhooks/mercadopago` : undefined;
}

class MercadoPagoGateway implements Gateway {
  readonly enabled = config.mercadoPago !== null;
  readonly publicKey = config.mercadoPago?.publicKey ?? null;

  private async call<T>(method: string, path: string, body?: unknown, idempotent = false): Promise<T> {
    if (!config.mercadoPago) throw unavailable("payments_unavailable", "Pagamentos ainda não estão configurados.");
    const response = await fetch(`https://api.mercadopago.com${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${config.mercadoPago.accessToken}`,
        "Content-Type": "application/json",
        ...(idempotent ? { "X-Idempotency-Key": randomUUID() } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(25_000),
    });
    const data: unknown = await response.json().catch(() => null);
    if (!response.ok) throw new GatewayError(response.status, data);
    return data as T;
  }

  async installments(amount: number, bin: string): Promise<Installments> {
    const params = new URLSearchParams({ amount: amount.toFixed(2), bin, payment_type_id: "credit_card" });
    const list = await this.call<
      {
        payment_method_id: string;
        payment_type_id: string;
        issuer?: { id: number | string; name: string } | null;
        payer_costs: { installments: number; installment_rate: number; installment_amount: number; total_amount: number }[];
      }[]
    >("GET", `/v1/payment_methods/installments?${params}`);
    const first = list[0];
    if (!first) throw new HttpError(422, "card_not_supported", "Não reconhecemos esse cartão. Confira o número.");
    return {
      paymentMethodId: first.payment_method_id,
      brand: brandName(first.payment_method_id),
      paymentTypeId: first.payment_type_id,
      issuerId: first.issuer ? String(first.issuer.id) : null,
      issuerName: first.issuer?.name ?? null,
      options: first.payer_costs
        .filter((cost) => cost.installments <= 12)
        .map((cost) => {
          const option = {
            installments: cost.installments,
            installmentAmount: cost.installment_amount,
            totalAmount: cost.total_amount,
            rate: cost.installment_rate,
          };
          return { ...option, label: installmentLabel(option) };
        }),
    };
  }

  async ensureCustomer(email: string, name: string) {
    const found = await this.call<{ results: { id: string }[] }>("GET", `/v1/customers/search?email=${encodeURIComponent(email)}`);
    if (found.results[0]) return found.results[0].id;
    const [first, ...rest] = name.trim().split(/\s+/);
    const created = await this.call<{ id: string }>("POST", "/v1/customers", { email, first_name: first, last_name: rest.join(" ") || undefined });
    return created.id;
  }

  async saveCard(customerId: string, token: string): Promise<SavedCard> {
    const card = await this.call<{
      id: string;
      first_six_digits: string;
      last_four_digits: string;
      expiration_month: number;
      expiration_year: number;
      payment_method: { id: string; name: string };
      issuer?: { id: number | string } | null;
      cardholder?: { name?: string } | null;
    }>("POST", `/v1/customers/${encodeURIComponent(customerId)}/cards`, { token });
    return {
      cardId: String(card.id),
      paymentMethodId: card.payment_method.id,
      brand: brandName(card.payment_method.id),
      issuerId: card.issuer ? String(card.issuer.id) : null,
      firstSix: card.first_six_digits,
      lastFour: card.last_four_digits,
      expMonth: card.expiration_month,
      expYear: card.expiration_year,
      holder: (card.cardholder?.name ?? "").toUpperCase(),
    };
  }

  async deleteCard(customerId: string, cardId: string) {
    await this.call("DELETE", `/v1/customers/${encodeURIComponent(customerId)}/cards/${encodeURIComponent(cardId)}`);
  }

  async createCardPayment(input: CardPaymentInput) {
    const payment = await this.call<MpPayment>(
      "POST",
      "/v1/payments",
      {
        transaction_amount: input.amount,
        token: input.token,
        description: input.description,
        installments: input.installments,
        payment_method_id: input.paymentMethodId,
        ...(input.issuerId ? { issuer_id: /^\d+$/.test(input.issuerId) ? Number(input.issuerId) : input.issuerId } : {}),
        payer: payerBody(input.payer),
        external_reference: input.orderId,
        notification_url: notificationUrl(),
        statement_descriptor: "OBRA AGIL",
        binary_mode: true,
        metadata: { order_id: input.orderId },
        additional_info: {
          items: [{ id: input.item.id, title: input.item.title, quantity: 1, unit_price: input.amount, category_id: "others" }],
          payer: { first_name: input.payer.firstName, last_name: input.payer.lastName },
        },
      },
      true,
    );
    return fromMp(payment);
  }

  async createPixPayment(input: PixPaymentInput) {
    const payment = await this.call<MpPayment>(
      "POST",
      "/v1/payments",
      {
        transaction_amount: input.amount,
        description: input.description,
        payment_method_id: "pix",
        payer: payerBody({ ...input.payer, customerId: null }),
        external_reference: input.orderId,
        notification_url: notificationUrl(),
        date_of_expiration: mpDate(input.expiresAt),
        metadata: { order_id: input.orderId },
        additional_info: { items: [{ id: input.item.id, title: input.item.title, quantity: 1, unit_price: input.amount, category_id: "others" }] },
      },
      true,
    );
    return fromMp(payment);
  }

  async getPayment(id: string) {
    return fromMp(await this.call<MpPayment>("GET", `/v1/payments/${encodeURIComponent(id)}`));
  }

  async findByReference(orderId: string) {
    const params = new URLSearchParams({ external_reference: orderId, sort: "date_created", criteria: "desc", limit: "1" });
    const found = await this.call<{ results: MpPayment[] }>("GET", `/v1/payments/search?${params}`);
    return found.results[0] ? fromMp(found.results[0]) : null;
  }

  async cancelPayment(id: string) {
    await this.call("PUT", `/v1/payments/${encodeURIComponent(id)}`, { status: "cancelled" });
  }

  async refund(id: string, amount: number | null) {
    await this.call("POST", `/v1/payments/${encodeURIComponent(id)}/refunds`, amount === null ? {} : { amount }, true);
  }
}

/** Test double for the automated API tests (NODE_ENV=test only). Card tokens ending in "reject" are declined. */
class FakeGateway implements Gateway {
  readonly enabled = true;
  readonly publicKey = "TEST-fake-public-key";
  private payments = new Map<string, GatewayPayment & { amount: number }>();
  /** orders.mp_payment_id is unique, so ids must not repeat after a restart. */
  private sequence = Date.now();

  async installments(amount: number, bin: string): Promise<Installments> {
    const options = Array.from({ length: 12 }, (_, i) => {
      const n = i + 1;
      const rate = n <= 6 ? 0 : 1.99 * (n - 6);
      const total = Math.round(amount * (1 + rate / 100) * 100) / 100;
      const option = { installments: n, installmentAmount: Math.round((total / n) * 100) / 100, totalAmount: total, rate };
      return { ...option, label: installmentLabel(option) };
    });
    const paymentMethodId = bin.startsWith("4") ? "visa" : "master";
    return { paymentMethodId, brand: brandName(paymentMethodId), paymentTypeId: "credit_card", issuerId: "1", issuerName: "Banco Teste", options };
  }

  async ensureCustomer(email: string) {
    return `fake-customer-${email}`;
  }

  async saveCard(_customerId: string, token: string): Promise<SavedCard> {
    const lastFour = token.match(/(\d{4})$/)?.[1] ?? "4242";
    return { cardId: `card-${randomUUID()}`, paymentMethodId: "master", brand: "Mastercard", issuerId: "1", firstSix: "503143", lastFour, expMonth: 11, expYear: 2030, holder: "APRO" };
  }

  async deleteCard() {}

  private store(payment: GatewayPayment, amount: number) {
    this.payments.set(payment.id, { ...payment, amount });
    return payment;
  }

  async createCardPayment(input: CardPaymentInput) {
    const rejected = input.token.endsWith("reject");
    return this.store(
      {
        id: String(++this.sequence),
        status: rejected ? "rejected" : "approved",
        statusDetail: rejected ? "cc_rejected_insufficient_amount" : "accredited",
        externalReference: input.orderId,
        paymentMethodId: input.paymentMethodId,
        installments: input.installments,
        card: { firstSix: "503143", lastFour: input.token.match(/(\d{4})/)?.[1] ?? "6351" },
        refundedAmount: 0,
        pix: null,
      },
      input.amount,
    );
  }

  async createPixPayment(input: PixPaymentInput) {
    const id = String(++this.sequence);
    const qrCode = `00020126580014br.gov.bcb.pix-test-${id}`;
    // qrcode is a dev dependency, which is fine because the fake gateway only exists with NODE_ENV=test.
    const { default: QRCode } = await import("qrcode");
    const qrCodeBase64 = (await QRCode.toDataURL(qrCode, { margin: 1, width: 440 })).split(",")[1];
    return this.store(
      {
        id,
        status: "pending",
        statusDetail: "pending_waiting_transfer",
        externalReference: input.orderId,
        paymentMethodId: "pix",
        installments: 1,
        card: null,
        refundedAmount: 0,
        pix: { qrCode, qrCodeBase64, ticketUrl: null, expiresAt: input.expiresAt },
      },
      input.amount,
    );
  }

  async getPayment(id: string) {
    const payment = this.payments.get(id);
    if (!payment) throw new GatewayError(404, { message: "not found" });
    return payment;
  }

  async findByReference(orderId: string) {
    return [...this.payments.values()].reverse().find((payment) => payment.externalReference === orderId) ?? null;
  }

  async cancelPayment(id: string) {
    const payment = await this.getPayment(id);
    if (payment.status === "pending") this.payments.set(id, { ...this.payments.get(id)!, status: "cancelled" });
  }

  async refund(id: string, amount: number | null) {
    const payment = this.payments.get(id);
    if (!payment) throw new GatewayError(404, { message: "not found" });
    const refunded = Math.round((payment.refundedAmount + (amount ?? payment.amount - payment.refundedAmount)) * 100) / 100;
    this.payments.set(id, { ...payment, refundedAmount: refunded, status: refunded >= payment.amount ? "refunded" : payment.status });
  }

  approve(id: string) {
    const payment = this.payments.get(id);
    if (payment) this.payments.set(id, { ...payment, status: "approved", statusDetail: "accredited" });
  }
}

export const gateway: Gateway = config.paymentsDriver === "fake" ? new FakeGateway() : new MercadoPagoGateway();

export function fakeGateway() {
  return gateway instanceof FakeGateway ? gateway : null;
}
