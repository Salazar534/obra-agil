import { z } from "zod";
import { many, one } from "../db/pool.ts";
import { notFound } from "../lib/errors.ts";
import { route } from "../lib/route.ts";
import { fold } from "../lib/text.ts";
import {
  Business,
  Category,
  IdParams,
  Item,
  Review,
  serializeBusiness,
  serializeItem,
  type BusinessRow,
  type ItemRow,
  type ReviewOut,
} from "../models.ts";

const Point = z.object({
  lat: z.coerce.number().min(-90).max(90).describe("Latitude do endereço da obra."),
  lng: z.coerce.number().min(-180).max(180).describe("Longitude do endereço da obra."),
  radiusKm: z.coerce.number().min(1).max(100).default(40).describe("Raio da busca em km (padrão 40)."),
});

/** Businesses within radius of $1/$2 ($3 km), with distance_km. */
const NEARBY = `
  select b.*, d.distance_km
    from businesses b
    cross join lateral (
      select 6371 * 2 * asin(sqrt(
        power(sin(radians(b.lat - $1) / 2), 2) +
        cos(radians($1)) * cos(radians(b.lat)) * power(sin(radians(b.lng - $2) / 2), 2)
      )) as distance_km
    ) d
   where b.lat between $1 - $3 / 111.0 and $1 + $3 / 111.0
     and b.lng between $2 - $3 / (111.0 * cos(radians($1))) and $2 + $3 / (111.0 * cos(radians($1)))
     and d.distance_km <= $3`;

export function shortName(name: string) {
  const parts = name.trim().split(/\s+/);
  return parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1][0]}.` : name;
}

export async function reviewsOf(businessId: string, limit = 50): Promise<ReviewOut[]> {
  const rows = await many<{ id: string; order_id: string; stars: number; body: string; created_at: Date; name: string; photo_url: string | null }>(
    `select r.id, r.order_id, r.stars, r.body, r.created_at, u.name, u.photo_url
       from reviews r join users u on u.id = r.author_id
      where r.business_id = $1 order by r.created_at desc limit $2`,
    [businessId, limit],
  );
  return rows.map((row) => ({
    id: row.id,
    businessId,
    orderId: row.order_id,
    author: shortName(row.name),
    authorPhoto: row.photo_url,
    stars: row.stars,
    text: row.body,
    at: row.created_at.getTime(),
  }));
}

export const exploreRoutes = [
  route({
    method: "get",
    path: "/explore",
    tag: "Explore",
    summary: "Lojas e equipamentos perto de um endereço",
    description: "Lojas com pelo menos um equipamento cadastrado, da mais perto para a mais longe (até 100), e todos os equipamentos delas.",
    auth: "optional",
    query: Point,
    responses: {
      200: {
        description: "Resultado da região",
        schema: z.object({ businesses: z.array(Business), items: z.array(Item) }),
      },
    },
    handler: async ({ query }) => {
      const businesses = await many<BusinessRow>(
        `${NEARBY} and exists (select 1 from items i where i.business_id = b.id and i.deleted_at is null)
          order by d.distance_km limit 100`,
        [query.lat, query.lng, query.radiusKm],
      );
      const items = businesses.length
        ? await many<ItemRow>("select * from items where business_id = any($1::uuid[]) and deleted_at is null order by created_at desc", [
            businesses.map((b) => b.id),
          ])
        : [];
      return { businesses: businesses.map(serializeBusiness), items: items.map(serializeItem) };
    },
  }),

  route({
    method: "get",
    path: "/search",
    tag: "Explore",
    summary: "Buscar equipamentos perto de um endereço",
    description: "Busca por nome, descrição, destaques, categoria ou nome da loja, sem diferenciar acentos. Disponíveis vêm primeiro.",
    auth: "optional",
    query: Point.extend({
      q: z.string().trim().max(60).optional().describe("Texto livre, como betoneira ou andaime."),
      category: Category.optional(),
      sort: z.enum(["near", "price", "rating"]).default("near"),
    }),
    responses: {
      200: {
        description: "Até 100 resultados",
        schema: z.object({ results: z.array(z.object({ item: Item, business: Business })) }),
      },
    },
    handler: async ({ query }) => {
      const term = query.q ? fold(query.q) : null;
      const order =
        query.sort === "price"
          ? "i.price_cents, near.distance_km"
          : query.sort === "rating"
            ? "case when near.rating_count > 0 then near.rating_sum::float / near.rating_count else 0 end desc, near.distance_km"
            : "near.distance_km, i.price_cents";
      const rows = await many<ItemRow & { b_id: string }>(
        `with near as (${NEARBY})
         select i.*, near.id as b_id
           from items i join near on near.id = i.business_id
          where i.deleted_at is null
            and ($4::text is null or i.category = $4)
            and ($5::text is null or i.search like '%' || $5 || '%'
                 or translate(lower(near.name), 'áàâãäéèêëíìîïóòôõöúùûüç', 'aaaaaeeeeiiiiooooouuuuc') like '%' || $5 || '%')
          order by i.available desc, ${order}
          limit 100`,
        [query.lat, query.lng, query.radiusKm, query.category ?? null, term],
      );
      const ids = [...new Set(rows.map((row) => row.b_id))];
      const businesses = ids.length
        ? await many<BusinessRow>(`${NEARBY} and b.id = any($4::uuid[])`, [query.lat, query.lng, query.radiusKm, ids])
        : [];
      const byId = new Map(businesses.map((row) => [row.id, serializeBusiness(row)]));
      return { results: rows.flatMap((row) => (byId.has(row.b_id) ? [{ item: serializeItem(row), business: byId.get(row.b_id)! }] : [])) };
    },
  }),

  route({
    method: "get",
    path: "/businesses/:id",
    tag: "Explore",
    summary: "Página da loja",
    auth: "optional",
    params: IdParams,
    responses: {
      200: {
        description: "Loja, estoque e avaliações",
        schema: z.object({ business: Business, items: z.array(Item), reviews: z.array(Review) }),
      },
    },
    handler: async ({ params }) => {
      const row = await one<BusinessRow>("select * from businesses where id = $1", [params.id]);
      if (!row) throw notFound("Loja não encontrada.");
      const [items, reviews] = await Promise.all([
        many<ItemRow>("select * from items where business_id = $1 and deleted_at is null order by available desc, created_at desc", [params.id]),
        reviewsOf(params.id),
      ]);
      return { business: serializeBusiness(row), items: items.map(serializeItem), reviews };
    },
  }),

  route({
    method: "get",
    path: "/items/:id",
    tag: "Explore",
    summary: "Página do equipamento",
    auth: "optional",
    params: IdParams,
    responses: { 200: { description: "Equipamento e loja", schema: z.object({ item: Item, business: Business }) } },
    handler: async ({ params }) => {
      const item = await one<ItemRow>("select * from items where id = $1 and deleted_at is null", [params.id]);
      if (!item) throw notFound("Equipamento não encontrado. Ele pode ter sido removido pela loja.");
      const business = await one<BusinessRow>("select * from businesses where id = $1", [item.business_id]);
      return { item: serializeItem(item), business: serializeBusiness(business!) };
    },
  }),
];
