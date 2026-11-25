import { useEffect, useRef, useState } from "react";
import { Check, Copy, ExternalLink, MessageCircle, Navigation, Phone, RotateCcw } from "lucide-react";
import { errorMessage } from "../../lib/api.ts";
import { chime } from "../../lib/feedback.ts";
import { addDays, brl, clock, dateLabel, isoDay, plural } from "../../lib/format.ts";
import { directionsUrl } from "../../lib/geo.ts";
import { useNav } from "../../lib/nav.tsx";
import { actions, useDB, useMe, useRequest } from "../../lib/store.ts";
import { toast } from "../../lib/toast.ts";
import type { Order, OrderStatus } from "../../lib/types.ts";
import { SuccessOverlay } from "../../ui/Celebrate.tsx";
import { Avatar, Button, Group, Img, Row, StarInput, StatusPill, TextAreaBlock } from "../../ui/controls.tsx";
import { Mascot, type MascotMood } from "../../ui/Mascot.tsx";
import { Page } from "../../ui/Page.tsx";
import { ActionSheet, Sheet } from "../../ui/Sheet.tsx";
import { PageLoading } from "../customer/BusinessScreen.tsx";

function Timeline({ order }: { order: Order }) {
  const pickup = order.mode === "pickup";
  const stopped = order.status === "declined" || order.status === "cancelled";
  const paidAt = order.history.find((h) => h.status === "pending")?.at;
  const steps: { status: OrderStatus; label: string }[] = stopped
    ? [
        { status: paidAt ? "pending" : "awaiting_payment", label: paidAt ? "Pedido pago" : "Pedido criado" },
        { status: order.status, label: order.status === "declined" ? "Recusado pela loja" : "Cancelado" },
      ]
    : [
        { status: "pending", label: order.status === "awaiting_payment" ? "Aguardando pagamento" : "Pedido pago" },
        { status: "accepted", label: "Confirmado pela loja" },
        { status: "on_the_way", label: pickup ? "Pronto para retirada" : "Saiu para entrega" },
        { status: "delivered", label: pickup ? "Retirado na loja" : "Entregue na obra" },
        { status: "returned", label: "Devolvido" },
      ];
  const reached = new Map(order.history.map((h) => [h.status, h.at]));

  return (
    <ol className="px-4 py-4">
      {steps.map((step, index) => {
        const at = reached.get(step.status);
        const done = at !== undefined;
        const current = (step.status === order.status || (order.status === "awaiting_payment" && index === 0)) && order.status !== "returned" && !stopped;
        const nextDone = index < steps.length - 1 && reached.has(steps[index + 1].status);
        const bad = stopped && index === 1;
        return (
          <li key={step.status} className="relative flex gap-3 pb-5 last:pb-0">
            {index < steps.length - 1 ? (
              <span
                aria-hidden="true"
                className={`absolute top-7 left-[11px] w-0.5 rounded-full transition-colors duration-500 ${nextDone ? "bg-primary" : "bg-muted"}`}
                style={{ height: "calc(100% - 22px)" }}
              />
            ) : null}
            <span
              className={`relative z-10 grid size-6 shrink-0 place-items-center rounded-full ${
                bad ? "bg-destructive text-primary-foreground" : done ? "bg-primary text-primary-foreground" : "border-2 border-border bg-card"
              } ${current ? "ping-soft" : ""}`}
            >
              {done ? <Check className="size-3.5" strokeWidth={3} aria-hidden="true" /> : null}
            </span>
            <span className="min-w-0 flex-1">
              <span className={`block type-body ${done ? "font-semibold" : "text-muted-foreground"} ${bad ? "text-destructive" : ""}`}>{step.label}</span>
              {at ? (
                <span className="block type-footnote text-muted-foreground">
                  {dateLabel(isoDay(new Date(at)))} · {clock(at)}
                </span>
              ) : null}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function copyText(text: string) {
  if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text);
  const area = document.createElement("textarea");
  area.value = text;
  area.setAttribute("readonly", "");
  area.style.position = "fixed";
  area.style.opacity = "0";
  document.body.appendChild(area);
  area.select();
  document.execCommand("copy");
  area.remove();
  return Promise.resolve();
}

function PixPanel({ order }: { order: Order }) {
  const pix = order.payment.pix!;
  const [now, setNow] = useState(() => Date.now());
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    const tick = window.setInterval(() => setNow(Date.now()), 1000);
    const poll = window.setInterval(() => void actions.refreshPayment(order.id).catch(() => {}), 6000);
    return () => {
      window.clearInterval(tick);
      window.clearInterval(poll);
    };
  }, [order.id]);

  const left = Math.max(0, Math.floor((pix.expiresAt - now) / 1000));
  const minutes = Math.floor(left / 60);
  const seconds = String(left % 60).padStart(2, "0");

  return (
    <section className="anim-rise mt-4 rounded-[28px] bg-card p-4 text-center" aria-label="Pagamento por Pix">
      <p className="type-headline">Pague {brl(order.total)} com Pix</p>
      <p className="mt-0.5 type-footnote text-muted-foreground">
        {left > 0 ? `Expira em ${minutes}:${seconds}` : "O código expirou. O pedido será cancelado."}
      </p>
      {pix.qrCodeBase64 ? (
        <img
          src={`data:image/png;base64,${pix.qrCodeBase64}`}
          alt="QR code do Pix"
          className="mx-auto mt-4 size-[220px] rounded-[16px] bg-white p-2 ring-1 ring-border [image-rendering:pixelated]"
        />
      ) : null}
      <p className="mx-auto mt-3 max-w-[300px] type-footnote text-muted-foreground">Abra o app do seu banco, escolha Pix e leia o QR code, ou use o Pix copia e cola.</p>
      <div className="mt-4 flex flex-col gap-2">
        <Button
          variant="tinted"
          onClick={() =>
            void copyText(pix.qrCode)
              .then(() => toast("Código Pix copiado"))
              .catch(() => toast("Não deu para copiar. Toque e segure o código.", "error"))
          }
        >
          <Copy className="size-[18px]" aria-hidden="true" />
          Copiar Pix copia e cola
        </Button>
        <Button
          variant="gray"
          loading={checking}
          onClick={async () => {
            setChecking(true);
            try {
              const changed = await actions.refreshPayment(order.id);
              if (!changed) toast("Ainda não recebemos o pagamento. Pode levar alguns segundos.", "info");
            } catch (error) {
              toast(errorMessage(error), "error");
            } finally {
              setChecking(false);
            }
          }}
        >
          Já paguei
        </Button>
        {pix.ticketUrl ? (
          <a
            href={pix.ticketUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center justify-center gap-1.5 py-2 type-subhead font-semibold text-primary"
          >
            Abrir no Mercado Pago <ExternalLink className="size-4" aria-hidden="true" />
          </a>
        ) : null}
      </div>
      <p className="mt-3 break-all rounded-[14px] bg-muted px-3 py-2 text-left font-mono text-[11px] leading-4 text-muted-foreground select-all">{pix.qrCode}</p>
    </section>
  );
}

function TicketPanel({ order }: { order: Order }) {
  const ticket = order.payment.ticket!;
  const [now, setNow] = useState(() => Date.now());
  const [checking, setChecking] = useState(false);
  const boleto = order.payment.method === "boleto";
  const loterica = order.payment.method === "pec";

  useEffect(() => {
    const poll = window.setInterval(() => void actions.refreshPayment(order.id).catch(() => {}), 15_000);
    const tick = ticket.expiresAt ? window.setInterval(() => setNow(Date.now()), 60_000) : 0;
    return () => {
      window.clearInterval(poll);
      if (tick) window.clearInterval(tick);
    };
  }, [order.id, ticket.expiresAt]);

  const left = ticket.expiresAt ? Math.max(0, ticket.expiresAt - now) : null;
  const title = boleto ? `Pague ${brl(order.total)} no boleto` : loterica ? `Pague ${brl(order.total)} na lotérica` : `Confirme ${brl(order.total)} no Mercado Pago`;
  const hint = boleto
    ? "Pague pelo app do banco ou numa lotérica. A compensação pode levar até 2 dias úteis."
    : loterica
      ? "Leve o código a uma casa lotérica e pague em dinheiro."
      : "Abra o Mercado Pago e autorize o pagamento com o saldo da conta.";

  return (
    <section className="anim-rise mt-4 rounded-[28px] bg-card p-4 text-center" aria-label={title}>
      <p className="type-headline">{title}</p>
      <p className="mt-0.5 type-footnote text-muted-foreground">
        {left === null ? "Aguardando a confirmação do Mercado Pago." : left > 0 ? `Vence em ${Math.ceil(left / 86_400_000)} dia(s)` : "O prazo acabou. O pedido será cancelado."}
      </p>
      <p className="mx-auto mt-3 max-w-[320px] type-footnote text-muted-foreground">{hint}</p>
      <div className="mt-4 flex flex-col gap-2">
        {ticket.barcode ? (
          <Button
            variant="tinted"
            onClick={() =>
              void copyText(ticket.barcode!)
                .then(() => toast(boleto ? "Linha digitável copiada" : "Código copiado"))
                .catch(() => toast("Não deu para copiar. Toque e segure o código.", "error"))
            }
          >
            <Copy className="size-[18px]" aria-hidden="true" />
            {boleto ? "Copiar linha digitável" : "Copiar código"}
          </Button>
        ) : null}
        {ticket.url ? (
          <a href={ticket.url} target="_blank" rel="noreferrer" className="inline-flex items-center justify-center gap-1.5 rounded-full bg-primary px-4 py-3 type-headline text-primary-foreground">
            {boleto ? "Abrir boleto" : "Abrir no Mercado Pago"} <ExternalLink className="size-4" aria-hidden="true" />
          </a>
        ) : null}
        <Button
          variant="gray"
          loading={checking}
          onClick={async () => {
            setChecking(true);
            try {
              const changed = await actions.refreshPayment(order.id);
              if (!changed) toast("Ainda não recebemos o pagamento.", "info");
            } catch (error) {
              toast(errorMessage(error), "error");
            } finally {
              setChecking(false);
            }
          }}
        >
          Já paguei
        </Button>
      </div>
      {ticket.barcode ? <p className="mt-3 break-all rounded-[14px] bg-muted px-3 py-2 text-left font-mono text-[11px] leading-4 text-muted-foreground select-all">{ticket.barcode}</p> : null}
    </section>
  );
}

function ReviewSheet({ open, onClose, store, onSend }: { open: boolean; onClose: () => void; store: string; onSend: (stars: number, text: string) => Promise<void> }) {
  const [stars, setStars] = useState(0);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const mood: MascotMood = stars === 0 ? "think" : stars >= 4 ? "celebrate" : stars === 3 ? "idle" : "sad";
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Avaliar"
      confirm={{
        label: "Enviar avaliação",
        disabled: stars === 0,
        loading: sending,
        onClick: async () => {
          setSending(true);
          await onSend(stars, text);
          setSending(false);
        },
      }}
    >
      <div className="flex flex-col items-center pt-1 text-center">
        <Mascot mood={mood} size={104} />
        <p className="mt-2 type-title3">Como foi com a {store}?</p>
      </div>
      <div className="mt-4">
        <StarInput value={stars} onChange={setStars} />
      </div>
      <Group className="mt-5">
        <TextAreaBlock aria-label="Comentário" placeholder="Conte como foi a entrega e o equipamento (opcional)" value={text} maxLength={500} onChange={(e) => setText(e.target.value)} />
      </Group>
    </Sheet>
  );
}

export function OrderScreen({ id }: { id: string }) {
  const db = useDB();
  const me = useMe();
  const nav = useNav();
  const order: Order | undefined = db.orders[id];
  const status = useRequest(order ? null : `order:${id}`, () => actions.loadOrder(id));
  const [confirm, setConfirm] = useState<"cancel" | "decline" | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const [celebrate, setCelebrate] = useState<null | "paid" | "reviewed">(null);
  const [busy, setBusy] = useState<OrderStatus | null>(null);
  const previous = useRef(order?.status);

  useEffect(() => {
    if (previous.current === "awaiting_payment" && order?.status === "pending") setCelebrate("paid");
    previous.current = order?.status;
  }, [order?.status]);

  if (!order) return <PageLoading title="Pedido" status={status} retryKey={`order:${id}`} />;

  const isBusiness = me.role === "business";
  const pickup = order.mode === "pickup";
  const returnDay = dateLabel(addDays(order.start, order.days));
  const business = order.business;
  const customer = order.customer;

  const hero: Record<OrderStatus, { mood: MascotMood; title: string; text: string }> = {
    awaiting_payment: {
      mood: "think",
      title: "Aguardando pagamento",
      text:
        order.payment.method === "boleto"
          ? "Pague o boleto. O pedido vai para a loja quando o banco compensar."
          : order.payment.method === "pec"
            ? "Pague na lotérica. O pedido vai para a loja quando o pagamento cair."
            : order.payment.method === "account_money"
              ? "Confirme o pagamento com o saldo do Mercado Pago."
              : "Assim que o Pix cair, o pedido vai para a loja.",
    },
    pending: {
      mood: "think",
      title: isBusiness ? "Novo pedido" : "Aguardando a loja",
      text: isBusiness ? "Aceite para o cliente receber no prazo." : `${business.name} vai confirmar em breve.`,
    },
    accepted: { mood: "wave", title: "Pedido confirmado", text: pickup ? "Separando para retirada." : "Separando o equipamento para entrega." },
    on_the_way: {
      mood: "idle",
      title: pickup ? "Pronto para retirada" : "A caminho da obra",
      text: pickup ? `Retire em ${business.address.label}.` : "A loja já saiu para entregar.",
    },
    delivered: {
      mood: "celebrate",
      title: pickup ? "Com você" : "Entregue",
      text: isBusiness ? `Devolução prevista para ${returnDay}.` : `Devolva até ${returnDay}. A loja confirma a devolução e a caução volta para você.`,
    },
    returned: { mood: "celebrate", title: "Aluguel concluído", text: order.deposit ? "A caução foi estornada." : "Obrigado por alugar com a gente." },
    declined: { mood: "sad", title: "Pedido recusado", text: "O valor pago foi estornado." },
    cancelled: { mood: "sad", title: "Pedido cancelado", text: order.payment.status === "refunded" ? "O valor pago foi estornado." : "Nenhum valor foi cobrado." },
  };
  const copy = hero[order.status];

  async function advance(next: OrderStatus, message: string) {
    setBusy(next);
    try {
      await actions.setOrderStatus(order!.id, next);
      chime(next === "declined" || next === "cancelled" ? "tap" : "success");
      toast(message, next === "declined" || next === "cancelled" ? "info" : "success");
    } catch (error) {
      toast(errorMessage(error), "error");
    } finally {
      setBusy(null);
    }
  }

  const businessNext: Partial<Record<OrderStatus, { label: string; to: OrderStatus; toast: string }>> = {
    accepted: { label: pickup ? "Pronto para retirada" : "Saiu para entrega", to: "on_the_way", toast: pickup ? "Cliente avisado da retirada" : "Cliente avisado da entrega" },
    on_the_way: { label: pickup ? "Confirmar retirada" : "Confirmar entrega", to: "delivered", toast: "Entrega confirmada" },
    delivered: { label: "Confirmar devolução", to: "returned", toast: order.deposit ? "Devolução confirmada e caução estornada" : "Aluguel concluído" },
  };
  const next = businessNext[order.status];
  const payment = order.payment;
  const refunded = payment.refunded > 0 ? ` · ${brl(payment.refunded)} estornado` : "";

  return (
    <Page title={`Pedido ${order.code}`}>
      <div className="anim-rise flex items-center gap-3 rounded-[28px] bg-card p-4">
        <Mascot mood={copy.mood} size={86} className="shrink-0" />
        <div className="min-w-0 flex-1">
          <StatusPill order={order} role={me.role} />
          <p className="mt-1.5 type-title3">{copy.title}</p>
          <p className="mt-0.5 type-subhead text-muted-foreground">{copy.text}</p>
        </div>
      </div>

      {order.status === "awaiting_payment" && payment.pix && !isBusiness ? <PixPanel order={order} /> : null}
      {order.status === "awaiting_payment" && payment.ticket && !isBusiness ? <TicketPanel order={order} /> : null}

      <Group title="Andamento">
        <Timeline order={order} />
      </Group>

      <Group>
        <Row
          leading={<Img src={order.item.image} alt="" className="mr-3 size-12 shrink-0 rounded-[12px]" />}
          title={order.item.name}
          subtitle={isBusiness ? `Pedido de ${customer.name}` : business.name}
          chevron={!isBusiness}
          onClick={!isBusiness ? () => nav.push("item", { id: order.itemId }) : undefined}
        />
        <Row title="Período" value={`${dateLabel(order.start)} → ${returnDay}`} />
        <Row title={pickup ? "Retirada" : "Entrega"} subtitle={`${order.address.label}${order.address.detail ? ` · ${order.address.detail}` : ""}`} />
        <Row title="Pagamento" value={payment.label} subtitle={payment.status === "approved" ? undefined : `${paymentStatusText[payment.status]}${refunded}`} />
      </Group>

      <Group title="Valores" footer={order.deposit ? `Caução de ${brl(order.deposit)} incluída no total e estornada quando a loja confirma a devolução.` : undefined}>
        <Row title={`Aluguel (${plural(order.days, "dia", "dias")})`} value={brl(order.rent)} />
        {order.deliveryFee ? <Row title="Entrega" value={brl(order.deliveryFee)} /> : null}
        <Row title={isBusiness ? "Taxa da Obi Ágil" : "Taxa de serviço"} value={brl(order.serviceFee)} />
        {order.deposit ? <Row title="Caução" value={brl(order.deposit)} /> : null}
        {order.payment.refunded ? <Row title="Estornado" value={brl(order.payment.refunded)} /> : null}
        {isBusiness ? (
          <Row
            title={<span className="font-semibold">Você recebe</span>}
            value={<span className="font-semibold text-foreground">{brl(Math.max(0, order.total - order.serviceFee - order.payment.refunded))}</span>}
          />
        ) : (
          <Row title={<span className="font-semibold">Total</span>} value={<span className="font-semibold text-foreground">{brl(order.total)}</span>} />
        )}
      </Group>

      {order.status !== "awaiting_payment" ? (
        <Group>
          <Row
            icon={MessageCircle}
            tone="blue"
            title="Mensagens"
            trailing={
              order.unread ? (
                <span className="grid h-[22px] min-w-[22px] place-items-center rounded-full bg-badge px-1.5 type-footnote font-semibold text-primary-foreground">{order.unread}</span>
              ) : null
            }
            chevron
            onClick={() => nav.push("chat", { id: order.id })}
          />
          {isBusiness ? (
            customer.phone ? (
              <Row
                icon={Phone}
                tone="green"
                leading={
                  <span className="mr-3">
                    <Avatar name={customer.name} src={customer.photo} size={30} />
                  </span>
                }
                title={`Ligar para ${customer.name}`}
                href={`tel:+55${customer.phone}`}
              />
            ) : null
          ) : business.phone ? (
            <Row icon={Phone} tone="green" title={`Ligar para ${business.name}`} href={`tel:+55${business.phone}`} />
          ) : null}
          <Row
            icon={Navigation}
            tone="indigo"
            title={pickup ? "Como chegar na loja" : isBusiness ? "Ver endereço no mapa" : "Ver loja no mapa"}
            href={directionsUrl(pickup || !isBusiness ? business.address : order.address)}
          />
        </Group>
      ) : null}

      <div className="mt-6 flex flex-col gap-2">
        {isBusiness ? (
          order.status === "pending" ? (
            <>
              <Button loading={busy === "accepted"} onClick={() => void advance("accepted", "Pedido aceito")}>
                Aceitar pedido
              </Button>
              <Button variant="destructive" onClick={() => setConfirm("decline")}>
                Recusar
              </Button>
            </>
          ) : next ? (
            <>
              <Button loading={busy === next.to} onClick={() => void advance(next.to, next.toast)}>
                {next.label}
              </Button>
              {order.status === "accepted" ? (
                <Button variant="destructive" onClick={() => setConfirm("cancel")}>
                  Cancelar pedido
                </Button>
              ) : null}
            </>
          ) : null
        ) : (
          <>
            {order.status === "returned" && !order.reviewed ? <Button onClick={() => setReviewing(true)}>Avaliar a loja</Button> : null}
            {order.status === "returned" || order.status === "declined" || order.status === "cancelled" ? (
              <Button variant="tinted" onClick={() => nav.push("item", { id: order.itemId })}>
                <RotateCcw className="size-[18px]" aria-hidden="true" />
                Alugar de novo
              </Button>
            ) : null}
            {order.status === "awaiting_payment" || order.status === "pending" || order.status === "accepted" ? (
              <Button variant="destructive" onClick={() => setConfirm("cancel")}>
                Cancelar pedido
              </Button>
            ) : null}
          </>
        )}
      </div>

      <ActionSheet
        open={confirm !== null}
        onClose={() => setConfirm(null)}
        title={confirm === "decline" ? "Recusar este pedido?" : "Cancelar este pedido?"}
        message={order.payment.status === "approved" ? "O valor pago é estornado para o cliente." : "Nenhum valor será cobrado."}
        actions={[
          confirm === "decline"
            ? { label: "Recusar pedido", destructive: true, onClick: () => void advance("declined", "Pedido recusado") }
            : { label: "Cancelar pedido", destructive: true, onClick: () => void advance("cancelled", "Pedido cancelado") },
        ]}
      />
      <ReviewSheet
        open={reviewing}
        onClose={() => setReviewing(false)}
        store={business.name}
        onSend={async (stars, text) => {
          try {
            await actions.review(order.id, stars, text);
            setReviewing(false);
            setCelebrate("reviewed");
          } catch (error) {
            toast(errorMessage(error), "error");
          }
        }}
      />
      <SuccessOverlay
        open={celebrate === "paid"}
        title="Pagamento confirmado!"
        message={`${business.name} já recebeu o pedido e vai confirmar em breve.`}
        primary={{ label: "Ótimo", onClick: () => setCelebrate(null) }}
      />
      <SuccessOverlay
        open={celebrate === "reviewed"}
        title="Obrigado!"
        message="Sua avaliação ajuda outras obras a escolher bem."
        primary={{ label: "Fechar", onClick: () => setCelebrate(null) }}
      />
    </Page>
  );
}

const paymentStatusText: Record<Order["payment"]["status"], string> = {
  pending: "Aguardando pagamento",
  approved: "Pago",
  rejected: "Recusado",
  cancelled: "Não cobrado",
  refunded: "Estornado",
  partially_refunded: "Pago",
};
