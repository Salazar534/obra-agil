import { useEffect, useState } from "react";
import { Eye, EyeOff, MailCheck } from "lucide-react";
import { errorMessage } from "../../lib/api.ts";
import { digits, formatPhone, isValidEmail, normalizePhone } from "../../lib/format.ts";
import { actions, useDB } from "../../lib/store.ts";
import { Button, Field } from "../../ui/controls.tsx";
import { Mascot } from "../../ui/Mascot.tsx";
import { Sheet } from "../../ui/Sheet.tsx";

export function PasswordField({
  label = "Senha",
  value,
  onChange,
  error,
  hint,
  autoComplete = "current-password",
  autoFocus,
}: {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  hint?: string;
  autoComplete?: "current-password" | "new-password";
  autoFocus?: boolean;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <Field
      label={label}
      type={visible ? "text" : "password"}
      value={value}
      autoComplete={autoComplete}
      autoCapitalize="none"
      autoCorrect="off"
      spellCheck={false}
      autoFocus={autoFocus}
      placeholder={autoComplete === "new-password" ? "Pelo menos 8 caracteres" : "Sua senha"}
      error={error}
      hint={hint}
      onChange={(event) => onChange(event.target.value)}
      trailing={
        <button
          type="button"
          aria-label={visible ? "Esconder senha" : "Mostrar senha"}
          onClick={() => setVisible((v) => !v)}
          className="-mr-2 grid size-10 shrink-0 cursor-pointer place-items-center rounded-full text-muted-foreground active:bg-muted"
        >
          {visible ? <EyeOff className="size-5" aria-hidden="true" /> : <Eye className="size-5" aria-hidden="true" />}
        </button>
      }
    />
  );
}

export function PhoneField({ value, onChange, error, autoFocus }: { value: string; onChange: (digits: string) => void; error?: string; autoFocus?: boolean }) {
  return (
    <Field
      label="Celular"
      adornment={<span className="type-body font-semibold">+55</span>}
      value={formatPhone(value)}
      inputMode="numeric"
      autoComplete="tel-national"
      placeholder="(11) 99999-9999"
      autoFocus={autoFocus}
      error={error}
      onChange={(event) => onChange(normalizePhone(event.target.value))}
    />
  );
}

export function CodeInput({ value, onChange, invalid }: { value: string; onChange: (code: string) => void; invalid?: boolean }) {
  const [focused, setFocused] = useState(false);
  return (
    <label className="relative block">
      <span className="sr-only">Código de 6 dígitos</span>
      <input
        value={value}
        autoFocus
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={6}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onChange={(e) => onChange(digits(e.target.value, 6))}
        className="absolute inset-0 z-10 size-full cursor-text opacity-0"
      />
      <span aria-hidden="true" className={`grid grid-cols-6 gap-2 ${invalid ? "anim-shake" : ""}`}>
        {Array.from({ length: 6 }, (_, i) => {
          const char = value[i];
          const current = focused && i === Math.min(value.length, 5);
          return (
            <span
              key={`${i}-${char ?? ""}`}
              className={`grid h-[62px] place-items-center rounded-[18px] bg-card type-title2 tabular-nums ring-2 transition-shadow elev-1 ${
                invalid ? "ring-destructive" : current ? "ring-primary" : value.length === 6 ? "ring-success" : "ring-transparent"
              } ${char ? "anim-pop" : ""}`}
            >
              {char ?? ""}
            </span>
          );
        })}
      </span>
    </label>
  );
}

/** Seconds left before another code can be requested. */
export function useCooldown(start: number) {
  const [left, setLeft] = useState(start);
  useEffect(() => {
    if (left <= 0) return;
    const timer = window.setTimeout(() => setLeft((s) => s - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [left]);
  return [left, setLeft] as const;
}

export function DevHint({ children }: { children: string }) {
  return <p className="mt-3 rounded-[16px] bg-warning/12 px-3 py-2 type-footnote text-warning">{children}</p>;
}

export function ForgotPasswordSheet({ open, onClose, initialEmail = "" }: { open: boolean; onClose: () => void; initialEmail?: string }) {
  const mailMode = useDB().config?.email.mode;
  const [email, setEmail] = useState(initialEmail);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    if (!open) return;
    setEmail(initialEmail);
    setError("");
    setSent(false);
  }, [open, initialEmail]);

  async function send() {
    if (!isValidEmail(email)) return setError("Esse e-mail está incompleto.");
    setPending(true);
    setError("");
    try {
      await actions.forgotPassword(email.trim().toLowerCase());
      setSent(true);
    } catch (problem) {
      setError(errorMessage(problem));
    } finally {
      setPending(false);
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title="Esqueci a senha" confirm={sent ? undefined : { label: "Enviar link", onClick: () => void send(), loading: pending }}>
      {sent ? (
        <div className="flex flex-col items-center px-2 pb-2 text-center">
          <span className="grid size-16 place-items-center rounded-full bg-tint text-primary">
            <MailCheck className="size-8" aria-hidden="true" />
          </span>
          <p className="mt-3 type-title3">Confira seu e-mail</p>
          <p className="mt-1 type-subhead text-muted-foreground">
            Se existir uma conta com {email.trim()}, enviamos um link para criar uma nova senha. Ele vale por 30 minutos.
          </p>
          {mailMode === "console" ? <DevHint>Ambiente de teste: o link aparece no terminal da API.</DevHint> : null}
          <Button className="mt-5" onClick={onClose}>
            Entendi
          </Button>
        </div>
      ) : (
        <>
          <div className="flex items-center gap-3 pb-4">
            <Mascot mood="think" size={64} />
            <p className="type-subhead text-muted-foreground">Digite o e-mail da conta. Vamos mandar um link para você criar uma senha nova.</p>
          </div>
          <Field
            label="E-mail"
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            placeholder="voce@email.com"
            value={email}
            error={error}
            data-autofocus
            onChange={(e) => {
              setEmail(e.target.value);
              setError("");
            }}
          />
        </>
      )}
    </Sheet>
  );
}
