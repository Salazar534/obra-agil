export class ApiError extends Error {
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

let onUnauthorized: (() => void) | null = null;

/** Called when a signed-in request comes back 401, i.e. the session expired or was revoked elsewhere. */
export function handleUnauthorized(callback: () => void) {
  onUnauthorized = callback;
}

async function request<T>(method: string, path: string, body?: unknown, quiet401 = false): Promise<T> {
  const headers: Record<string, string> = { "X-Requested-With": "obra-agil" };
  let payload: BodyInit | undefined;
  if (body instanceof FormData) payload = body;
  else if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    payload = JSON.stringify(body);
  }
  let response: Response;
  try {
    response = await fetch(`/api${path}`, { method, headers, body: payload, credentials: "same-origin" });
  } catch {
    throw new ApiError(0, "offline", "Sem conexão com o servidor. Confira a internet e tente de novo.");
  }
  if (response.status === 204) return undefined as T;
  const text = await response.text();
  let data: { error?: { code: string; message: string; details?: unknown } } | null = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!response.ok) {
    if (response.status === 401 && !quiet401) onUnauthorized?.();
    throw new ApiError(
      response.status,
      data?.error?.code ?? "error",
      data?.error?.message ?? (response.status >= 500 ? "O servidor teve um problema. Tente de novo." : "Algo deu errado. Tente de novo."),
      data?.error?.details,
    );
  }
  return (data ?? undefined) as T;
}

export const api = {
  get: <T>(path: string) => request<T>("GET", path),
  post: <T>(path: string, body?: unknown) => request<T>("POST", path, body ?? {}),
  put: <T>(path: string, body?: unknown) => request<T>("PUT", path, body ?? {}),
  patch: <T>(path: string, body: unknown) => request<T>("PATCH", path, body),
  del: <T>(path: string) => request<T>("DELETE", path),
  /** Auth endpoints answer 401 for bad credentials; that is not an expired session. */
  auth: <T>(method: string, path: string, body?: unknown) => request<T>(method, path, body, true),
  async upload(kind: "avatar" | "logo" | "cover" | "item", file: Blob) {
    const form = new FormData();
    form.append("file", file, "foto.jpg");
    const { url } = await request<{ url: string }>("POST", `/uploads?kind=${kind}`, form);
    return url;
  },
};

export function errorMessage(error: unknown) {
  return error instanceof ApiError ? error.message : "Algo deu errado. Tente de novo.";
}
