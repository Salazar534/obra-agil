import { useEffect, useState } from "react";
import { Check, ChevronRight, CreditCard, Heart, MapPin, Navigation, QrCode, Share } from "lucide-react";
import { ApiError, errorMessage } from "../../lib/api.ts";
import { addDays, brl, brlShort, dateLabel, dayChip, isoDay, isValidCpf, isValidEmail, plural } from "../../lib/format.ts";
import { directionsUrl, distanceKm, formatKm, type Address } from "../../lib/geo.ts";
import { cardErrorMessage, useMercadoPago } from "../../lib/mercadopago.ts";
import { useNav } from "../../lib/nav.tsx";
import { actions, businessOf, isFavorite, itemOf, originOf, useDB, useMe, useRequest, type PlaceOrderInput } from "../../lib/store.ts";
import { toast } from "../../lib/toast.ts";
import type { Business, Installments, Item, Order } from "../../lib/types.ts";
import { AddressSheet } from "../../ui/AddressPicker.tsx";
import { SuccessOverlay } from "../../ui/Celebrate.tsx";
import { BizLogo, Button, FieldRow, GlassButton, Group, Img, Rating, Row, Segmented, SelectRow, Spinner, Stepper } from "../../ui/controls.tsx";
import { Page } from "../../ui/Page.tsx";
import { CardForm, CvvField, MethodBadge, methodDetail, methodTitle, PaymentsUnavailable } from "../../ui/PaymentForm.tsx";
import { Sheet } from "../../ui/Sheet.tsx";
import { PageLoading, shareLink, toggleSaved } from "./BusinessScreen.tsx";

type Mode = Order["mode"];
type Choice = { kind: "saved"; id: string } | { kind: "new" } | { kind: "pix" };

const round2 = (value: number) => Math.round(value * 100) / 100;

export function priceOf(item: Item, business: Business, days: number, mode: Mode, feeRate: number) {
  const rent = round2(item.price * days);
  const deliveryFee = mode === "delivery" ? business.deliveryFee : 0;
  const serviceFee = Math.round(rent * 100 * feeRate) / 100;
  return { rent, deliveryFee, serviceFee, deposit: item.deposit, total: round2(rent + deliveryFee + serviceFee + item.deposit) };
}

