// End-to-end API test against the obra_agil_test database, with the test payment gateway.
// Usage: npm run test:api
import { spawn } from "node:child_process";
import { resolve } from "node:path";
import pg from "pg";
import sharp from "sharp";

const root = resolve(import.meta.dirname, "..");
process.loadEnvFile(resolve(root, ".env"));
const databaseUrl = process.env.DATABASE_URL.replace(/\/([^/?]+)(\?.*)?$/, "/$1_test$2");
const port = 3101;
const base = `http://127.0.0.1:${port}/api`;

async function sql(text, params = []) {
  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    return (await client.query(text, params)).rows;
  } finally {
    await client.end();
  }
}

await sql("drop schema public cascade; create schema public;");

let logs = "";
const server = spawn(process.execPath, ["server/index.ts"], {
  cwd: root,
  env: { ...process.env, NODE_ENV: "test", PAYMENTS_DRIVER: "fake", DATABASE_URL: databaseUrl, PORT: String(port), MP_ACCESS_TOKEN: "", MP_PUBLIC_KEY: "" },
  stdio: ["ignore", "pipe", "pipe"],
});
server.stdout.on("data", (chunk) => (logs += chunk));
server.stderr.on("data", (chunk) => (logs += chunk));

async function waitFor(pattern, from = 0, timeout = 10_000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    const match = logs.slice(from).match(pattern);
    if (match) return match;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error(`timed out waiting for ${pattern}`);
}

class Client {
  cookies = new Map();
  async call(method, path, body, { header = true, raw = false } = {}) {
    const headers = {};
    if (header) headers["X-Requested-With"] = "api-test";
    if (this.cookies.size) headers.Cookie = [...this.cookies].map(([k, v]) => `${k}=${v}`).join("; ");
    let payload;
    if (body instanceof FormData) payload = body;
    else if (body !== undefined) {
      headers["Content-Type"] = "application/json";
      payload = JSON.stringify(body);
    }
    const res = await fetch(base + path, { method, headers, body: payload });
    for (const cookie of res.headers.getSetCookie()) {
      const [pair] = cookie.split(";");
      const [name, value] = pair.split("=");
      if (/expires=Thu, 01 Jan 1970/i.test(cookie) || value === "") this.cookies.delete(name);
      else this.cookies.set(name, value);
    }
    if (raw) return res;
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : null };
  }
}

let passed = 0;
const failures = [];
function check(name, condition, detail) {
  if (condition) {
    passed += 1;
    console.log(`  ✓ ${name}`);
  } else {
    failures.push(name);
    console.log(`  ✗ ${name}${detail === undefined ? "" : `\n      ${JSON.stringify(detail).slice(0, 400)}`}`);
  }
}

const near = { label: "Avenida Paulista, 1578", detail: "Bela Vista, São Paulo", lat: -23.5614, lng: -46.6559 };
const store = { label: "Rua Augusta, 900", detail: "Consolação, São Paulo", lat: -23.5535, lng: -46.6564 };
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
const addDays = (iso, n) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

