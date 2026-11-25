import { useEffect, useState } from "react";
import { errorMessage } from "../../lib/api.ts";
import { brl } from "../../lib/format.ts";
import { actions } from "../../lib/store.ts";
import { toast } from "../../lib/toast.ts";
import { Button, Group } from "../../ui/controls.tsx";

type Quote = { id: string; item: string; note: string; status: string; quote: number | null; customer?: string; business?: string };

const label: Record<string, string> = {
  requested: "Aguardando resposta",
  quoted: "Orçamento enviado",
  accepted: "Aceito",
  done: "Concluído",
  cancelled: "Cancelado",
};

export function ServiceQuotes({ role }: { role: "customer" | "business" }) {
  const [rows, setRows] = useState<Quote[] | null>(null);
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  function load() {
    void actions
      .serviceRequests(role)
      .then((data) => setRows(data.requests))
      .catch(() => setRows([]));
  }

  useEffect(load, [role]);

  async function run(id: string, task: () => Promise<unknown>, ok: string) {
    setBusy(id);
    try {
      await task();
      toast(ok);
      setAmount("");
      load();
    } catch (error) {
      toast(errorMessage(error), "error");
    } finally {
      setBusy(null);
    }
  }

  if (!rows?.length) return null;
  return (
    <Group title="Orçamentos de serviço" className="mt-4">
      {rows.map((row) => (
        <div key={row.id} className="border-b border-separator px-4 py-3 last:border-b-0">
          <p className="type-subhead">{row.item}</p>
          <p className="type-footnote text-muted-foreground">
            {role === "business" ? row.customer : row.business} · {label[row.status] ?? row.status}
            {row.quote != null ? ` · ${brl(row.quote)}` : ""}
          </p>
          {row.note ? <p className="mt-1 type-footnote">{row.note}</p> : null}
          {role === "business" && row.status === "requested" ? (
            <div className="mt-2 flex items-center gap-2">
              <input
                aria-label="Valor do orçamento"
                inputMode="decimal"
                placeholder="Valor"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                className="h-10 w-28 rounded-full bg-muted px-3 type-subhead outline-none"
              />
              <Button
                size="sm"
                loading={busy === row.id}
                onClick={() => {
                  const quote = Number(amount.replace(/\./g, "").replace(",", "."));
                  if (!quote) return toast("Informe o valor", "error");
                  void run(row.id, () => actions.updateServiceRequest(row.id, { status: "quoted", quote }), "Orçamento enviado");
                }}
              >
                Enviar
              </Button>
              <Button size="sm" variant="tinted" onClick={() => void run(row.id, () => actions.updateServiceRequest(row.id, { status: "cancelled" }), "Pedido recusado")}>
                Recusar
              </Button>
            </div>
          ) : null}
          {role === "business" && row.status === "accepted" ? (
            <Button size="sm" className="mt-2" onClick={() => void run(row.id, () => actions.updateServiceRequest(row.id, { status: "done" }), "Serviço concluído")}>
              Concluir
            </Button>
          ) : null}
          {role === "customer" && row.status === "quoted" ? (
            <Button size="sm" className="mt-2" loading={busy === row.id} onClick={() => void run(row.id, () => actions.acceptServiceRequest(row.id), "Orçamento aceito")}>
              Aceitar
            </Button>
          ) : null}
        </div>
      ))}
    </Group>
  );
}
