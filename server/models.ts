import { z } from "zod";
import { many, one, type Db } from "./db/pool.ts";
import { CATEGORIES, toReais } from "./lib/text.ts";

/* ---------- Shared inputs ---------- */

export const Id = z.uuid({ error: "Identificador inválido." });
export const IdParams = z.object({ id: Id });
export const Category = z.enum(CATEGORIES).meta({ id: "Category", description: "Categoria de equipamento." });
export const Role = z.enum(["customer", "business"]).meta({ id: "Role", description: "customer: quem aluga. business: locadora." });
export const Phone = z
  .string()
  .transform((value) => value.replace(/\D/g, "").replace(/^55(?=\d{11}$)/, ""))
  .pipe(z.string().regex(/^[1-9]{2}9\d{8}$/, "Use um celular com DDD, como (11) 99999-9999."))
  .describe("Celular com DDD (11 dígitos). Pontuação e +55 são aceitos.");
export const Email = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email({ error: "Esse e-mail está incompleto." }).max(160));
export const Password = z
  .string()
  .min(8, "A senha precisa de pelo menos 8 caracteres.")
  .max(128, "A senha pode ter no máximo 128 caracteres.");
export const Cpf = z
  .string()
  .transform((value) => value.replace(/\D/g, ""))
  .pipe(z.string().regex(/^\d{11}$/, "O CPF tem 11 dígitos."))
  .describe("CPF, com ou sem pontuação.");
