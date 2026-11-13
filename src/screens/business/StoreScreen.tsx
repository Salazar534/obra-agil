import { useState } from "react";
import { Camera, Eye, MapPin, Star } from "lucide-react";
import { errorMessage } from "../../lib/api.ts";
import { categories, coverLibrary, type CategoryId } from "../../lib/catalog.ts";
import { chime } from "../../lib/feedback.ts";
import { digits, formatPhone, isValidPhone } from "../../lib/format.ts";
import { useNav } from "../../lib/nav.tsx";
import { actions, useDB } from "../../lib/store.ts";
import { toast } from "../../lib/toast.ts";
import type { Address, Business } from "../../lib/types.ts";
import { AddressSheet } from "../../ui/AddressPicker.tsx";
import { BizLogo, Button, EmptyState, FieldRow, Group, Rating, Row, SelectRow, Spinner, Stepper, TextAreaBlock } from "../../ui/controls.tsx";
import { ImagePicker, uploadFromInput } from "../../ui/ImagePicker.tsx";
import { Page } from "../../ui/Page.tsx";
import { ProfileButton } from "../shared/Profile.tsx";

type Form = {
  name: string;
  tagline: string;
  about: string;
  category: CategoryId;
  phone: string;
  deliveryFee: string;
  radiusKm: number;
  opens: string;
  closes: string;
  address: Address;
  cover: string;
  logo: string | null;
};

function toForm(b: Business): Form {
  return {
    name: b.name,
    tagline: b.tagline,
    about: b.about,
    category: b.category,
    phone: b.phone,
    deliveryFee: String(b.deliveryFee).replace(".", ","),
    radiusKm: b.radiusKm,
    opens: b.opens,
    closes: b.closes,
    address: b.address,
    cover: b.cover,
    logo: b.logo,
  };
}

