// Thin fetch wrapper: adds the bearer token, normalises errors into friendly
// messages, and signals session expiry so the app can redirect to login.

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

let tokenGetter: () => string | null = () => null;
let onUnauthorized: (code: string, message: string) => void = () => {};

export function configureApi(opts: { getToken: () => string | null; onUnauthorized: (code: string, message: string) => void }) {
  tokenGetter = opts.getToken;
  onUnauthorized = opts.onUnauthorized;
}

export async function api<T>(path: string, init: { method?: string; body?: unknown; signal?: AbortSignal } = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  const token = tokenGetter();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (init.body !== undefined) headers['Content-Type'] = 'application/json';
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method: init.method ?? (init.body !== undefined ? 'POST' : 'GET'),
      headers,
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      signal: init.signal,
    });
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw err;
    throw new ApiError(0, 'NETWORK', 'Cannot reach the exam server. Check your internet connection — we will keep retrying.');
  }
  let data: any = null;
  const text = await res.text();
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }
  if (!res.ok) {
    const code = data?.error?.code ?? (res.status >= 500 ? 'SERVER' : 'HTTP_' + res.status);
    const message =
      data?.error?.message ??
      (res.status === 502 || res.status === 504
        ? 'The exam server is not responding. Make sure the backend is running (npm run dev).'
        : `Request failed (${res.status}).`);
    if (res.status === 401 && token) onUnauthorized(code, message);
    throw new ApiError(res.status, code, message);
  }
  return data as T;
}

export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return 'Something went wrong. Please try again.';
}
