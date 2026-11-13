import { useEffect, useRef, useState, type CSSProperties, type InputHTMLAttributes } from "react";
import { CreditCard } from "lucide-react";
import { ApiError } from "../lib/api.ts";
import { chime } from "../lib/feedback.ts";
import { digits, formatCpf, isValidCpf } from "../lib/format.ts";
import { cardErrorMessage, fieldIds, fieldStyle, useMercadoPago, type MercadoPagoSdk } from "../lib/mercadopago.ts";
import { actions, useDB, useMe } from "../lib/store.ts";
import { toast } from "../lib/toast.ts";
import type { PaymentMethod } from "../lib/types.ts";
import { Spinner } from "./controls.tsx";
import { Mascot } from "./Mascot.tsx";
import { Sheet } from "./Sheet.tsx";

export type CardFace = { brand: string; lastFour: string; holder: string; expiry: string };

const gradients: Record<string, string> = {
  Visa: "var(--wallet-visa)",
  Mastercard: "var(--wallet-master)",
  Elo: "var(--wallet-elo)",
  "American Express": "var(--wallet-amex)",
};

export function brandBackground(brand: string) {
  if (brand === "Pix") return "var(--wallet-pix)";
  return gradients[brand] ?? "var(--wallet-card)";
}

export function cardFace(method: PaymentMethod): CardFace {
  return {
    brand: method.brand,
    lastFour: method.lastFour,
    holder: method.holder,
    expiry: `${String(method.expMonth).padStart(2, "0")}/${String(method.expYear).slice(-2)}`,
  };
}

export function MethodBadge({ brand }: { brand: string }) {
  const label = brand === "Mastercard" ? "MC" : brand === "American Express" ? "AMEX" : brand === "Pix" ? "PIX" : brand.toUpperCase().slice(0, 4);
  return (
    <span
      aria-hidden="true"
      className="grid h-7 w-10 shrink-0 place-items-center rounded-[6px] text-[10px] font-bold tracking-wide text-primary-foreground"
      style={{ background: brandBackground(brand) }}
    >
      {label}
    </span>
  );
}

export function methodTitle(method: PaymentMethod) {
  return `${method.brand} •••• ${method.lastFour}`;
}

export function methodDetail(method: PaymentMethod) {
  return `${method.holder || "Cartão de crédito"} · ${cardFace(method).expiry}`;
}

export function WalletCard({
  card,
  isDefault,
  onClick,
  className = "",
  style,
}: {
  card: CardFace;
  isDefault?: boolean;
  onClick?: () => void;
  className?: string;
  style?: CSSProperties;
}) {
  const content = (
    <>
      <span aria-hidden="true" className="absolute -top-16 -right-10 size-48 rounded-full" style={{ background: "rgb(255 255 255 / 0.1)" }} />
      <span aria-hidden="true" className="absolute -bottom-24 -left-14 size-60 rounded-full" style={{ background: "rgb(255 255 255 / 0.07)" }} />
      <span className="relative flex items-start justify-between gap-3">
        <span className="type-title3 font-bold">{card.brand}</span>
        {isDefault ? (
          <span className="rounded-full px-2.5 py-1 type-caption font-semibold" style={{ background: "rgb(255 255 255 / 0.22)" }}>
            Padrão
          </span>
        ) : null}
      </span>
      <span className="absolute inset-x-5 bottom-5 block">
        <span aria-hidden="true" className="mb-4 block h-8 w-11 rounded-[7px]" style={{ background: "var(--wallet-chip)" }} />
        <span className="block type-title3 tracking-[0.14em] tabular-nums">•••• {card.lastFour}</span>
        <span className="mt-1 flex justify-between gap-3 type-footnote opacity-85">
          <span className="truncate uppercase">{card.holder}</span>
          <span className="shrink-0 tabular-nums">{card.expiry}</span>
        </span>
      </span>
    </>
  );
  const base = `relative flex aspect-[1.586/1] w-full flex-col justify-start overflow-hidden rounded-[22px] p-5 text-left text-primary-foreground shadow-[0_14px_30px_-14px_rgb(0_0_0/0.55)] ${className}`;
  const background = brandBackground(card.brand);
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-label={`${card.brand} final ${card.lastFour}${isDefault ? ", padrão" : ""}`}
        className={`${base} cursor-pointer transition-transform duration-300 active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary`}
        style={{ background, ...style }}
      >
        {content}
      </button>
    );
  }
  return (
    <div aria-hidden="true" className={base} style={{ background, ...style }}>
      {content}
    </div>
  );
}