function CheckoutSheet({
  open,
  onClose,
  item,
  business,
  start,
  days,
  mode,
  address,
  onPlaced,
}: {
  open: boolean;
  onClose: () => void;
  item: Item;
  business: Business;
  start: string;
  days: number;
  mode: Mode;
  address: Address;
  onPlaced: (order: Order) => void;
}) {
  const db = useDB();
  const me = useMe();
  const { enabled, sdk, failed } = useMercadoPago();
  const cards = db.payments;
  const price = priceOf(item, business, days, mode, db.config?.serviceFeeRate ?? 0.05);
  const defaultChoice = (): Choice => {
    const preferred = cards.find((c) => c.isDefault) ?? cards[0];
    return preferred ? { kind: "saved", id: preferred.id } : { kind: "new" };
  };
  const [choice, setChoice] = useState<Choice>(defaultChoice);
  const [plan, setPlan] = useState<Installments | null>(null);
  const [planLoading, setPlanLoading] = useState(false);
  const [count, setCount] = useState(1);
  const [bin, setBin] = useState<string | null>(null);
  const [holder, setHolder] = useState("");
  const [cpf, setCpf] = useState(me.cpf ?? "");
  const [email, setEmail] = useState(me.email ?? "");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!open) return;
    setError("");
    setCount(1);
    setChoice(defaultChoice());
    // Only when the sheet opens; later card changes keep the person's choice.
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const saved = choice.kind === "saved" ? cards.find((c) => c.id === choice.id) : undefined;
  const planBin = choice.kind === "saved" ? (saved?.firstSix ?? null) : choice.kind === "new" ? bin : null;

  useEffect(() => {
    if (!open || !enabled || !planBin) {
      setPlan(null);
      return;
    }
    let alive = true;
    setPlanLoading(true);
    actions
      .installments(price.total, planBin)
      .then((next) => {
        if (!alive) return;
        setPlan(next);
        setCount((current) => (next.options.some((o) => o.installments === current) ? current : 1));
      })
      .catch((problem) => alive && setError(errorMessage(problem)))
      .finally(() => alive && setPlanLoading(false));
    return () => {
      alive = false;
    };
  }, [open, enabled, planBin, price.total]);

  const option = plan?.options.find((o) => o.installments === count);
  const needEmail = !me.email;
  const card = choice.kind !== "pix";
  const ready = enabled && !pending && (card ? Boolean(sdk && plan && option) : true);

  async function confirm() {
    if (!ready) return;
    if (needEmail && !isValidEmail(email)) return setError("Informe um e-mail para receber o comprovante.");
    setPending(true);
    setError("");
    try {
      let payment: PlaceOrderInput["payment"] = { method: "pix" };
      let payerCpf: string | undefined;
      if (choice.kind === "saved" && saved && sdk && plan) {
        const token = await sdk.fields.createCardToken({ cardId: saved.cardId });
        if (!token?.id) throw new Error("token");
        payment = { method: "card", token: token.id, paymentMethodId: saved.paymentMethodId, issuerId: saved.issuerId, installments: count, savedCardId: saved.id };
      } else if (choice.kind === "new" && sdk && plan) {
        if (holder.trim().length < 4) throw new Error("holder");
        if (!isValidCpf(cpf)) throw new Error("cpf");
        const token = await sdk.fields.createCardToken({ cardholderName: holder.trim(), identificationType: "CPF", identificationNumber: cpf });
        if (!token?.id) throw new Error("token");
        payment = { method: "card", token: token.id, paymentMethodId: plan.paymentMethodId, issuerId: plan.issuerId, installments: count };
        payerCpf = cpf;
      }
      const order = await actions.placeOrder({
        itemId: item.id,
        start,
        days,
        mode,
        address: mode === "delivery" ? address : undefined,
        payment,
        payer: needEmail || (payerCpf && !me.cpf) ? { email: needEmail ? email.trim().toLowerCase() : undefined, cpf: me.cpf ? undefined : payerCpf } : undefined,
      });
      onPlaced(order);
    } catch (problem) {
      if (problem instanceof Error && problem.message === "holder") setError("Digite o nome como está no cartão.");
      else if (problem instanceof Error && problem.message === "cpf") setError("Confira o CPF do titular do cartão.");
      else setError(problem instanceof ApiError ? problem.message : cardErrorMessage(problem));
    } finally {
      setPending(false);
    }
  }

  const buttonLabel = !enabled
    ? "Pagamentos em configuração"
    : choice.kind === "pix"
      ? `Gerar Pix · ${brl(price.total)}`
      : option && option.installments > 1
        ? `Pagar ${option.installments}x de ${brl(option.installmentAmount)}`
        : `Pagar ${brl(option?.totalAmount ?? price.total)}`;

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Confirmar pedido"
      large
      footer={
        <Button loading={pending} disabled={!ready} onClick={() => void confirm()}>
          {pending ? "Processando" : buttonLabel}
        </Button>
      }
    >
      <div className="flex items-center gap-3 rounded-[22px] bg-card p-3">
        <Img src={item.image} alt="" className="size-16 shrink-0 rounded-[16px]" />
        <div className="min-w-0">
          <p className="truncate type-headline">{item.name}</p>
          <p className="truncate type-footnote text-muted-foreground">{business.name}</p>
          <p className="mt-1 type-footnote font-semibold">
            {dateLabel(start)} → {dateLabel(addDays(start, days))}
          </p>
        </div>
      </div>

      <Group title="Recebimento">
        <Row
          icon={mode === "delivery" ? MapPin : Navigation}
          tone={mode === "delivery" ? "orange" : "indigo"}
          title={mode === "delivery" ? "Entrega na obra" : "Retirada na loja"}
          subtitle={(mode === "delivery" ? address : business.address).label}
        />
      </Group>

      {!enabled ? (
        <PaymentsUnavailable text="A loja ainda não pode receber pagamentos pelo app. Tente de novo mais tarde." />
      ) : (
        <>
          <Group title="Pagamento">
            {cards.map((method) => (
              <Row
                key={method.id}
                leading={
                  <span className="mr-3">
                    <MethodBadge brand={method.brand} />
                  </span>
                }
                title={methodTitle(method)}
                subtitle={methodDetail(method)}
                onClick={() => setChoice({ kind: "saved", id: method.id })}
                trailing={choice.kind === "saved" && choice.id === method.id ? <Selected /> : null}
              />
            ))}
            <Row
              icon={CreditCard}
              tone="blue"
              title="Novo cartão de crédito"
              subtitle="Parcele em até 12x"
              onClick={() => setChoice({ kind: "new" })}
              trailing={choice.kind === "new" ? <Selected /> : null}
            />
            <Row
              icon={QrCode}
              tone="teal"
              title="Pix"
              subtitle="Aprovação na hora · código válido por 30 min"
              onClick={() => setChoice({ kind: "pix" })}
              trailing={choice.kind === "pix" ? <Selected /> : null}
            />
          </Group>

          {card && !sdk ? (
            <div className="mt-4 grid h-24 place-items-center text-muted-foreground">
              {failed ? <p className="px-6 text-center type-subhead text-destructive">Não conseguimos carregar o Mercado Pago. Confira a internet.</p> : <Spinner />}
            </div>
          ) : null}

          {choice.kind === "saved" && saved && sdk ? (
            <Group title={`${saved.brand} •••• ${saved.lastFour}`} footer="Digite o código de segurança (CVV) do verso do cartão.">
              <CvvField key={saved.id} sdk={sdk} paymentMethodId={saved.paymentMethodId} />
            </Group>
          ) : null}

          {choice.kind === "new" && sdk ? (
            <div className="mt-6">
              <CardForm sdk={sdk} holder={holder} onHolder={setHolder} cpf={cpf} onCpf={setCpf} onBin={setBin} />
            </div>
          ) : null}

          {card && sdk ? (
            <Group footer={plan ? (option && option.rate > 0 ? `Com juros do cartão: total de ${brl(option.totalAmount)}.` : undefined) : "Digite o número do cartão para ver as parcelas."}>
              {plan ? (
                <SelectRow
                  label="Parcelas"
                  value={String(count)}
                  onChange={(value) => setCount(Number(value))}
                  options={plan.options.map((o) => ({ value: String(o.installments), label: o.label }))}
                />
              ) : (
                <Row title="Parcelas" value={planLoading ? "Calculando…" : "—"} />
              )}
            </Group>
          ) : null}

          {choice.kind === "pix" ? (
            <p className="mt-3 px-4 type-footnote text-muted-foreground">Depois de confirmar, mostramos o QR code e o Pix copia e cola. O pedido vai para a loja assim que o pagamento cair.</p>
          ) : null}

          {needEmail ? (
            <Group title="Comprovante" footer="O Mercado Pago envia o comprovante para este e-mail.">
              <FieldRow label="E-mail" type="email" inputMode="email" autoComplete="email" placeholder="voce@email.com" value={email} onChange={(e) => setEmail(e.target.value)} />
            </Group>
          ) : null}
        </>
      )}

      <Group title="Resumo" footer={price.deposit ? `A caução de ${brl(price.deposit)} é estornada quando a loja confirma a devolução.` : undefined}>
        <Row title={`Aluguel (${days} × ${brlShort(item.price)})`} value={brl(price.rent)} />
        {price.deliveryFee ? <Row title="Entrega" value={brl(price.deliveryFee)} /> : null}
        <Row title="Taxa de serviço" value={brl(price.serviceFee)} />
        {price.deposit ? <Row title="Caução" value={brl(price.deposit)} /> : null}
        <Row title={<span className="font-semibold">Total</span>} value={<span className="font-semibold text-foreground">{brl(price.total)}</span>} />
      </Group>

      {error ? (
        <p role="alert" className="mt-3 rounded-[16px] bg-destructive/10 px-4 py-3 type-subhead font-semibold text-destructive">
          {error}
        </p>
      ) : null}
    </Sheet>
  );
}

