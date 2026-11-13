import { z } from "zod";
import type { AnyRoute } from "./route.ts";

type Json = Record<string, unknown>;

const SAFE_INT = 9_007_199_254_740_991;

const tagInfo: { name: string; description: string }[] = [
  { name: "Meta", description: "Configuração pública e saúde do servidor." },
  { name: "Auth", description: "Cadastro, entrada com e-mail e senha ou celular e código SMS, recuperação de senha e sessão." },
  { name: "Me", description: "Perfil da conta logada: dados, endereços, salvos e buscas recentes." },
  { name: "Explore", description: "Busca pública de locadoras e equipamentos perto de um endereço." },
  { name: "My business", description: "Painel da locadora: dados da loja e estoque." },
  { name: "Orders", description: "Pedidos de aluguel: criação com pagamento, andamento, conversa e avaliação." },
  { name: "Payments", description: "Cartões salvos e parcelamento via Mercado Pago." },
  { name: "Uploads", description: "Envio de fotos (perfil, logo, capa e equipamentos)." },
  { name: "Events", description: "Atualizações ao vivo via Server-Sent Events." },
  { name: "Webhooks", description: "Notificações enviadas pelo Mercado Pago." },
];

/** Cleans zod output for OpenAPI: shared schemas move to components and numeric/uuid noise goes away. */
function tidy(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(tidy);
  if (!node || typeof node !== "object") return node;
  const out: Json = {};
  for (const [key, value] of Object.entries(node as Json)) {
    if (key === "$schema" || key === "$id") continue;
    if (key === "$ref" && typeof value === "string") {
      out.$ref = value.replace("#/$defs/", "#/components/schemas/");
      continue;
    }
    if ((key === "minimum" && value === -SAFE_INT) || (key === "maximum" && value === SAFE_INT)) continue;
    if (key === "pattern" && (node as Json).format === "uuid") continue;
    out[key] = tidy(value);
  }
  return out;
}

function toSchema(schema: z.ZodType, io: "input" | "output", components: Json) {
  const raw = z.toJSONSchema(schema, { io, unrepresentable: "any" }) as Json;
  const defs = (raw.$defs ?? {}) as Json;
  delete raw.$defs;
  for (const [name, def] of Object.entries(defs)) components[name] ??= tidy(def);
  return tidy(raw);
}

function parameters(schema: z.ZodType | undefined, location: "path" | "query", components: Json) {
  if (!schema) return [];
  const json = toSchema(schema, "input", components) as { properties?: Json; required?: string[] };
  return Object.entries(json.properties ?? {}).map(([name, property]) => {
    const { description, ...rest } = property as Json;
    return {
      name,
      in: location,
      required: location === "path" || (json.required ?? []).includes(name),
      ...(description ? { description } : {}),
      schema: rest,
    };
  });
}

const authNote: Record<string, string> = {
  user: "Requer sessão.",
  customer: "Requer sessão de conta de cliente.",
  business: "Requer sessão de conta de empresa.",
  optional: "Sessão opcional.",
};

export function buildOpenApi(routes: AnyRoute[]) {
  const components: Json = {};
  const paths: Record<string, Json> = {};
  for (const spec of routes) {
    const path = `/api${spec.path.replace(/:(\w+)/g, "{$1}")}`;
    const note = authNote[spec.auth];
    const operation: Json = {
      tags: [spec.tag],
      summary: spec.summary,
      operationId: `${spec.method}${path.replace(/[{}]/g, "").replace(/[^a-zA-Z0-9]+(\w)/g, (_, c: string) => c.toUpperCase())}`,
      description: [spec.description, note].filter(Boolean).join("\n\n") || undefined,
      security: spec.auth === "none" || spec.auth === "optional" ? [] : [{ session: [] }],
    };
    const params = [...parameters(spec.params, "path", components), ...parameters(spec.query, "query", components)];
    if (params.length) operation.parameters = params;
    if (spec.body) {
      operation.requestBody = { required: true, content: { "application/json": { schema: toSchema(spec.body, "input", components) } } };
    }
    if (spec.upload) {
      operation.requestBody = {
        required: true,
        content: {
          "multipart/form-data": {
            schema: {
              type: "object",
              required: [spec.upload.field],
              properties: { [spec.upload.field]: { type: "string", format: "binary", description: spec.upload.description } },
            },
          },
        },
      };
    }
    const responses: Json = {};
    for (const [code, response] of Object.entries(spec.responses)) {
      responses[code] = response.schema
        ? { description: response.description, content: { "application/json": { schema: toSchema(response.schema, "output", components) } } }
        : { description: response.description };
    }
    responses.default = { description: "Erro", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } };
    operation.responses = responses;
    (paths[path] ??= {})[spec.method] = operation;
  }

  components.Error = {
    type: "object",
    required: ["error"],
    properties: {
      error: {
        type: "object",
        required: ["code", "message"],
        properties: {
          code: { type: "string", examples: ["validation_error", "unauthorized", "not_found"] },
          message: { type: "string", description: "Mensagem pronta para mostrar ao usuário (pt-BR)." },
          details: { description: "Detalhes extras, como os campos inválidos." },
        },
      },
    },
  };

  return {
    openapi: "3.1.0",
    info: {
      title: "Obra Ágil API",
      version: "1.0.0",
      description:
        "API do Obra Ágil, marketplace de aluguel de equipamentos de obra. Todas as rotas ficam em /api. " +
        "A sessão é um cookie httpOnly (oa_session) criado no cadastro ou na entrada. Valores em reais (número com 2 casas). " +
        "Datas de calendário em YYYY-MM-DD e instantes em milissegundos desde 1970 (epoch).",
    },
    servers: [{ url: "/" }],
    tags: tagInfo,
    components: {
      securitySchemes: { session: { type: "apiKey", in: "cookie", name: "oa_session" } },
      schemas: components,
    },
    paths,
  };
}
