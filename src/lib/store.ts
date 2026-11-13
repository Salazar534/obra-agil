import { useEffect, useSyncExternalStore } from "react";
import { api, ApiError, handleUnauthorized } from "./api.ts";
import { chime, setSoundEnabled } from "./feedback.ts";
import { DEFAULT_ADDRESS, distanceKm, type Address, type LatLng } from "./geo.ts";
import { fileToJpeg } from "./image.ts";
import { toast } from "./toast.ts";
import type {
  Account,
  Business,
  CategoryId,
  Installments,
  Item,
  Message,
  Order,
  OrderStatus,
  PaymentMethod,
  PublicConfig,
  Review,
  Role,
  Session,
} from "./types.ts";

type RequestStatus = "loading" | "ready" | "error";

export type State = {
  phase: "booting" | "ready" | "offline";
  config: PublicConfig | null;
  me: Account | null;
  business: Business | null;
  businesses: Record<string, Business>;
  items: Record<string, Item>;
  orders: Record<string, Order>;
  messages: Record<string, Message[]>;
  reviews: Record<string, Review[]>;
  payments: PaymentMethod[];
  ownItems: string[];
  nearby: { key: string; businesses: string[]; items: string[] } | null;
  requests: Record<string, RequestStatus>;
};

function blank(): State {
  return {
    phase: "booting",
    config: null,
    me: null,
    business: null,
    businesses: {},
    items: {},
    orders: {},
    messages: {},
    reviews: {},
    payments: [],
    ownItems: [],
    nearby: null,
    requests: {},
  };
}

let state = blank();
const listeners = new Set<() => void>();

