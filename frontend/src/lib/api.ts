export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public fields?: Record<string, string>,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

interface ApiOptions {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  signal?: AbortSignal;
}

/**
 * Thin fetch wrapper for the backend API (proxied through Next.js rewrites at
 * /api/*). Throws ApiError carrying the backend's error envelope.
 */
export async function api<T = unknown>(path: string, opts: ApiOptions = {}): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method: opts.method ?? "GET",
    headers: opts.body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    signal: opts.signal,
  });

  if (res.status === 204) return undefined as T;

  if (!res.ok) {
    let code = "unknown";
    let message = `request failed (${res.status})`;
    let fields: Record<string, string> | undefined;
    try {
      const data = await res.json();
      if (data?.error) {
        code = data.error.code ?? code;
        message = data.error.message ?? message;
        fields = data.error.fields;
      }
    } catch {
      // non-JSON error body — keep generic
    }
    throw new ApiError(res.status, code, message, fields);
  }

  return res.json() as Promise<T>;
}
