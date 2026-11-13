import type { CategoryId } from "./catalog.ts";
import type { Address, LatLng } from "./geo.ts";

export type { Address, CategoryId, LatLng };

export type Role = "customer" | "business";

export type Prefs = { orders: boolean; promos: boolean; sounds: boolean };

export type SavedAddress = Address & { id: string };

export type Account = {
  id: string;
  role: Role;
  name: string;
  email: string | null;
  phone: string | null;
  cpf: string | null;
  hasPassword: boolean;
  photo: string | null;
  prefs: Prefs;
  tipDismissed: boolean;
  recentSearches: string[];
  addresses: SavedAddress[];
  activeAddressId: string | null;
  favoriteIds: string[];
  businessId: string | null;
  createdAt: number;
};

export type Business = {
  id: string;
  ownerId: string;
  name: string;
  tagline: string;
  about: string;
  category: CategoryId;
  cover: string;
  logo: string | null;
  phone: string;
  address: Address;
  opens: string;
  closes: string;
  deliveryFee: number;
  radiusKm: number;
  rating: number;
  reviewCount: number;
  createdAt: number;
  distanceKm?: number;
};

export type Item = {
  id: string;
  businessId: string;
  name: string;
  category: CategoryId;
  price: number;
  deposit: number;
  description: string;
  specs: string[];
  image: string;
  quantity: number;
  available: boolean;
  rentals: number;
  createdAt: number;
};

export type OrderStatus = "awaiting_payment" | "pending" | "accepted" | "on_the_way" | "delivered" | "returned" | "declined" | "cancelled";

export type PaymentStatus = "pending" | "approved" | "rejected" | "cancelled" | "refunded" | "partially_refunded";

export type OrderPayment = {
  method: "card" | "pix";
  label: string;
  installments: number;
  status: PaymentStatus;
  detail: string | null;
  refunded: number;
  pix: { qrCode: string; qrCodeBase64: string; ticketUrl: string | null; expiresAt: number } | null;
};

export type Order = {
  id: string;
  code: string;
  customerId: string;
  businessId: string;
  itemId: string;
  item: { id: string; name: string; image: string };
  business: { id: string; name: string; logo: string | null; phone: string; address: Address };
  customer: { id: string; name: string; photo: string | null; phone: string | null };
  start: string;
  days: number;
  mode: "delivery" | "pickup";
  address: Address;
  rent: number;
  deliveryFee: number;
  serviceFee: number;
  deposit: number;
  total: number;
  status: OrderStatus;
  history: { status: OrderStatus; at: number }[];
  payment: OrderPayment;
  reviewed: boolean;
  unread: number;
  createdAt: number;
};

export type Message = { id: string; orderId: string; from: Role; text: string; at: number };

export type Review = {
  id: string;
  businessId: string;
  orderId: string;
  author: string;
  authorPhoto: string | null;
  stars: number;
  text: string;
  at: number;
};

export type PaymentMethod = {
  id: string;
  cardId: string;
  brand: string;
  paymentMethodId: string;
  issuerId: string | null;
  firstSix: string;
  lastFour: string;
  expMonth: number;
  expYear: number;
  holder: string;
  isDefault: boolean;
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

export type PublicConfig = {
  payments: { enabled: boolean; provider: "mercadopago"; publicKey: string | null; maxInstallments: number };
  sms: { enabled: boolean; mode: "twilio" | "console" | "disabled" };
  email: { enabled: boolean; mode: "smtp" | "console" | "disabled" };
  serviceFeeRate: number;
};

export type Session = { user: Account; business: Business | null };