function Selected() {
  return (
    <span className="text-primary">
      <Check className="size-5" strokeWidth={2.6} aria-hidden="true" />
      <span className="sr-only">Selecionado</span>
    </span>
  );
}

export function ItemScreen({ id }: { id: string }) {
  const db = useDB();
  const me = useMe();
  const nav = useNav();
  const key = `item:${id}`;
  const status = useRequest(key, () => actions.loadItem(id));
  const item = itemOf(db, id);
  const business = item ? businessOf(db, item.businessId) : undefined;
  const origin = originOf(db, me);
  const today = isoDay(new Date());

  const [start, setStart] = useState(today);
  const [days, setDays] = useState(1);
  const [mode, setMode] = useState<Mode>("delivery");
  const [address, setAddress] = useState<Address>(origin);
  const [addressOpen, setAddressOpen] = useState(false);
  const [checkout, setCheckout] = useState(false);
  const [placed, setPlaced] = useState<Order | null>(null);

  if (!item || !business) return <PageLoading title="Equipamento" status={status} retryKey={key} />;

  const km = distanceKm(address, business.address);
  const canDeliver = km <= business.radiusKm;
  const preview = me.role === "business";
  const effectiveMode: Mode = canDeliver ? mode : "pickup";
  const price = priceOf(item, business, days, effectiveMode, db.config?.serviceFeeRate ?? 0.05);
  const dates = Array.from({ length: 14 }, (_, i) => addDays(today, i));
  const saved = isFavorite(db, item.id);
  const pix = placed?.status === "awaiting_payment";

  return (
    <Page
      title={item.name}
      hero={
        <div className="bg-card">
          <Img src={item.image} alt={item.name} className="aspect-square w-full" />
        </div>
      }
      actions={
        <>
          {preview ? null : (
            <GlassButton label={saved ? "Remover dos salvos" : "Salvar equipamento"} pressed={saved} onClick={() => void toggleSaved("item", item.id)}>
              <Heart className={saved ? "fill-badge text-badge" : ""} aria-hidden="true" />
            </GlassButton>
          )}
          <GlassButton label="Compartilhar" onClick={() => shareLink(item.name)}>
            <Share aria-hidden="true" />
          </GlassButton>
        </>
      }
      bottomBar={
        <div className="glass flex items-center gap-3 rounded-full p-2 pl-5">
          <div className="min-w-0 flex-1">
            <p className="type-headline tabular-nums">{brl(price.total)}</p>
            <p className="truncate type-footnote text-muted-foreground">
              {plural(days, "dia", "dias")} · {effectiveMode === "delivery" ? "com entrega" : "retirada"}
              {price.deposit ? " · caução volta" : ""}
            </p>
          </div>
          <Button size="md" disabled={!item.available || preview} onClick={() => setCheckout(true)}>
            {preview ? "Visualização" : item.available ? "Alugar" : "Indisponível"}
          </Button>
        </div>
      }
    >
      <div className="relative -mx-4 -mt-8 rounded-t-[34px] bg-background px-4 pt-6">
        <h1 className="type-title1">{item.name}</h1>
        <p className="mt-1.5 flex items-baseline gap-2">
          <span className="type-title2">{brlShort(item.price)}</span>
          <span className="type-subhead text-muted-foreground">por dia{item.deposit ? ` · caução ${brlShort(item.deposit)}` : ""}</span>
        </p>
        {!item.available ? (
          <p className="mt-3 rounded-[16px] bg-destructive/10 px-3 py-2 type-subhead font-semibold text-destructive">Indisponível no momento</p>
        ) : null}

        <button
          type="button"
          onClick={() => nav.push("business", { id: business.id })}
          className="mt-4 flex w-full cursor-pointer items-center gap-3 rounded-[22px] bg-card p-3 text-left transition-transform active:scale-[0.99] focus-visible:outline-2 focus-visible:outline-primary"
        >
          <BizLogo business={business} size={44} />
          <span className="min-w-0 flex-1">
            <span className="block truncate type-headline">{business.name}</span>
            <span className="mt-0.5 flex items-center gap-1 type-footnote text-muted-foreground">
              <Rating value={business.rating} count={business.reviewCount} />
              {preview ? null : (
                <>
                  <span aria-hidden="true">·</span>
                  {formatKm(distanceKm(origin, business.address))}
                </>
              )}
            </span>
          </span>
          <ChevronRight className="size-[18px] text-subtle" strokeWidth={2.4} aria-hidden="true" />
        </button>

        {item.specs.length ? (
          <div className="mt-4 flex flex-wrap gap-2">
            {item.specs.map((spec) => (
              <span key={spec} className="rounded-full bg-card px-3 py-1.5 type-footnote font-semibold elev-1">
                {spec}
              </span>
            ))}
          </div>
        ) : null}
        {item.description ? <p className="mt-4 type-body text-muted-foreground">{item.description}</p> : null}

        <Group title="Seu aluguel">
          <div className="row-block px-4 py-3">
            <p className="type-body">Início</p>
            <div className="-mx-4 mt-2.5 flex gap-2 overflow-x-auto px-4 pb-1" role="radiogroup" aria-label="Data de início">
              {dates.map((date) => {
                const chip = dayChip(date);
                const selected = date === start;
                return (
                  <button
                    key={date}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    aria-label={dateLabel(date)}
                    onClick={() => setStart(date)}
                    className={`flex h-[62px] w-[56px] shrink-0 cursor-pointer flex-col items-center justify-center rounded-[16px] transition-[background-color,color,transform] duration-200 active:scale-95 ${
                      selected ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"
                    }`}
                  >
                    <span className="type-caption font-semibold capitalize">{chip.top}</span>
                    <span className="type-title3">{chip.bottom}</span>
                  </button>
                );
              })}
            </div>
          </div>
          <Row title="Duração" value={plural(days, "dia", "dias")} trailing={<Stepper value={days} onChange={setDays} min={1} max={30} label="dias de aluguel" />} />
          <div className="row-block px-4 py-3">
            <Segmented
              label="Como receber"
              value={effectiveMode}
              onChange={(next) => {
                if (next === "delivery" && !canDeliver) {
                  toast(`Fora da área de entrega da loja (${business.radiusKm} km)`, "info");
                  return;
                }
                setMode(next);
              }}
              options={[
                { value: "delivery", label: canDeliver ? `Entrega ${brlShort(business.deliveryFee)}` : "Sem entrega" },
                { value: "pickup", label: "Retirar na loja" },
              ]}
            />
          </div>
          {effectiveMode === "delivery" ? (
            <Row icon={MapPin} tone="orange" title={address.label} subtitle={address.detail || "Endereço de entrega"} chevron onClick={() => setAddressOpen(true)} />
          ) : (
            <Row icon={Navigation} tone="indigo" title={business.address.label} subtitle="Retirada na loja · ver rota" chevron href={directionsUrl(business.address)} />
          )}
        </Group>
      </div>

      <AddressSheet open={addressOpen} onClose={() => setAddressOpen(false)} saved={me.addresses} title="Entregar onde?" onSelect={setAddress} />
      <CheckoutSheet
        open={checkout}
        onClose={() => setCheckout(false)}
        item={item}
        business={business}
        start={start}
        days={days}
        mode={effectiveMode}
        address={address}
        onPlaced={(order) => {
          setCheckout(false);
          setPlaced(order);
        }}
      />
      <SuccessOverlay
        open={placed !== null}
        title={pix ? "Pix gerado!" : "Pedido enviado!"}
        message={pix ? "Pague em até 30 minutos. O pedido vai para a loja assim que o pagamento cair." : `${business.name} recebeu o pedido e vai confirmar em breve.`}
        primary={{
          label: pix ? "Pagar com Pix" : "Acompanhar pedido",
          onClick: () => {
            const order = placed;
            setPlaced(null);
            if (order) nav.switchTab("orders", { name: "order", params: { id: order.id } });
          },
        }}
        secondary={
          pix
            ? undefined
            : {
                label: "Continuar explorando",
                onClick: () => {
                  setPlaced(null);
                  nav.pop();
                },
              }
        }
      />
    </Page>
  );
}
