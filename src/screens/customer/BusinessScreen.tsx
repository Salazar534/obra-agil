import { useMemo, useState } from "react";
import { Clock, Heart, MapPin, Phone, Share, Star, Truck } from "lucide-react";
import { errorMessage } from "../../lib/api.ts";
import { brlShort, formatPhone, plural, timeAgo } from "../../lib/format.ts";
import { directionsUrl, distanceKm, formatKm } from "../../lib/geo.ts";
import { isNativeShell, postNative } from "../../lib/native.ts";
import { useNav } from "../../lib/nav.tsx";
import { actions, businessOf, isFavorite, isOpen, originOf, retry, useDB, useMe, useRequest } from "../../lib/store.ts";
import { toast } from "../../lib/toast.ts";
import { ListingRow } from "../../ui/cards.tsx";
import { Avatar, BizLogo, Button, EmptyState, GlassButton, Group, Img, Rating, Row, Segmented, Spinner } from "../../ui/controls.tsx";
import { MapView } from "../../ui/MapView.tsx";
import { Page } from "../../ui/Page.tsx";

type Tab = "items" | "about" | "reviews";

export async function shareLink(title: string) {
  const url = window.location.href;
  if (isNativeShell()) {
    postNative({ type: "share", title: `${title} na Obi Ágil` });
    return;
  }
  try {
    if (navigator.share) {
      await navigator.share({ title, url });
      return;
    }
    await navigator.clipboard.writeText(url);
    toast("Link copiado");
  } catch {
    // Share sheet dismissed.
  }
}

export async function toggleSaved(kind: "item" | "business", id: string) {
  try {
    const saved = await actions.toggleFavorite(kind, id);
    toast(saved ? (kind === "item" ? "Equipamento salvo" : "Loja salva") : "Removido dos salvos", "info");
  } catch (error) {
    toast(errorMessage(error), "error");
  }
}

export function PageLoading({ title, status, retryKey }: { title: string; status: string; retryKey: string }) {
  return (
    <Page title={title}>
      {status === "error" ? (
        <EmptyState
          mood="sad"
          title="Não encontrado"
          text="Pode ter sido removido, ou a conexão caiu."
          action={
            <Button size="md" onClick={() => retry(retryKey)}>
              Tentar de novo
            </Button>
          }
        />
      ) : (
        <div className="grid h-60 place-items-center text-muted-foreground" aria-label="Carregando">
          <Spinner className="size-7" />
        </div>
      )}
    </Page>
  );
}

