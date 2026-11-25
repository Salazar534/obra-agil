import type { Request } from "express";
import type pg from "pg";
import { z } from "zod";
import { config } from "../config.ts";
import { exec, one, tx } from "../db/pool.ts";
import { badRequest, conflict, HttpError, unauthorized } from "../lib/errors.ts";
import { authLimiter, mailLimiter, smsLimiter } from "../lib/limits.ts";
import { route } from "../lib/route.ts";
import { decoyHash, hashPassword, newToken, sha256, verifyPassword } from "../lib/security.ts";
import { endOtherSessions, endSession, readSession, startSession } from "../lib/session.ts";
import { coverForCategory } from "../lib/text.ts";
import { AddressInput, Business, Category, Email, loadBusinessOf, loadMe, Me, Password, Phone, Role } from "../models.ts";
import { mailMode, resetPasswordEmail, sendMail } from "../services/mail.ts";
import { verifyIdentity } from "../services/identity.ts";
import { checkCode, sendCode } from "../services/sms.ts";

export const Session = z.object({ user: Me, business: Business.nullable() }).meta({ id: "Session", description: "Conta logada e, para empresas, a loja." });

const Profile = z.object({
  role: Role,
  name: z.string().trim().min(3, "Digite seu nome completo.").max(80),
  address: AddressInput.describe("Endereço da obra (cliente) ou da loja (empresa)."),
  document: z
    .string()
    .trim()
    .transform((value) => value.replace(/\D/g, ""))
    .default("")
    .describe("CPF ou CNPJ de quem cria a conta."),
  business: z
    .object({
      name: z.string().trim().min(3, "Digite o nome da loja.").max(80),
      category: Category,
      offers: z.enum(["rental", "service", "both"]).default("rental"),
      personType: z.enum(["pf", "pj"]).default("pf"),
      document: z
        .string()
        .trim()
        .transform((value) => value.replace(/\D/g, ""))
        .default(""),
    })
    .optional()
    .describe("Obrigatório quando role = business."),
});

function needsBusiness<T extends z.ZodType<{ role: string; business?: unknown }>>(schema: T) {
  return schema.refine((value) => value.role !== "business" || value.business, { message: "Informe o nome da locadora.", path: ["business"] });
}

type NewAccount = z.output<typeof Profile> & { email?: string | null; passwordHash?: string | null; phone?: string | null };

function uniqueViolation(error: unknown) {
  const pgError = error as pg.DatabaseError;
  if (pgError?.code !== "23505") return null;
  if (pgError.constraint === "users_email_key") return conflict("email_taken", "Esse e-mail já tem conta. Entre com ele.");
  if (pgError.constraint === "users_phone_key") return conflict("phone_taken", "Esse celular já tem conta. Entre com ele.");
  return null;
}

