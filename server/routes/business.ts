import { z } from "zod";
import { exec, many, one } from "../db/pool.ts";
import { badRequest, forbidden, notFound } from "../lib/errors.ts";
import { route } from "../lib/route.ts";
import { fold, toCents } from "../lib/text.ts";
import {
  AddressInput,
  Business,
  Category,
  IdParams,
  Item,
  Money,
  serializeBusiness,
  serializeItem,
  Time,
  type BusinessRow,
  type ItemRow,
} from "../models.ts";

const categoryLabel: Record<z.output<typeof Category>, string> = {
  concreto: "Concreto",
  andaimes: "Andaimes",
  ferramentas: "Ferramentas",
  energia: "Energia",
  compactacao: "Compactação",
  escavacao: "Escavação",
  elevacao: "Elevação",
  limpeza: "Limpeza",
};

/** Our own uploads or the built-in gallery. */
const ImageUrl = z
  .string()
  .regex(/^\/(uploads|img)\/[\w./-]+$/, "Use uma foto enviada pelo app.")
  .describe("Caminho devolvido por /uploads, ou uma imagem da galeria em /img.");

const ItemFields = z.object({
  name: z.string().trim().min(3, "Dê um nome ao equipamento.").max(80),
  category: Category,
  price: Money.min(0.01, "Informe o preço por dia."),
  deposit: Money,
  description: z.string().trim().max(240),
  specs: z.array(z.string().trim().min(1).max(40)).max(6),
  image: ImageUrl,
  quantity: z.number().int().min(1).max(999),
  available: z.boolean(),
});

const ItemInput = ItemFields.extend({
  deposit: ItemFields.shape.deposit.default(0),
  description: ItemFields.shape.description.default(""),
  specs: ItemFields.shape.specs.default([]),
  quantity: ItemFields.shape.quantity.default(1),
  available: ItemFields.shape.available.default(true),
});

/** Zod 4 still fills .default() values inside .partial(), which would overwrite fields the request left out. */
const ItemPatch = ItemFields.partial();

function searchText(item: { name: string; description: string; specs: string[]; category: z.output<typeof Category> }) {
  return fold([item.name, item.description, item.specs.join(" "), categoryLabel[item.category]].join(" "));
}

async function ownBusiness(userId: string) {
  const row = await one<BusinessRow>("select * from businesses where owner_id = $1", [userId]);
  if (!row) throw notFound("Loja não encontrada.");
  return row;
}

async function ownItem(userId: string, itemId: string) {
  const row = await one<ItemRow & { owner_id: string }>(
    "select i.*, b.owner_id from items i join businesses b on b.id = i.business_id where i.id = $1 and i.deleted_at is null",
    [itemId],
  );
  if (!row) throw notFound("Equipamento não encontrado.");
  if (row.owner_id !== userId) throw forbidden();
  return row;
}

