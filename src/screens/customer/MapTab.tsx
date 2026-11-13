import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, LocateFixed, MapPin } from "lucide-react";
import { brlShort, initials } from "../../lib/format.ts";
import { formatKm } from "../../lib/geo.ts";
import { useNav, usePageState } from "../../lib/nav.tsx";
import { originOf, useDB, useMe, useNearby } from "../../lib/store.ts";
import { AddressSheet } from "../../ui/AddressPicker.tsx";
import { Img, Rating, Spinner } from "../../ui/controls.tsx";
import { MapView, type MapHandle, type MapMarker } from "../../ui/MapView.tsx";
import { ProfileButton } from "../shared/Profile.tsx";
import { chooseAddress } from "./Explore.tsx";

export function MapTab() {
  const db = useDB();
  const me = useMe();
  const nav = useNav();
  const { active } = usePageState();
  const origin = originOf(db, me);
  const { status, near } = useNearby(origin);
  const [selected, setSelected] = useState<string | null>(null);
  const [addressOpen, setAddressOpen] = useState(false);
  const mapRef = useRef<MapHandle>(null);
  const cardsRef = useRef<HTMLDivElement>(null);
  const scrollTimer = useRef(0);
  const current = selected ?? near[0]?.business.id ?? null;

  useEffect(() => {
    if (active) document.title = "Mapa · Obra Ágil";
  }, [active]);

  const markers = useMemo<MapMarker[]>(
    () =>
      near.map(({ business }) => ({
        id: business.id,
        lat: business.address.lat,
        lng: business.address.lng,
        label: business.name,
        short: initials(business.name),
      })),
    [near],
  );

  function selectFromMap(id: string) {
    setSelected(id);
    const card = cardsRef.current?.querySelector<HTMLElement>(`[data-id="${id}"]`);
    card?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  }

  function onCardsScroll() {
    window.clearTimeout(scrollTimer.current);
    scrollTimer.current = window.setTimeout(() => {
      const box = cardsRef.current;
      if (!box) return;
      const center = box.scrollLeft + box.clientWidth / 2;
      let best: string | null = null;
      let distance = Infinity;
      for (const card of Array.from(box.querySelectorAll<HTMLElement>("[data-id]"))) {
        const mid = card.offsetLeft + card.offsetWidth / 2;
        if (Math.abs(mid - center) < distance) {
          distance = Math.abs(mid - center);
          best = card.dataset.id ?? null;
        }
      }
      if (best && best !== current) {
        setSelected(best);
        mapRef.current?.focus(best);
      }
    }, 140);
  }

  return (
    <div className={`absolute inset-0 overflow-hidden bg-background ${active ? "vt-page" : ""}`}>
      <h1 className="sr-only">Mapa</h1>
      <MapView
        ref={mapRef}
        center={origin}
        markers={markers}
        selectedId={current}
        onSelect={selectFromMap}
        fit
        label="Mapa de locadoras próximas"
        className="absolute inset-0"
      />

      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-center gap-2 px-3" style={{ paddingTop: "calc(var(--safe-top) + 10px)" }}>
        <button
          type="button"
          onClick={() => setAddressOpen(true)}
          className="glass pointer-events-auto flex h-11 min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-full px-4 text-left transition-transform active:scale-[0.98]"
        >
          <MapPin className="size-[18px] shrink-0 text-primary" aria-hidden="true" />
          <span className="min-w-0 flex-1 truncate type-subhead font-semibold">{origin.label}</span>
          <ChevronDown className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span className="sr-only">, trocar endereço</span>
        </button>
        <span className="pointer-events-auto">
          <ProfileButton />
        </span>
      </div>

      <button
        type="button"
        aria-label="Voltar para o meu endereço"
        onClick={() => mapRef.current?.recenter()}
        className="glass absolute right-3 z-10 grid size-11 cursor-pointer place-items-center rounded-full text-primary transition-transform active:scale-90"
        style={{ bottom: "calc(max(10px, var(--safe-bottom)) + 236px)" }}
      >
        <LocateFixed className="size-[21px]" aria-hidden="true" />
      </button>

      <div
        ref={cardsRef}
        onScroll={onCardsScroll}
        className="absolute inset-x-0 z-10 flex snap-x snap-mandatory gap-3 overflow-x-auto px-[7%] pb-2"
        style={{ bottom: "calc(max(10px, var(--safe-bottom)) + 74px)" }}
      >
        {near.map(({ business, km }) => {
          const isSelected = business.id === current;
          return (
            <button
              key={business.id}
              data-id={business.id}
              type="button"
              onClick={() => nav.push("business", { id: business.id })}
              className={`glass-strong flex w-[86%] shrink-0 cursor-pointer snap-center items-center gap-3 rounded-[26px] p-2.5 pr-4 text-left transition-transform duration-300 active:scale-[0.98] ${
                isSelected ? "scale-100" : "scale-[0.96] opacity-90"
              }`}
            >
              <Img src={business.cover} alt="" className="size-[92px] shrink-0 rounded-[20px]" />
              <span className="min-w-0 flex-1">
                <span className="block truncate type-headline">{business.name}</span>
                <span className="mt-0.5 block truncate type-footnote text-muted-foreground">{business.tagline}</span>
                <span className="mt-2 flex items-center gap-1 whitespace-nowrap type-footnote text-muted-foreground">
                  <Rating value={business.rating} count={business.reviewCount} />
                  <span aria-hidden="true">·</span>
                  <span>{formatKm(km)}</span>
                </span>
                <span className="mt-0.5 block truncate type-footnote text-muted-foreground">Entrega {brlShort(business.deliveryFee)}</span>
              </span>
            </button>
          );
        })}
        {near.length === 0 ? (
          <div className="glass-strong flex w-full items-center justify-center gap-2 rounded-[26px] p-4 text-center type-subhead text-muted-foreground">
            {status === "loading" ? (
              <>
                <Spinner className="size-4" /> Procurando locadoras…
              </>
            ) : status === "error" ? (
              "Não deu para carregar as lojas. Tente de novo."
            ) : (
              "Nenhuma locadora perto deste endereço ainda."
            )}
          </div>
        ) : null}
      </div>

      <AddressSheet
        open={addressOpen}
        onClose={() => setAddressOpen(false)}
        saved={me.addresses}
        title="Onde fica a obra?"
        onSelect={(address) => {
          void chooseAddress(address);
          setSelected(null);
        }}
      />
    </div>
  );
}
