// Creates demo rental stores with equipment in Castanhal (PA) through the API, so customers there find stores nearby.
// Needs the API running (npm run dev). Running it again skips stores that already exist.
// Usage: npm run seed:castanhal
import { resolve } from "node:path";

try {
  process.loadEnvFile(resolve(import.meta.dirname, "..", ".env"));
} catch {
  // .env is optional here; PORT falls back to 3001.
}

const base = `http://127.0.0.1:${process.env.PORT ?? 3001}/api`;
const PASSWORD = "Castanhal#2026";
const img = (key) => `/img/eq/${key}.webp`;

const stores = [
  {
    email: "cidademodelo@example.com",
    owner: "Raimundo Ferreira",
    name: "Cidade Modelo Locações",
    category: "ferramentas",
    tagline: "Ferramentas revisadas com entrega no mesmo dia",
    about: "Locadora de bairro no Pirapora, com ferramentas elétricas revisadas a cada aluguel. Entregamos em Castanhal e no Apeú.",
    cover: "/img/biz/loja.webp",
    address: { label: "Rua Benjamin Constant, 1240", detail: "Pirapora, Castanhal", lat: -1.2935, lng: -47.9232 },
    opens: "07:30",
    closes: "18:00",
    deliveryFee: 10,
    radiusKm: 20,
    items: [
      { name: "Martelete rompedor 10 kg", category: "ferramentas", price: 65, deposit: 250, quantity: 2, image: img("martelete"), description: "Para quebrar piso, parede e concreto. Acompanha ponteiro e talhadeira.", specs: ["1.500 W", "220 V", "Ponteiro e talhadeira"] },
      { name: "Furadeira de impacto 750 W", category: "ferramentas", price: 25, deposit: 80, quantity: 3, image: img("furadeira"), description: "Fura concreto, madeira e metal. Vem com jogo de brocas.", specs: ["Mandril 13 mm", "127 V ou 220 V", "Jogo de brocas"] },
      { name: 'Serra de bancada 10"', category: "ferramentas", price: 60, deposit: 200, quantity: 1, image: img("serra"), description: "Cortes retos em madeira e compensado, com guia paralela.", specs: ['Disco de 10"', "Guia paralela", "220 V"] },
      { name: "Nível a laser com tripé", category: "ferramentas", price: 45, deposit: 300, quantity: 1, image: img("laser"), description: "Marca nível e prumo em paredes, pisos e forros.", specs: ["Alcance de 20 m", "Tripé incluso", "Linhas em cruz"] },
      { name: "Escada extensível 7 m", category: "andaimes", price: 28, deposit: 120, quantity: 2, image: img("escada"), description: "Escada de alumínio com trava de segurança, para telhado e fachada.", specs: ["Alumínio", "Até 120 kg", "Sapatas antiderrapantes"] },
    ],
  },
  {
    email: "paramaquinas@example.com",
    owner: "Edivaldo Moraes",
    name: "Pará Máquinas",
    category: "escavacao",
    tagline: "Máquinas pesadas com operador",
    about: "Mini escavadeira, compactação e energia para obras em Castanhal, Santa Izabel, Inhangapi e região.",
    cover: "/img/biz/patio.webp",
    address: { label: "Rua Presidente Kennedy, 870", detail: "Novo Estrela, Castanhal", lat: -1.2883, lng: -47.9333 },
    opens: "07:00",
    closes: "17:00",
    deliveryFee: 60,
    radiusKm: 40,
    items: [
      { name: "Mini escavadeira 1,8 t", category: "escavacao", price: 520, deposit: 1500, quantity: 1, image: img("escavadeira"), description: "Abre valas, fundações e fossas. Vai com operador experiente.", specs: ["Com operador", "Caçamba de 40 cm"] },
      { name: "Placa vibratória 90 kg", category: "compactacao", price: 110, deposit: 350, quantity: 2, image: img("compactador"), description: "Compacta aterro, brita e base de calçada.", specs: ["Motor a gasolina", "Placa de 50 × 60 cm"] },
      { name: "Gerador 8 kVA silenciado", category: "energia", price: 150, deposit: 600, quantity: 1, image: img("gerador"), description: "Energia para a obra enquanto a ligação de luz não sai.", specs: ["Diesel", "Partida elétrica", "Silenciado"] },
    ],
  },
  {
    email: "andaimesapeu@example.com",
    owner: "Benedita Cardoso",
    name: "Andaimes Apeú",
    category: "andaimes",
    tagline: "Andaime entregue e montado na sua obra",
    about: "Andaimes tubulares, plataforma e escadas para obra e reforma. Montamos e desmontamos no local.",
    cover: "/img/biz/andaimes.webp",
    address: { label: "Rua Francisco Quintal, 455", detail: "São José, Castanhal", lat: -1.28, lng: -47.9105 },
    opens: "07:00",
    closes: "17:30",
    deliveryFee: 25,
    radiusKm: 30,
    items: [
      { name: "Andaime tubular 1 × 1,5 m (módulo)", category: "andaimes", price: 12, deposit: 40, quantity: 60, image: img("andaime"), description: "Módulo com piso e travas. Monte a altura que precisar.", specs: ["Módulo 1 × 1,5 m", "Piso metálico", "Rodízios opcionais"] },
      { name: "Plataforma tesoura 8 m", category: "elevacao", price: 380, deposit: 1200, quantity: 1, image: img("plataforma"), description: "Plataforma elétrica para fachada, forro e pintura em altura.", specs: ["Trabalho a 8 m", "Carga de 230 kg", "Elétrica"] },
      { name: "Escada extensível 9 m", category: "andaimes", price: 35, deposit: 150, quantity: 2, image: img("escada"), description: "Escada de alumínio para telhado e fachada alta.", specs: ["Alumínio", "Até 120 kg"] },
    ],
  },
  {
    email: "concretiza@example.com",
    owner: "Socorro Barbosa",
    name: "Concretiza Castanhal",
    category: "concreto",
    tagline: "Betoneira na porta da sua obra",
    about: "Betoneiras de 150 e 400 litros, compactação e demolição. Entrega e retirada com caminhão próprio.",
    cover: "/img/biz/obra.webp",
    address: { label: "Rua Manoel Manoin, 315", detail: "Santa Lídia, Castanhal", lat: -1.2991, lng: -47.9148 },
    opens: "07:00",
    closes: "18:00",
    deliveryFee: 15,
    radiusKm: 25,
    items: [
      { name: "Betoneira 400 L", category: "concreto", price: 80, deposit: 300, quantity: 4, image: img("betoneira"), description: "Mistura concreto e argamassa para laje, piso e fundação.", specs: ["Motor 2 cv", "220 V", "Rodas para reboque"] },
      { name: "Betoneira 150 L", category: "concreto", price: 55, deposit: 200, quantity: 3, image: img("betoneira"), description: "Leve e fácil de manobrar, ideal para reforma e calçada.", specs: ["Motor 1/2 cv", "127 V ou 220 V"] },
      { name: "Placa vibratória 60 kg", category: "compactacao", price: 90, deposit: 300, quantity: 1, image: img("compactador"), description: "Compactação de contrapiso, calçada e pequenos aterros.", specs: ["Motor a gasolina", "Placa de 40 × 50 cm"] },
      { name: "Martelete rompedor 16 kg", category: "ferramentas", price: 75, deposit: 300, quantity: 1, image: img("martelete"), description: "Demolição pesada de concreto e alvenaria.", specs: ["1.700 W", "220 V"] },
    ],
  },
  {
    email: "forcatotal@example.com",
    owner: "Antônio Carlos Souza",
    name: "Força Total Geradores",
    category: "energia",
    tagline: "Energia e limpeza para obra e evento",
    about: "Geradores a diesel e gasolina e lavadoras de alta pressão. Atendemos obras e eventos em Castanhal e região.",
    cover: "/img/biz/galpao.webp",
    address: { label: "Rua Marechal Deodoro, 1680", detail: "Santa Catarina, Castanhal", lat: -1.2924, lng: -47.9058 },
    opens: "07:00",
    closes: "19:00",
    deliveryFee: 20,
    radiusKm: 40,
    items: [
      { name: "Gerador 8 kVA silenciado", category: "energia", price: 160, deposit: 600, quantity: 2, image: img("gerador"), description: "Energia estável para obra sem ligação de luz, com até 10 h de autonomia.", specs: ["Diesel", "Partida elétrica", "Silenciado"] },
      { name: "Gerador 3 kVA portátil", category: "energia", price: 85, deposit: 300, quantity: 3, image: img("gerador"), description: "Leve e portátil para ferramentas elétricas no canteiro.", specs: ["Gasolina", "Tomadas 127 V e 220 V"] },
      { name: "Lavadora de alta pressão", category: "limpeza", price: 50, deposit: 150, quantity: 2, image: img("lavadora"), description: "Limpeza de fachada, calçada e equipamentos no fim da obra.", specs: ["2.200 psi", "Mangueira de 8 m"] },
    ],
  },
];

