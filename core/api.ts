import { ClashAPIError } from "./types.ts";

// ── ClashAPI ───────────────────────────────────────────────────────────────────

export class ClashAPI {
  private base: string;
  private headers: Record<string, string>;

  constructor(base: string, secret: string) {
    this.base = base.replace(/\/$/, "");
    this.headers = {
      "Authorization": `Bearer ${secret}`,
      "Content-Type": "application/json",
    };
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown
  ): Promise<T> {
    const url = `${this.base}${path}`;
    const res = await fetch(url, {
      method,
      headers: this.headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new ClashAPIError(res.status, `${method} ${path} → ${res.status}: ${text}`);
    }

    // 204 No Content
    if (res.status === 204) return undefined as T;

    const ct = res.headers.get("content-type") ?? "";
    if (ct.includes("application/json")) {
      return res.json() as Promise<T>;
    }
    return res.text() as unknown as T;
  }

  get<T>(path: string): Promise<T> {
    return this.request<T>("GET", path);
  }

  put<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>("PUT", path, body);
  }

  patch<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>("PATCH", path, body);
  }

  delete<T>(path: string): Promise<T> {
    return this.request<T>("DELETE", path);
  }

  post<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>("POST", path, body);
  }
}
