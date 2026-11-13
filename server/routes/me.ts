import type pg from "pg";
import { z } from "zod";
import { exec, many, one, tx } from "../db/pool.ts";
import { badRequest, conflict, notFound } from "../lib/errors.ts";
import { authLimiter, smsLimiter } from "../lib/limits.ts";
import { route } from "../lib/route.ts";
import { isValidCpf } from "../lib/text.ts";
import {
  AddressInput,
  Business,
  Cpf,
  Email,
  Id,
  IdParams,
  Item,
  loadMe,
  Me,
  Phone,
  Prefs,
  serializeBusiness,
  serializeItem,
  type BusinessRow,
  type ItemRow,
} from "../models.ts";
import { checkCode, sendCode } from "../services/sms.ts";

const MeResponse = { description: "Conta atualizada", schema: Me };
const Kind = z.enum(["item", "business"]);

export const meRoutes = [
  route({
    method: "patch",
    path: "/me",
    tag: "Me",
    summary: "Editar perfil",
    description: "Envie só os campos que mudaram. Para trocar o celular use /me/phone/start.",
    auth: "user",
    body: z.object({
      name: z.string().trim().min(3, "Digite seu nome completo.").max(80).optional(),
      email: Email.nullable().optional().describe("null remove o e-mail (só se a conta também entra pelo celular)."),
      cpf: Cpf.nullable().optional().describe("Usado como documento do pagador no Mercado Pago."),
      photo: z.string().max(300).nullable().optional().describe("URL devolvida por /uploads."),
      prefs: Prefs.partial().optional(),
      tipDismissed: z.boolean().optional(),
    }),
    responses: { 200: MeResponse },
    handler: async ({ body, user }) => {
      if (body.cpf && !isValidCpf(body.cpf)) throw badRequest("invalid_cpf", "Esse CPF não é válido.");
      const sets: string[] = [];
      const values: unknown[] = [user.id];
      const set = (column: string, value: unknown) => {
        values.push(value);
        sets.push(`${column} = $${values.length}`);
      };
      if (body.name !== undefined) set("name", body.name);
      if (body.email !== undefined) set("email", body.email);
      if (body.cpf !== undefined) set("cpf", body.cpf);
      if (body.photo !== undefined) set("photo_url", body.photo);
      if (body.tipDismissed !== undefined) set("tip_dismissed", body.tipDismissed);
      if (body.prefs) {
        values.push(JSON.stringify(body.prefs));
        sets.push(`prefs = prefs || $${values.length}::jsonb`);
      }
      if (sets.length) {
        try {
          await exec(`update users set ${sets.join(", ")}, updated_at = now() where id = $1`, values);
        } catch (error) {
          const pgError = error as pg.DatabaseError;
          if (pgError.code === "23505") throw conflict("email_taken", "Esse e-mail já está em outra conta.");
          if (pgError.constraint === "users_can_sign_in") throw badRequest("email_required", "Mantenha o e-mail: é com ele que você entra.");
          throw error;
        }
      }
      return loadMe(user.id);
    },
  }),

  route({
    method: "post",
    path: "/me/phone/start",
    tag: "Me",
    summary: "Enviar código para um novo celular",
    auth: "user",
    middleware: [smsLimiter],
    body: z.object({ phone: Phone }),
    responses: { 202: { description: "Código enviado", schema: z.object({ resendIn: z.number().int() }) } },
    handler: async ({ req, body, user }) => {
      const owner = await one<{ id: string }>("select id from users where phone = $1", [body.phone]);
      if (owner && owner.id !== user.id) throw conflict("phone_taken", "Esse celular já está em outra conta.");
      return sendCode(body.phone, req.ip ?? null);
    },
  }),

  route({
    method: "post",
    path: "/me/phone/verify",
    tag: "Me",
    summary: "Confirmar o novo celular",
    auth: "user",
    middleware: [authLimiter],
    body: z.object({ phone: Phone, code: z.string().regex(/^\d{6}$/, "O código tem 6 dígitos.").describe("Código de 6 dígitos recebido por SMS.") }),
    responses: { 200: MeResponse },
    handler: async ({ body, user }) => {
      await checkCode(body.phone, body.code);
      try {
        await exec("update users set phone = $2, updated_at = now() where id = $1", [user.id, body.phone]);
      } catch (error) {
        if ((error as pg.DatabaseError).code === "23505") throw conflict("phone_taken", "Esse celular já está em outra conta.");
        throw error;
      }
      return loadMe(user.id);
    },
  }),

  route({
    method: "delete",
    path: "/me/phone",
    tag: "Me",
    summary: "Remover celular",
    description: "Só para contas que também entram com e-mail e senha.",
    auth: "user",
    responses: { 200: MeResponse },
    handler: async ({ user }) => {
      try {
        await exec("update users set phone = null, updated_at = now() where id = $1", [user.id]);
      } catch (error) {
        if ((error as pg.DatabaseError).constraint === "users_can_sign_in") {
          throw badRequest("phone_required", "Crie uma senha antes: hoje você entra só pelo celular.");
        }
        throw error;
      }
      return loadMe(user.id);
    },
  }),

  route({
    method: "post",
    path: "/me/addresses",
    tag: "Me",
    summary: "Salvar endereço e usar agora",
    description: "Se o endereço já está salvo, só vira o endereço atual.",
    auth: "user",
    body: AddressInput,
    responses: { 200: MeResponse },
    handler: async ({ body, user }) => {
      await tx(async (db) => {
        const existing = await one<{ id: string }>(
          "select id from addresses where user_id = $1 and label = $2 and detail = $3 and abs(lat - $4) < 0.0005 and abs(lng - $5) < 0.0005",
          [user.id, body.label, body.detail, body.lat, body.lng],
          db,
        );
        const id =
          existing?.id ??
          (await one<{ id: string }>(
            "insert into addresses (user_id, label, detail, lat, lng) values ($1, $2, $3, $4, $5) returning id",
            [user.id, body.label, body.detail, body.lat, body.lng],
            db,
          ))!.id;
        await exec("update users set active_address_id = $2, updated_at = now() where id = $1", [user.id, id], db);
      });
      return loadMe(user.id);
    },
  }),

  route({
    method: "put",
    path: "/me/addresses/active",
    tag: "Me",
    summary: "Escolher o endereço atual",
    auth: "user",
    body: z.object({ id: Id }),
    responses: { 200: MeResponse },
    handler: async ({ body, user }) => {
      const updated = await exec(
        "update users set active_address_id = $2, updated_at = now() where id = $1 and exists (select 1 from addresses where id = $2 and user_id = $1)",
        [user.id, body.id],
      );
      if (!updated) throw notFound("Endereço não encontrado.");
      return loadMe(user.id);
    },
  }),

  route({
    method: "delete",
    path: "/me/addresses/:id",
    tag: "Me",
    summary: "Apagar endereço",
    description: "Se era o atual, o mais recente vira o atual.",
    auth: "user",
    params: IdParams,
    responses: { 200: MeResponse },
    handler: async ({ params, user }) => {
      await tx(async (db) => {
        const removed = await exec("delete from addresses where id = $1 and user_id = $2", [params.id, user.id], db);
        if (!removed) throw notFound("Endereço não encontrado.");
        await exec(
          `update users set active_address_id = coalesce(active_address_id,
             (select id from addresses where user_id = $1 order by created_at desc limit 1)) where id = $1`,
          [user.id],
          db,
        );
      });
      return loadMe(user.id);
    },
  }),

  route({
    method: "get",
    path: "/me/favorites",
    tag: "Me",
    summary: "Equipamentos e lojas salvos",
    auth: "user",
    responses: {
      200: {
        description: "Salvos, do mais recente ao mais antigo",
        schema: z.object({ items: z.array(z.object({ item: Item, business: Business })), businesses: z.array(Business) }),
      },
    },
    handler: async ({ user }) => {
      const items = await many<ItemRow>(
        `select i.* from favorites f join items i on i.id = f.target_id
          where f.user_id = $1 and f.kind = 'item' and i.deleted_at is null order by f.created_at desc`,
        [user.id],
      );
      const stores = await many<BusinessRow>(
        `select b.* from businesses b
          where b.id = any($2::uuid[])
             or b.id in (select target_id from favorites where user_id = $1 and kind = 'business')`,
        [user.id, items.map((item) => item.business_id)],
      );
      const byId = new Map(stores.map((row) => [row.id, serializeBusiness(row)]));
      const savedOrder = await many<{ target_id: string }>(
        "select target_id from favorites where user_id = $1 and kind = 'business' order by created_at desc",
        [user.id],
      );
      return {
        items: items.flatMap((row) => {
          const business = byId.get(row.business_id);
          return business ? [{ item: serializeItem(row), business }] : [];
        }),
        businesses: savedOrder.flatMap((f) => byId.get(f.target_id) ?? []),
      };
    },
  }),

  route({
    method: "put",
    path: "/me/favorites/:kind/:id",
    tag: "Me",
    summary: "Salvar equipamento ou loja",
    auth: "user",
    params: z.object({ kind: Kind, id: Id }),
    responses: { 204: { description: "Salvo" } },
    handler: async ({ params, user }) => {
      const table = params.kind === "item" ? "items" : "businesses";
      const exists = await one(`select 1 from ${table} where id = $1`, [params.id]);
      if (!exists) throw notFound(params.kind === "item" ? "Equipamento não encontrado." : "Loja não encontrada.");
      await exec("insert into favorites (user_id, kind, target_id) values ($1, $2, $3) on conflict do nothing", [user.id, params.kind, params.id]);
    },
  }),

  route({
    method: "delete",
    path: "/me/favorites/:kind/:id",
    tag: "Me",
    summary: "Tirar dos salvos",
    auth: "user",
    params: z.object({ kind: Kind, id: Id }),
    responses: { 204: { description: "Removido" } },
    handler: async ({ params, user }) => {
      await exec("delete from favorites where user_id = $1 and kind = $2 and target_id = $3", [user.id, params.kind, params.id]);
    },
  }),

  route({
    method: "post",
    path: "/me/searches",
    tag: "Me",
    summary: "Guardar busca recente",
    auth: "user",
    body: z.object({ query: z.string().trim().min(1).max(60) }),
    responses: { 200: { description: "Buscas recentes", schema: z.object({ recentSearches: z.array(z.string()) }) } },
    handler: async ({ body, user }) => {
      const row = await one<{ recent_searches: string[] }>(
        `update users set recent_searches = (
            select coalesce(array_agg(q order by ord), '{}') from (
              select q, ord from unnest(array_prepend($2::text,
                array(select s from unnest(recent_searches) s where lower(s) <> lower($2)))) with ordinality as t(q, ord)
              limit 6) recent)
          where id = $1 returning recent_searches`,
        [user.id, body.query],
      );
      return { recentSearches: row?.recent_searches ?? [] };
    },
  }),

  route({
    method: "delete",
    path: "/me/searches",
    tag: "Me",
    summary: "Limpar buscas recentes",
    auth: "user",
    responses: { 204: { description: "Limpo" } },
    handler: async ({ user }) => {
      await exec("update users set recent_searches = '{}' where id = $1", [user.id]);
    },
  }),
];