class Session {
  cookie = "";

  async call(method, path, body) {
    const headers = { "X-Requested-With": "seed-castanhal" };
    if (this.cookie) headers.Cookie = this.cookie;
    if (body !== undefined) headers["Content-Type"] = "application/json";
    const res = await fetch(base + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    const sessionCookie = res.headers.getSetCookie().find((cookie) => cookie.startsWith("oa_session="));
    if (sessionCookie) this.cookie = sessionCookie.split(";")[0];
    const text = await res.text();
    const data = text ? JSON.parse(text) : null;
    if (!res.ok) throw Object.assign(new Error(data?.error?.message ?? `HTTP ${res.status}`), { status: res.status, code: data?.error?.code });
    return data;
  }
}

try {
  await fetch(`${base}/health`, { signal: AbortSignal.timeout(3000) });
} catch {
  console.error(`A API não respondeu em ${base}. Rode \`npm run dev\` e tente de novo.`);
  process.exit(1);
}

for (const store of stores) {
  const session = new Session();
  try {
    await session.call("POST", "/auth/register", {
      role: "business",
      name: store.owner,
      email: store.email,
      password: PASSWORD,
      address: store.address,
      business: { name: store.name, category: store.category },
    });
  } catch (error) {
    if (error.code === "email_taken") {
      console.log(`- ${store.name}: já existe, pulei.`);
      continue;
    }
    throw error;
  }
  const { tagline, about, cover, opens, closes, deliveryFee, radiusKm } = store;
  await session.call("PATCH", "/my/business", { tagline, about, cover, opens, closes, deliveryFee, radiusKm });
  for (const item of store.items) await session.call("POST", "/my/items", item);
  await session.call("POST", "/auth/logout");
  console.log(`+ ${store.name} (${store.address.detail}): ${store.items.length} equipamentos. Entrar: ${store.email}`);
}

console.log(`\nSenha de todas as lojas de exemplo: ${PASSWORD}`);