function set(patch: Partial<State> | ((current: State) => Partial<State>)) {
  state = { ...state, ...(typeof patch === "function" ? patch(state) : patch) };
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useDB() {
  return useSyncExternalStore(subscribe, () => state);
}

export function getDB() {
  return state;
}

/* ---------- Cache helpers ---------- */

function mergeBusinesses(list: Business[]) {
  if (!list.length) return;
  set((s) => {
    const businesses = { ...s.businesses };
    for (const business of list) businesses[business.id] = business;
    const own = s.business && businesses[s.business.id];
    return { businesses, business: own ?? s.business };
  });
}

function mergeItems(list: Item[]) {
  if (!list.length) return;
  set((s) => {
    const items = { ...s.items };
    for (const item of list) items[item.id] = item;
    return { items };
  });
}

function upsertOrder(order: Order) {
  set((s) => ({ orders: { ...s.orders, [order.id]: order } }));
}

function appendMessage(message: Message) {
  set((s) => {
    const list = s.messages[message.orderId];
    if (!list || list.some((m) => m.id === message.id)) return {};
    return { messages: { ...s.messages, [message.orderId]: [...list, message] } };
  });
}

/* ---------- Requests ---------- */

async function tracked<T>(key: string, run: () => Promise<T>) {
  set((s) => ({ requests: { ...s.requests, [key]: "loading" } }));
  try {
    const result = await run();
    set((s) => ({ requests: { ...s.requests, [key]: "ready" } }));
    return result;
  } catch (error) {
    set((s) => ({ requests: { ...s.requests, [key]: "error" } }));
    throw error;
  }
}

/** Loads once per key while mounted; returns loading, ready or error. */
export function useRequest(key: string | null, run: () => Promise<unknown>): RequestStatus {
  const status = useDB().requests[key ?? ""];
  useEffect(() => {
    if (key && !status) void tracked(key, run).catch(() => {});
    // run is recreated every render; the key identifies the request.
  }, [key, status]); // eslint-disable-line react-hooks/exhaustive-deps
  return key ? (status ?? "loading") : "ready";
}

export function retry(key: string) {
  set((s) => {
    const requests = { ...s.requests };
    delete requests[key];
    return { requests };
  });
}

/* ---------- Selectors ---------- */

const GUEST: Account = {
  id: "guest",
  role: "customer",
  name: "Visitante",
  email: null,
  phone: null,
  cpf: null,
  hasPassword: false,
  photo: null,
  prefs: { orders: true, promos: false, sounds: true },
  tipDismissed: true,
  recentSearches: [],
  addresses: [],
  activeAddressId: null,
  favoriteIds: [],
  businessId: null,
  createdAt: 0,
};

export function useMe() {
  return useDB().me ?? GUEST;
}

export function businessOf(db: State, id: string | null | undefined) {
  if (!id) return undefined;
  return db.businesses[id] ?? (db.business?.id === id ? db.business : undefined);
}

export function itemOf(db: State, id: string) {
  return db.items[id];
}

export function originOf(db: State, account: Account): Address {
  if (account.role === "business") return db.business?.address ?? DEFAULT_ADDRESS;
  return account.addresses.find((a) => a.id === account.activeAddressId) ?? account.addresses[account.addresses.length - 1] ?? DEFAULT_ADDRESS;
}

export type Nearby = { business: Business; km: number };
export type Listing = { item: Item; business: Business; km: number };

export function nearbyKey(origin: LatLng) {
  return `nearby:${origin.lat.toFixed(4)},${origin.lng.toFixed(4)}`;
}

export function nearbyBusinesses(db: State, origin: LatLng): Nearby[] {
  if (!db.nearby) return [];
  return db.nearby.businesses
    .flatMap((id) => (db.businesses[id] ? [{ business: db.businesses[id], km: distanceKm(origin, db.businesses[id].address) }] : []))
    .sort((a, b) => a.km - b.km);
}

export function listings(db: State, origin: LatLng): Listing[] {
  const near = new Map(nearbyBusinesses(db, origin).map((n) => [n.business.id, n]));
  return (db.nearby?.items ?? []).flatMap((id) => {
    const item = db.items[id];
    const entry = item ? near.get(item.businessId) : undefined;
    return item && entry ? [{ item, business: entry.business, km: entry.km }] : [];
  });
}

/** Stores and items around the address, reloaded whenever the address changes. */
export function useNearby(origin: LatLng) {
  const db = useDB();
  const key = nearbyKey(origin);
  const current = db.nearby?.key === key;
  const status = db.requests[key];
  useEffect(() => {
    if (!current && status !== "loading") void tracked(key, () => actions.loadNearby(origin)).catch(() => {});
  }, [key, current]); // eslint-disable-line react-hooks/exhaustive-deps
  return {
    status: current ? ("ready" as const) : status === "error" ? ("error" as const) : ("loading" as const),
    near: current ? nearbyBusinesses(db, origin) : [],
    all: current ? listings(db, origin) : [],
    reload: () => void tracked(key, () => actions.loadNearby(origin)).catch(() => {}),
  };
}

export function isOpen(business: Business, now = new Date()) {
  const minutes = now.getHours() * 60 + now.getMinutes();
  const [oh, om] = business.opens.split(":").map(Number);
  const [ch, cm] = business.closes.split(":").map(Number);
  return minutes >= oh * 60 + om && minutes < ch * 60 + cm;
}

export function isFavorite(db: State, id: string) {
  return db.me?.favoriteIds.includes(id) ?? false;
}

export function ordersOf(db: State) {
  return Object.values(db.orders).sort((a, b) => b.createdAt - a.createdAt);
}

export const activeStatuses: OrderStatus[] = ["awaiting_payment", "pending", "accepted", "on_the_way", "delivered"];

export function statusText(order: Pick<Order, "status" | "mode">, role: Role = "customer") {
  const pickup = order.mode === "pickup";
  const map: Record<OrderStatus, string> = {
    awaiting_payment: "Aguardando pagamento",
    pending: role === "business" ? "Aguarda resposta" : "Aguardando loja",
    accepted: "Confirmado",
    on_the_way: pickup ? "Pronto para retirada" : "A caminho",
    delivered: pickup ? "Com você" : "Entregue",
    returned: "Concluído",
    declined: "Recusado",
    cancelled: "Cancelado",
  };
  return map[order.status];
}

export function shortName(name: string) {
  const parts = name.trim().split(/\s+/);
  return parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1][0]}.` : name;
}

/* ---------- Live updates ---------- */

const expecting = new Map<string, OrderStatus>();
let viewingChat: string | null = null;
let source: EventSource | null = null;
let reconnectTimer = 0;
let watchdog = 0;
let lastBeat = 0;

function notify(text: string, kind: "success" | "info" = "info") {
  if (!state.me?.prefs.orders) return;
  toast(text, kind);
  chime(kind === "success" ? "success" : "notify");
}

function onOrderEvent(order: Order) {
  const previous = state.orders[order.id];
  upsertOrder(order);
  const me = state.me;
  if (!me) return;
  if (me.role === "business" && previous && !previous.reviewed && order.reviewed) {
    void actions.loadBusiness(order.business.id).catch(() => {});
    notify(`${shortName(order.customer.name)} avaliou sua loja`, "success");
  }
  if (previous?.status === order.status) return;
  if (expecting.get(order.id) === order.status) {
    expecting.delete(order.id);
    return;
  }
  const pickup = order.mode === "pickup";
  if (me.role === "business") {
    if (!previous && order.status === "pending") notify(`Novo pedido de ${shortName(order.customer.name)}`);
    else if (order.status === "cancelled") notify(`${shortName(order.customer.name)} cancelou o pedido ${order.code}`);
    return;
  }
  if (!previous) return;
  const messages: Partial<Record<OrderStatus, string>> = {
    pending: "Pagamento confirmado! A loja já recebeu o pedido.",
    accepted: `${order.business.name} confirmou seu pedido`,
    on_the_way: pickup ? `${order.item.name} está pronto para retirada` : `${order.item.name} saiu para entrega`,
    delivered: pickup ? "Retirada confirmada. Bom trabalho!" : "Entregue! Bom trabalho na obra.",
    returned: "Devolução confirmada. A caução foi estornada.",
    declined: `${order.business.name} recusou o pedido. O valor foi estornado.`,
    cancelled: previous.status === "awaiting_payment" ? "O Pix expirou e o pedido foi cancelado." : "O pedido foi cancelado e o valor estornado.",
  };
  const text = messages[order.status];
  if (text) notify(text, order.status === "pending" || order.status === "returned" ? "success" : "info");
}

function onMessageEvent(message: Message) {
  appendMessage(message);
  const me = state.me;
  if (!me || message.from === me.role) return;
  const order = state.orders[message.orderId];
  if (viewingChat === message.orderId) {
    void api.post(`/orders/${message.orderId}/read`).catch(() => {});
    return;
  }
  if (!order) return;
  upsertOrder({ ...order, unread: order.unread + 1 });
  const who = me.role === "customer" ? order.business.name : shortName(order.customer.name);
  notify(`${who}: ${message.text.length > 60 ? `${message.text.slice(0, 60)}…` : message.text}`);
}

/** The server sends a ping every 25 s; a connection silent for longer is dead (server restart, proxy, network change). */
const SILENCE_LIMIT = 70_000;

/** catchUp: reload orders once connected, because events may have been missed while disconnected. */
function startLive(catchUp = false) {
  if (source || typeof EventSource === "undefined") return;
  const live = new EventSource("/api/events");
  source = live;
  lastBeat = Date.now();
  const beat = () => {
    lastBeat = Date.now();
  };
  live.addEventListener("ping", beat);
  live.addEventListener("order", (event) => {
    beat();
    onOrderEvent(JSON.parse((event as MessageEvent<string>).data) as Order);
  });
  live.addEventListener("message", (event) => {
    beat();
    onMessageEvent(JSON.parse((event as MessageEvent<string>).data) as Message);
  });
  live.onopen = () => {
    beat();
    if (catchUp) void actions.loadOrders().catch(() => {});
    catchUp = true;
  };
  live.onerror = () => {
    if (live.readyState === EventSource.CLOSED) restartLive(5000);
  };
  watchdog = window.setInterval(() => {
    if (Date.now() - lastBeat > SILENCE_LIMIT) restartLive(0);
  }, 15_000);
}

function restartLive(delay: number) {
  stopLive();
  reconnectTimer = window.setTimeout(() => state.me && startLive(true), delay);
}

function stopLive() {
  window.clearTimeout(reconnectTimer);
  window.clearInterval(watchdog);
  source?.close();
  source = null;
}

window.addEventListener("online", () => {
  if (source) restartLive(0);
});
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && source && Date.now() - lastBeat > 35_000) restartLive(0);
});

export function setViewingChat(orderId: string | null) {
  viewingChat = orderId;
}

/* ---------- Session ---------- */

function applySession(session: Session) {
  set((s) => ({
    me: session.user,
    business: session.business,
    businesses: session.business ? { ...s.businesses, [session.business.id]: session.business } : s.businesses,
  }));
  setSoundEnabled(session.user.prefs.sounds);
  startLive();
  void tracked("orders", actions.loadOrders).catch(() => {});
  if (session.user.role === "customer") void tracked("payments", actions.loadPayments).catch(() => {});
  else void tracked("own-items", actions.loadOwnItems).catch(() => {});
}

function clearSession() {
  stopLive();
  expecting.clear();
  set({ ...blank(), phase: "ready", config: state.config });
}

handleUnauthorized(() => {
  if (!state.me) return;
  clearSession();
  toast("Sua sessão terminou. Entre de novo.", "info");
});

export type SignUpProfile = {
  role: Role;
  name: string;
  address: Address;
  business?: { name: string; category: CategoryId };
};

export type CardPayment = {
  method: "card";
  token: string;
  paymentMethodId: string;
  issuerId: string | null;
  installments: number;
  savedCardId?: string;
};

export type PlaceOrderInput = {
  itemId: string;
  start: string;
  days: number;
  mode: Order["mode"];
  address?: Address;
  payment: CardPayment | { method: "pix" };
  payer?: { email?: string; cpf?: string };
};

export type ItemInput = Pick<Item, "name" | "category" | "price" | "deposit" | "description" | "specs" | "image" | "quantity" | "available">;

/* ---------- Actions ---------- */

export const actions = {
  async boot() {
    set({ phase: "booting" });
    try {
      set({ config: await api.get<PublicConfig>("/config") });
    } catch {
      set({ phase: "offline" });
      return;
    }
    try {
      applySession(await api.auth<Session>("GET", "/auth/me"));
    } catch (error) {
      if (!(error instanceof ApiError && error.status === 401)) {
        set({ phase: "offline" });
        return;
      }
    }
    set({ phase: "ready" });
  },

  /** Enters the app with a session the server already opened, so screens can animate the switch. */
  enter(session: Session) {
    applySession(session);
  },

  signIn(email: string, password: string) {
    return api.auth<Session>("POST", "/auth/login", { email, password });
  },

  register(input: SignUpProfile & { email: string; password: string }) {
    return api.auth<Session>("POST", "/auth/register", input);
  },

  phoneStart(phone: string) {
    return api.auth<{ resendIn: number }>("POST", "/auth/phone/start", { phone });
  },

  phoneVerify(phone: string, code: string) {
    return api.auth<({ status: "signed_in" } & Session) | { status: "new"; ticket: string }>("POST", "/auth/phone/verify", { phone, code });
  },

  phoneRegister(input: SignUpProfile & { ticket: string; email?: string }) {
    return api.auth<Session>("POST", "/auth/phone/register", input);
  },

  forgotPassword(email: string) {
    return api.auth<void>("POST", "/auth/password/forgot", { email });
  },

  resetPassword(token: string, password: string) {
    return api.auth<Session>("POST", "/auth/password/reset", { token, password });
  },

  /** wrap lets the screen animate the switch back to the welcome screen. */
  async signOut(wrap: (update: () => void) => void = (update) => update()) {
    await api.post("/auth/logout").catch(() => {});
    wrap(clearSession);
  },

  async updateAccount(patch: Partial<Pick<Account, "name" | "email" | "cpf" | "photo" | "tipDismissed">> & { prefs?: Partial<Account["prefs"]> }) {
    const previous = state.me;
    if (previous) set({ me: { ...previous, ...patch, prefs: { ...previous.prefs, ...patch.prefs } } });
    try {
      const me = await api.patch<Account>("/me", patch);
      set({ me });
      setSoundEnabled(me.prefs.sounds);
      return me;
    } catch (error) {
      set({ me: previous });
      throw error;
    }
  },

  async addAddress(address: Address) {
    set({ me: await api.post<Account>("/me/addresses", { label: address.label, detail: address.detail, lat: address.lat, lng: address.lng }) });
  },

  async setActiveAddress(id: string) {
    const previous = state.me;
    if (previous) set({ me: { ...previous, activeAddressId: id } });
    try {
      set({ me: await api.put<Account>("/me/addresses/active", { id }) });
    } catch (error) {
      set({ me: previous });
      throw error;
    }
  },

  async removeAddress(id: string) {
    set({ me: await api.del<Account>(`/me/addresses/${id}`) });
  },

  async toggleFavorite(kind: "item" | "business", id: string) {
    const me = state.me;
    if (!me) return false;
    const saved = !me.favoriteIds.includes(id);
    set({ me: { ...me, favoriteIds: saved ? [id, ...me.favoriteIds] : me.favoriteIds.filter((x) => x !== id) } });
    try {
      if (saved) await api.put(`/me/favorites/${kind}/${id}`);
      else await api.del(`/me/favorites/${kind}/${id}`);
    } catch (error) {
      const current = state.me;
      if (current) set({ me: { ...current, favoriteIds: me.favoriteIds } });
      throw error;
    }
    return saved;
  },

  async loadFavorites() {
    const data = await api.get<{ items: { item: Item; business: Business }[]; businesses: Business[] }>("/me/favorites");
    mergeBusinesses([...data.businesses, ...data.items.map((entry) => entry.business)]);
    mergeItems(data.items.map((entry) => entry.item));
  },

  async addRecent(query: string) {
    const q = query.trim();
    const me = state.me;
    if (!q || !me) return;
    set({ me: { ...me, recentSearches: [q, ...me.recentSearches.filter((x) => x.toLowerCase() !== q.toLowerCase())].slice(0, 6) } });
    const { recentSearches } = await api.post<{ recentSearches: string[] }>("/me/searches", { query: q });
    const current = state.me;
    if (current) set({ me: { ...current, recentSearches } });
  },

  async clearRecent() {
    const me = state.me;
    if (me) set({ me: { ...me, recentSearches: [] } });
    await api.del("/me/searches");
  },

  startPhoneChange(phone: string) {
    return api.post<{ resendIn: number }>("/me/phone/start", { phone });
  },

  async verifyPhoneChange(phone: string, code: string) {
    set({ me: await api.post<Account>("/me/phone/verify", { phone, code }) });
  },

  async removePhone() {
    set({ me: await api.del<Account>("/me/phone") });
  },

  async changePassword(current: string | undefined, password: string) {
    await api.post("/me/password", { current, password });
    const me = state.me;
    if (me) set({ me: { ...me, hasPassword: true } });
  },

  async uploadPhoto(file: File, kind: "avatar" | "logo" | "cover" | "item") {
    const max = kind === "cover" ? 1800 : kind === "item" ? 1400 : 800;
    return api.upload(kind, await fileToJpeg(file, max));
  },

  async loadNearby(origin: LatLng) {
    const data = await api.get<{ businesses: Business[]; items: Item[] }>(`/explore?lat=${origin.lat}&lng=${origin.lng}`);
    mergeBusinesses(data.businesses);
    mergeItems(data.items);
    set({ nearby: { key: nearbyKey(origin), businesses: data.businesses.map((b) => b.id), items: data.items.map((i) => i.id) } });
  },

  async search(origin: LatLng, params: { q?: string; category?: CategoryId; sort: "near" | "price" | "rating" }, signal?: AbortSignal) {
    const query = new URLSearchParams({ lat: String(origin.lat), lng: String(origin.lng), sort: params.sort });
    if (params.q?.trim()) query.set("q", params.q.trim());
    if (params.category) query.set("category", params.category);
    const data = await api.get<{ results: { item: Item; business: Business }[] }>(`/search?${query}`);
    if (signal?.aborted) return [];
    mergeBusinesses(data.results.map((r) => r.business));
    mergeItems(data.results.map((r) => r.item));
    return data.results.map((r) => ({ ...r, km: distanceKm(origin, r.business.address) }));
  },

  async loadBusiness(id: string) {
    const data = await api.get<{ business: Business; items: Item[]; reviews: Review[] }>(`/businesses/${id}`);
    mergeBusinesses([data.business]);
    set((s) => {
      const items = { ...s.items };
      for (const [key, item] of Object.entries(items)) if (item.businessId === id) delete items[key];
      for (const item of data.items) items[item.id] = item;
      return { items, reviews: { ...s.reviews, [id]: data.reviews } };
    });
    return data;
  },

  async loadItem(id: string) {
    const data = await api.get<{ item: Item; business: Business }>(`/items/${id}`);
    mergeBusinesses([data.business]);
    mergeItems([data.item]);
  },

  async loadOwnItems() {
    const list = await api.get<Item[]>("/my/items");
    mergeItems(list);
    set({ ownItems: list.map((item) => item.id) });
  },

  async saveItem(input: ItemInput & { id?: string }) {
    const { id, ...body } = input;
    if (id) {
      const item = await api.patch<Item>(`/my/items/${id}`, body);
      mergeItems([item]);
      return { item, first: false };
    }
    const result = await api.post<{ item: Item; first: boolean }>("/my/items", body);
    mergeItems([result.item]);
    set((s) => ({ ownItems: [result.item.id, ...s.ownItems] }));
    return result;
  },

  async deleteItem(id: string) {
    await api.del(`/my/items/${id}`);
    set((s) => {
      const items = { ...s.items };
      delete items[id];
      return { items, ownItems: s.ownItems.filter((x) => x !== id) };
    });
  },

  async setItemAvailable(id: string, available: boolean) {
    const previous = state.items[id];
    if (previous) mergeItems([{ ...previous, available }]);
    try {
      mergeItems([await api.patch<Item>(`/my/items/${id}`, { available })]);
    } catch (error) {
      if (previous) mergeItems([previous]);
      throw error;
    }
  },

  async updateBusiness(patch: Partial<Omit<Business, "id" | "ownerId" | "rating" | "reviewCount" | "createdAt" | "distanceKm">>) {
    const business = await api.patch<Business>("/my/business", patch);
    set((s) => ({ business, businesses: { ...s.businesses, [business.id]: business } }));
    return business;
  },

  async loadOrders() {
    const list = await api.get<Order[]>("/orders");
    set({ orders: Object.fromEntries(list.map((order) => [order.id, order])) });
  },

  async loadOrder(id: string) {
    upsertOrder(await api.get<Order>(`/orders/${id}`));
  },

  async placeOrder(input: PlaceOrderInput) {
    const order = await api.post<Order>("/orders", input);
    upsertOrder(order);
    return order;
  },

  async setOrderStatus(id: string, status: OrderStatus) {
    expecting.set(id, status);
    try {
      const order = await api.post<Order>(`/orders/${id}/status`, { status });
      upsertOrder(order);
      return order;
    } catch (error) {
      expecting.delete(id);
      throw error;
    }
  },

  async refreshPayment(id: string) {
    const order = await api.post<Order>(`/orders/${id}/payment/refresh`);
    const previous = state.orders[id];
    upsertOrder(order);
    return previous?.status !== order.status;
  },

  async loadMessages(orderId: string) {
    const list = await api.get<Message[]>(`/orders/${orderId}/messages`);
    set((s) => ({ messages: { ...s.messages, [orderId]: list } }));
  },

  async sendMessage(orderId: string, text: string) {
    appendMessage(await api.post<Message>(`/orders/${orderId}/messages`, { text }));
  },

  async markRead(orderId: string) {
    const order = state.orders[orderId];
    if (order?.unread) upsertOrder({ ...order, unread: 0 });
    await api.post(`/orders/${orderId}/read`).catch(() => {});
  },

  async review(orderId: string, stars: number, text: string) {
    const review = await api.post<Review>(`/orders/${orderId}/review`, { stars, text });
    const order = state.orders[orderId];
    if (order) upsertOrder({ ...order, reviewed: true });
    set((s) => ({ reviews: { ...s.reviews, [review.businessId]: [review, ...(s.reviews[review.businessId] ?? [])] } }));
    return review;
  },

  async loadPayments() {
    set({ payments: await api.get<PaymentMethod[]>("/payment-methods") });
  },

  async addCard(token: string) {
    const payments = await api.post<PaymentMethod[]>("/payment-methods", { token });
    set({ payments });
    return payments;
  },

  async removeCard(id: string) {
    set({ payments: await api.del<PaymentMethod[]>(`/payment-methods/${id}`) });
  },

  async setDefaultCard(id: string) {
    set({ payments: await api.patch<PaymentMethod[]>(`/payment-methods/${id}`, { isDefault: true }) });
  },

  installments(amount: number, bin: string) {
    return api.get<Installments>(`/payments/installments?amount=${amount.toFixed(2)}&bin=${bin}`);
  },
};
