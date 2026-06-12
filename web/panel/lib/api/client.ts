import type { ApiError } from "@/lib/types";

export class ApiRequestError extends Error {
  status: number;
  body: ApiError | null;

  constructor(message: string, status: number, body: ApiError | null = null) {
    super(message);
    this.name = "ApiRequestError";
    this.status = status;
    this.body = body;
  }
}

type RequestOptions = Omit<RequestInit, "body"> & {
  body?: unknown;
  json?: boolean;
};

export async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { body, json = true, headers, ...rest } = options;

  const init: RequestInit = {
    credentials: "same-origin",
    ...rest,
    headers: {
      Accept: "application/json",
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  };

  const response = await fetch(path, init);
  const contentType = response.headers.get("content-type") || "";
  const isJson = contentType.includes("application/json");
  const payload = isJson ? await response.json().catch(() => null) : null;

  if (!response.ok) {
    const message =
      (payload as ApiError | null)?.error ||
      `Error ${response.status} en ${path}`;
    throw new ApiRequestError(message, response.status, payload as ApiError | null);
  }

  if (!json) return undefined as T;
  return payload as T;
}

export async function apiForm<T>(path: string, form: FormData, init: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    method: "POST",
    credentials: "same-origin",
    body: form,
    ...init,
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new ApiRequestError(
      (payload as ApiError | null)?.error || `Error ${response.status}`,
      response.status,
      payload as ApiError | null
    );
  }
  return payload as T;
}