export const businessRoutes = [
  route({
    method: "patch",
    path: "/my/business",
    tag: "My business",
    summary: "Editar a loja",
    description: "Envie só os campos que mudaram.",
    auth: "business",
    body: z.object({
      name: z.string().trim().min(3, "O nome precisa de pelo menos 3 letras.").max(80).optional(),
      tagline: z.string().trim().max(80).optional(),
      about: z.string().trim().max(300).optional(),
      category: Category.optional(),
      cover: ImageUrl.optional(),
      logo: ImageUrl.nullable().optional(),
      phone: z
        .string()
        .transform((value) => value.replace(/\D/g, ""))
        .pipe(z.string().regex(/^[1-9]{2}\d{8,9}$/, "Confira o telefone com DDD."))
        .optional(),
      address: AddressInput.optional(),
      opens: Time.optional(),
      closes: Time.optional(),
      deliveryFee: Money.optional(),
      radiusKm: z.number().int().min(1).max(100).optional(),
    }),
    responses: { 200: { description: "Loja atualizada", schema: Business } },
    handler: async ({ body, user }) => {
      const business = await ownBusiness(user.id);
      const columns: Record<string, unknown> = {
        name: body.name,
        tagline: body.tagline,
        about: body.about,
        category: body.category,
        cover_url: body.cover,
        logo_url: body.logo,
        phone: body.phone,
        opens: body.opens,
        closes: body.closes,
        delivery_fee_cents: body.deliveryFee === undefined ? undefined : toCents(body.deliveryFee),
        radius_km: body.radiusKm,
        address_label: body.address?.label,
        address_detail: body.address?.detail,
        lat: body.address?.lat,
        lng: body.address?.lng,
      };
      const entries = Object.entries(columns).filter(([, value]) => value !== undefined);
      if (entries.length) {
        await exec(
          `update businesses set ${entries.map(([column], i) => `${column} = $${i + 2}`).join(", ")}, updated_at = now() where id = $1`,
          [business.id, ...entries.map(([, value]) => value)],
        );
      }
      return serializeBusiness((await one<BusinessRow>("select * from businesses where id = $1", [business.id]))!);
    },
  }),

  route({
    method: "get",
    path: "/my/items",
    tag: "My business",
    summary: "Estoque da loja",
    auth: "business",
    responses: { 200: { description: "Equipamentos, do mais novo ao mais antigo", schema: z.array(Item) } },
    handler: async ({ user }) => {
      const business = await ownBusiness(user.id);
      const rows = await many<ItemRow>("select * from items where business_id = $1 and deleted_at is null order by created_at desc", [business.id]);
      return rows.map(serializeItem);
    },
  }),

  route({
    method: "post",
    path: "/my/items",
    tag: "My business",
    summary: "Cadastrar equipamento",
    auth: "business",
    body: ItemInput,
    responses: {
      201: {
        description: "Equipamento criado",
        schema: z.object({ item: Item, first: z.boolean().describe("true quando é o primeiro equipamento da loja.") }),
      },
    },
    handler: async ({ body, user }) => {
      const business = await ownBusiness(user.id);
      const count = await one<{ n: number }>("select count(*)::int as n from items where business_id = $1 and deleted_at is null", [business.id]);
      if ((count?.n ?? 0) >= 500) throw badRequest("too_many_items", "Limite de 500 equipamentos por loja.");
      const row = await one<ItemRow>(
        `insert into items (business_id, name, category, price_cents, deposit_cents, description, specs, image_url, quantity, available, search)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) returning *`,
        [
          business.id,
          body.name,
          body.category,
          toCents(body.price),
          toCents(body.deposit),
          body.description,
          body.specs,
          body.image,
          body.quantity,
          body.available,
          searchText(body),
        ],
      );
      return { item: serializeItem(row!), first: (count?.n ?? 0) === 0 };
    },
  }),

  route({
    method: "patch",
    path: "/my/items/:id",
    tag: "My business",
    summary: "Editar equipamento",
    description: "Envie só os campos que mudaram, por exemplo { available: false } para pausar.",
    auth: "business",
    params: IdParams,
    body: ItemPatch,
    responses: { 200: { description: "Equipamento atualizado", schema: Item } },
    handler: async ({ params, body, user }) => {
      const current = await ownItem(user.id, params.id);
      const next = {
        name: body.name ?? current.name,
        category: body.category ?? current.category,
        description: body.description ?? current.description,
        specs: body.specs ?? current.specs,
      };
      const row = await one<ItemRow>(
        `update items set name = $2, category = $3, price_cents = $4, deposit_cents = $5, description = $6, specs = $7,
                image_url = $8, quantity = $9, available = $10, search = $11, updated_at = now()
          where id = $1 returning *`,
        [
          params.id,
          next.name,
          next.category,
          body.price === undefined ? current.price_cents : toCents(body.price),
          body.deposit === undefined ? current.deposit_cents : toCents(body.deposit),
          next.description,
          next.specs,
          body.image ?? current.image_url,
          body.quantity ?? current.quantity,
          body.available ?? current.available,
          searchText(next),
        ],
      );
      return serializeItem(row!);
    },
  }),

  route({
    method: "delete",
    path: "/my/items/:id",
    tag: "My business",
    summary: "Excluir equipamento",
    description: "Sai da loja e da busca na hora. Pedidos antigos continuam mostrando o nome e a foto.",
    auth: "business",
    params: IdParams,
    responses: { 204: { description: "Excluído" } },
    handler: async ({ params, user }) => {
      await ownItem(user.id, params.id);
      await exec("update items set deleted_at = now(), available = false, updated_at = now() where id = $1", [params.id]);
      await exec("delete from favorites where kind = 'item' and target_id = $1", [params.id]);
    },
  }),
];