async function createAccount(input: NewAccount) {
  const identity = await verifyIdentity({
    offers: input.business?.offers,
    document: input.business?.document || input.document,
  });
  try {
    return await tx(async (db) => {
      const user = await one<{ id: string }>(
        "insert into users (role, name, email, phone, password_hash, cpf, cnpj) values ($1, $2, $3, $4, $5, $6, $7) returning id",
        [
          input.role,
          input.name,
          input.email ?? null,
          input.phone ?? null,
          input.passwordHash ?? null,
          identity?.kind === "cpf" ? identity.digits : null,
          identity?.kind === "cnpj" ? identity.digits : null,
        ],
        db,
      );
      const userId = user!.id;
      const { label, detail, lat, lng } = input.address;
      if (input.role === "customer") {
        const address = await one<{ id: string }>(
          "insert into addresses (user_id, label, detail, lat, lng) values ($1, $2, $3, $4, $5) returning id",
          [userId, label, detail, lat, lng],
          db,
        );
        await exec("update users set active_address_id = $2 where id = $1", [userId, address!.id], db);
      } else if (input.business) {
        const category = await one("select id from catalog_categories where id = $1 and active", [input.business.category], db);
        if (!category) throw badRequest("unknown_category", "Escolha uma categoria do catálogo.");
        await exec(
          `insert into businesses (owner_id, name, tagline, category, offers, person_type, document, legal_name, cover_url, phone, address_label, address_detail, lat, lng)
           values ($1, $2, 'Nova na Obi Ágil', $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
          [
            userId,
            input.business.name,
            input.business.category,
            input.business.offers,
            identity?.kind === "cnpj" ? "pj" : "pf",
            identity?.digits ?? null,
            identity?.legalName ?? null,
            coverForCategory(input.business.category),
            input.phone ?? "",
            label,
            detail,
            lat,
            lng,
          ],
          db,
        );
        await exec(
          `insert into business_categories (business_id, category_id)
           select id, $2 from businesses where owner_id = $1
           on conflict do nothing`,
          [userId, input.business.category],
          db,
        );
      }
      return userId;
    });
  } catch (error) {
    throw uniqueViolation(error) ?? error;
  }
}

async function session(userId: string) {
  return { user: await loadMe(userId), business: await loadBusinessOf(userId) };
}

function ip(req: Request) {
  return req.ip ?? null;
}

const SessionResponse = { description: "Conta logada", schema: Session };

export const authRoutes = [
  route({
    method: "post",
    path: "/auth/register",
    tag: "Auth",
    summary: "Criar conta com e-mail e senha",
    description: "Cria a conta (e a loja, para empresas), salva o endereço e já abre a sessão.",
    auth: "none",
    middleware: [authLimiter],
    body: needsBusiness(Profile.extend({ email: Email, password: Password })),
    responses: { 201: SessionResponse },
    handler: async ({ req, res, body }) => {
      const userId = await createAccount({ ...body, passwordHash: await hashPassword(body.password) });
      await startSession(req, res, userId);
      return session(userId);
    },
  }),

  route({
    method: "post",
    path: "/auth/login",
    tag: "Auth",
    summary: "Entrar com e-mail e senha",
    auth: "none",
    middleware: [authLimiter],
    body: z.object({ email: Email, password: z.string().min(1, "Digite a senha.").max(128) }),
    responses: { 200: SessionResponse },
    handler: async ({ req, res, body }) => {
      const user = await one<{ id: string; password_hash: string | null }>("select id, password_hash from users where email = $1", [body.email]);
      const valid = await verifyPassword(body.password, user?.password_hash ?? decoyHash);
      if (!user || !user.password_hash || !valid) throw new HttpError(401, "invalid_credentials", "E-mail ou senha incorretos.");
      await startSession(req, res, user.id);
      return session(user.id);
    },
  }),

  route({
    method: "post",
    path: "/auth/phone/start",
    tag: "Auth",
    summary: "Enviar código por SMS",
    description:
      "Envia um código de 6 dígitos para o celular. Serve para entrar e para criar conta: depois de conferir o código, " +
      "/auth/phone/verify diz se o número já tem conta. Sem Twilio configurado, em desenvolvimento o código aparece no terminal da API.",
    auth: "none",
    middleware: [smsLimiter],
    body: z.object({ phone: Phone }),
    responses: { 202: { description: "Código enviado", schema: z.object({ resendIn: z.number().int().describe("Segundos até poder pedir outro.") }) } },
    handler: ({ req, body }) => sendCode(body.phone, ip(req)),
  }),

  route({
    method: "post",
    path: "/auth/phone/verify",
    tag: "Auth",
    summary: "Conferir código do SMS",
    description:
      "Se o celular já tem conta, abre a sessão (status signed_in). Se não, devolve um ticket (status new) para /auth/phone/register, válido por 30 minutos.",
    auth: "none",
    middleware: [authLimiter],
    body: z.object({ phone: Phone, code: z.string().regex(/^\d{6}$/, "O código tem 6 dígitos.").describe("Código de 6 dígitos recebido por SMS.") }),
    responses: {
      200: {
        description: "Código certo",
        schema: z.discriminatedUnion("status", [
          z.object({ status: z.literal("signed_in"), user: Me, business: Business.nullable() }),
          z.object({ status: z.literal("new"), ticket: z.string().describe("Use em /auth/phone/register.") }),
        ]),
      },
    },
    handler: async ({ req, res, body }) => {
      await checkCode(body.phone, body.code);
      const user = await one<{ id: string }>("select id from users where phone = $1", [body.phone]);
      if (user) {
        await startSession(req, res, user.id);
        return { status: "signed_in" as const, ...(await session(user.id)) };
      }
      const ticket = newToken();
      await exec("insert into phone_tickets (id, phone, expires_at) values ($1, $2, now() + interval '30 minutes')", [sha256(ticket), body.phone]);
      return { status: "new" as const, ticket };
    },
  }),

  route({
    method: "post",
    path: "/auth/phone/register",
    tag: "Auth",
    summary: "Criar conta com celular verificado",
    auth: "none",
    middleware: [authLimiter],
    body: needsBusiness(Profile.extend({ ticket: z.string().min(20).max(100), email: Email.optional().describe("Opcional, usado em pagamentos e recibos.") })),
    responses: { 201: SessionResponse },
    handler: async ({ req, res, body }) => {
      const ticket = await one<{ phone: string }>(
        "update phone_tickets set used_at = now() where id = $1 and used_at is null and expires_at > now() returning phone",
        [sha256(body.ticket)],
      );
      if (!ticket) throw badRequest("ticket_expired", "A confirmação do celular expirou. Peça um novo código.");
      const userId = await createAccount({ ...body, phone: ticket.phone, email: body.email ?? null });
      await startSession(req, res, userId);
      return session(userId);
    },
  }),

  route({
    method: "get",
    path: "/auth/me",
    tag: "Auth",
    summary: "Conta da sessão atual",
    auth: "optional",
    responses: { 200: SessionResponse },
    handler: async ({ user }) => {
      if (!user) throw unauthorized("Você não está logado.");
      return session(user.id);
    },
  }),

  route({
    method: "post",
    path: "/auth/logout",
    tag: "Auth",
    summary: "Sair",
    auth: "none",
    responses: { 204: { description: "Sessão encerrada" } },
    handler: async ({ req, res }) => {
      await endSession(req, res);
    },
  }),

  route({
    method: "post",
    path: "/auth/password/forgot",
    tag: "Auth",
    summary: "Pedir link para criar nova senha",
    description:
      "Sempre responde 202, exista ou não a conta, para não revelar e-mails cadastrados. O link leva a APP_URL/?reset=TOKEN e vale 30 minutos. " +
      "Sem SMTP configurado, em desenvolvimento o e-mail aparece no terminal da API.",
    auth: "none",
    middleware: [mailLimiter],
    body: z.object({ email: Email }),
    responses: { 202: { description: "Pedido recebido" } },
    handler: async ({ res, body }) => {
      if (mailMode === "disabled") throw new HttpError(503, "mail_unavailable", "Recuperação de senha indisponível agora. Fale com o suporte.");
      const user = await one<{ id: string; name: string }>("select id, name from users where email = $1", [body.email]);
      if (user) {
        const token = newToken();
        await exec("insert into password_resets (id, user_id, expires_at) values ($1, $2, now() + interval '30 minutes')", [sha256(token), user.id]);
        const email = resetPasswordEmail(user.name, `${config.appUrl}/?reset=${token}`);
        await sendMail({ to: body.email, ...email }).catch((error) => console.error("[mail] reset email failed", error));
      }
      res.status(202).end();
    },
  }),

  route({
    method: "post",
    path: "/auth/password/reset",
    tag: "Auth",
    summary: "Criar nova senha com o link do e-mail",
    description: "Troca a senha, encerra as outras sessões e já entra na conta.",
    auth: "none",
    middleware: [authLimiter],
    body: z.object({ token: z.string().min(20).max(100), password: Password }),
    responses: { 200: SessionResponse },
    handler: async ({ req, res, body }) => {
      const reset = await one<{ user_id: string }>(
        "update password_resets set used_at = now() where id = $1 and used_at is null and expires_at > now() returning user_id",
        [sha256(body.token)],
      );
      if (!reset) throw badRequest("reset_expired", "Esse link expirou ou já foi usado. Peça outro.");
      await exec("update users set password_hash = $2, updated_at = now() where id = $1", [reset.user_id, await hashPassword(body.password)]);
      await endOtherSessions(reset.user_id, null);
      await startSession(req, res, reset.user_id);
      return session(reset.user_id);
    },
  }),

  route({
    method: "post",
    path: "/me/password",
    tag: "Me",
    summary: "Trocar ou criar senha",
    description: "Contas com senha precisam enviar a atual. Contas criadas pelo celular podem criar uma senha para entrar também com e-mail.",
    auth: "user",
    middleware: [authLimiter],
    body: z.object({ current: z.string().max(128).optional(), password: Password }),
    responses: { 204: { description: "Senha salva" } },
    handler: async ({ req, res, body, user }) => {
      const row = await one<{ password_hash: string | null; email: string | null }>("select password_hash, email from users where id = $1", [user.id]);
      if (row?.password_hash && !(await verifyPassword(body.current ?? "", row.password_hash))) {
        throw new HttpError(400, "invalid_password", "A senha atual está incorreta.");
      }
      if (!row?.email) throw badRequest("email_required", "Adicione um e-mail ao perfil antes de criar uma senha.");
      await exec("update users set password_hash = $2, updated_at = now() where id = $1", [user.id, await hashPassword(body.password)]);
      const current = await readSession(req, res);
      await endOtherSessions(user.id, current?.sessionId ?? null);
    },
  }),
];
