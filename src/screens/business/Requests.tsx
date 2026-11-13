import { useState } from "react";
import { brlShort } from "../../lib/format.ts";
import { useNav } from "../../lib/nav.tsx";
import { ordersOf, useDB } from "../../lib/store.ts";
import type { OrderStatus } from "../../lib/types.ts";
import { OrderCard } from "../../ui/cards.tsx";
import { EmptyState, Segmented, Spinner } from "../../ui/controls.tsx";
import { Page } from "../../ui/Page.tsx";
import { ProfileButton } from "../shared/Profile.tsx";
import { earning } from "./Dashboard.tsx";

type Segment = "new" | "active" | "done";

const groups: Record<Segment, OrderStatus[]> = {
  new: ["pending"],
  active: ["accepted", "on_the_way", "delivered"],
  done: ["returned", "declined", "cancelled"],
};

const empty: Record<Segment, { title: string; text: string }> = {
  new: { title: "Nenhum pedido novo", text: "Quando alguém pagar um pedido, ele aparece aqui na hora." },
  active: { title: "Nada em andamento", text: "Pedidos aceitos ficam aqui até a devolução." },
  done: { title: "Sem histórico ainda", text: "Os aluguéis concluídos ficam guardados aqui." },
};

export function Requests() {
  const db = useDB();
  const nav = useNav();
  const [segment, setSegment] = useState<Segment>("new");
  const orders = ordersOf(db);
  const list = orders.filter((o) => groups[segment].includes(o.status));
  const count = (s: Segment) => orders.filter((o) => groups[s].includes(o.status)).length;

  return (
    <Page title="Pedidos" actions={<ProfileButton />}>
      <Segmented
        label="Filtrar pedidos"
        value={segment}
        onChange={setSegment}
        options={[
          { value: "new", label: "Novos", badge: count("new") || undefined },
          { value: "active", label: "Ativos" },
          { value: "done", label: "Concluídos" },
        ]}
      />
      {list.length ? (
        <div className="mt-4 flex flex-col gap-3">
          {list.map((order, index) => (
            <div key={order.id} className="anim-rise" style={{ animationDelay: `${index * 50}ms` }}>
              <OrderCard
                order={order}
                title={order.customer.name}
                subtitle={`${order.item.name} · ${brlShort(earning(order))}`}
                role="business"
                onClick={() => nav.push("order", { id: order.id })}
              />
            </div>
          ))}
        </div>
      ) : db.requests.orders === "loading" ? (
        <div className="grid h-60 place-items-center text-muted-foreground">
          <Spinner className="size-7" />
        </div>
      ) : (
        <EmptyState mood={segment === "new" ? "idle" : "think"} title={empty[segment].title} text={empty[segment].text} />
      )}
    </Page>
  );
}
