import { useEffect, useRef, useState } from "react";
import { Check, ChevronLeft, MapPin } from "lucide-react";
import { ApiError, errorMessage } from "../../lib/api.ts";
import { categories, type CategoryId } from "../../lib/catalog.ts";
import { firstName, formatPhone, isMobile, isValidEmail, phoneProblem } from "../../lib/format.ts";
import type { Address } from "../../lib/geo.ts";
import { runTransition } from "../../lib/nav.tsx";
import { actions, useDB } from "../../lib/store.ts";
import { toast } from "../../lib/toast.ts";
import type { Role, Session } from "../../lib/types.ts";
import { AddressSearch } from "../../ui/AddressPicker.tsx";
import { SuccessOverlay } from "../../ui/Celebrate.tsx";
import { Button, Field, GlassButton, Segmented, ToneIcon } from "../../ui/controls.tsx";
import { MapView } from "../../ui/MapView.tsx";
import { MascotSays, type MascotMood } from "../../ui/Mascot.tsx";
import { CodeInput, DevHint, ForgotPasswordSheet, PasswordField, PhoneField, useCooldown } from "./AuthFields.tsx";

export type AuthMode = "signup" | "signin";
export type Prefill = { via: "phone" | "email"; value: string; ticket?: string };
type Step = "role" | "details" | "method" | "code" | "address";
type Problem = { text: string; action?: { label: string; run: () => void } };

function Progress({ value }: { value: number }) {
  return (
    <div
      role="progressbar"
      aria-label="Progresso do cadastro"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(value * 100)}
      className="h-4 min-w-0 flex-1 overflow-hidden rounded-full bg-muted"
    >
      <div
        className="relative h-full rounded-full bg-primary transition-[width] duration-700"
        style={{ width: `${Math.max(8, value * 100)}%`, transitionTimingFunction: "var(--ease-spring)" }}
      >
        <span aria-hidden="true" className="absolute inset-x-2 top-[3px] h-1 rounded-full" style={{ background: "rgb(255 255 255 / 0.38)" }} />
      </div>
    </div>
  );
}

function RoleCard({ selected, image, title, text, onClick }: { selected: boolean; image: string; title: string; text: string; onClick: () => void }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onClick}
      className={`flex w-full cursor-pointer items-center gap-4 rounded-[28px] bg-card p-3 pr-5 text-left ring-2 transition-[box-shadow,transform] duration-200 active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${
        selected ? "ring-primary" : "ring-transparent"
      } elev-1`}
    >
      <img src={image} alt="" className="size-[88px] shrink-0 rounded-[22px] bg-card object-cover" />
      <span className="min-w-0 flex-1">
        <span className="block type-headline">{title}</span>
        <span className="mt-0.5 block type-subhead text-muted-foreground">{text}</span>
      </span>
      <span
        aria-hidden="true"
        className={`grid size-7 shrink-0 place-items-center rounded-full border-2 transition-colors ${selected ? "border-primary bg-primary text-primary-foreground" : "border-border"}`}
      >
        {selected ? <Check className="size-4" strokeWidth={3} /> : null}
      </span>
    </button>
  );
}

