export class HttpError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const badRequest = (code: string, message: string, details?: unknown) => new HttpError(400, code, message, details);
export const unauthorized = (message = "Entre na sua conta para continuar.") => new HttpError(401, "unauthorized", message);
export const forbidden = (message = "Você não tem acesso a isso.") => new HttpError(403, "forbidden", message);
export const notFound = (message = "Não encontrado.") => new HttpError(404, "not_found", message);
export const conflict = (code: string, message: string) => new HttpError(409, code, message);
export const tooMany = (message = "Muitas tentativas. Espere um pouco e tente de novo.") => new HttpError(429, "rate_limited", message);
export const unavailable = (code: string, message: string) => new HttpError(503, code, message);
