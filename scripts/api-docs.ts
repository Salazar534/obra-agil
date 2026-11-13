// Writes docs/openapi.json and the endpoint reference inside docs/API.md, straight from the route definitions.
// Only the part of API.md between the GENERATED markers is replaced; the guide above it is edited by hand.
// Usage: npm run docs
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

process.env.DATABASE_URL ??= "postgres://docs@127.0.0.1:5432/docs";

const { routes } = await import("../server/app.ts");
const { buildOpenApi } = await import("../server/lib/openapi.ts");

type Schema = {
  type?: string | string[];
  format?: string;
  enum?: unknown[];
  const?: unknown;
  $ref?: string;
  items?: Schema;
  properties?: Record<string, Schema>;
  required?: string[];
  anyOf?: Schema[];
  oneOf?: Schema[];
  description?: string;
  default?: unknown;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  maxItems?: number;
};
type Parameter = { name: string; in: string; required: boolean; description?: string; schema: Schema };
type Content = Record<string, { schema: Schema }>;
type Operation = {
  tags: string[];
  summary: string;
  description?: string;
  security: unknown[];
  parameters?: Parameter[];
  requestBody?: { content: Content };
  responses: Record<string, { description: string; content?: Content }>;
};

const BEGIN = "<!-- BEGIN GENERATED: npm run docs -->";
const END = "<!-- END GENERATED -->";

const spec = buildOpenApi(routes) as unknown as {
  tags: { name: string; description: string }[];
  paths: Record<string, Record<string, Operation>>;
  components: { schemas: Record<string, Schema> };
};
const models = spec.components.schemas;

const statusText: Record<string, string> = {
  awaiting_payment: "Pix gerado, esperando o pagamento. Só o cliente vê.",
  pending: "Pago. Esperando a loja aceitar.",
  accepted: "A loja aceitou.",
  on_the_way: "Saiu para entrega (ou pronto para retirada).",
  delivered: "Entregue na obra (ou retirado).",
  returned: "Devolvido. A caução é estornada.",
  declined: "A loja recusou. Tudo é estornado.",
  cancelled: "Cancelado pelo cliente, pela loja depois de aceitar, ou Pix expirado. O que foi pago é estornado.",
};

const anchorOf = (method: string, path: string) => `${method}-${path}`.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/-+$/, "");
const modelAnchor = (name: string) => `model-${name.toLowerCase()}`;
const refName = (ref: string) => ref.split("/").pop() ?? ref;
const cell = (text: string) => text.replace(/\|/g, "\\|").replace(/\n+/g, " ");
const isNull = (schema: Schema) => schema.type === "null";
const isObject = (schema: Schema) => Boolean(schema.properties) && !schema.$ref;

function typeOf(schema: Schema): string {
  if (schema.$ref) return `[${refName(schema.$ref)}](#${modelAnchor(refName(schema.$ref))})`;
  if (schema.const !== undefined) return `\`${JSON.stringify(schema.const)}\``;
  if (schema.enum) return schema.enum.map((value) => `\`${JSON.stringify(value)}\``).join(" | ");
  const variants = schema.anyOf ?? schema.oneOf;
  if (variants) return variants.map(typeOf).join(" | ");
  const types = Array.isArray(schema.type) ? schema.type : schema.type ? [schema.type] : [];
  const names = types.map((type) => {
    if (type === "array") return `${schema.items ? typeOf(schema.items) : "any"}[]`;
    if (type === "string" && schema.format) return `string (${schema.format})`;
    return type;
  });
  return names.join(" | ") || "any";
}

function rules(schema: Schema) {
  const parts: string[] = [];
  const { minLength, maxLength, minimum, maximum } = schema;
  if (minLength !== undefined && maxLength !== undefined) parts.push(`${minLength} a ${maxLength} caracteres`);
  else if (maxLength !== undefined) parts.push(`até ${maxLength} caracteres`);
  else if (minLength !== undefined && minLength > 0) parts.push(`pelo menos ${minLength} caracteres`);
  if (minimum !== undefined && maximum !== undefined) parts.push(`de ${minimum} a ${maximum}`);
  else if (minimum !== undefined) parts.push(`mínimo ${minimum}`);
  else if (maximum !== undefined) parts.push(`máximo ${maximum}`);
  if (schema.maxItems !== undefined) parts.push(`até ${schema.maxItems} itens`);
  if (schema.default !== undefined) parts.push(`padrão \`${JSON.stringify(schema.default)}\``);
  if (!parts.length) return "";
  const sentence = parts.join(", ");
  return `${sentence[0].toUpperCase()}${sentence.slice(1)}.`;
}

