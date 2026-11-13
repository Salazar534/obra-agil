import { useState } from "react";
import { Boxes, Inbox, Star, TrendingUp } from "lucide-react";
import { errorMessage } from "../../lib/api.ts";
import { chime } from "../../lib/feedback.ts";
import { addDays, brl, brlShort, firstName, greeting, isoDay, parseDay, plural } from "../../lib/format.ts";
import { useNav } from "../../lib/nav.tsx";
import { actions, ordersOf, useDB, useMe } from "../../lib/store.ts";
import { toast } from "../../lib/toast.ts";
import type { Order } from "../../lib/types.ts";
import { Avatar, Button, EmptyState, SectionHeader, ToneIcon, type Tone } from "../../ui/controls.tsx";
import { Mascot } from "../../ui/Mascot.tsx";
import { Page } from "../../ui/Page.tsx";
import { ActionSheet } from "../../ui/Sheet.tsx";
import { ProfileButton } from "../shared/Profile.tsx";

const narrow = new Intl.DateTimeFormat("pt-BR", { weekday: "narrow" });
const longDay = new Intl.DateTimeFormat("pt-BR", { weekday: "long" });

/** What the store keeps: rent and delivery. The service fee and the deposit are not revenue. */
export function earning(order: Order) {
  return order.rent + order.deliveryFee;
}

function Stat({ icon, tone, label, value, onClick }: { icon: typeof Boxes; tone: Tone; label: string; value: string; onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="anim-rise flex cursor-pointer flex-col items-start gap-3 rounded-[24px] bg-card p-4 text-left transition-transform active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-primary"
    >
      <ToneIcon icon={icon} tone={tone} size={34} />
      <span>
        <span className="block type-title2 tabular-nums">{value}</span>
        <span className="block type-footnote text-muted-foreground">{label}</span>
      </span>
    </button>
  );
}

export async function respond(order: Order, status: "accepted" | "declined") {
  try {
    await actions.setOrderStatus(order.id, status);
    if (status === "accepted") {
      chime("success");
      toast("Pedido aceito");
    } else {
      toast("Pedido recusado e valor estornado", "info");
    }
  } catch (error) {
    toast(errorMessage(error), "error");
  }
}