export const Time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use o formato HH:MM.");
export const Money = z.number().min(0).max(1_000_000).describe("Valor em reais.");
export const AddressInput = z.object({
  label: z.string().trim().min(1).max(120).describe("Rua e número, ou nome do lugar."),
  detail: z.string().trim().max(160).default("").describe("Bairro e cidade."),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

/* ---------- Outputs ---------- */

export const Address = z
  .object({ label: z.string(), detail: z.string(), lat: z.number(), lng: z.number() })
  .meta({ id: "Address", description: "Endereço com coordenadas." });

export const SavedAddress = Address.extend({ id: Id }).meta({ id: "SavedAddress" });

export const Prefs = z
  .object({ orders: z.boolean(), promos: z.boolean(), sounds: z.boolean() })
  .meta({ id: "Prefs", description: "Avisos de pedidos, promoções e sons." });

export const Me = z
  .object({
    id: Id,
    role: Role,
    name: z.string(),
    email: z.string().nullable(),
    phone: z.string().nullable().describe("Celular verificado, só dígitos."),
    cpf: z.string().nullable(),
    hasPassword: z.boolean().describe("A conta pode entrar com e-mail e senha."),
    photo: z.string().nullable(),
    prefs: Prefs,
    tipDismissed: z.boolean(),
    recentSearches: z.array(z.string()),
    addresses: z.array(SavedAddress),
    activeAddressId: Id.nullable(),
    favoriteIds: z.array(Id).describe("Ids de equipamentos e lojas salvos."),
    businessId: Id.nullable(),
    createdAt: z.number().int(),
  })
  .meta({ id: "Me", description: "A conta logada." });

export const Business = z
  .object({
    id: Id,
    ownerId: Id,
    name: z.string(),
    tagline: z.string(),
    about: z.string(),
    category: Category,
    cover: z.string(),
    logo: z.string().nullable(),
    phone: z.string(),
    address: Address,
    opens: z.string().describe("HH:MM"),
    closes: z.string().describe("HH:MM"),
    deliveryFee: z.number(),
    radiusKm: z.number().int(),
    rating: z.number().describe("Média de 0 a 5; 0 quando ainda não há avaliações."),
    reviewCount: z.number().int(),
    createdAt: z.number().int(),
    distanceKm: z.number().optional().describe("Distância até o ponto da busca."),
  })
  .meta({ id: "Business", description: "Locadora." });

export const Item = z
  .object({
    id: Id,
    businessId: Id,
    name: z.string(),
    category: Category,
    price: z.number().describe("Preço por dia."),
    deposit: z.number().describe("Caução, devolvida no fim do aluguel."),
    description: z.string(),
    specs: z.array(z.string()),
    image: z.string(),
    quantity: z.number().int(),
    available: z.boolean(),
    rentals: z.number().int(),
    createdAt: z.number().int(),
  })
  .meta({ id: "Item", description: "Equipamento para alugar." });

export const OrderStatus = z
  .enum(["awaiting_payment", "pending", "accepted", "on_the_way", "delivered", "returned", "declined", "cancelled"])
  .meta({
    id: "OrderStatus",
    description:
      "awaiting_payment: Pix gerado, esperando pagamento. pending: pago, esperando a loja. accepted: loja aceitou. " +
      "on_the_way: saiu para entrega ou pronto para retirada. delivered: com o cliente. returned: devolvido (caução estornada). " +
      "declined: loja recusou (estornado). cancelled: cancelado (estornado se pago).",
  });

export const PaymentStatus = z
  .enum(["pending", "approved", "rejected", "cancelled", "refunded", "partially_refunded"])
  .meta({ id: "PaymentStatus" });

export const OrderPayment = z
  .object({
    method: z.enum(["card", "pix"]),
    label: z.string().describe("Ex.: Mastercard •••• 6351 · 3x"),
    installments: z.number().int(),
    status: PaymentStatus,
    detail: z.string().nullable().describe("Motivo informado pelo Mercado Pago."),
    refunded: z.number().describe("Total já estornado."),
    pix: z
      .object({
        qrCode: z.string().describe("Pix copia e cola."),
        qrCodeBase64: z.string().describe("Imagem PNG do QR code em base64."),
        ticketUrl: z.string().nullable(),
        expiresAt: z.number().int(),
      })
      .nullable()
      .describe("Presente enquanto o Pix espera pagamento."),
  })
  .meta({ id: "OrderPayment" });

export const Order = z
  .object({
    id: Id,
    code: z.string().describe("Número curto do pedido, como #1001."),
    customerId: Id,
    businessId: Id,
    itemId: Id,
    item: z.object({ id: Id, name: z.string(), image: z.string() }),
    business: z.object({ id: Id, name: z.string(), logo: z.string().nullable(), phone: z.string(), address: Address }),
    customer: z.object({ id: Id, name: z.string(), photo: z.string().nullable(), phone: z.string().nullable() }),
    start: z.string().describe("Primeiro dia do aluguel, YYYY-MM-DD."),
    days: z.number().int(),
    mode: z.enum(["delivery", "pickup"]),
    address: Address.describe("Endereço de entrega, ou da loja na retirada."),
    rent: z.number(),
    deliveryFee: z.number(),
    serviceFee: z.number(),
    deposit: z.number(),
    total: z.number().describe("Valor cobrado: aluguel + entrega + taxa de serviço + caução."),
    status: OrderStatus,
    history: z.array(z.object({ status: OrderStatus, at: z.number().int() })),
    payment: OrderPayment,
    reviewed: z.boolean(),
    unread: z.number().int().describe("Mensagens não lidas por quem fez a requisição."),
    createdAt: z.number().int(),
  })
  .meta({ id: "Order", description: "Pedido de aluguel." });

export const Message = z
  .object({ id: Id, orderId: Id, from: Role, text: z.string(), at: z.number().int() })
  .meta({ id: "Message", description: "Mensagem do chat do pedido." });

export const Review = z
  .object({
    id: Id,
    businessId: Id,
    orderId: Id,
    author: z.string(),
    authorPhoto: z.string().nullable(),
    stars: z.number().int().min(1).max(5),
    text: z.string(),
    at: z.number().int(),
  })
  .meta({ id: "Review", description: "Avaliação de uma locadora." });

export const PaymentMethod = z
  .object({
    id: Id,
    cardId: z.string().describe("Id do cartão no Mercado Pago, para createCardToken({ cardId }) junto com o CVV."),
    brand: z.string(),
    paymentMethodId: z.string().describe("Id do meio no Mercado Pago, como master ou visa."),
    issuerId: z.string().nullable(),
    firstSix: z.string(),
    lastFour: z.string(),
    expMonth: z.number().int(),
    expYear: z.number().int(),
    holder: z.string(),
    isDefault: z.boolean(),
  })
  .meta({ id: "PaymentMethod", description: "Cartão salvo no Mercado Pago." });

export type MeOut = z.output<typeof Me>;
export type BusinessOut = z.output<typeof Business>;
export type ItemOut = z.output<typeof Item>;
export type OrderOut = z.output<typeof Order>;
export type MessageOut = z.output<typeof Message>;
export type ReviewOut = z.output<typeof Review>;
export type PaymentMethodOut = z.output<typeof PaymentMethod>;

/* ---------- Rows and serializers ---------- */

export type UserRow = {
  id: string;
  role: "customer" | "business";
  name: string;
  email: string | null;
  phone: string | null;
  password_hash: string | null;
  cpf: string | null;
  photo_url: string | null;
  prefs: { orders: boolean; promos: boolean; sounds: boolean };
  tip_dismissed: boolean;
  recent_searches: string[];
  active_address_id: string | null;
  mp_customer_id: string | null;
  created_at: Date;
};

export type BusinessRow = {
  id: string;
  owner_id: string;
  name: string;
  tagline: string;
  about: string;
  category: z.output<typeof Category>;
  cover_url: string;
  logo_url: string | null;
  phone: string;
  address_label: string;
  address_detail: string;
  lat: number;
  lng: number;
  opens: string;
  closes: string;
  delivery_fee_cents: number;
  radius_km: number;
  rating_sum: number;
  rating_count: number;
  created_at: Date;
  distance_km?: number;
};

export type ItemRow = {
  id: string;
  business_id: string;
  name: string;
  category: z.output<typeof Category>;
  price_cents: number;
  deposit_cents: number;
  description: string;
  specs: string[];
  image_url: string;
  quantity: number;
  available: boolean;
  rentals: number;
  created_at: Date;
};

export type OrderRow = {
  id: string;
  number: number;
  customer_id: string;
  business_id: string;
  item_id: string;
  item_name: string;
  item_image_url: string;
  price_cents: number;
  start_date: string;
  days: number;
  mode: "delivery" | "pickup";
  address_label: string;
  address_detail: string;
  lat: number;
  lng: number;
  rent_cents: number;
  delivery_fee_cents: number;
  service_fee_cents: number;
  deposit_cents: number;
  total_cents: number;
  status: z.output<typeof OrderStatus>;
  payment_method: "card" | "pix";
  payment_label: string;
  installments: number;
  payment_status: z.output<typeof PaymentStatus>;
  payment_detail: string | null;
  mp_payment_id: string | null;
  pix_qr_code: string | null;
  pix_qr_base64: string | null;
  pix_ticket_url: string | null;
  pix_expires_at: Date | null;
  refunded_cents: number;
  refund_due_cents: number;
  reviewed: boolean;
  created_at: Date;
  owner_id: string;
  business_name: string;
  business_logo: string | null;
  business_phone: string;
  business_label: string;
  business_detail: string;
  business_lat: number;
  business_lng: number;
  customer_name: string;
  customer_photo: string | null;
  customer_phone: string | null;
  history: { status: z.output<typeof OrderStatus>; at: number }[];
  unread: number;
};

export type PaymentMethodRow = {
  id: string;
  mp_card_id: string;
  payment_method_id: string;
  brand: string;
  issuer_id: string | null;
  first_six: string;
  last_four: string;
  exp_month: number;
  exp_year: number;
  holder: string;
  is_default: boolean;
};

export function serializeBusiness(row: BusinessRow): BusinessOut {
  return {
    id: row.id,
    ownerId: row.owner_id,
    name: row.name,
    tagline: row.tagline,
    about: row.about,
    category: row.category,
    cover: row.cover_url,
    logo: row.logo_url,
    phone: row.phone,
    address: { label: row.address_label, detail: row.address_detail, lat: row.lat, lng: row.lng },
    opens: row.opens,
    closes: row.closes,
    deliveryFee: toReais(row.delivery_fee_cents),
    radiusKm: row.radius_km,
    rating: row.rating_count ? Math.round((row.rating_sum / row.rating_count) * 10) / 10 : 0,
    reviewCount: row.rating_count,
    createdAt: row.created_at.getTime(),
    ...(row.distance_km === undefined ? {} : { distanceKm: Math.round(row.distance_km * 100) / 100 }),
  };
}

export function serializeItem(row: ItemRow): ItemOut {
  return {
    id: row.id,
    businessId: row.business_id,
    name: row.name,
    category: row.category,
    price: toReais(row.price_cents),
    deposit: toReais(row.deposit_cents),
    description: row.description,
    specs: row.specs,
    image: row.image_url,
    quantity: row.quantity,
    available: row.available,
    rentals: row.rentals,
    createdAt: row.created_at.getTime(),
  };
}

export function serializeOrder(row: OrderRow): OrderOut {
  const waitingPix = row.status === "awaiting_payment" && row.pix_qr_code && row.pix_expires_at;
  return {
    id: row.id,
    code: `#${row.number}`,
    customerId: row.customer_id,
    businessId: row.business_id,
    itemId: row.item_id,
    item: { id: row.item_id, name: row.item_name, image: row.item_image_url },
    business: {
      id: row.business_id,
      name: row.business_name,
      logo: row.business_logo,
      phone: row.business_phone,
      address: { label: row.business_label, detail: row.business_detail, lat: row.business_lat, lng: row.business_lng },
    },
    customer: { id: row.customer_id, name: row.customer_name, photo: row.customer_photo, phone: row.customer_phone },
    start: row.start_date,
    days: row.days,
    mode: row.mode,
    address: { label: row.address_label, detail: row.address_detail, lat: row.lat, lng: row.lng },
    rent: toReais(row.rent_cents),
    deliveryFee: toReais(row.delivery_fee_cents),
    serviceFee: toReais(row.service_fee_cents),
    deposit: toReais(row.deposit_cents),
    total: toReais(row.total_cents),
    status: row.status,
    history: row.history,
    payment: {
      method: row.payment_method,
      label: row.payment_label,
      installments: row.installments,
      status: row.payment_status,
      detail: row.payment_detail,
      refunded: toReais(row.refunded_cents),
      pix: waitingPix
        ? {
            qrCode: row.pix_qr_code!,
            qrCodeBase64: row.pix_qr_base64 ?? "",
            ticketUrl: row.pix_ticket_url,
            expiresAt: row.pix_expires_at!.getTime(),
          }
        : null,
    },
    reviewed: row.reviewed,
    unread: row.unread,
    createdAt: row.created_at.getTime(),
  };
}

export function serializePaymentMethod(row: PaymentMethodRow): PaymentMethodOut {
  return {
    id: row.id,
    cardId: row.mp_card_id,
    brand: row.brand,
    paymentMethodId: row.payment_method_id,
    issuerId: row.issuer_id,
    firstSix: row.first_six,
    lastFour: row.last_four,
    expMonth: row.exp_month,
    expYear: row.exp_year,
    holder: row.holder,
    isDefault: row.is_default,
  };
}

/* ---------- Loaders ---------- */

export async function loadMe(userId: string, db?: Db): Promise<MeOut> {
  const user = await one<UserRow>("select * from users where id = $1", [userId], db);
  if (!user) throw new Error(`user ${userId} not found`);
  const [addresses, favorites, business] = await Promise.all([
    many<{ id: string; label: string; detail: string; lat: number; lng: number }>(
      "select id, label, detail, lat, lng from addresses where user_id = $1 order by created_at",
      [userId],
      db,
    ),
    many<{ target_id: string }>("select target_id from favorites where user_id = $1 order by created_at desc", [userId], db),
    one<{ id: string }>("select id from businesses where owner_id = $1", [userId], db),
  ]);
  return {
    id: user.id,
    role: user.role,
    name: user.name,
    email: user.email,
    phone: user.phone,
    cpf: user.cpf,
    hasPassword: user.password_hash !== null,
    photo: user.photo_url,
    prefs: user.prefs,
    tipDismissed: user.tip_dismissed,
    recentSearches: user.recent_searches,
    addresses,
    activeAddressId: user.active_address_id,
    favoriteIds: favorites.map((f) => f.target_id),
    businessId: business?.id ?? null,
    createdAt: user.created_at.getTime(),
  };
}

export async function loadBusiness(id: string, db?: Db) {
  const row = await one<BusinessRow>("select * from businesses where id = $1", [id], db);
  return row ? serializeBusiness(row) : null;
}

export async function loadBusinessOf(ownerId: string, db?: Db) {
  const row = await one<BusinessRow>("select * from businesses where owner_id = $1", [ownerId], db);
  return row ? serializeBusiness(row) : null;
}

/** Orders joined with the data every screen needs. $1 is the viewer role, which decides what counts as unread. */
export const ORDER_SELECT = `
  select o.*,
         b.owner_id, b.name as business_name, b.logo_url as business_logo, b.phone as business_phone,
         b.address_label as business_label, b.address_detail as business_detail, b.lat as business_lat, b.lng as business_lng,
         u.name as customer_name, u.photo_url as customer_photo, u.phone as customer_phone,
         coalesce((select json_agg(json_build_object('status', e.status, 'at', floor(extract(epoch from e.created_at) * 1000)) order by e.id)
                     from order_events e where e.order_id = o.id), '[]'::json) as history,
         (select count(*) from messages m
           where m.order_id = o.id and m.sender_role <> $1
             and m.created_at > case when $1 = 'customer' then o.read_customer_at else o.read_business_at end)::int as unread
    from orders o
    join businesses b on b.id = o.business_id
    join users u on u.id = o.customer_id`;

export async function loadOrder(id: string, viewerRole: "customer" | "business", db?: Db) {
  const row = await one<OrderRow>(`${ORDER_SELECT} where o.id = $2`, [viewerRole, id], db);
  return row;
}
