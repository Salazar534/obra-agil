import { useEffect, useState } from "react";
import { ArrowDownLeft, Clock, Landmark, Wallet } from "lucide-react";
import { errorMessage } from "../../lib/api.ts";
import { brl } from "../../lib/format.ts";
import { actions, useDB } from "../../lib/store.ts";
import { toast } from "../../lib/toast.ts";
import type { StoreBalance, StoreMovement } from "../../lib/types.ts";
import { Button, EmptyState, Group, Row, Spinner, ToneIcon, type Tone } from "../../ui/controls.tsx";
import { Page } from "../../ui/Page.tsx";

const bucketLabel: Record<StoreMovement["bucket"], string> = {
  waiting: "Aguardando o cliente",
  receiving: "A receber",
  available: "Disponível",
  refunded: "Estornado",
};

function Figure({ icon, tone, label, value }: { icon: typeof Wallet; tone: Tone; label: string; value: string }) {
  return (
    <div className="flex flex-col items-start gap-3 rounded-[24px] bg-card p-4">
      <ToneIcon icon={icon} tone={tone} size={34} />
      <span>
        <span className="block type-title2 tabular-nums">{value}</span>
        <span className="block type-footnote text-muted-foreground">{label}</span>
      </span>
    </div>
  );
}

export function FinanceScreen() {
  const db = useDB();
  const [balance, setBalance] = useState<StoreBalance | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let live = true;
    actions
      .storeBalance()
      .then((next) => {
        if (live) setBalance(next);
      })
      .catch((reason) => {
        if (live) setError(errorMessage(reason));
      });
    return () => {
      live = false;
    };
  }, []);

  if (error) {
    return (
      <Page title="Balanço">
        <EmptyState mood="sad" title="Não foi possível carregar o extrato" text={error} />
      </Page>
    );
  }
  if (!balance) {
    return (
      <Page title="Balanço">
        <div className="grid place-items-center py-16">
          <Spinner />
        </div>
      </Page>
    );
  }

  const when = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short" });

  return (
    <Page title="Balanço">
      <div className="grid grid-cols-2 gap-3">
        <Figure icon={Wallet} tone="green" label="Disponível" value={brl(balance.available)} />
        <Figure icon={Clock} tone="orange" label="A receber" value={brl(balance.receiving)} />
        <Figure icon={Landmark} tone="blue" label="Aguardando" value={brl(balance.waiting)} />
        <Figure icon={ArrowDownLeft} tone="pink" label="Estornado" value={brl(balance.refunded)} />
      </div>

      <Group
        title="Como o dinheiro se divide"
        footer={
          balance.connected
            ? "Disponível já está na conta Mercado Pago da loja. A receber ainda está no prazo de liberação. A caução entra nesses valores e sai no estorno, quando o equipamento volta."
            : "Conecte o Mercado Pago da loja para os próximos aluguéis caírem na conta dela. Até lá, o pagamento fica na conta da Obi Ágil."
        }
      >
        <Row title="Taxa da Obi Ágil" value={brl(balance.serviceFee)} />
        <Row title="Caução ainda com a loja" value={brl(balance.depositHeld)} />
      </Group>

      {balance.connected ? (
        <Button onClick={() => window.open(balance.withdrawUrl, "_blank", "noopener")}>Retirar no Mercado Pago</Button>
      ) : (
        <Button
          onClick={() => {
            void actions.connectMercadoPago().catch((reason) => toast(errorMessage(reason), "error"));
          }}
        >
          Conectar Mercado Pago
        </Button>
      )}

      <Group title="Movimentos">
        {balance.movements.length === 0 ? (
          <Row title="Nenhum pagamento ainda" subtitle={db.business?.name} />
        ) : (
          balance.movements.map((movement) => (
            <Row
              key={movement.id}
              title={movement.item}
              subtitle={`${movement.code} · ${when.format(movement.at)} · ${bucketLabel[movement.bucket]}`}
              value={brl(movement.amount)}
            />
          ))
        )}
      </Group>
    </Page>
  );
}
