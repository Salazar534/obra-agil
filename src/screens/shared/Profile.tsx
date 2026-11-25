import { useEffect, useState } from "react";
import { Bell, Camera, Check, CreditCard, Heart, Info, KeyRound, LifeBuoy, MapPin, Megaphone, Plus, Server, Smartphone, Store, Trash, UserRound, Volume2 } from "lucide-react";
import { errorMessage } from "../../lib/api.ts";
import { digits, formatCpf, formatPhone, isMobile, isValidCpf, isValidEmail } from "../../lib/format.ts";
import { distanceKm, formatKm } from "../../lib/geo.ts";
import { runTransition, useNav } from "../../lib/nav.tsx";
import { actions, businessOf, originOf, useDB, useMe, useRequest } from "../../lib/store.ts";
import { toast } from "../../lib/toast.ts";
import type { Address } from "../../lib/types.ts";
import { AddressSheet } from "../../ui/AddressPicker.tsx";
import { ListingRow } from "../../ui/cards.tsx";
import { Avatar, BizLogo, Button, EmptyState, FieldRow, Group, Rating, Row, Segmented, Spinner, Switch, ToneIcon } from "../../ui/controls.tsx";
import { uploadFromInput } from "../../ui/ImagePicker.tsx";
import { Mascot } from "../../ui/Mascot.tsx";
import { Page } from "../../ui/Page.tsx";
import { ActionSheet, Sheet } from "../../ui/Sheet.tsx";
import { CodeInput, DevHint, PasswordField, PhoneField, useCooldown } from "../auth/AuthFields.tsx";
import { onboardingIntent } from "../auth/intent.ts";

export function ProfileButton() {
  const me = useMe();
  const nav = useNav();
  return (
    <button
      type="button"
      aria-label="Abrir perfil"
      title="Perfil"
      onClick={() => nav.push("profile")}
      className="glass grid size-11 shrink-0 cursor-pointer place-items-center rounded-full transition-transform duration-200 active:scale-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary lg:hidden"
    >
      <Avatar name={me.name} src={me.photo} size={34} />
    </button>
  );
}

const faqs = [
  { q: "Como funciona a caução?", a: "A caução entra no total do pagamento e é estornada automaticamente quando a loja confirma a devolução do equipamento." },
  { q: "Posso cancelar um pedido?", a: "Sim. Enquanto a loja não sair para entrega, cancele pela tela do pedido e o valor pago é estornado." },
  { q: "Posso parcelar?", a: "Sim. No cartão de crédito você parcela em até 12x. Também dá para pagar com Pix." },
  { q: "Como anuncio meus equipamentos?", a: "Crie uma conta de empresa, cadastre os itens no Estoque e eles aparecem para quem está por perto." },
];

async function savePrefs(patch: Parameters<typeof actions.updateAccount>[0]) {
  try {
    await actions.updateAccount(patch);
  } catch (error) {
    toast(errorMessage(error), "error");
  }
}

