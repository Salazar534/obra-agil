import { useEffect, useState } from "react";
import { useDB } from "./store.ts";

type FieldType = "cardNumber" | "expirationDate" | "securityCode";

export type SecureField = {
  mount(container: string): SecureField;
  unmount(): void;
  on(event: "binChange", callback: (event: { bin: string | null }) => void): SecureField;
  on(event: "validityChange", callback: (event: { field: string; errorMessages: { message: string; cause: string }[] }) => void): SecureField;
  on(event: "ready" | "focus" | "blur", callback: () => void): SecureField;
  update(properties: Record<string, unknown>): SecureField;
};

type PaymentMethodInfo = {
  id: string;
  name: string;
  settings: { card_number: Record<string, unknown>; security_code: Record<string, unknown> }[];
};

export type MercadoPagoSdk = {
  fields: {
    create(type: FieldType, options?: Record<string, unknown>): SecureField;
    createCardToken(data: { cardId?: string; cardholderName?: string; identificationType?: string; identificationNumber?: string }): Promise<{
      id: string;
      first_six_digits?: string;
      last_four_digits?: string;
    } | void>;
  };
  getPaymentMethods(options: { bin: string }): Promise<{ results: PaymentMethodInfo[] }>;
};

declare global {
  interface Window {
    MercadoPago?: new (publicKey: string, options?: { locale?: string }) => MercadoPagoSdk;
  }
}

let loading: { key: string; promise: Promise<MercadoPagoSdk> } | null = null;

function loadMercadoPago(publicKey: string) {
  if (loading?.key === publicKey) return loading.promise;
  const promise = new Promise<MercadoPagoSdk>((resolve, reject) => {
    const create = () => (window.MercadoPago ? resolve(new window.MercadoPago(publicKey, { locale: "pt-BR" })) : reject(new Error("sdk")));
    if (window.MercadoPago) return create();
    const script = document.createElement("script");
    script.src = "https://sdk.mercadopago.com/js/v2";
    script.async = true;
    script.onload = create;
    script.onerror = () => {
      loading = null;
      script.remove();
      reject(new Error("sdk"));
    };
    document.head.appendChild(script);
  });
  loading = { key: publicKey, promise };
  return promise;
}

/** Mercado Pago's card fields live in their iframes: the full number and CVV never touch our code or server. */
export function useMercadoPago() {
  const key = useDB().config?.payments.publicKey ?? null;
  const [sdk, setSdk] = useState<MercadoPagoSdk | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!key) return;
    let alive = true;
    loadMercadoPago(key)
      .then((instance) => alive && setSdk(instance))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [key]);
  return { enabled: key !== null, sdk, failed };
}

export const fieldStyle = {
  height: "100%",
  fontSize: "17px",
  fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', Roboto, sans-serif",
  color: "#1c1c1e",
  placeholderColor: "#a1a1a6",
};

let sequence = 0;
export function fieldIds() {
  sequence += 1;
  return { number: `mp-number-${sequence}`, expiry: `mp-expiry-${sequence}`, cvv: `mp-cvv-${sequence}` };
}

/** createCardToken rejects with a list of field problems; this names the first one the person can fix. */
export function cardErrorMessage(error: unknown) {
  const list = (Array.isArray(error) ? error : ((error as { cause?: unknown[] })?.cause ?? [])) as { field?: string; code?: string; message?: string }[];
  const text = JSON.stringify(list.length ? list : error ?? "").toLowerCase();
  if (text.includes("cardnumber") || text.includes("card_number") || text.includes("e205") || text.includes("e301")) return "Confira o número do cartão.";
  if (text.includes("expiration") || text.includes("325") || text.includes("326")) return "Confira a validade do cartão.";
  if (text.includes("securitycode") || text.includes("security_code") || text.includes("e302")) return "Confira o código de segurança.";
  if (text.includes("identification") || text.includes("324")) return "Confira o CPF do titular.";
  if (text.includes("cardholder") || text.includes("221") || text.includes("316")) return "Digite o nome como está no cartão.";
  return "Confira os dados do cartão e tente de novo.";
}
