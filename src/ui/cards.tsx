import { ChevronRight } from "lucide-react";
import { brlShort, rangeLabel } from "../lib/format.ts";
import { formatKm } from "../lib/geo.ts";
import type { Listing } from "../lib/store.ts";
import type { Business, Item, Order, Role } from "../lib/types.ts";
import { BizLogo, Img, Rating, StatusPill } from "./controls.tsx";

const press =
  "cursor-pointer transition-transform duration-200 active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";

export function ListingRow({
  item,
  business,
  km,
  onClick,
  showBusiness = true,
}: {
  item: Item;
  business: Business;
  km?: number;
  onClick: () => void;
  showBusiness?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="row flex w-full cursor-pointer items-center pl-3 text-left transition-colors active:bg-muted focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-primary"
    >
      <Img src={item.image} alt="" className="size-16 shrink-0 rounded-[16px]" />
      <span className="row-main ml-3 flex min-h-[86px] min-w-0 flex-1 items-center gap-3 py-2.5 pr-4">
        <span className="min-w-0 flex-1">
          <span className="block truncate type-headline">{item.name}</span>
          <span className="mt-0.5 block truncate type-footnote text-muted-foreground">
            {showBusiness ? `${business.name}${km !== undefined ? ` · ${formatKm(km)}` : ""}` : item.specs.slice(0, 2).join(" · ")}
          </span>
          {!item.available ? <span className="mt-1 block type-footnote font-semibold text-destructive">Indisponível agora</span> : null}
        </span>
        <span className="shrink-0 text-right">
          <span className="block type-headline">{brlShort(item.price)}</span>
          <span className="block type-caption text-muted-foreground">por dia</span>
        </span>
      </span>
    </button>
  );
}

export function ItemCard({ listing, onClick }: { listing: Listing; onClick: () => void }) {
  const { item, business, km } = listing;
  return (
    <button type="button" onClick={onClick} className={`flex flex-col overflow-hidden rounded-[24px] bg-card text-left ${press}`}>
      <Img src={item.image} alt="" className="aspect-square w-full" />
      <span className="flex flex-1 flex-col p-3">
        <span className="line-clamp-2 min-h-[40px] type-subhead font-semibold">{item.name}</span>
        <span className="mt-1 type-headline">
          {brlShort(item.price)}
          <span className="type-footnote font-normal text-muted-foreground">/dia</span>
        </span>
        <span className="mt-0.5 truncate type-footnote text-muted-foreground">
          {formatKm(km)} · {business.name}
        </span>
      </span>
    </button>
  );
}

export function BusinessCard({ business, km, onClick }: { business: Business; km: number; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className={`w-[282px] shrink-0 snap-start overflow-hidden rounded-[26px] bg-card text-left ${press}`}>
      <span className="relative block">
        <Img src={business.cover} alt="" className="aspect-[16/9] w-full" />
        <span className="glass absolute top-3 left-3 rounded-full px-2.5 py-1 type-footnote font-semibold">{formatKm(km)}</span>
      </span>
      <span className="flex items-center gap-3 p-3">
        <BizLogo business={business} size={44} />
        <span className="min-w-0 flex-1">
          <span className="block truncate type-headline">{business.name}</span>
          <span className="mt-0.5 flex items-center gap-1 truncate type-footnote text-muted-foreground">
            <Rating value={business.rating} count={business.reviewCount} />
            <span aria-hidden="true">·</span>
            <span className="truncate">Entrega {brlShort(business.deliveryFee)}</span>
          </span>
        </span>
      </span>
    </button>
  );
}

export function OrderCard({
  order,
  title,
  subtitle,
  role = "customer",
  onClick,
}: {
  order: Order;
  title: string;
  subtitle: string;
  role?: Role;
  onClick: () => void;
}) {
  return (
    <button type="button" onClick={onClick} className={`flex w-full items-center gap-3 rounded-[24px] bg-card p-3 pr-4 text-left ${press}`}>
      <Img src={order.item.image} alt="" className="size-16 shrink-0 rounded-[16px]" />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="truncate type-headline">{title}</span>
          {order.unread ? (
            <span className="grid h-[18px] min-w-[18px] shrink-0 place-items-center rounded-full bg-primary px-1 type-caption font-semibold text-primary-foreground">
              {order.unread}
              <span className="sr-only"> mensagens novas</span>
            </span>
          ) : null}
        </span>
        <span className="mt-0.5 block truncate type-footnote text-muted-foreground">{subtitle}</span>
        <span className="mt-2 flex items-center gap-2">
          <StatusPill order={order} role={role} />
          <span className="truncate type-footnote text-muted-foreground">{rangeLabel(order.start, order.days)}</span>
        </span>
      </span>
      <ChevronRight className="size-[18px] shrink-0 text-subtle" strokeWidth={2.4} aria-hidden="true" />
    </button>
  );
}