export function ProfileScreen() {
  const me = useMe();
  const db = useDB();
  const nav = useNav();
  const [help, setHelp] = useState(false);
  const [about, setAbout] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [advertise, setAdvertise] = useState(false);
  const [uploading, setUploading] = useState(false);
  const business = businessOf(db, me.businessId);
  const origin = originOf(db, me);
  const contact = me.phone ? `+55 ${formatPhone(me.phone)}` : (me.email ?? "");

  return (
    <Page title="Perfil">
      <div className="flex flex-col items-center pt-1 pb-2 text-center">
        <label className="relative cursor-pointer rounded-full focus-within:outline-2 focus-within:outline-offset-4 focus-within:outline-primary">
          <Avatar name={me.name} src={me.photo} size={96} className="anim-pop" />
          <span className="absolute right-0 bottom-0 grid size-8 place-items-center rounded-full bg-primary text-primary-foreground ring-4 ring-background">
            {uploading ? <Spinner className="size-4" /> : <Camera className="size-4" aria-hidden="true" />}
          </span>
          <input
            type="file"
            accept="image/*"
            className="sr-only"
            aria-label="Trocar foto de perfil"
            disabled={uploading}
            onChange={async (event) => {
              setUploading(true);
              const photo = await uploadFromInput(event, "avatar");
              if (photo) {
                await savePrefs({ photo });
                toast("Foto atualizada");
              }
              setUploading(false);
            }}
          />
        </label>
        <h2 className="mt-3 type-title2">{me.name}</h2>
        <p className="type-subhead text-muted-foreground">{contact}</p>
        <span className="mt-2 rounded-full bg-tint px-3 py-1 type-footnote font-semibold text-primary">{me.role === "business" ? "Conta de empresa" : "Conta pessoal"}</span>
      </div>

      <Group>
        <Row icon={UserRound} tone="blue" title="Editar perfil" chevron onClick={() => nav.push("editProfile")} />
        {me.role === "customer" ? (
          <>
            <Row icon={MapPin} tone="orange" title="Endereços" value={origin.label} chevron onClick={() => nav.push("addresses")} />
            <Row icon={Heart} tone="pink" title="Salvos" value={me.favoriteIds.length ? String(me.favoriteIds.length) : undefined} chevron onClick={() => nav.push("saved")} />
            <Row icon={CreditCard} tone="green" title="Carteira" chevron onClick={() => nav.switchTab("wallet")} />
          </>
        ) : business ? (
          <Row
            icon={Store}
            tone="indigo"
            title={business.name}
            subtitle="Editar loja, horário e entrega"
            leading={
              <span className="mr-3">
                <BizLogo business={business} size={30} />
              </span>
            }
            chevron
            onClick={() => nav.switchTab("store")}
          />
        ) : null}
      </Group>

      <Group title="Notificações">
        <Row icon={Bell} tone="orange" title="Pedidos" trailing={<Switch label="Avisos de pedidos" checked={me.prefs.orders} onChange={(orders) => void savePrefs({ prefs: { orders } })} />} />
        <Row icon={Megaphone} tone="pink" title="Promoções" trailing={<Switch label="Promoções" checked={me.prefs.promos} onChange={(promos) => void savePrefs({ prefs: { promos } })} />} />
        <Row icon={Volume2} tone="indigo" title="Sons" trailing={<Switch label="Sons" checked={me.prefs.sounds} onChange={(sounds) => void savePrefs({ prefs: { sounds } })} />} />
      </Group>

      <Group>
        <Row icon={LifeBuoy} tone="green" title="Ajuda" chevron onClick={() => setHelp(true)} />
        {me.role === "customer" ? <Row icon={Store} tone="teal" title="Anunciar meus equipamentos" chevron onClick={() => setAdvertise(true)} /> : null}
        <Row icon={Info} tone="gray" title="Sobre o Obi Ágil" chevron onClick={() => setAbout(true)} />
        {db.config?.apiPage ? <Row icon={Server} tone="blue" title="API" subtitle="Página da sua conta" chevron onClick={() => window.location.assign(db.config?.apiPage ?? "/")} /> : null}
      </Group>

      <Group>
        <Row title="Sair" destructive center onClick={() => setLeaving(true)} />
      </Group>
      <p className="mt-6 text-center type-footnote text-subtle">Obi Ágil 1.0</p>

      <ActionSheet
        open={leaving}
        onClose={() => setLeaving(false)}
        title="Sair da conta?"
        actions={[{ label: "Sair", destructive: true, onClick: () => void actions.signOut((update) => runTransition("fade", update)) }]}
      />
      <ActionSheet
        open={advertise}
        onClose={() => setAdvertise(false)}
        title="Anunciar equipamentos"
        message="Locadoras usam uma conta de empresa. Você sai desta conta e cria a da sua loja."
        actions={[
          {
            label: "Criar conta de empresa",
            onClick: () => {
              onboardingIntent.value = "business";
              void actions.signOut((update) => runTransition("fade", update));
            },
          },
        ]}
      />
      <Sheet open={help} onClose={() => setHelp(false)} title="Ajuda">
        <div className="flex flex-col items-center pt-2 pb-4 text-center">
          <Mascot mood="wave" size={110} />
          <p className="mt-2 type-headline">O Obi responde as dúvidas mais comuns.</p>
        </div>
        <div className="flex flex-col gap-2">
          {faqs.map((faq) => (
            <details key={faq.q} className="group rounded-[20px] bg-card px-4 py-3.5">
              <summary className="cursor-pointer list-none type-headline marker:hidden">{faq.q}</summary>
              <p className="mt-2 type-subhead text-muted-foreground">{faq.a}</p>
            </details>
          ))}
        </div>
      </Sheet>
      <Sheet open={about} onClose={() => setAbout(false)} title="Sobre">
        <div className="flex flex-col items-center py-4 text-center">
          <img src="/favicon.svg" alt="" className="size-20 rounded-[22px] elev-2" />
          <h3 className="mt-4 type-title2">Obi Ágil</h3>
          <p className="mt-1 type-subhead text-muted-foreground">Versão 1.0</p>
          <p className="mt-4 max-w-[300px] type-body text-muted-foreground">
            Equipamentos de obra perto de você. Locadoras anunciam o estoque, quem precisa aluga, paga com Pix ou cartão em até 12x e recebe na obra.
          </p>
        </div>
      </Sheet>
    </Page>
  );
}

function PhoneSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const smsMode = useDB().config?.sms.mode;
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [cooldown, setCooldown] = useCooldown(0);

  useEffect(() => {
    if (!open) return;
    setPhone("");
    setCode("");
    setSent(false);
    setError("");
  }, [open]);

  async function send() {
    if (!isMobile(phone)) return setError("Use um celular com DDD, como (11) 99999-9999.");
    setPending(true);
    setError("");
    try {
      const { resendIn } = await actions.startPhoneChange(phone);
      setCooldown(resendIn);
      setSent(true);
    } catch (problem) {
      setError(errorMessage(problem));
    } finally {
      setPending(false);
    }
  }

  async function verify(value = code) {
    setPending(true);
    setError("");
    try {
      await actions.verifyPhoneChange(phone, value);
      toast("Celular confirmado");
      onClose();
    } catch (problem) {
      setCode("");
      setError(errorMessage(problem));
    } finally {
      setPending(false);
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Celular"
      confirm={sent ? { label: "Confirmar", onClick: () => void verify(), disabled: code.length !== 6, loading: pending } : { label: "Receber código", onClick: () => void send(), loading: pending }}
    >
      {sent ? (
        <>
          <p className="px-1 pb-4 type-subhead text-muted-foreground">
            Digite o código enviado para <span className="font-semibold text-foreground">+55 {formatPhone(phone)}</span>.
          </p>
          <CodeInput
            value={code}
            invalid={Boolean(error)}
            onChange={(value) => {
              setCode(value);
              setError("");
              if (value.length === 6 && !pending) void verify(value);
            }}
          />
          {error ? (
            <p role="alert" className="mt-3 px-1 type-footnote text-destructive">
              {error}
            </p>
          ) : null}
          {smsMode === "console" ? <DevHint>Ambiente de teste: o código aparece no terminal da API.</DevHint> : null}
          <div className="mt-3 flex justify-center">
            <Button size="sm" variant="plain" disabled={cooldown > 0 || pending} onClick={() => void send()}>
              {cooldown > 0 ? `Reenviar em 0:${String(cooldown).padStart(2, "0")}` : "Reenviar código"}
            </Button>
          </div>
        </>
      ) : (
        <>
          <p className="px-1 pb-4 type-subhead text-muted-foreground">Vamos mandar um código por SMS para confirmar que o número é seu.</p>
          <PhoneField value={phone} onChange={setPhone} error={error} autoFocus />
        </>
      )}
    </Sheet>
  );
}

function PasswordSheet({ open, onClose, hasPassword }: { open: boolean; onClose: () => void; hasPassword: boolean }) {
  const [current, setCurrent] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!open) return;
    setCurrent("");
    setPassword("");
    setConfirm("");
    setError("");
  }, [open]);

  async function save() {
    if (password.length < 8) return setError("A senha precisa de pelo menos 8 caracteres.");
    if (password !== confirm) return setError("As duas senhas estão diferentes.");
    setPending(true);
    setError("");
    try {
      await actions.changePassword(hasPassword ? current : undefined, password);
      toast(hasPassword ? "Senha alterada" : "Senha criada");
      onClose();
    } catch (problem) {
      setError(errorMessage(problem));
    } finally {
      setPending(false);
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title={hasPassword ? "Alterar senha" : "Criar senha"} confirm={{ label: "Salvar senha", onClick: () => void save(), loading: pending }}>
      <div className="flex flex-col gap-4">
        {hasPassword ? <PasswordField label="Senha atual" value={current} onChange={setCurrent} autoFocus /> : null}
        <PasswordField label="Nova senha" autoComplete="new-password" value={password} onChange={setPassword} hint="Pelo menos 8 caracteres." autoFocus={!hasPassword} />
        <PasswordField label="Repita a nova senha" autoComplete="new-password" value={confirm} onChange={setConfirm} error={error} />
        <p className="px-1 type-footnote text-muted-foreground">Por segurança, saímos da sua conta nos outros aparelhos.</p>
      </div>
    </Sheet>
  );
}