function describe(schema: Schema) {
  const text = schema.description?.trim() ?? "";
  return [text && !/[.!?]$/.test(text) ? `${text}.` : text, rules(schema)].filter(Boolean).join(" ");
}

/** Variants of a union that are inline objects, with the literal field that tells them apart. */
function objectVariants(schema: Schema) {
  const variants = (schema.oneOf ?? schema.anyOf ?? []).filter((variant) => !isNull(variant));
  if (!variants.length || !variants.every(isObject)) return null;
  const key = Object.keys(variants[0].properties ?? {}).find((name) => variants.every((v) => v.properties?.[name]?.const !== undefined));
  return key ? { key, variants } : null;
}

function fieldRows(schema: Schema, prefix = "", note = ""): string[] {
  const rows: string[] = [];
  const required = new Set(schema.required ?? []);
  for (const [name, property] of Object.entries(schema.properties ?? {})) {
    const path = prefix ? `${prefix}.${name}` : name;
    const union = objectVariants(property);
    if (union) {
      const values = union.variants.map((variant) => `\`${JSON.stringify(variant.properties![union.key].const)}\``).join(" | ");
      rows.push(`| \`${path}.${union.key}\` | ${cell(values)} | ${required.has(name) ? "sim" : "não"} | ${cell([note, describe(property)].filter(Boolean).join(" "))} |`);
      for (const variant of union.variants) {
        const { [union.key]: tag, ...rest } = variant.properties!;
        const when = `Só com \`${union.key}\` = \`${JSON.stringify(tag.const)}\`.`;
        rows.push(...fieldRows({ ...variant, properties: rest }, path, when));
      }
      continue;
    }
    rows.push(`| \`${path}\` | ${cell(typeOf(property))} | ${required.has(name) ? "sim" : "não"} | ${cell([note, describe(property)].filter(Boolean).join(" "))} |`);
    if (isObject(property)) rows.push(...fieldRows(property, path, note));
    const nested = property.anyOf?.find(isObject) ?? (property.type === "array" && property.items && isObject(property.items) ? property.items : null);
    if (nested) rows.push(...fieldRows(nested, property.type === "array" ? `${path}[]` : path, note));
  }
  return rows;
}

function fieldTable(schema: Schema) {
  return ["| Campo | Tipo | Obrigatório | Descrição |", "| --- | --- | --- | --- |", ...fieldRows(schema)].join("\n");
}

function bodyOf(schema: Schema): string {
  if (schema.$ref || (schema.type === "array" && schema.items?.$ref)) return `JSON: ${typeOf(schema)}`;
  const union = (schema.oneOf ?? schema.anyOf)?.filter((variant) => !isNull(variant));
  if (union?.length && union.every(isObject)) {
    return union
      .map((variant, i) => `Formato ${i + 1}:\n\n${fieldTable(variant)}`)
      .join("\n\n");
  }
  if (isObject(schema)) return fieldTable(schema);
  return `JSON: ${typeOf(schema)}`;
}

function responseCell(code: string, response: { content?: Content }) {
  const schema = response.content?.["application/json"]?.schema;
  if (!schema) return Number(code) >= 400 ? `[Error](#${modelAnchor("Error")})` : "—";
  if (schema.$ref || schema.items?.$ref) return cell(typeOf(schema));
  if (schema.oneOf || schema.anyOf) return "ver abaixo";
  if (isObject(schema)) return "objeto, ver abaixo";
  return cell(typeOf(schema));
}

const authLabel = (operation: Operation) => {
  const note = operation.description?.match(/(Requer sessão[^.]*|Sessão opcional)\.?$/)?.[1];
  return note ?? (operation.security.length ? "Requer sessão" : "Pública");
};

