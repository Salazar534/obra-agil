import { useState } from "react";
import { useNav } from "../../lib/nav.tsx";
import { activeStatuses, ordersOf, retry, useDB } from "../../lib/store.ts";
import { OrderCard } from "../../ui/cards.tsx";
import { Button, EmptyState, Segmented, Spinner } from "../../ui/controls.tsx";
import { Page } from "../../ui/Page.tsx";
import { ProfileButton } from "../shared/Profile.tsx";

export function OrdersScreen() {
  const db = useDB();
  const nav = useNav();
  const [segment, setSegment] = useState<"active" | "past">("active");
  const mine = ordersOf(db);
  const active = mine.filter((o) => activeStatuses.includes(o.status));
  const list = segment === "active" ? active : mine.filter((o) => !activeStatuses.includes(o.status));
  const status = db.requests.orders;

  return (
    <Page title="Pedidos" actions={<ProfileButton />}>
      <Segmented
        label="Filtrar pedidos"
        value={segment}
        onChange={setSegment}
        options={[
          { value: "active", label: "Em andamento", badge: active.length || undefined },
          { value: "past", label: "Histórico" },
        ]}
      />
      {list.length ? (
        <div className="mt-4 flex flex-col gap-3">
          {list.map((order, index) => (
            <div key={order.id} className="anim-rise" style={{ animationDelay: `${index * 50}ms` }}>
              <OrderCard order={order} title={order.item.name} subtitle={order.business.name} onClick={() => nav.push("order", { id: order.id })} />
            </div>
          ))}
        </div>
      ) : status === "loading" ? (
        <div className="grid h-60 place-items-center text-muted-foreground">
          <Spinner className="size-7" />
        </div>
      ) : status === "error" ? (
        <EmptyState
          mood="sad"
          title="Não deu para carregar"
          text="Confira a internet e tente de novo."
          action={
            <Button size="md" onClick={() => retry("orders")}>
              Tentar de novo
            </Button>
          }
        />
      ) : (
        <EmptyState
          mood={segment === "active" ? "think" : "idle"}
          title={segment === "active" ? "Nenhum pedido em andamento" : "Sem histórico ainda"}
          text={segment === "active" ? "Quando você alugar, o pedido aparece aqui com o andamento ao vivo." : "Seus aluguéis concluídos ficam guardados aqui."}
          action={
            <Button size="md" onClick={() => nav.switchTab("explore")}>
              Explorar equipamentos
            </Button>
          }
        />
      )}
    </Page>
  );
}