export function EditProfileScreen() {
  const me = useMe();
  const nav = useNav();
  const [name, setName] = useState(me.name);
  const [email, setEmail] = useState(me.email ?? "");
  const [cpf, setCpf] = useState(me.cpf ?? "");
  const [saving, setSaving] = useState(false);
  const [phoneOpen, setPhoneOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [removingPhone, setRemovingPhone] = useState(false);

  const emailOk = email.trim() === "" ? !me.hasPassword : isValidEmail(email);
  const cpfOk = cpf === "" || isValidCpf(cpf);
  const valid = name.trim().length >= 3 && emailOk && cpfOk;
  const dirty = name.trim() !== me.name || email.trim().toLowerCase() !== (me.email ?? "") || cpf !== (me.cpf ?? "");
  const problem =
    name.trim().length < 3
      ? "Digite seu nome completo."
      : !emailOk
        ? email.trim() === ""
          ? "Mantenha o e-mail: é com ele que você entra."
          : "Esse e-mail está incompleto."
        : !cpfOk
          ? "Esse CPF não é válido."
          : undefined;

  async function save() {
    setSaving(true);
    try {
      await actions.updateAccount({ name: name.trim(), email: email.trim() ? email.trim().toLowerCase() : null, cpf: cpf || null });
      toast("Perfil atualizado");
      nav.pop();
    } catch (error) {
      toast(errorMessage(error), "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Page
      title="Editar perfil"
      actions={
        <button
          type="button"
          disabled={!valid || !dirty || saving}
          onClick={() => void save()}
          className="glass h-11 cursor-pointer rounded-full px-5 type-headline text-primary transition-transform active:scale-95 disabled:cursor-not-allowed disabled:text-subtle"
        >
          {saving ? <Spinner className="size-5" /> : "Salvar"}
        </button>
      }
    >
      <Group footer={problem ?? "O CPF é usado como documento nos pagamentos pelo Mercado Pago."}>
        <FieldRow label="Nome" value={name} autoComplete="name" onChange={(e) => setName(e.target.value)} />
        <FieldRow
          label="E-mail"
          type="email"
          inputMode="email"
          autoComplete="email"
          autoCapitalize="none"
          value={email}
          placeholder="voce@email.com"
          invalid={!emailOk}
          onChange={(e) => setEmail(e.target.value)}
        />
        <FieldRow label="CPF" value={formatCpf(cpf)} inputMode="numeric" placeholder="000.000.000-00" invalid={!cpfOk} onChange={(e) => setCpf(digits(e.target.value, 11))} />
      </Group>

      <Group title="Entrar na conta" footer={me.phone ? "Você pode entrar com um código por SMS para este celular." : "Adicione um celular para entrar com código por SMS."}>
        <Row icon={Smartphone} tone="green" title={me.phone ? `+55 ${formatPhone(me.phone)}` : "Adicionar celular"} value={me.phone ? "Trocar" : undefined} chevron onClick={() => setPhoneOpen(true)} />
        <Row
          icon={KeyRound}
          tone="indigo"
          title={me.hasPassword ? "Alterar senha" : "Criar senha"}
          subtitle={me.hasPassword ? undefined : me.email ? "Para entrar também com e-mail e senha" : "Adicione um e-mail antes"}
          chevron
          onClick={() => (me.email || me.hasPassword ? setPasswordOpen(true) : toast("Adicione e salve um e-mail antes de criar a senha.", "info"))}
        />
        {me.phone && me.hasPassword ? <Row title="Remover celular" destructive onClick={() => setRemovingPhone(true)} /> : null}
      </Group>

      <PhoneSheet open={phoneOpen} onClose={() => setPhoneOpen(false)} />
      <PasswordSheet open={passwordOpen} onClose={() => setPasswordOpen(false)} hasPassword={me.hasPassword} />
      <ActionSheet
        open={removingPhone}
        onClose={() => setRemovingPhone(false)}
        title="Remover celular?"
        message="Você continua entrando com e-mail e senha."
        actions={[
          {
            label: "Remover",
            destructive: true,
            onClick: () =>
              void actions
                .removePhone()
                .then(() => toast("Celular removido"))
                .catch((error) => toast(errorMessage(error), "error")),
          },
        ]}
      />
    </Page>
  );
}

export function AddressesScreen() {
  const me = useMe();
  const [open, setOpen] = useState(false);

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
      title="Endereços"
      actions={
        <button type="button" aria-label="Adicionar endereço" onClick={() => setOpen(true)} className="glass grid size-11 cursor-pointer place-items-center rounded-full transition-transform active:scale-90">
          <Plus className="size-[21px]" aria-hidden="true" />
        </button>
      }
    >
      {me.addresses.length ? (
        <Group footer="O endereço marcado define as lojas que aparecem para você.">
          {me.addresses.map((address) => {
            const active = address.id === me.activeAddressId;
            return (
              <div key={address.id} className="row flex w-full items-center pl-4">
                <span className="mr-3">
                  <ToneIcon icon={MapPin} tone={active ? "blue" : "gray"} />
                </span>
                <div className="row-main flex min-h-[58px] min-w-0 flex-1 items-center gap-2 pr-2">
                  <button
                    type="button"
                    aria-pressed={active}
                    onClick={() => void run(() => actions.setActiveAddress(address.id), "Endereço atualizado")}
                    className="min-w-0 flex-1 cursor-pointer py-2.5 text-left focus-visible:outline-2 focus-visible:outline-primary"
                  >
                    <span className="block truncate type-body">{address.label}</span>
                    <span className="block truncate type-footnote text-muted-foreground">{address.detail}</span>
                  </button>
                  {active ? (
                    <span className="grid size-10 place-items-center text-primary">
                      <Check className="size-5" strokeWidth={2.6} aria-hidden="true" />
                      <span className="sr-only">Endereço atual</span>
                    </span>
                  ) : (
                    <button
                      type="button"
                      aria-label={`Remover ${address.label}`}
                      onClick={() => void run(() => actions.removeAddress(address.id), "Endereço removido")}
                      className="grid size-10 cursor-pointer place-items-center rounded-full text-destructive active:bg-destructive/10 focus-visible:outline-2 focus-visible:outline-primary"
                    >
                      <Trash className="size-[18px]" aria-hidden="true" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </Group>
      ) : (
        <EmptyState mood="think" title="Nenhum endereço salvo" text="Adicione o endereço da obra para ver as lojas por perto." />
      )}
      <AddressSheet open={open} onClose={() => setOpen(false)} title="Novo endereço" onSelect={(address: Address) => void run(() => actions.addAddress(address), "Endereço salvo")} />
    </Page>
  );
}

export function SavedScreen() {
  const db = useDB();
  const me = useMe();
  const nav = useNav();
  const [tab, setTab] = useState<"items" | "stores">("items");
  const status = useRequest("favorites", actions.loadFavorites);
  const origin = originOf(db, me);
  const items = me.favoriteIds.flatMap((id) => {
    const item = db.items[id];
    const business = item ? businessOf(db, item.businessId) : undefined;
    return item && business ? [{ item, business }] : [];
  });
  const stores = me.favoriteIds.flatMap((id) => (db.businesses[id] ? [db.businesses[id]] : []));
  const loading = status === "loading" && items.length + stores.length === 0;

  return (
    <Page title="Salvos">
      <Segmented
        label="Tipo de salvo"
        value={tab}
        onChange={setTab}
        options={[
          { value: "items", label: "Equipamentos" },
          { value: "stores", label: "Lojas" },
        ]}
      />
      {loading ? (
        <div className="grid h-40 place-items-center text-muted-foreground">
          <Spinner />
        </div>
      ) : tab === "items" ? (
        items.length ? (
          <Group className="mt-4">
            {items.map(({ item, business }) => (
              <ListingRow key={item.id} item={item} business={business} onClick={() => nav.push("item", { id: item.id })} />
            ))}
          </Group>
        ) : (
          <EmptyState
            mood="think"
            title="Nada salvo ainda"
            text="Toque no coração de um equipamento para guardar aqui."
            action={
              <Button size="md" onClick={() => nav.switchTab("explore")}>
                Explorar
              </Button>
            }
          />
        )
      ) : stores.length ? (
        <Group className="mt-4">
          {stores.map((business) => (
            <Row
              key={business.id}
              leading={
                <span className="mr-3">
                  <BizLogo business={business} size={44} />
                </span>
              }
              title={business.name}
              subtitle={
                <span className="inline-flex items-center gap-1">
                  <Rating value={business.rating} count={business.reviewCount} /> · {formatKm(distanceKm(origin, business.address))}
                </span>
              }
              chevron
              onClick={() => nav.push("business", { id: business.id })}
            />
          ))}
        </Group>
      ) : (
        <EmptyState mood="think" title="Nenhuma loja salva" text="Salve as locadoras que você mais usa." />
      )}
    </Page>
  );
}
