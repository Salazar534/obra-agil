const currency = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export function brl(value: number) {
  return currency.format(value);
}

export function brlShort(value: number) {
  return Number.isInteger(value) ? `R$ ${value.toLocaleString("pt-BR")}` : brl(value);
}

export function digits(value: string, max = 99) {
  return value.replace(/\D/g, "").slice(0, max);
}

export function normalizePhone(raw: string) {
  let d = raw.replace(/\D/g, "");
  if (d.startsWith("55") && d.length > 11) d = d.slice(2);
  return d.slice(0, 11);
}

export function formatPhone(d: string) {
  if (d.length === 0) return "";
  if (d.length < 3) return `(${d}`;
  const ddd = d.slice(0, 2);
  const rest = d.slice(2);
  if (rest.length <= 4) return `(${ddd}) ${rest}`;
  if (d.length <= 10) return `(${ddd}) ${rest.slice(0, 4)}-${rest.slice(4)}`;
  return `(${ddd}) ${rest.slice(0, 5)}-${rest.slice(5)}`;
}

export function isValidPhone(d: string) {
  return /^[1-9]{2}\d{8,9}$/.test(d);
}

export function phoneProblem(d: string) {
  if (d.length >= 2 && !/^[1-9]{2}/.test(d)) return "Confira o DDD.";
  return "Inclua o DDD e o número do celular.";
}

export function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value.trim());
}

export function isMobile(d: string) {
  return /^[1-9]{2}9\d{8}$/.test(d);
}

export function formatCpf(value: string) {
  const d = digits(value, 11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

export function isValidCpf(value: string) {
  const d = digits(value, 11);
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  const check = (length: number) => {
    let sum = 0;
    for (let i = 0; i < length; i++) sum += Number(d[i]) * (length + 1 - i);
    const rest = (sum * 10) % 11;
    return rest === 10 ? 0 : rest;
  };
  return check(9) === Number(d[9]) && check(10) === Number(d[10]);
}

export function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const letters = parts.length > 1 ? [parts[0][0], parts[parts.length - 1][0]] : [parts[0]?.[0], parts[0]?.[1]];
  return letters.filter(Boolean).join("").toUpperCase() || "?";
}

export function firstName(name: string) {
  return name.trim().split(/\s+/)[0] ?? name;
}

export function plural(n: number, one: string, many: string) {
  return `${n} ${n === 1 ? one : many}`;
}

export function fold(value: string) {
  return value.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

export function isoDay(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function parseDay(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(iso: string, n: number) {
  const date = parseDay(iso);
  date.setDate(date.getDate() + n);
  return isoDay(date);
}

const weekday = new Intl.DateTimeFormat("pt-BR", { weekday: "short" });
const shortDate = new Intl.DateTimeFormat("pt-BR", { weekday: "short", day: "numeric", month: "short" });
const dayMonth = new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "short" });

function relativeDay(iso: string) {
  const today = isoDay(new Date());
  if (iso === today) return "Hoje";
  if (iso === addDays(today, 1)) return "Amanhã";
  return null;
}

export function dayChip(iso: string) {
  const date = parseDay(iso);
  return {
    top: relativeDay(iso) ?? weekday.format(date).replace(".", ""),
    bottom: String(date.getDate()),
  };
}

export function dateLabel(iso: string) {
  return relativeDay(iso) ?? shortDate.format(parseDay(iso)).replace(/\./g, "");
}

export function rangeLabel(start: string, days: number) {
  const end = addDays(start, days);
  return `${dayMonth.format(parseDay(start)).replace(".", "")} – ${dayMonth.format(parseDay(end)).replace(".", "")}`;
}

export function clock(ts: number) {
  return new Date(ts).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

export function timeAgo(ts: number) {
  const diff = Date.now() - ts;
  const min = Math.round(diff / 60000);
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `há ${h} h`;
  const d = Math.round(h / 24);
  if (d === 1) return "ontem";
  if (d < 7) return `há ${d} dias`;
  return dayMonth.format(new Date(ts)).replace(".", "");
}

export function greeting(date = new Date()) {
  const h = date.getHours();
  if (h < 12) return "Bom dia";
  if (h < 18) return "Boa tarde";
  return "Boa noite";
}

export function wait(ms: number) {
  return new Promise<void>((resolve) => window.setTimeout(resolve, ms));
}

export function uid(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}