export function StoreScreen() {
  const db = useDB();
  const nav = useNav();
  const business = db.business;
  const [form, setForm] = useState<Form | null>(() => (business ? toForm(business) : null));
  const [addressOpen, setAddressOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);

  if (!business || !form) {
    return (
      <Page title="Loja">
        <EmptyState mood="sad" title="Loja não encontrada" />
      </Page>
    );
  }

  const set = (patch: Partial<Form>) => setForm({ ...form, ...patch });
  const dirty = JSON.stringify(form) !== JSON.stringify(toForm(business));
  const fee = Number(form.deliveryFee.replace(",", "."));
  const phoneOk = form.phone === "" || isValidPhone(form.phone);
  const valid = form.name.trim().length >= 3 && phoneOk && Number.isFinite(fee) && fee >= 0;

  async function save() {
    if (!form || !valid) return;
    setSaving(true);
    try {
      const updated = await actions.updateBusiness({
        name: form.name.trim(),
        tagline: form.tagline.trim(),
        about: form.about.trim(),
        category: form.category,
        ...(form.phone ? { phone: form.phone } : {}),
        deliveryFee: Math.round(fee * 100) / 100,
        radiusKm: form.radiusKm,
        opens: form.opens,
        closes: form.closes,
        address: form.address,
        cover: form.cover,
        logo: form.logo,
      });
      setForm(toForm(updated));
      chime("success");
      toast("Loja atualizada");
    } catch (error) {
      toast(errorMessage(error), "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Page title="Loja" actions={<ProfileButton />}>
      <section className="anim-rise overflow-hidden rounded-[26px] bg-card">
        <ImagePicker value={form.cover} onChange={(cover) => set({ cover })} library={coverLibrary} kind="cover" aspect="aspect-[16/9]" label="Capa da loja" />
        <div className="flex items-center gap-3 p-4">
          <label className="relative cursor-pointer rounded-[20px] focus-within:outline-2 focus-within:outline-primary">
            <BizLogo business={{ name: form.name || business.name, logo: form.logo }} size={64} />
            <span className="absolute -right-1 -bottom-1 grid size-7 place-items-center rounded-full bg-primary text-primary-foreground ring-2 ring-card">
              {uploadingLogo ? <Spinner className="size-3.5" /> : <Camera className="size-3.5" aria-hidden="true" />}
            </span>
            <input
              type="file"
              accept="image/*"
              className="sr-only"
              aria-label="Trocar logo"
              disabled={uploadingLogo}
              onChange={async (event) => {
                setUploadingLogo(true);
                const logo = await uploadFromInput(event, "logo");
                setUploadingLogo(false);
                if (logo) set({ logo });
              }}
            />
          </label>
          <div className="min-w-0 flex-1">
            <p className="truncate type-headline">{form.name || "Sua loja"}</p>
            <p className="type-footnote text-muted-foreground">
              <Rating value={business.rating} count={business.reviewCount} />
            </p>
          </div>
        </div>
      </section>

      <Group>
        <Row icon={Eye} tone="blue" title="Ver como cliente" chevron onClick={() => nav.push("business", { id: business.id })} />
        <Row icon={Star} tone="orange" title="Avaliações" value={String(business.reviewCount)} chevron onClick={() => nav.push("business", { id: business.id, tab: "reviews" })} />
      </Group>

      <Group title="Informações">
        <FieldRow label="Nome" value={form.name} maxLength={80} onChange={(e) => set({ name: e.target.value })} invalid={form.name.trim().length < 3} />
        <FieldRow label="Slogan" value={form.tagline} maxLength={80} placeholder="Ex.: Entrega no mesmo dia" onChange={(e) => set({ tagline: e.target.value })} />
        <SelectRow label="Categoria" value={form.category} options={categories.map((c) => ({ value: c.id, label: c.label }))} onChange={(value) => set({ category: value as CategoryId })} />
        <FieldRow
          label="Telefone"
          value={formatPhone(form.phone)}
          inputMode="numeric"
          placeholder="(11) 3333-4444"
          invalid={!phoneOk}
          onChange={(e) => set({ phone: digits(e.target.value, 11) })}
        />
        <TextAreaBlock aria-label="Sobre a loja" placeholder="Conte o que sua loja tem de diferente" value={form.about} maxLength={300} onChange={(e) => set({ about: e.target.value })} />
      </Group>

      <Group title="Entrega e horário">
        <FieldRow label="Taxa" prefix="R$" inputMode="decimal" value={form.deliveryFee} onChange={(e) => set({ deliveryFee: e.target.value.replace(/[^\d,]/g, "") })} />
        <Row title="Raio de entrega" value={`${form.radiusKm} km`} trailing={<Stepper value={form.radiusKm} onChange={(radiusKm) => set({ radiusKm })} min={1} max={60} label="raio em km" />} />
        <FieldRow label="Abre às" type="time" value={form.opens} onChange={(e) => set({ opens: e.target.value })} />
        <FieldRow label="Fecha às" type="time" value={form.closes} onChange={(e) => set({ closes: e.target.value })} />
      </Group>

      <Group title="Endereço" footer="Clientes num raio de até 40 km encontram sua loja.">
        <Row icon={MapPin} tone="orange" title={form.address.label} subtitle={form.address.detail} chevron onClick={() => setAddressOpen(true)} />
      </Group>

      {dirty ? <div className="h-20" aria-hidden="true" /> : null}
      {dirty ? (
        <div className="fixed inset-x-0 z-30 px-3" style={{ bottom: "calc(max(10px, var(--safe-bottom)) + 74px)" }}>
          <div className="glass anim-rise flex items-center gap-3 rounded-full p-2 pl-5">
            <p className="min-w-0 flex-1 truncate type-subhead font-semibold">Alterações não salvas</p>
            <Button size="sm" variant="gray" onClick={() => setForm(toForm(business))}>
              Desfazer
            </Button>
            <Button size="md" disabled={!valid} loading={saving} onClick={() => void save()}>
              Salvar
            </Button>
          </div>
        </div>
      ) : null}

      <AddressSheet open={addressOpen} onClose={() => setAddressOpen(false)} title="Endereço da loja" onSelect={(address) => set({ address })} />
    </Page>
  );
}