export function Dashboard() {
  const db = useDB();
  const me = useMe();
  const nav = useNav();
  const [declining, setDeclining] = useState<Order | null>(null);
  const [accepting, setAccepting] = useState<string | null>(null);
  const business = db.business;

  if (!business) {
    return (
      <Page title="Painel">
        <EmptyState mood="sad" title="Loja não encontrada" />
      </Page>
    );
  }

  const orders = ordersOf(db);
  const pending = orders.filter((o) => o.status === "pending");
  const active = orders.filter((o) => o.status === "accepted" || o.status === "on_the_way" || o.status === "delivered");
  const counted = orders.filter((o) => ["accepted", "on_the_way", "delivered", "returned"].includes(o.status));
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const revenue = counted.filter((o) => o.createdAt >= monthStart.getTime()).reduce((sum, o) => sum + earning(o), 0);
  const items = db.ownItems.flatMap((id) => (db.items[id] ? [db.items[id]] : []));
  const today = isoDay(new Date());
  const series = Array.from({ length: 7 }, (_, index) => {
    const day = addDays(today, index - 6);
    return { day, value: counted.filter((o) => isoDay(new Date(o.createdAt)) === day).reduce((sum, o) => sum + earning(o), 0) };
  });
  const max = Math.max(1, ...series.map((s) => s.value));
  const weekTotal = series.reduce((sum, s) => sum + s.value, 0);
  const itemsLoading = db.requests["own-items"] === "loading";

  return (
    <Page title="Painel" actions={<ProfileButton />}>
      <div className="anim-rise flex items-center gap-2 rounded-[26px] bg-card py-2 pr-4 pl-1">
        <Mascot mood={pending.length || items.length === 0 ? "wave" : "idle"} size={78} className="shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="type-headline">
            {greeting()}, {firstName(me.name)}!
          </p>
          <p className="type-subhead text-muted-foreground">
            {items.length === 0 && !itemsLoading
              ? "Cadastre o primeiro item para aparecer na busca."
              : pending.length
                ? `${plural(pending.length, "pedido esperando", "pedidos esperando")} resposta.`
                : "Tudo em dia na sua loja."}
          </p>
          {items.length === 0 && !itemsLoading ? (
            <Button
              size="sm"
              className="mt-2"
              onClick={() => {
                nav.switchTab("inventory");
                window.dispatchEvent(new Event("obra:add-item"));
              }}
            >
              Adicionar item
            </Button>
          ) : null}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <Stat icon={TrendingUp} tone="green" label="Receita no mês" value={brlShort(Math.round(revenue))} />
        <Stat icon={Inbox} tone="orange" label="Pedidos ativos" value={String(active.length + pending.length)} onClick={() => nav.switchTab("requests")} />
        <Stat icon={Boxes} tone="blue" label="Itens disponíveis" value={`${items.filter((i) => i.available).length}/${items.length}`} onClick={() => nav.switchTab("inventory")} />
        <Stat
          icon={Star}
          tone="indigo"
          label={plural(business.reviewCount, "avaliação", "avaliações")}
          value={business.rating ? business.rating.toLocaleString("pt-BR", { minimumFractionDigits: 1 }) : "Novo"}
          onClick={() => nav.push("business", { id: business.id, tab: "reviews" })}
        />
      </div>

      <section className="anim-rise mt-4 rounded-[24px] bg-card p-4" style={{ animationDelay: "120ms" }}>
        <div className="flex items-baseline justify-between">
          <h2 className="type-headline">Últimos 7 dias</h2>
          <span className="type-subhead text-muted-foreground tabular-nums">{brl(weekTotal)}</span>
        </div>
        <div role="img" aria-label={`Receita por dia: ${series.map((s) => `${longDay.format(parseDay(s.day))} ${brl(s.value)}`).join(", ")}`} className="mt-4 flex items-end gap-2">
          {series.map((s, index) => {
            const isToday = index === series.length - 1;
            return (
              <div key={s.day} className="flex flex-1 flex-col items-center gap-1.5">
                <div className="flex h-[104px] w-full items-end">
                  <div
                    className={`bar-grow w-full rounded-[8px] ${isToday ? "bg-primary" : "bg-primary/25"}`}
                    style={{ height: `${Math.max(5, (s.value / max) * 100)}%`, animationDelay: `${index * 60}ms` }}
                  />
                </div>
                <span aria-hidden="true" className={`type-caption uppercase ${isToday ? "font-semibold text-primary" : "text-muted-foreground"}`}>
                  {narrow.format(parseDay(s.day))}
                </span>
              </div>
            );
          })}
        </div>
      </section>

      <SectionHeader title="Novos pedidos" action={pending.length ? { label: "Ver todos", onClick: () => nav.switchTab("requests") } : undefined} />
      {pending.length ? (
        <div className="flex flex-col gap-3">
          {pending.slice(0, 3).map((order) => (
            <div key={order.id} className="anim-rise rounded-[24px] bg-card p-3">
              <button
                type="button"
                onClick={() => nav.push("order", { id: order.id })}
                className="flex w-full cursor-pointer items-center gap-3 text-left focus-visible:outline-2 focus-visible:outline-primary"
              >
                <Avatar name={order.customer.name} src={order.customer.photo} size={44} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate type-headline">{order.customer.name}</span>
                  <span className="block truncate type-footnote text-muted-foreground">
                    {order.item.name} · {plural(order.days, "dia", "dias")} · {order.mode === "delivery" ? "entrega" : "retirada"}
                  </span>
                </span>
                <span className="shrink-0 type-headline tabular-nums">{brlShort(earning(order))}</span>
              </button>
              <div className="mt-3 flex gap-2">
                <Button size="md" variant="gray" className="flex-1" onClick={() => setDeclining(order)}>
                  Recusar
                </Button>
                <Button
                  size="md"
                  className="flex-1"
                  loading={accepting === order.id}
                  onClick={async () => {
                    setAccepting(order.id);
                    await respond(order, "accepted");
                    setAccepting(null);
                  }}
                >
                  Aceitar
                </Button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex items-center gap-3 rounded-[24px] bg-card p-4">
          <Mascot mood="idle" size={56} className="shrink-0" />
          <p className="type-subhead text-muted-foreground">Nenhum pedido novo. Itens com foto boa alugam mais rápido.</p>
        </div>
      )}

      <ActionSheet
        open={declining !== null}
        onClose={() => setDeclining(null)}
        title="Recusar este pedido?"
        message="O cliente é avisado e o valor pago é estornado."
        actions={[
          {
            label: "Recusar pedido",
            destructive: true,
            onClick: () => {
              if (declining) void respond(declining, "declined");
            },
          },
        ]}
      />
    </Page>
  );
}
