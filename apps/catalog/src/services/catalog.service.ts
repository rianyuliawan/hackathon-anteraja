import type { Buyer, Order, Product } from "../types/catalog";

const API_BASE = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/$/, "");

import { createWorkspaceSession } from './workspaceSession';

const sessionScope = createWorkspaceSession('fashionaja_workspace_session');

export class ApiError extends Error {
  status: number;
  fields?: Record<string, string[]>;

  constructor(
    message: string,
    status: number,
    fields?: Record<string, string[]>,
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.fields = fields;
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set("Accept", "application/json");
  headers.set("X-Workspace-Session", await sessionScope);
  if (options.method && !["GET", "HEAD"].includes(options.method.toUpperCase()))
    headers.set("X-XSRF-TOKEN", await csrf());
  if (options.body && !(options.body instanceof FormData))
    headers.set("Content-Type", "application/json");
  const response = await fetch(`${API_BASE}${path}`, {
    credentials: "include",
    ...options,
    headers,
  });
  const raw = await response.text();
  let body: unknown = null;
  if (raw) {
    try {
      body = JSON.parse(raw);
    } catch {
      body = raw;
    }
  }
  if (!response.ok) {
    const problem = body as {
      message?: string;
      errors?: Record<string, string[]>;
    } | null;
    const firstFieldError =
      problem?.errors && Object.values(problem.errors).flat()[0];
    throw new ApiError(
      firstFieldError ||
        problem?.message ||
        `Permintaan gagal (${response.status})`,
      response.status,
      problem?.errors,
    );
  }
  return body as T;
}

function unwrap<T>(value: unknown): T {
  if (value && typeof value === "object" && "data" in value)
    return (value as { data: T }).data;
  return value as T;
}

function collection<T>(value: unknown, key?: string): T[] {
  const body = unwrap<unknown>(value);
  if (Array.isArray(body)) return body as T[];
  if (body && typeof body === "object") {
    const obj = body as Record<string, unknown>;
    if (key && Array.isArray(obj[key])) return obj[key] as T[];
    if (Array.isArray(obj.data)) return obj.data as T[];
  }
  return [];
}

function xsrfToken(): string {
  const match = document.cookie.match(/(?:^|;\s*)XSRF-TOKEN=([^;]*)/);
  return match ? decodeURIComponent(match[1]) : "";
}

async function csrf(): Promise<string> {
  const res = await fetch(`${API_BASE}/sanctum/csrf-cookie`, {
    credentials: "include",
    headers: { Accept: "application/json", "X-Workspace-Session": await sessionScope },
  });
  if (!res.ok) throw new ApiError("Tidak dapat memulai sesi. Periksa koneksi lalu coba lagi.", res.status);
  const token = xsrfToken();
  if (!token) throw new ApiError("Sesi tidak tersedia. Muat ulang halaman lalu coba lagi.", 0);
  return token;
}

export const api = {
  async me(): Promise<Buyer> {
    const result = await request<unknown>("/api/v1/me");
    const payload = unwrap<
      | Buyer
      | {
          user: Buyer;
          roles?: Buyer["roles"];
          primary_role?: string;
        }
    >(result);
    if ("user" in payload)
      return {
        ...payload.user,
        roles: payload.roles,
      };
    return payload;
  },
  async login(email: string, password: string): Promise<Buyer> {
    await request("/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    return api.me();
  },
  async register(input: {
    name: string;
    email: string;
    phone: string;
    default_address: string;
    default_postcode: string;
    password: string;
    password_confirmation: string;
  }): Promise<Buyer> {
    await request("/register", {
      method: "POST",
      body: JSON.stringify(input),
    });
    return api.me();
  },
  async logout(): Promise<void> {
    await request("/logout", { method: "POST" });
  },
  async products(): Promise<Product[]> {
    return collection<Product>(await request("/api/v1/products"), "products");
  },
  async orders(): Promise<Order[]> {
    return collection<Order>(await request("/api/v1/me/orders"), "orders");
  },
  async order(id: number): Promise<Order> {
    return unwrap<Order>(await request(`/api/v1/me/orders/${id}`));
  },
  async checkout(input: {
    checkout_key: string;
    items: Array<{ product_id: number; quantity: number }>;
    recipient: {
      name: string;
      phone: string;
      address: string;
      postcode: string;
    };
  }): Promise<Order> {
    return unwrap<Order>(
      await request("/api/v1/orders", {
        method: "POST",
        
        body: JSON.stringify(input),
      }),
    );
  },
  async updateProfile(input: Partial<Buyer>): Promise<Buyer> {
    await request("/api/v1/me", {
      method: "PATCH",
      
      body: JSON.stringify(input),
    });
    return api.me();
  },
};
