import { config } from "../config.ts";
import { badRequest, unavailable } from "../lib/errors.ts";
import { isValidCpf } from "../lib/text.ts";

/** Receita Federal check digits. Rejects sequences like 00000000000000. */
export function isValidCnpj(value: string) {
  const d = value.replace(/\D/g, "");
  if (d.length !== 14 || /^(\d)\1{13}$/.test(d)) return false;
  const digit = (length: number) => {
    const weights = length === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const sum = weights.reduce((total, weight, index) => total + Number(d[index]) * weight, 0);
    const rest = sum % 11;
    return rest < 2 ? 0 : 11 - rest;
  };
  return digit(12) === Number(d[12]) && digit(13) === Number(d[13]);
}

export type Identity = { kind: "cpf" | "cnpj"; digits: string; legalName: string | null };

type CnpjPayload = { razao_social?: string; descricao_situacao_cadastral?: string };

/** Public Receita Federal company data, via BrasilAPI / Minha Receita. There is no equivalent public API for CPF. */
export async function lookupCnpj(cnpj: string): Promise<{ legalName: string; status: string }> {
  let response: Response;
  try {
    response = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(8_000),
    });
  } catch {
    throw unavailable("cnpj_unavailable", "Não conseguimos consultar o CNPJ na Receita Federal agora. Tente de novo.");
  }
  if (response.status === 404) throw badRequest("cnpj_not_found", "Esse CNPJ não está na base pública da Receita Federal.");
  if (response.status === 400) throw badRequest("invalid_cnpj", "Esse CNPJ não é válido.");
  if (!response.ok) throw unavailable("cnpj_unavailable", "A consulta do CNPJ está indisponível. Tente de novo em instantes.");
  const data = (await response.json()) as CnpjPayload;
  const status = (data.descricao_situacao_cadastral ?? "").trim().toUpperCase();
  if (status !== "ATIVA") throw badRequest("cnpj_inactive", "Esse CNPJ não está ativo na Receita Federal.");
  return { legalName: data.razao_social?.trim() || "Empresa", status };
}

/**
 * Users may use CPF or CNPJ. A rental store must use an active CNPJ.
 * A service provider may use CPF or an active CNPJ.
 * Tests may omit the document. CPF is checked by the official digit algorithm;
 * matching a person's name requires the paid Serpro Consulta CPF contract.
 */
export async function verifyIdentity(input: { offers?: "rental" | "service" | "both"; document: string }): Promise<Identity | null> {
  const digits = input.document.replace(/\D/g, "");
  if (!digits) {
    if (config.env === "test") return null;
    throw badRequest("document_required", input.offers && input.offers !== "service" ? "A loja precisa de um CNPJ." : "Informe um CPF ou um CNPJ.");
  }
  const storeNeedsCnpj = input.offers === "rental" || input.offers === "both";
  if (storeNeedsCnpj) {
    if (!isValidCnpj(digits)) throw badRequest("invalid_cnpj", "A loja precisa de um CNPJ válido.");
    const company = config.env === "test" ? { legalName: null } : await lookupCnpj(digits);
    return { kind: "cnpj", digits, legalName: company.legalName };
  }
  if (digits.length === 11) {
    if (!isValidCpf(digits)) throw badRequest("invalid_cpf", "Esse CPF não é válido. Confira os números.");
    return { kind: "cpf", digits, legalName: null };
  }
  if (!isValidCnpj(digits)) throw badRequest("invalid_document", "Informe um CPF ou um CNPJ válido.");
  const company = config.env === "test" ? { legalName: null } : await lookupCnpj(digits);
  return { kind: "cnpj", digits, legalName: company.legalName };
}
