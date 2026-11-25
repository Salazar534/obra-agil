import { z } from "zod";
import { many, one } from "../db/pool.ts";
import { badRequest, forbidden, notFound } from "../lib/errors.ts";
import { route } from "../lib/route.ts";
import { fold } from "../lib/text.ts";
import { Id } from "../models.ts";

const Kind = z.enum(["product", "service"]);

export const catalogRoutes = [
  route({
    method: "get",
    path: "/catalog/categories",
    tag: "Explore",
    summary: "Categorias do catálogo",
    description: "Lista plana de categorias de aluguel e de serviço. A busca ignora acentos.",
    auth: "none",
    query: z.object({
      kind: Kind.optional(),
      q: z.string().trim().max(60).optional(),
      limit: z.coerce.number().int().min(1).max(100).default(40),
      offset: z.coerce.number().int().min(0).default(0),
    }),
    responses: { 200: { description: "Categorias ativas" } },
    handler: async ({ query }) => {
      const term = query.q ? fold(query.q) : null;
      const rows = await many<{ id: string; kind: "product" | "service"; name: string; aliases: string[]; image_url: string | null; restricted: boolean }>(
        `select id, kind, name, aliases, image_url, restricted
           from catalog_categories
          where active
            and ($1::text is null or kind = $1)
            and ($2::text is null or search like '%' || $2 || '%')
          order by name
          limit $3 offset $4`,
        [query.kind ?? null, term, query.limit, query.offset],
      );
      return {
        categories: rows.map((row) => ({
          id: row.id,
          kind: row.kind,
          name: row.name,
          aliases: row.aliases,
          image: row.image_url,
          restricted: row.restricted,
        })),
      };
    },
  }),

  route({
    method: "get",
    path: "/catalog/templates",
    tag: "Explore",
    summary: "Modelos para montar a vitrine",
    description: "Modelos da Obi Ágil. Eles não aparecem no marketplace até alguém publicar um anúncio.",
    auth: "none",
    query: z.object({
      kind: Kind.optional(),
      category: z.string().max(48).optional(),
      q: z.string().trim().max(60).optional(),
      limit: z.coerce.number().int().min(1).max(40).default(20),
      offset: z.coerce.number().int().min(0).default(0),
    }),
    responses: { 200: { description: "Modelos ativos" } },
    handler: async ({ query }) => {
      const term = query.q ? fold(query.q) : null;
      const rows = await many<{
        id: string;
        name: string;
        description: string;
        image_url: string | null;
        category_id: string;
        category_name: string;
        kind: "product" | "service";
      }>(
        `select t.id, t.name, t.description, t.image_url, t.category_id, c.name as category_name, c.kind
           from catalog_templates t
           join catalog_categories c on c.id = t.category_id
          where t.active and c.active
            and ($1::text is null or c.kind = $1)
            and ($2::text is null or t.category_id = $2)
            and ($3::text is null or t.search like '%' || $3 || '%' or c.search like '%' || $3 || '%')
          order by t.name
          limit $4 offset $5`,
        [query.kind ?? null, query.category ?? null, term, query.limit, query.offset],
      );
      return {
        templates: rows.map((row) => ({
          id: row.id,
          name: row.name,
          description: row.description,
          image: row.image_url,
          categoryId: row.category_id,
          category: row.category_name,
          kind: row.kind,
        })),
      };
    },
  }),

  route({
    method: "get",
    path: "/catalog/stats",
    tag: "Meta",
    summary: "Cobertura do catálogo",
    auth: "none",
    responses: { 200: { description: "Contagens reais, inclusive fotos ainda não geradas" } },
    handler: async () => {
      const row = await one<{
        categories: number;
        product_categories: number;
        service_categories: number;
        templates: number;
        product_templates: number;
        service_templates: number;
        images_done: number;
        images_pending: number;
        images_failed: number;
      }>(
        `select
           (select count(*)::int from catalog_categories where active) as categories,
           (select count(*)::int from catalog_categories where active and kind = 'product') as product_categories,
           (select count(*)::int from catalog_categories where active and kind = 'service') as service_categories,
           (select count(*)::int from catalog_templates where active) as templates,
           (select count(*)::int from catalog_templates t join catalog_categories c on c.id = t.category_id where t.active and c.kind = 'product') as product_templates,
           (select count(*)::int from catalog_templates t join catalog_categories c on c.id = t.category_id where t.active and c.kind = 'service') as service_templates,
           (select count(*)::int from catalog_image_jobs where status = 'done') as images_done,
           (select count(*)::int from catalog_image_jobs where status = 'pending') as images_pending,
           (select count(*)::int from catalog_image_jobs where status = 'failed') as images_failed`,
      );
      return row;
    },
  }),

  route({
    method: "post",
    path: "/items/:id/requests",
    tag: "Orders",
    summary: "Pedir orçamento de um serviço",
    auth: "customer",
    params: z.object({ id: Id }),
    body: z.object({ note: z.string().trim().max(500).default("") }),
    responses: { 201: { description: "Pedido registrado" } },
    handler: async ({ params, body, user }) => {
      const item = await one<{ id: string; business_id: string; kind: string; name: string }>(
        "select id, business_id, kind, name from items where id = $1 and deleted_at is null and available",
        [params.id],
      );
      if (!item) throw notFound("Anúncio não encontrado.");
      if (item.kind !== "service") throw badRequest("not_a_service", "Esse anúncio é um aluguel. Use o pedido de aluguel.");
      const business = await one<{ owner_id: string }>("select owner_id from businesses where id = $1", [item.business_id]);
      if (business?.owner_id === user.id) throw forbidden();
      const row = await one<{ id: string }>(
        `insert into service_requests (business_id, item_id, customer_id, note)
         values ($1, $2, $3, $4) returning id`,
        [item.business_id, item.id, user.id, body.note],
      );
      return { id: row!.id, status: "requested" as const };
    },
  }),

  route({
    method: "get",
    path: "/my/service-requests",
    tag: "My business",
    summary: "Pedidos de orçamento da loja",
    auth: "business",
    responses: { 200: { description: "Pedidos mais recentes" } },
    handler: async ({ user }) => {
      const business = await one<{ id: string }>("select id from businesses where owner_id = $1", [user.id]);
      if (!business) throw notFound("Loja não encontrada.");
      const rows = await many<{ id: string; item_name: string; note: string; status: string; quote_cents: number | null; created_at: Date; customer_name: string }>(
        `select r.id, i.name as item_name, r.note, r.status, r.quote_cents, r.created_at, u.name as customer_name
           from service_requests r
           join items i on i.id = r.item_id
           join users u on u.id = r.customer_id
          where r.business_id = $1
          order by r.created_at desc
          limit 50`,
        [business.id],
      );
      return {
        requests: rows.map((row) => ({
          id: row.id,
          item: row.item_name,
          note: row.note,
          status: row.status,
          quote: row.quote_cents === null || row.quote_cents === undefined ? null : row.quote_cents / 100,
          customer: row.customer_name,
          at: row.created_at.getTime(),
        })),
      };
    },
  }),

  route({
    method: "get",
    path: "/service-requests",
    tag: "Orders",
    summary: "Orçamentos do cliente",
    auth: "customer",
    responses: { 200: { description: "Pedidos de serviço do cliente" } },
    handler: async ({ user }) => {
      const rows = await many<{ id: string; item_name: string; note: string; status: string; quote_cents: number | null; created_at: Date; business_name: string }>(
        `select r.id, i.name as item_name, r.note, r.status, r.quote_cents, r.created_at, b.name as business_name
           from service_requests r
           join items i on i.id = r.item_id
           join businesses b on b.id = r.business_id
          where r.customer_id = $1
          order by r.created_at desc
          limit 50`,
        [user.id],
      );
      return {
        requests: rows.map((row) => ({
          id: row.id,
          item: row.item_name,
          note: row.note,
          status: row.status,
          quote: row.quote_cents === null ? null : row.quote_cents / 100,
          business: row.business_name,
          at: row.created_at.getTime(),
        })),
      };
    },
  }),

  route({
    method: "patch",
    path: "/my/service-requests/:id",
    tag: "My business",
    summary: "Responder um orçamento",
    auth: "business",
    params: z.object({ id: Id }),
    body: z.object({
      status: z.enum(["quoted", "cancelled", "done"]),
      quote: z.number().min(0).max(1_000_000).optional(),
    }),
    responses: { 200: { description: "Orçamento atualizado" } },
    handler: async ({ params, body, user }) => {
      const row = await one<{ id: string; status: string; owner_id: string }>(
        `select r.id, r.status, b.owner_id
           from service_requests r join businesses b on b.id = r.business_id
          where r.id = $1`,
        [params.id],
      );
      if (!row) throw notFound("Pedido não encontrado.");
      if (row.owner_id !== user.id) throw forbidden();
      const allowed: Record<string, string[]> = { requested: ["quoted", "cancelled"], quoted: ["cancelled"], accepted: ["done", "cancelled"] };
      if (!allowed[row.status]?.includes(body.status)) throw badRequest("invalid_status", "Esse pedido não pode mudar para essa etapa.");
      if (body.status === "quoted" && body.quote === undefined) throw badRequest("quote_required", "Informe o valor do orçamento.");
      const quoteCents = body.quote === undefined ? null : Math.round(body.quote * 100);
      const updated = await one<{ status: string; quote_cents: number | null }>(
        `update service_requests set status = $2, quote_cents = coalesce($3, quote_cents) where id = $1 returning status, quote_cents`,
        [params.id, body.status, quoteCents],
      );
      return { id: params.id, status: updated!.status, quote: updated!.quote_cents === null ? null : updated!.quote_cents / 100 };
    },
  }),

  route({
    method: "post",
    path: "/service-requests/:id/accept",
    tag: "Orders",
    summary: "Aceitar o orçamento",
    auth: "customer",
    params: z.object({ id: Id }),
    responses: { 200: { description: "Orçamento aceito" } },
    handler: async ({ params, user }) => {
      const row = await one<{ status: string; customer_id: string }>("select status, customer_id from service_requests where id = $1", [params.id]);
      if (!row) throw notFound("Pedido não encontrado.");
      if (row.customer_id !== user.id) throw forbidden();
      if (row.status !== "quoted") throw badRequest("not_quoted", "O profissional ainda não enviou o valor.");
      await one("update service_requests set status = 'accepted' where id = $1", [params.id]);
      return { id: params.id, status: "accepted" as const };
    },
  }),
];