export function AuthFlow({
  mode,
  initialRole,
  prefill,
  onExit,
  onSwitch,
}: {
  mode: AuthMode;
  initialRole?: Role;
  prefill?: Prefill;
  onExit: () => void;
  onSwitch: (mode: AuthMode, prefill?: Prefill) => void;
}) {
  const config = useDB().config;
  const smsOn = config?.sms.enabled ?? false;
  const [via, setVia] = useState<"phone" | "email">(prefill?.via ?? (smsOn ? "phone" : "email"));
  const [ticket, setTicket] = useState<string | null>(prefill?.ticket ?? null);
  const steps: Step[] =
    mode === "signin"
      ? via === "phone"
        ? ["method", "code"]
        : ["method"]
      : ticket
        ? ["role", "details", "address"]
        : via === "phone"
          ? ["role", "details", "method", "code", "address"]
          : ["role", "details", "method", "address"];
  const [step, setStep] = useState<Step>(steps[0]);
  const [role, setRole] = useState<Role | null>(initialRole ?? null);
  const [name, setName] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [category, setCategory] = useState<CategoryId>("ferramentas");
  const [phone, setPhone] = useState(prefill?.via === "phone" ? prefill.value : "");
  const [email, setEmail] = useState(prefill?.via === "email" ? prefill.value : "");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [cooldown, setCooldown] = useCooldown(0);
  const [address, setAddress] = useState<Address | null>(null);
  const [problem, setProblem] = useState<Problem | null>(null);
  const [pending, setPending] = useState(false);
  const [created, setCreated] = useState<Session | null>(null);
  const [forgot, setForgot] = useState(false);

  const index = Math.max(0, steps.indexOf(step));

  function go(next: Step) {
    setProblem(null);
    setStep(next);
  }

  function back() {
    setProblem(null);
    if (index <= 0) onExit();
    else setStep(steps[index - 1]);
  }

  const backRef = useRef<() => void>(() => {});
  const verifyRef = useRef<() => Promise<void>>(async () => {});
  useEffect(() => {
    backRef.current = back;
    verifyRef.current = verify;
  });

  useEffect(() => {
    const onBack = () => backRef.current();
    window.addEventListener("obra:navback", onBack);
    return () => window.removeEventListener("obra:navback", onBack);
  }, []);

  useEffect(() => {
    if (step !== "code" || code.length !== 6 || pending) return;
    const timer = window.setTimeout(() => void verifyRef.current(), 350);
    return () => window.clearTimeout(timer);
  }, [code, step, pending]);

  function enter(session: Session) {
    runTransition("fade", () => actions.enter(session));
  }

  async function sendCode() {
    if (!isMobile(phone)) {
      setProblem({ text: phone.length >= 10 ? "Use um celular (com 9 na frente)." : phoneProblem(phone) });
      return;
    }
    setPending(true);
    setProblem(null);
    try {
      const { resendIn } = await actions.phoneStart(phone);
      setCooldown(resendIn);
      setCode("");
      go("code");
    } catch (error) {
      setProblem({ text: errorMessage(error) });
    } finally {
      setPending(false);
    }
  }

  async function signInWithEmail() {
    if (!isValidEmail(email)) return setProblem({ text: "Esse e-mail está incompleto." });
    if (!password) return setProblem({ text: "Digite sua senha." });
    setPending(true);
    setProblem(null);
    try {
      enter(await actions.signIn(email.trim().toLowerCase(), password));
    } catch (error) {
      setProblem({ text: errorMessage(error) });
      setPending(false);
    }
  }

  async function verify() {
    setPending(true);
    setProblem(null);
    try {
      const result = await actions.phoneVerify(phone, code);
      if (result.status === "signed_in") {
        if (mode === "signup") toast("Esse celular já tinha conta. Que bom te ver de novo!", "info");
        enter(result);
        return;
      }
      setTicket(result.ticket);
      if (mode === "signin") {
        toast("Esse celular ainda não tem conta. Vamos criar!", "info");
        onSwitch("signup", { via: "phone", value: phone, ticket: result.ticket });
      } else {
        go("address");
      }
      setPending(false);
    } catch (error) {
      setCode("");
      setProblem({ text: errorMessage(error) });
      setPending(false);
    }
  }

  async function createAccount() {
    if (!role || !address) return;
    setPending(true);
    setProblem(null);
    const profile = {
      role,
      name: name.trim(),
      address,
      business: role === "business" ? { name: businessName.trim(), category } : undefined,
    };
    try {
      const session = ticket
        ? await actions.phoneRegister({ ...profile, ticket })
        : await actions.register({ ...profile, email: email.trim().toLowerCase(), password });
      setCreated(session);
    } catch (error) {
      if (error instanceof ApiError && error.code === "email_taken") {
        setProblem({ text: error.message, action: { label: "Entrar com esse e-mail", run: () => onSwitch("signin", { via: "email", value: email.trim().toLowerCase() }) } });
      } else if (error instanceof ApiError && error.code === "ticket_expired") {
        setTicket(null);
        setProblem({ text: error.message, action: { label: "Receber novo código", run: () => go("method") } });
      } else {
        setProblem({ text: errorMessage(error) });
      }
    } finally {
      setPending(false);
    }
  }

  const detailsValid = name.trim().length >= 3 && (role !== "business" || businessName.trim().length >= 3);
  const emailReady = isValidEmail(email) && password.length >= (mode === "signup" ? 8 : 1);

  const prompt: Record<Step, { mood: MascotMood; text: string }> = {
    role: { mood: "wave", text: "Oi! Como você vai usar o Obra Ágil?" },
    details: { mood: "idle", text: role === "business" ? "Me conta da sua locadora." : "Como posso te chamar?" },
    method: mode === "signin" ? { mood: "wave", text: "Que bom te ver! Como você entra?" } : { mood: "idle", text: "Como você quer entrar no app?" },
    code: { mood: code.length === 6 ? "celebrate" : "think", text: "Enviei um código por SMS." },
    address: { mood: "idle", text: role === "business" ? "Onde fica a sua loja?" : "Onde fica a obra?" },
  };

  const cta: Record<Step, { label: string; disabled: boolean; run: () => void }> = {
    role: { label: "Continuar", disabled: !role, run: () => go("details") },
    details: { label: "Continuar", disabled: !detailsValid, run: () => go(ticket ? "address" : "method") },
    method:
      via === "phone"
        ? { label: "Receber código", disabled: phone.length < 10, run: () => void sendCode() }
        : mode === "signin"
          ? { label: "Entrar", disabled: !emailReady, run: () => void signInWithEmail() }
          : {
              label: "Continuar",
              disabled: !emailReady,
              run: () => (password.length < 8 ? setProblem({ text: "A senha precisa de pelo menos 8 caracteres." }) : go("address")),
            },
    code: { label: pending ? "Conferindo" : "Confirmar", disabled: code.length !== 6, run: () => void verify() },
    address: { label: "Criar conta", disabled: !address, run: () => void createAccount() },
  };

  return (
    <main className="vt-page absolute inset-0 flex flex-col bg-background">
      <div className="flex items-center gap-3 px-3" style={{ paddingTop: "calc(var(--safe-top) + 8px)" }}>
        <GlassButton label="Voltar" onClick={back}>
          <ChevronLeft strokeWidth={2.4} aria-hidden="true" />
        </GlassButton>
        {mode === "signup" ? <Progress value={(index + 1) / steps.length} /> : <p className="flex-1 text-center type-headline">Entrar</p>}
        <span className="w-11 shrink-0" aria-hidden="true" />
      </div>

      <form
        key={step}
        className="anim-step min-h-0 flex-1 overflow-y-auto px-5 pt-5 pb-6"
        onSubmit={(event) => {
          event.preventDefault();
          if (!cta[step].disabled && !pending) cta[step].run();
        }}
      >
        <MascotSays mood={prompt[step].mood}>
          <h1 className="type-title3">{prompt[step].text}</h1>
        </MascotSays>

        {step === "role" ? (
          <div role="radiogroup" aria-label="Tipo de conta" className="mt-6 flex flex-col gap-3">
            <RoleCard
              selected={role === "customer"}
              image="/img/role-cliente.webp"
              title="Quero alugar"
              text="Encontre equipamentos perto da obra."
              onClick={() => setRole("customer")}
            />
            <RoleCard
              selected={role === "business"}
              image="/img/role-empresa.webp"
              title="Tenho uma locadora"
              text="Anuncie seu estoque e receba pedidos."
              onClick={() => setRole("business")}
            />
          </div>
        ) : null}

        {step === "details" ? (
          <div className="mt-6 flex flex-col gap-4">
            {role === "business" ? (
              <>
                <Field label="Nome da locadora" value={businessName} autoComplete="organization" placeholder="Ex.: Casa & Obra Aluguel" onChange={(e) => setBusinessName(e.target.value)} />
                <div>
                  <p className="mb-1.5 block px-1 type-footnote font-semibold text-muted-foreground">O que vocês mais alugam</p>
                  <div className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1" role="radiogroup" aria-label="Categoria principal">
                    {categories.map((c) => {
                      const selected = c.id === category;
                      return (
                        <button
                          key={c.id}
                          type="button"
                          role="radio"
                          aria-checked={selected}
                          onClick={() => setCategory(c.id)}
                          className={`flex shrink-0 cursor-pointer items-center gap-2 rounded-full py-1 pr-4 pl-1 type-subhead font-semibold transition-colors ${
                            selected ? "bg-primary text-primary-foreground" : "bg-card elev-1"
                          }`}
                        >
                          <img src={c.image} alt="" className="size-8 rounded-full object-cover" />
                          {c.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </>
            ) : null}
            <Field
              label={role === "business" ? "Seu nome" : "Nome completo"}
              value={name}
              autoComplete="name"
              placeholder="Como você quer ser chamado"
              onChange={(e) => setName(e.target.value)}
            />
            {ticket ? (
              <p className="px-1 type-footnote text-muted-foreground">
                Celular confirmado: <span className="font-semibold text-foreground">+55 {formatPhone(phone)}</span>
              </p>
            ) : null}
          </div>
        ) : null}

        {step === "method" ? (
          <div className="mt-6 flex flex-col gap-4">
            {smsOn ? (
              <Segmented
                label="Entrar com"
                value={via}
                onChange={(next) => {
                  setVia(next);
                  setProblem(null);
                }}
                options={[
                  { value: "phone", label: "Celular" },
                  { value: "email", label: "E-mail e senha" },
                ]}
              />
            ) : null}
            {via === "phone" ? (
              <PhoneField
                value={phone}
                autoFocus
                error={problem?.text}
                onChange={(value) => {
                  setPhone(value);
                  setProblem(null);
                }}
              />
            ) : (
              <>
                <Field
                  label="E-mail"
                  type="email"
                  inputMode="email"
                  autoComplete={mode === "signup" ? "email" : "username"}
                  autoCapitalize="none"
                  autoFocus
                  placeholder="voce@email.com"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    setProblem(null);
                  }}
                />
                <PasswordField
                  label={mode === "signup" ? "Crie uma senha" : "Senha"}
                  autoComplete={mode === "signup" ? "new-password" : "current-password"}
                  value={password}
                  error={problem?.text}
                  hint={mode === "signup" ? "Pelo menos 8 caracteres." : undefined}
                  onChange={(value) => {
                    setPassword(value);
                    setProblem(null);
                  }}
                />
                {mode === "signin" ? (
                  <Button type="button" variant="plain" size="sm" className="self-end" onClick={() => setForgot(true)}>
                    Esqueci a senha
                  </Button>
                ) : null}
              </>
            )}
            {via === "phone" ? <p className="px-1 type-footnote text-muted-foreground">Mandamos um código de 6 dígitos por SMS. Sem senha para lembrar.</p> : null}
            {problem?.action ? (
              <Button type="button" size="sm" variant="tinted" className="self-start" onClick={problem.action.run}>
                {problem.action.label}
              </Button>
            ) : null}
          </div>
        ) : null}

        {step === "code" ? (
          <div className="mt-6">
            <p className="px-1 type-subhead text-muted-foreground">
              Enviado para <span className="font-semibold text-foreground">+55 {formatPhone(phone)}</span>.
            </p>
            <div className="mt-4">
              <CodeInput
                value={code}
                invalid={Boolean(problem)}
                onChange={(value) => {
                  setCode(value);
                  setProblem(null);
                }}
              />
            </div>
            {problem ? (
              <p role="alert" className="mt-3 px-1 type-footnote text-destructive">
                {problem.text}
              </p>
            ) : null}
            {config?.sms.mode === "console" ? <DevHint>Ambiente de teste: o código aparece no terminal da API.</DevHint> : null}
            <div className="mt-4 flex justify-center">
              <Button type="button" size="sm" variant="plain" disabled={cooldown > 0 || pending} onClick={() => void sendCode()}>
                {cooldown > 0 ? `Reenviar em 0:${String(cooldown).padStart(2, "0")}` : "Reenviar código"}
              </Button>
            </div>
          </div>
        ) : null}

        {step === "address" ? (
          address ? (
            <div className="anim-pop mt-6 overflow-hidden rounded-[26px] bg-card elev-1">
              <div className="h-[170px]">
                <MapView center={address} interactive={false} zoom={15} label="Mapa do endereço escolhido" className="size-full" />
              </div>
              <div className="flex items-center gap-3 p-3">
                <ToneIcon icon={MapPin} tone="orange" />
                <div className="min-w-0 flex-1">
                  <p className="truncate type-headline">{address.label}</p>
                  <p className="truncate type-footnote text-muted-foreground">{address.detail}</p>
                </div>
                <Button type="button" size="sm" variant="tinted" onClick={() => setAddress(null)}>
                  Trocar
                </Button>
              </div>
              {problem ? (
                <div className="border-t border-border px-4 py-3">
                  <p role="alert" className="type-footnote text-destructive">
                    {problem.text}
                  </p>
                  {problem.action ? (
                    <Button type="button" size="sm" variant="tinted" className="mt-2" onClick={problem.action.run}>
                      {problem.action.label}
                    </Button>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : (
            <div className="mt-6">
              <AddressSearch onSelect={setAddress} />
            </div>
          )
        ) : null}
        <button type="submit" hidden aria-hidden="true" tabIndex={-1} />
      </form>

      {step === "address" && !address ? null : (
        <div className="px-5 pt-2" style={{ paddingBottom: "calc(var(--safe-bottom) + 14px)" }}>
          <Button disabled={cta[step].disabled} loading={pending} onClick={cta[step].run}>
            {cta[step].label}
          </Button>
        </div>
      )}

      <ForgotPasswordSheet open={forgot} onClose={() => setForgot(false)} initialEmail={email} />
      <SuccessOverlay
        open={created !== null}
        title={role === "business" ? `${businessName.trim()} está no ar!` : `Tudo pronto, ${firstName(name)}!`}
        message={role === "business" ? "Cadastre o estoque e comece a receber pedidos de quem está perto." : "Já dá para ver as locadoras perto da sua obra."}
        primary={{
          label: role === "business" ? "Abrir minha loja" : "Começar a explorar",
          onClick: () => {
            if (created) enter(created);
          },
        }}
      />
    </main>
  );
}
