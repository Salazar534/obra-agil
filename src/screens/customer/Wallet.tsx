import { useState } from "react";
import { Plus, QrCode } from "lucide-react";
import { errorMessage } from "../../lib/api.ts";
import { brl, dateLabel, isoDay } from "../../lib/format.ts";
import { useMercadoPago } from "../../lib/mercadopago.ts";
import { useNav } from "../../lib/nav.tsx";
import { actions, ordersOf, useDB } from "../../lib/store.ts";
import { toast } from "../../lib/toast.ts";
import type { PaymentMethod } from "../../lib/types.ts";
import { Button, EmptyState, GlassButton, Group, Img, Row } from "../../ui/controls.tsx";
import { Page } from "../../ui/Page.tsx";
import { AddCardSheet, cardFace, methodTitle, PaymentsUnavailable, WalletCard } from "../../ui/PaymentForm.tsx";
import { ActionSheet } from "../../ui/Sheet.tsx";
import { ProfileButton } from "../shared/Profile.tsx";

export function WalletScreen() {
  const db = useDB();
  const nav = useNav();
  const { enabled } = useMercadoPago();
  const [adding, setAdding] = useState(false);
  const [selected, setSelected] = useState<PaymentMethod | null>(null);
  const stack = [...db.payments].sort((a, b) => Number(a.isDefault) - Number(b.isDefault));
  const charges = ordersOf(db)
    .filter((o) => o.payment.status !== "pending" && o.payment.status !== "cancelled" && o.payment.status !== "rejected")
    .slice(0, 8);

  async function run(action: () => Promise<void>, done: string) {
    try {
      await action();
      toast(done);
    } catch (error) {
      toast(errorMessage(error), "error");
    }
  }

  return (
    <Page
      title="Carteira"
      actions={
        <>
          {enabled ? (
            <GlassButton label="Adicionar cartão" onClick={() => setAdding(true)}>
              <Plus aria-hidden="true" />
            </GlassButton>
          ) : null}
          <ProfileButton />
        </>
      }
    >
      {!enabled ? (
        <PaymentsUnavailable />
      ) : stack.length ? (
        <div className="@container pt-1">
          {stack.map((method, index) => (
            <WalletCard
              key={method.id}
              card={cardFace(method)}
              isDefault={method.isDefault}
              onClick={() => setSelected(method)}
              className="anim-rise"
              style={{
                marginTop: index === 0 ? 0 : "calc(62px - 100cqw / 1.586)",
                zIndex: index,
                animationDelay: `${index * 70}ms`,
              }}
            />
          ))}
          <p className="mt-3 text-center type-footnote text-muted-foreground">Toque num cartão para tornar padrão ou remover.</p>
        </div>
      ) : (
        <EmptyState
          mood="idle"
          title="Nenhum cartão salvo"
          text="Salve um cartão para alugar em segundos e parcelar em até 12x."
          action={
            <Button size="md" onClick={() => setAdding(true)}>
              Adicionar cartão
            </Button>
          }
        />
      )}

      {enabled ? (
        <Group>
          <Row icon={QrCode} tone="teal" title="Pix" subtitle="Escolha Pix na hora de pagar. Aprovação na hora." />
        </Group>
      ) : null}

      {charges.length ? (
        <Group title="Últimos pagamentos">
          {charges.map((order) => (
            <Row
              key={order.id}
              leading={<Img src={order.item.image} alt="" className="mr-3 size-10 shrink-0 rounded-[10px]" />}
              title={order.item.name}
              subtitle={`${dateLabel(isoDay(new Date(order.createdAt)))} · ${order.payment.label}${order.payment.refunded ? ` · ${brl(order.payment.refunded)} estornado` : ""}`}
              value={brl(order.total)}
              onClick={() => nav.push("order", { id: order.id })}
            />
          ))}
        </Group>
      ) : null}

      <AddCardSheet open={adding} onClose={() => setAdding(false)} />
      <ActionSheet
        open={selected !== null}
        onClose={() => setSelected(null)}
        title={selected ? methodTitle(selected) : undefined}
        actions={[
          ...(selected && !selected.isDefault
            ? [{ label: "Usar como padrão", onClick: () => void run(() => actions.setDefaultCard(selected.id), "Cartão padrão atualizado") }]
            : []),
          {
            label: "Remover cartão",
            destructive: true,
            onClick: () => {
              if (selected) void run(() => actions.removeCard(selected.id), "Cartão removido");
            },
          },
        ]}
      />
    </Page>
  );
}