export function BusinessScreen({ id, initialTab = "items" }: { id: string; initialTab?: Tab }) {
  const db = useDB();
  const me = useMe();
  const nav = useNav();
  const [tab, setTab] = useState<Tab>(initialTab);
  const key = `business:${id}`;
  const status = useRequest(key, () => actions.loadBusiness(id));
  const business = businessOf(db, id);
  const items = useMemo(
    () =>
      Object.values(db.items)
        .filter((i) => i.businessId === id)
        .sort((a, b) => Number(b.available) - Number(a.available) || b.createdAt - a.createdAt),
    [db.items, id],
  );
  const reviews = db.reviews[id] ?? [];

  if (!business) return <PageLoading title="Loja" status={status} retryKey={key} />;

  const own = me.businessId === business.id;
  const km = own ? 0 : distanceKm(originOf(db, me), business.address);
  const saved = isFavorite(db, business.id);
  const open = isOpen(business);

  return (
    <Page
      title={business.name}
      hero={
        <div className="relative h-[300px]">
          <Img src={business.cover} alt={`Foto de ${business.name}`} className="size-full" />
          <div aria-hidden="true" className="scrim-image absolute inset-0" />
        </div>
      }
      actions={
        <>
          {own ? null : (
            <GlassButton label={saved ? "Remover dos salvos" : "Salvar loja"} pressed={saved} onClick={() => void toggleSaved("business", business.id)}>
              <Heart className={saved ? "fill-badge text-badge" : ""} aria-hidden="true" />
            </GlassButton>
          )}
          <GlassButton label="Compartilhar" onClick={() => shareLink(business.name)}>
            <Share aria-hidden="true" />
          </GlassButton>
        </>
      }
    >
      <div className="relative -mx-4 -mt-10 rounded-t-[34px] bg-background px-4 pt-1">
        <BizLogo business={business} size={78} className="-mt-10 ring-4 ring-background elev-2" />
        <h1 className="mt-3 type-title1">{business.name}</h1>
        {business.tagline ? <p className="type-subhead text-muted-foreground">{business.tagline}</p> : null}
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 type-subhead">
          <Rating value={business.rating} count={business.reviewCount} />
          {own ? null : <span className="text-muted-foreground">{formatKm(km)}</span>}
          <span className={open ? "font-semibold text-success" : "font-semibold text-destructive"}>
            {open ? `Aberto até ${business.closes}` : `Abre às ${business.opens}`}
          </span>
        </div>
        {own ? (
          <p className="mt-3 rounded-[16px] bg-tint px-3 py-2 type-footnote font-semibold text-primary">É assim que os clientes veem a sua loja.</p>
        ) : null}
      </div>

      <Segmented
        label="Seções da loja"
        className="mt-5"
        value={tab}
        onChange={setTab}
        options={[
          { value: "items", label: `Itens (${items.length})` },
          { value: "about", label: "Sobre" },
          { value: "reviews", label: "Avaliações" },
        ]}
      />

      {tab === "items" ? (
        items.length ? (
          <Group className="mt-4">
            {items.map((item) => (
              <ListingRow key={item.id} item={item} business={business} showBusiness={false} onClick={() => nav.push("item", { id: item.id })} />
            ))}
          </Group>
        ) : status === "loading" ? (
          <div className="grid h-40 place-items-center text-muted-foreground">
            <Spinner />
          </div>
        ) : (
          <EmptyState mood="think" title="Estoque vazio" text="Esta loja ainda não cadastrou equipamentos." />
        )
      ) : null}

      {tab === "about" ? (
        <>
          {business.about ? <p className="mt-5 rounded-[22px] bg-card p-4 type-body">{business.about}</p> : null}
          <Group>
            <Row icon={MapPin} tone="orange" title={business.address.label} subtitle={business.address.detail} chevron href={directionsUrl(business.address)} />
            {business.phone ? <Row icon={Phone} tone="green" title={`+55 ${formatPhone(business.phone)}`} href={`tel:+55${business.phone}`} /> : null}
            <Row icon={Clock} tone="blue" title="Horário" value={business.opens === "00:00" && business.closes === "23:59" ? "24 horas" : `${business.opens} às ${business.closes}`} />
            <Row icon={Truck} tone="indigo" title="Entrega" value={`Até ${business.radiusKm} km · ${brlShort(business.deliveryFee)}`} />
          </Group>
          <div className="mt-4 h-[180px] overflow-hidden rounded-[22px]">
            <MapView center={business.address} interactive={false} zoom={15} label={`Mapa com ${business.name}`} className="size-full" />
          </div>
        </>
      ) : null}

      {tab === "reviews" ? (
        <>
          <div className="mt-5 flex items-center gap-4 rounded-[22px] bg-card p-4">
            <span className="type-large">{business.rating ? business.rating.toLocaleString("pt-BR", { minimumFractionDigits: 1 }) : "–"}</span>
            <span>
              <span className="flex gap-0.5" role="img" aria-label={`Nota ${business.rating.toLocaleString("pt-BR")} de 5`}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <Star key={n} className={`size-4 ${n <= Math.round(business.rating) ? "fill-star text-star" : "text-border"}`} aria-hidden="true" />
                ))}
              </span>
              <span className="mt-1 block type-footnote text-muted-foreground">{plural(business.reviewCount, "avaliação", "avaliações")}</span>
            </span>
          </div>
          {reviews.length ? (
            <div className="mt-3 flex flex-col gap-2.5">
              {reviews.map((review) => (
                <article key={review.id} className="rounded-[22px] bg-card p-4">
                  <div className="flex items-center gap-3">
                    <Avatar name={review.author} src={review.authorPhoto} size={36} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate type-headline">{review.author}</p>
                      <p className="type-footnote text-muted-foreground">{timeAgo(review.at)}</p>
                    </div>
                    <Rating value={review.stars} className="type-subhead" />
                  </div>
                  {review.text ? <p className="mt-2.5 type-body">{review.text}</p> : null}
                </article>
              ))}
            </div>
          ) : (
            <EmptyState mood="idle" title="Sem avaliações ainda" text="As avaliações aparecem depois do primeiro aluguel." />
          )}
        </>
      ) : null}
    </Page>
  );
}