function SecureRow({ label, id }: { label: string; id: string }) {
  return (
    <div className="row flex w-full items-center pl-4">
      <span className="row-main flex min-h-[48px] min-w-0 flex-1 items-center gap-2 pr-4">
        <span className="w-[108px] shrink-0 type-body">{label}</span>
        <div id={id} className="h-[48px] min-w-0 flex-1" />
      </span>
    </div>
  );
}

function PlainRow({ label, ...input }: InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <label className="row flex w-full items-center pl-4">
      <span className="row-main flex min-h-[48px] min-w-0 flex-1 items-center gap-2 pr-4">
        <span className="w-[108px] shrink-0 type-body">{label}</span>
        <input {...input} className="h-[48px] min-w-0 flex-1 bg-transparent type-body outline-none placeholder:text-subtle" />
      </span>
    </label>
  );
}

/** Number, expiry and CVV in Mercado Pago iframes, plus holder name and CPF. */
export function CardForm({
  sdk,
  holder,
  onHolder,
  cpf,
  onCpf,
  onBin,
  onBrand,
}: {
  sdk: MercadoPagoSdk;
  holder: string;
  onHolder: (value: string) => void;
  cpf: string;
  onCpf: (value: string) => void;
  onBin?: (bin: string | null) => void;
  onBrand?: (brand: string | null) => void;
}) {
  const [ids] = useState(fieldIds);
  const callbacks = useRef({ onBin, onBrand });
  useEffect(() => {
    callbacks.current = { onBin, onBrand };
  });

  useEffect(() => {
    const number = sdk.fields.create("cardNumber", { placeholder: "0000 0000 0000 0000", style: fieldStyle, srLabel: "Número do cartão" }).mount(ids.number);
    const expiry = sdk.fields.create("expirationDate", { placeholder: "MM/AA", mode: "short", style: fieldStyle, srLabel: "Validade" }).mount(ids.expiry);
    const cvv = sdk.fields.create("securityCode", { placeholder: "123", style: fieldStyle, srLabel: "Código de segurança" }).mount(ids.cvv);
    let current: string | null = null;
    number.on("binChange", async ({ bin }) => {
      if (bin === current) return;
      current = bin;
      callbacks.current.onBin?.(bin);
      if (!bin) {
        callbacks.current.onBrand?.(null);
        return;
      }
      try {
        const method = (await sdk.getPaymentMethods({ bin })).results[0];
        if (!method || current !== bin) return;
        callbacks.current.onBrand?.(method.name === "master" ? "Mastercard" : method.name.charAt(0).toUpperCase() + method.name.slice(1));
        const settings = method.settings[0];
        if (settings) {
          number.update({ settings: settings.card_number });
          cvv.update({ settings: settings.security_code });
        }
      } catch {
        // The brand is cosmetic; installments are fetched by our server.
      }
    });
    return () => {
      number.unmount();
      expiry.unmount();
      cvv.unmount();
    };
  }, [sdk, ids]);

  return (
    <div className="ios-group overflow-hidden rounded-[22px] bg-card">
      <SecureRow label="Número" id={ids.number} />
      <SecureRow label="Validade" id={ids.expiry} />
      <SecureRow label="Código" id={ids.cvv} />
      <PlainRow label="Nome" value={holder} autoComplete="cc-name" placeholder="Como está no cartão" onChange={(e) => onHolder(e.target.value)} />
      <PlainRow label="CPF" value={formatCpf(cpf)} inputMode="numeric" placeholder="000.000.000-00" onChange={(e) => onCpf(digits(e.target.value, 11))} />
    </div>
  );
}