function renderOperation(method: string, path: string, operation: Operation) {
  const out: string[] = [];
  out.push(`<a id="${anchorOf(method, path)}"></a>`, "", `### ${method.toUpperCase()} \`${path}\``, "", `**${operation.summary}** · ${authLabel(operation)}`, "");
  const description = operation.description?.replace(/\n\n(Requer sessão[^.]*|Sessão opcional)\.?$/, "").trim();
  if (description && !/^(Requer sessão|Sessão opcional)/.test(description)) out.push(description, "");

  const params = operation.parameters ?? [];
  if (params.length) {
    out.push("**Parâmetros**", "", "| Nome | Onde | Tipo | Obrigatório | Descrição |", "| --- | --- | --- | --- | --- |");
    for (const param of params) {
      const where = param.in === "path" ? "caminho" : "query";
      const text = [param.description, rules(param.schema)].filter(Boolean).join(" ");
      out.push(`| \`${param.name}\` | ${where} | ${cell(typeOf(param.schema))} | ${param.required ? "sim" : "não"} | ${cell(text)} |`);
    }
    out.push("");
  }

  const content = operation.requestBody?.content;
  if (content?.["application/json"]) out.push("**Corpo (JSON)**", "", bodyOf(content["application/json"].schema), "");
  if (content?.["multipart/form-data"]) {
    out.push("**Corpo (multipart/form-data)**", "", fieldTable(content["multipart/form-data"].schema).replace("string (binary)", "arquivo"), "");
  }

  out.push("**Respostas**", "", "| Código | Quando | Corpo |", "| --- | --- | --- |");
  const extra: string[] = [];
  for (const [code, response] of Object.entries(operation.responses)) {
    if (code === "default") continue;
    out.push(`| ${code} | ${cell(response.description)} | ${responseCell(code, response)} |`);
    const schema = response.content?.["application/json"]?.schema;
    if (schema && !schema.$ref && !schema.items?.$ref && (isObject(schema) || schema.oneOf || schema.anyOf)) {
      extra.push(`Corpo da resposta ${code}:`, "", bodyOf(schema), "");
    }
  }
  out.push(`| 4xx/5xx | Erro | [Error](#${modelAnchor("Error")}) |`, "", ...extra);
  return out.join("\n");
}

function renderModel(name: string, schema: Schema) {
  const out = [`<a id="${modelAnchor(name)}"></a>`, "", `### ${name}`, ""];
  const explained = name === "OrderStatus";
  if (schema.description && !explained) out.push(describe(schema), "");
  if (schema.enum) {
    out.push(explained ? "| Valor | Significado |\n| --- | --- |" : "| Valor |\n| --- |");
    for (const value of schema.enum) out.push(explained ? `| \`${value}\` | ${statusText[String(value)] ?? ""} |` : `| \`${value}\` |`);
  } else if (isObject(schema)) {
    out.push(fieldTable(schema));
  } else {
    out.push(`Tipo: ${typeOf(schema)}`);
  }
  out.push("");
  return out.join("\n");
}

function renderReference() {
  const operations = Object.entries(spec.paths).flatMap(([path, methods]) =>
    Object.entries(methods).map(([method, operation]) => ({ method, path, operation })),
  );
  const out: string[] = [BEGIN, "", "## Referência dos endpoints", ""];
  out.push(`${operations.length} endpoints, gerados de \`server/routes\`. Todos ficam em \`/api\`.`, "");
  for (const tag of spec.tags) {
    const list = operations.filter((entry) => entry.operation.tags[0] === tag.name);
    if (!list.length) continue;
    out.push(`- **${tag.name}**: ${list.map((e) => `[${e.method.toUpperCase()} ${e.path.replace(/^\/api/, "")}](#${anchorOf(e.method, e.path)})`).join(", ")}`);
  }
  out.push("");
  for (const tag of spec.tags) {
    const list = operations.filter((entry) => entry.operation.tags[0] === tag.name);
    if (!list.length) continue;
    out.push(`## ${tag.name}`, "", tag.description, "");
    for (const entry of list) out.push(renderOperation(entry.method, entry.path, entry.operation), "");
  }
  out.push("## Modelos", "", "Formatos dos objetos que a API devolve. Valores em reais são números com até 2 casas; instantes (`createdAt`, `at`) são milissegundos desde 1970.", "");
  for (const [name, schema] of Object.entries(models).sort(([a], [b]) => a.localeCompare(b))) out.push(renderModel(name, schema));
  out.push(END);
  return out.join("\n");
}

const docsDir = resolve(import.meta.dirname, "..", "docs");
mkdirSync(docsDir, { recursive: true });
writeFileSync(join(docsDir, "openapi.json"), `${JSON.stringify(spec, null, 2)}\n`);

const apiPath = join(docsDir, "API.md");
const current = existsSync(apiPath) ? readFileSync(apiPath, "utf8") : `# Obra Ágil API\n\n${BEGIN}\n${END}\n`;
const start = current.indexOf(BEGIN);
const end = current.indexOf(END);
if (start === -1 || end === -1) throw new Error(`docs/API.md precisa dos marcadores ${BEGIN} e ${END}.`);
writeFileSync(apiPath, `${current.slice(0, start)}${renderReference()}${current.slice(end + END.length)}`);

const total = Object.values(spec.paths).reduce((n, methods) => n + Object.keys(methods).length, 0);
console.log(`[docs] ${total} endpoints e ${Object.keys(models).length} modelos -> docs/API.md e docs/openapi.json`);
process.exit(0);
