import type { Request, RequestHandler, Response, Router } from "express";
import type { z } from "zod";
import { forbidden, HttpError, unauthorized } from "./errors.ts";
import { readSession, type SessionUser } from "./session.ts";

/** none: public. optional: public, user attached when signed in. user/customer/business: session required. */
export type Auth = "none" | "optional" | "user" | "customer" | "business";
type Method = "get" | "post" | "put" | "patch" | "delete";
type Schema = z.ZodType | undefined;
type Out<S> = S extends z.ZodType ? z.output<S> : undefined;
type UserFor<A extends Auth> = A extends "user" | "customer" | "business" ? SessionUser : SessionUser | null;

export type Context<P, Q, B, A extends Auth> = {
  req: Request;
  res: Response;
  params: P;
  query: Q;
  body: B;
  user: UserFor<A>;
};

export type ResponseSpec = { description: string; schema?: z.ZodType };

export type RouteSpec<P extends Schema, Q extends Schema, B extends Schema, A extends Auth> = {
  method: Method;
  path: string;
  tag: string;
  summary: string;
  description?: string;
  auth: A;
  params?: P;
  query?: Q;
  body?: B;
  /** Multipart upload field, documented as binary. */
  upload?: { field: string; description: string };
  responses: Record<number, ResponseSpec>;
  middleware?: RequestHandler[];
  handler: (ctx: Context<Out<P>, Out<Q>, Out<B>, A>) => unknown;
};

export type AnyRoute = RouteSpec<Schema, Schema, Schema, Auth>;

export function route<P extends Schema = undefined, Q extends Schema = undefined, B extends Schema = undefined, A extends Auth = Auth>(
  spec: RouteSpec<P, Q, B, A>,
): AnyRoute {
  return spec as unknown as AnyRoute;
}

function parse(schema: z.ZodType, value: unknown, where: "params" | "query" | "body") {
  const result = schema.safeParse(value);
  if (result.success) return result.data;
  const details = result.error.issues.map((issue) => ({ in: where, path: issue.path.join("."), message: issue.message }));
  throw new HttpError(422, "validation_error", details[0]?.message ?? "Confira os dados enviados.", details);
}

async function authorize(req: Request, res: Response, auth: Auth) {
  if (auth === "none") return null;
  const user = await readSession(req, res);
  if (auth === "optional") return user;
  if (!user) throw unauthorized();
  if (auth === "customer" && user.role !== "customer") throw forbidden("Disponível só para contas de cliente.");
  if (auth === "business" && user.role !== "business") throw forbidden("Disponível só para contas de empresa.");
  return user;
}

export function successStatus(spec: AnyRoute) {
  return Number(Object.keys(spec.responses).find((code) => code.startsWith("2")) ?? 200);
}

export function mount(router: Router, routes: AnyRoute[]) {
  for (const spec of routes) {
    const status = successStatus(spec);
    const handler: RequestHandler = async (req, res, next) => {
      try {
        const user = await authorize(req, res, spec.auth);
        const params = spec.params ? parse(spec.params, req.params, "params") : undefined;
        const query = spec.query ? parse(spec.query, req.query, "query") : undefined;
        const body = spec.body ? parse(spec.body, req.body ?? {}, "body") : undefined;
        const result = await spec.handler({ req, res, params, query, body, user });
        if (res.headersSent) return;
        if (status === 204) res.status(204).end();
        else res.status(status).json(result ?? null);
      } catch (error) {
        next(error);
      }
    };
    router[spec.method](spec.path, ...(spec.middleware ?? []), handler);
  }
}