/** Only the CVV, for paying with a card saved in Mercado Pago. */
export function CvvField({ sdk, paymentMethodId }: { sdk: MercadoPagoSdk; paymentMethodId: string }) {
  const [ids] = useState(fieldIds);
  useEffect(() => {
    const cvv = sdk.fields.create("securityCode", { placeholder: paymentMethodId === "amex" ? "1234" : "123", style: fieldStyle, srLabel: "Código de segurança" }).mount(ids.cvv);
    if (paymentMethodId === "amex") cvv.update({ settings: { mode: "mandatory", length: 4 } });
    return () => cvv.unmount();
  }, [sdk, ids, paymentMethodId]);
  return <SecureRow label="Código" id={ids.cvv} />;
}

export function PaymentsUnavailable({ text = "Os pagamentos com cartão e Pix ainda estão sendo ligados. Tente de novo mais tarde." }: { text?: string }) {
  return (
    <div className="flex flex-col items-center px-4 py-6 text-center">
      <Mascot mood="think" size={96} />
      <p className="mt-3 type-headline">Pagamentos em configuração</p>
      <p className="mt-1 max-w-[280px] type-subhead text-muted-foreground">{text}</p>
    </div>
  );
}

export function AddCardSheet({ open, onClose, onAdded }: { open: boolean; onClose: () => void; onAdded?: (method: PaymentMethod) => void }) {
  const me = useMe();
  const payments = useDB().payments;
  const { enabled, sdk, failed } = useMercadoPago();
  const [holder, setHolder] = useState("");
  const [cpf, setCpf] = useState("");
  const [brand, setBrand] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setHolder("");
    setCpf(me.cpf ?? "");
    setBrand(null);
    setError("");
  }, [open, me.cpf]);

  async function save() {
    if (!sdk) return;
    if (holder.trim().length < 4) return setError("Digite o nome como está no cartão.");
    if (!isValidCpf(cpf)) return setError("Confira o CPF do titular do cartão.");
    setSaving(true);
    setError("");
    try {
      const token = await sdk.fields.createCardToken({ cardholderName: holder.trim(), identificationType: "CPF", identificationNumber: cpf });
      if (!token?.id) throw new Error("token");
      const before = new Set(payments.map((p) => p.id));
      const list = await actions.addCard(token.id);
      if (!me.cpf) void actions.updateAccount({ cpf }).catch(() => {});
      chime("success");
      toast("Cartão adicionado");
      const added = list.find((p) => !before.has(p.id));
      if (added) onAdded?.(added);
      onClose();
    } catch (problem) {
      setError(problem instanceof ApiError ? problem.message : cardErrorMessage(problem));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Novo cartão"
      large
      confirm={enabled ? { label: "Salvar cartão", onClick: () => void save(), disabled: !sdk, loading: saving } : undefined}
    >
      {!enabled ? (
        <PaymentsUnavailable />
      ) : (
        <>
          <WalletCard card={{ brand: brand ?? "Cartão", lastFour: "••••", holder: holder.trim() || "Nome no cartão", expiry: "MM/AA" }} className="mx-auto max-w-[330px]" />
          <div className="mt-5">
            {sdk ? (
              <CardForm sdk={sdk} holder={holder} onHolder={setHolder} cpf={cpf} onCpf={setCpf} onBrand={setBrand} />
            ) : failed ? (
              <p role="alert" className="px-4 text-center type-subhead text-destructive">
                Não conseguimos carregar o Mercado Pago. Confira a internet e abra de novo.
              </p>
            ) : (
              <div className="grid h-40 place-items-center text-muted-foreground">
                <Spinner />
              </div>
            )}
          </div>
          {error ? (
            <p role="alert" className="mt-3 px-4 type-footnote text-destructive">
              {error}
            </p>
          ) : null}
          <p className="mt-3 flex gap-2 px-4 type-footnote text-muted-foreground">
            <CreditCard className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            Os dados do cartão vão direto para o Mercado Pago. Guardamos só a bandeira e os 4 últimos números.
          </p>
        </>
      )}
    </Sheet>
  );
}