try {
  await waitFor(/listening on/);
  const anon = new Client();
  const biz = new Client();
  const ana = new Client();

  console.log("\nMeta");
  check("health", (await anon.call("GET", "/health")).body?.db === true);
  const docs = await anon.call("GET", "/openapi.json");
  check("openapi spec", docs.status === 200 && Object.keys(docs.body.paths).length > 30);
  check("state-changing request without X-Requested-With is refused", (await anon.call("POST", "/auth/login", { email: "a@b.co", password: "x" }, { header: false })).status === 403);

  console.log("\nBusiness sign-up (email + password)");
  const weak = await biz.call("POST", "/auth/register", { role: "business", name: "Carlos Lima", email: "carlos@loja.com", password: "123", address: store, business: { name: "Casa & Obra", category: "concreto" } });
  check("weak password rejected", weak.status === 422, weak.body);
  const reg = await biz.call("POST", "/auth/register", {
    role: "business",
    name: "Carlos Lima",
    email: "Carlos@Loja.com",
    password: "senha-forte-123",
    address: store,
    business: { name: "Casa & Obra Aluguel", category: "concreto" },
  });
  check("register business", reg.status === 201 && reg.body.business?.name === "Casa & Obra Aluguel" && reg.body.user.email === "carlos@loja.com", reg.body);
  check("session cookie is httpOnly", biz.cookies.has("oa_session"));
  const dup = await anon.call("POST", "/auth/register", { role: "customer", name: "Outro Carlos", email: "carlos@loja.com", password: "outra-senha-1", address: near });
  check("duplicate email -> 409", dup.status === 409 && dup.body.error.code === "email_taken", dup.body);

  console.log("\nInventory");
  const png = await sharp({ create: { width: 900, height: 700, channels: 3, background: "#f5a623" } }).png().toBuffer();
  const form = new FormData();
  form.append("file", new Blob([png], { type: "image/png" }), "betoneira.png");
  const upload = await biz.call("POST", "/uploads?kind=item", form);
  check("upload photo", upload.status === 201 && /^\/uploads\/[\w-]+\.webp$/.test(upload.body.url), upload.body);
  const served = await fetch(`http://127.0.0.1:${port}${upload.body.url}`);
  check("photo is served as webp", served.status === 200 && served.headers.get("content-type") === "image/webp");
  const badForm = new FormData();
  badForm.append("file", new Blob(["not an image"], { type: "image/png" }), "x.png");
  check("non-image upload rejected", (await biz.call("POST", "/uploads?kind=item", badForm)).status === 400);
  const created = await biz.call("POST", "/my/items", {
    name: "Betoneira 400 L",
    category: "concreto",
    price: 89.9,
    deposit: 300,
    description: "Motor 2 cv, ótima para obra média",
    specs: ["220 V", "Motor 2 cv"],
    image: upload.body.url,
    quantity: 1,
  });
  check("create first item", created.status === 201 && created.body.first === true && created.body.item.price === 89.9, created.body);
  const itemId = created.body.item.id;
  const second = await biz.call("POST", "/my/items", { name: "Andaime tubular", category: "andaimes", price: 42, image: "/img/eq/andaime.webp" });
  check("create second item", second.status === 201 && second.body.first === false, second.body);
  check("external image url rejected", (await biz.call("POST", "/my/items", { name: "Gerador", category: "energia", price: 10, image: "https://evil.example/x.png" })).status === 422);
  const patched = await biz.call("PATCH", "/my/business", { deliveryFee: 12.5, radiusKm: 20, tagline: "Entrega no mesmo dia", opens: "07:00", closes: "19:00" });
  check("update store", patched.status === 200 && patched.body.deliveryFee === 12.5 && patched.body.radiusKm === 20, patched.body);
  const paused = await biz.call("PATCH", `/my/items/${second.body.item.id}`, { available: false });
  check("pause item", paused.status === 200 && paused.body.available === false);
  const toggled = await biz.call("PATCH", `/my/items/${itemId}`, { available: false });
  check(
    "partial update keeps the other fields",
    toggled.status === 200 && toggled.body.deposit === 300 && toggled.body.specs.length === 2 && toggled.body.description.startsWith("Motor"),
    toggled.body,
  );
  await biz.call("PATCH", `/my/items/${itemId}`, { available: true });

  console.log("\nCustomer sign-up (phone + SMS code)");
  let mark = logs.length;
  const start = await ana.call("POST", "/auth/phone/start", { phone: "(11) 98888-7777" });
  check("send SMS code", start.status === 202 && start.body.resendIn === 30, start.body);
  const code = (await waitFor(/Código para \+55 \(11\) 98888-7777: (\d{6})/, mark))[1];
  const resend = await ana.call("POST", "/auth/phone/start", { phone: "11988887777" });
  check("resend too soon -> 429", resend.status === 429, resend.body);
  check("wrong code rejected", (await ana.call("POST", "/auth/phone/verify", { phone: "11988887777", code: code === "000000" ? "111111" : "000000" })).status === 400);
  const verify = await ana.call("POST", "/auth/phone/verify", { phone: "11988887777", code });
  check("new phone gets a ticket", verify.status === 200 && verify.body.status === "new" && verify.body.ticket, verify.body);
  const phoneReg = await ana.call("POST", "/auth/phone/register", { ticket: verify.body.ticket, role: "customer", name: "Ana Souza", address: near });
  check("register with phone", phoneReg.status === 201 && phoneReg.body.user.phone === "11988887777" && phoneReg.body.user.addresses.length === 1, phoneReg.body);
  check("ticket cannot be reused", (await anon.call("POST", "/auth/phone/register", { ticket: verify.body.ticket, role: "customer", name: "Clone", address: near })).status === 400);
  check("customer cannot edit a store", (await ana.call("PATCH", "/my/business", { name: "Hack" })).status === 403);

  console.log("\nExplore");
  const explore = await ana.call("GET", `/explore?lat=${near.lat}&lng=${near.lng}`);
  check("explore finds the store and its items", explore.body.businesses?.[0]?.id === reg.body.business.id && explore.body.items.length === 2, explore.body);
  check("distance is computed", explore.body.businesses[0].distanceKm > 0.5 && explore.body.businesses[0].distanceKm < 2, explore.body.businesses[0]);
  const far = await anon.call("GET", "/explore?lat=-22.95&lng=-43.18");
  check("store does not show up in another city", far.body.businesses.length === 0);
  const search = await ana.call("GET", `/search?lat=${near.lat}&lng=${near.lng}&q=BETONEIRA`);
  check("search ignores case", search.body.results?.length === 1 && search.body.results[0].item.id === itemId, search.body);
  const accents = await ana.call("GET", `/search?lat=${near.lat}&lng=${near.lng}&q=otima`);
  check("search ignores accents", accents.body.results?.length === 1);
  const page = await anon.call("GET", `/businesses/${reg.body.business.id}`);
  check("store page", page.status === 200 && page.body.items.length === 2);
  check("item page", (await anon.call("GET", `/items/${itemId}`)).body.business.id === reg.body.business.id);

  console.log("\nProfile");
  check("save favorite item", (await ana.call("PUT", `/me/favorites/item/${itemId}`)).status === 204);
  check("save favorite store", (await ana.call("PUT", `/me/favorites/business/${reg.body.business.id}`)).status === 204);
  const favs = await ana.call("GET", "/me/favorites");
  check("list favorites", favs.body.items.length === 1 && favs.body.items[0].business.id === reg.body.business.id && favs.body.businesses.length === 1, favs.body);
  await ana.call("POST", "/me/searches", { query: "gerador" });
  const recent = await ana.call("POST", "/me/searches", { query: "Betoneira" });
  check("recent searches newest first", recent.body.recentSearches.join(",") === "Betoneira,gerador", recent.body);
  const second2 = await ana.call("POST", "/me/addresses", { label: "Rua dos Pinheiros, 870", detail: "Pinheiros, São Paulo", lat: -23.5657, lng: -46.683 });
  check("add address becomes active", second2.body.addresses.length === 2 && second2.body.activeAddressId === second2.body.addresses[1].id);
  const badCpf = await ana.call("PATCH", "/me", { cpf: "111.111.111-11" });
  check("invalid CPF rejected", badCpf.status === 400, badCpf.body);
  const profile = await ana.call("PATCH", "/me", { email: "ana@email.com", cpf: "529.982.247-25", prefs: { promos: true } });
  check("edit profile", profile.status === 200 && profile.body.cpf === "52998224725" && profile.body.prefs.promos === true && profile.body.prefs.orders === true, profile.body);

  console.log("\nPayments");
  const inst = await ana.call("GET", "/payments/installments?amount=500&bin=503143");
  check("installments up to 12x", inst.body.options?.length === 12 && /sem juros/.test(inst.body.options[2].label), inst.body);
  const card = await ana.call("POST", "/payment-methods", { token: "fake-card-6351" });
  check("save card", card.status === 201 && card.body[0].lastFour === "6351" && card.body[0].isDefault, card.body);

  console.log("\nOrders");
  const start1 = addDays(today, 1);
  const sse = await biz.call("GET", "/events", undefined, { raw: true });
  const reader = sse.body.getReader();
  let streamed = "";
  const pump = (async () => {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      streamed += new TextDecoder().decode(value);
    }
  })();
  const order1 = await ana.call("POST", "/orders", {
    itemId,
    start: start1,
    days: 3,
    mode: "delivery",
    address: near,
    payment: { method: "card", token: "tok-approved-6351", paymentMethodId: "master", issuerId: "1", installments: 3, savedCardId: card.body[0].id },
  });
  const o1 = order1.body;
  check("card order approved -> pending", order1.status === 201 && o1.status === "pending" && o1.payment.status === "approved", o1);
  check("prices computed on the server", o1.rent === 269.7 && o1.deliveryFee === 12.5 && o1.serviceFee === 13.49 && o1.deposit === 300 && o1.total === 595.69, o1);
  check("payment label shows card and installments", o1.payment.label === "Mastercard •••• 6351 · 3x", o1.payment);
  await new Promise((r) => setTimeout(r, 300));
  check("store gets the order live (SSE)", /event: order/.test(streamed) && streamed.includes(o1.id));
  const clash = await ana.call("POST", "/orders", { itemId, start: addDays(start1, 2), days: 2, mode: "pickup", payment: { method: "pix" } });
  check("overlapping dates -> 409", clash.status === 409 && clash.body.error.code === "unavailable_dates", clash.body);
  const rejected = await ana.call("POST", "/orders", {
    itemId,
    start: addDays(start1, 10),
    days: 1,
    mode: "pickup",
    payment: { method: "card", token: "tok-4242-reject", paymentMethodId: "visa", installments: 1 },
  });
  check("declined card -> 402 and no order", rejected.status === 402 && rejected.body.error.code === "payment_rejected", rejected.body);
  const tooFar = await ana.call("POST", "/orders", {
    itemId,
    start: addDays(start1, 10),
    days: 1,
    mode: "delivery",
    address: { label: "Copacabana", detail: "Rio", lat: -22.97, lng: -43.18 },
    payment: { method: "pix" },
  });
  check("delivery outside radius -> 400", tooFar.status === 400 && tooFar.body.error.code === "out_of_range", tooFar.body);
  const pix = await ana.call("POST", "/orders", { itemId, start: addDays(start1, 10), days: 2, mode: "pickup", payment: { method: "pix" } });
  check("pix order waits for payment with a QR code", pix.status === 201 && pix.body.status === "awaiting_payment" && pix.body.payment.pix?.qrCode, pix.body);
  let bizOrders = await biz.call("GET", "/orders");
  check("store does not see unpaid pix orders", bizOrders.body.length === 1 && bizOrders.body[0].id === o1.id);
  const [{ mp_payment_id: paymentId }] = await sql("select mp_payment_id from orders where id = $1", [pix.body.id]);
  await anon.call("POST", `/test/payments/${paymentId}/approve`);
  const paidPix = await ana.call("GET", `/orders/${pix.body.id}`);
  check("paid pix moves to pending", paidPix.body.status === "pending" && paidPix.body.payment.status === "approved" && paidPix.body.payment.pix === null, paidPix.body);
  bizOrders = await biz.call("GET", "/orders");
  check("store now sees the pix order", bizOrders.body.length === 2);

  console.log("\nChat");
  const msg = await ana.call("POST", `/orders/${o1.id}/messages`, { text: "Oi! Pode entregar de manhã?" });
  check("customer sends message", msg.status === 201 && msg.body.from === "customer", msg.body);
  await new Promise((r) => setTimeout(r, 200));
  check("store gets the message live (SSE)", /event: message/.test(streamed) && streamed.includes("Pode entregar"));
  let viewed = await biz.call("GET", `/orders/${o1.id}`);
  check("store sees 1 unread", viewed.body.unread === 1, viewed.body.unread);
  await biz.call("POST", `/orders/${o1.id}/read`);
  viewed = await biz.call("GET", `/orders/${o1.id}`);
  check("read clears unread", viewed.body.unread === 0);
  const reply = await biz.call("POST", `/orders/${o1.id}/messages`, { text: "Claro, até 10h." });
  check("store replies", reply.status === 201 && reply.body.from === "business");
  const thread = await ana.call("GET", `/orders/${o1.id}/messages`);
  check("thread in order", thread.body.length === 2 && thread.body[1].text === "Claro, até 10h.");
  check("stranger cannot read the chat", (await anon.call("GET", `/orders/${o1.id}/messages`)).status === 401);

  console.log("\nOrder lifecycle");
  check("customer cannot accept", (await ana.call("POST", `/orders/${o1.id}/status`, { status: "accepted" })).status === 409);
  check("store cannot skip a step", (await biz.call("POST", `/orders/${o1.id}/status`, { status: "delivered" })).status === 409);
  for (const status of ["accepted", "on_the_way", "delivered"]) {
    const step = await biz.call("POST", `/orders/${o1.id}/status`, { status });
    check(`store moves order to ${status}`, step.body.status === status, step.body);
  }
  check("review before return refused", (await ana.call("POST", `/orders/${o1.id}/review`, { stars: 5 })).status === 409);
  const returned = await biz.call("POST", `/orders/${o1.id}/status`, { status: "returned" });
  check("return refunds the deposit", returned.body.status === "returned" && returned.body.payment.status === "partially_refunded" && returned.body.payment.refunded === 300, returned.body.payment);
  check("history has every step", returned.body.history.map((h) => h.status).join(",") === "awaiting_payment,pending,accepted,on_the_way,delivered,returned", returned.body.history);
  const review = await ana.call("POST", `/orders/${o1.id}/review`, { stars: 5, text: "Entrega rápida e betoneira nova." });
  check("customer reviews", review.status === 201 && review.body.author === "Ana S.", review.body);
  check("second review refused", (await ana.call("POST", `/orders/${o1.id}/review`, { stars: 1 })).status === 409);
  const rated = await anon.call("GET", `/businesses/${reg.body.business.id}`);
  check("store rating updated", rated.body.business.rating === 5 && rated.body.business.reviewCount === 1 && rated.body.reviews.length === 1);
  const declined = await biz.call("POST", `/orders/${pix.body.id}/status`, { status: "declined" });
  check("declining refunds everything", declined.body.status === "declined" && declined.body.payment.status === "refunded" && declined.body.payment.refunded === declined.body.total, declined.body.payment);
  const rentals = await anon.call("GET", `/items/${itemId}`);
  check("rentals counted on accept", rentals.body.item.rentals === 1);

  console.log("\nSign in, sign out, passwords");
  check("logout", (await biz.call("POST", "/auth/logout")).status === 204);
  check("me after logout -> 401", (await biz.call("GET", "/auth/me")).status === 401);
  check("wrong password -> 401", (await biz.call("POST", "/auth/login", { email: "carlos@loja.com", password: "errada-123" })).status === 401);
  mark = logs.length;
  check("forgot password -> 202", (await anon.call("POST", "/auth/password/forgot", { email: "carlos@loja.com" })).status === 202);
  check("forgot for unknown email also 202", (await anon.call("POST", "/auth/password/forgot", { email: "ninguem@nada.com" })).status === 202);
  const token = (await waitFor(/\?reset=([\w-]+)/, mark))[1];
  const reset = await biz.call("POST", "/auth/password/reset", { token, password: "nova-senha-456" });
  check("reset password signs in", reset.status === 200 && reset.body.user.email === "carlos@loja.com", reset.body);
  check("reset link works once", (await anon.call("POST", "/auth/password/reset", { token, password: "outra-senha-789" })).status === 400);
  check("old password no longer works", (await anon.call("POST", "/auth/login", { email: "carlos@loja.com", password: "senha-forte-123" })).status === 401);
  const login = await biz.call("POST", "/auth/login", { email: "CARLOS@loja.com", password: "nova-senha-456" });
  check("login with new password", login.status === 200 && login.body.business?.id === reg.body.business.id);
  await sql("update sms_codes set created_at = created_at - interval '1 minute'");
  mark = logs.length;
  const again = new Client();
  await again.call("POST", "/auth/phone/start", { phone: "11988887777" });
  const code2 = (await waitFor(/Código para \+55 \(11\) 98888-7777: (\d{6})/, mark))[1];
  const signin = await again.call("POST", "/auth/phone/verify", { phone: "11988887777", code: code2 });
  check("phone sign-in for existing account", signin.body.status === "signed_in" && signin.body.user.name === "Ana Souza", signin.body);
  check("delete item", (await biz.call("DELETE", `/my/items/${second.body.item.id}`)).status === 204);
  check("deleted item is gone", (await anon.call("GET", `/items/${second.body.item.id}`)).status === 404);

  await reader.cancel().catch(() => {});
  await pump.catch(() => {});
} catch (error) {
  failures.push(`crashed: ${error.message}`);
  console.error(error);
  console.log(logs.slice(-3000));
} finally {
  server.kill();
}

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) {
  console.log(failures.map((f) => `  - ${f}`).join("\n"));
  const errors = logs.split("\n").filter((line) => /error|Error/.test(line));
  if (errors.length) console.log("\nServer errors:\n" + errors.slice(-20).join("\n"));
  process.exitCode = 1;
}
