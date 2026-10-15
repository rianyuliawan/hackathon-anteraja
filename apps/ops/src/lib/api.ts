const origin = (import.meta.env.VITE_API_ORIGIN || '').replace(/\/$/, '');

export function apiUrl(path: string) {
  return `${origin}${path}`;
}

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public errors: Record<string, string[]> = {},
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

import { createWorkspaceSession } from './workspaceSession';

const sessionScope = createWorkspaceSession('anteraja_workspace_session');

export async function csrf(): Promise<string> {
  const response = await fetch(apiUrl('/sanctum/csrf-cookie'), {
    credentials: 'include',
    headers: { Accept: 'application/json', 'X-Workspace-Session': await sessionScope },
  });
  if (!response.ok) throw new ApiError('Tidak dapat memulai sesi. Periksa koneksi lalu coba lagi.', response.status);
  const payload = await response.json() as { csrf_token?: string };
  if (!payload.csrf_token) throw new ApiError('Sesi tidak tersedia. Muat ulang halaman lalu coba lagi.', 0);
  return payload.csrf_token;
}

export async function request<T>(
  path: string,
  options: RequestInit & { idempotencyKey?: string } = {},
): Promise<T> {
  const { idempotencyKey, ...init } = options;
  const headers = new Headers(init.headers);
  headers.set('Accept', 'application/json');
  headers.set('X-Workspace-Session', await sessionScope);
  if (init.body && !(init.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  if (init.method && !['GET', 'HEAD'].includes(init.method.toUpperCase())) {
    headers.set('X-CSRF-TOKEN', await csrf());
  }
  if (idempotencyKey) headers.set('Idempotency-Key', idempotencyKey);

  let response: Response;
  try {
    response = await fetch(apiUrl(path), {
      ...init,
      headers,
      credentials: 'include',
    });
  } catch {
    throw new ApiError('Tidak bisa terhubung ke server. Periksa koneksi lalu coba lagi.', 0);
  }

  const contentType = response.headers.get('content-type') || '';
  const body = contentType.includes('application/json')
    ? await response.json().catch(() => null)
    : await response.text().catch(() => '');
  if (!response.ok) {
    const payload = body && typeof body === 'object' ? body as Record<string, unknown> : {};
    const message = response.status >= 500
      ? 'Server sedang bermasalah. Coba lagi beberapa saat.'
      : String(payload.message || payload.error || (typeof body === 'string' && !body.startsWith('<') ? body : '') || `Permintaan gagal (${response.status}).`);
    throw new ApiError(message, response.status, (payload.errors || {}) as Record<string, string[]>);
  }
  return body as T;
}

export async function getPrivateImage(path: string, signal?: AbortSignal): Promise<Blob> {
  let response: Response;
  try {
    response = await fetch(apiUrl(path), {
      credentials: 'include',
      headers: { Accept: 'application/json, image/*', 'X-Workspace-Session': await sessionScope },
      signal,
    });
  } catch (cause) {
    if (signal?.aborted) throw cause;
    throw new ApiError('Foto tidak dapat dimuat. Periksa koneksi lalu coba lagi.', 0);
  }
  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { message?: string } | null;
    throw new ApiError(payload?.message || 'Foto tidak dapat dibuka dengan akun ini.', response.status);
  }
  if (!(response.headers.get('content-type') || '').startsWith('image/')) {
    throw new ApiError('Respons foto tidak valid. Masuk kembali lalu coba lagi.', response.status);
  }
  return response.blob();
}

export async function downloadFile(path: string, filename: string) {
  let response: Response;
  try {
    response = await fetch(apiUrl(path), { credentials: 'include', headers: { Accept: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'X-Workspace-Session': await sessionScope } });
  } catch {
    throw new ApiError('Tidak bisa mengunduh laporan. Periksa koneksi lalu coba lagi.', 0);
  }
  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { message?: string } | null;
    throw new ApiError(payload?.message || `Unduhan gagal (${response.status}).`, response.status);
  }
  if (!(response.headers.get('content-type') || '').includes('spreadsheetml.sheet')) {
    throw new ApiError('Sesi unduhan tidak valid. Masuk kembali lalu coba lagi.', response.status);
  }
  const objectUrl = URL.createObjectURL(await response.blob());
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
}

export function get<T>(path: string) {
  return request<T>(path);
}

export function post<T>(path: string, data?: unknown, idempotencyKey?: string) {
  return request<T>(path, {
    method: 'POST',
    body: data === undefined ? undefined : JSON.stringify(data),
    idempotencyKey,
  });
}

export function patch<T>(path: string, data: unknown) {
  return request<T>(path, { method: 'PATCH', body: JSON.stringify(data) });
}

export function del<T>(path: string) {
  return request<T>(path, { method: 'DELETE' });
}

export function upload<T>(path: string, data: FormData, idempotencyKey?: string) {
  return request<T>(path, { method: 'POST', body: data, idempotencyKey });
}

export function unwrap<T>(value: unknown, key?: string): T {
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    if (key && record[key] !== undefined) return record[key] as T;
    if (record.data !== undefined) return record.data as T;
  }
  return value as T;
}

export function list<T>(value: unknown, key?: string): T[] {
  const unwrapped = unwrap<unknown>(value, key);
  return Array.isArray(unwrapped) ? unwrapped as T[] : [];
}

export function newActionKey() {
  return crypto.randomUUID();
}

export function query(params: Record<string, string | number | undefined | null>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') search.set(key, String(value));
  }
  return search.toString() ? `?${search}` : '';
}
