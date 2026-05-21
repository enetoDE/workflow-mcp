import type { SevdeskConfig } from "./config.js";

type QueryValue = string | number | boolean | undefined;

export class SevdeskApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "SevdeskApiError";
  }
}

export class SevdeskClient {
  constructor(private readonly config: SevdeskConfig) {}

  hasToken(): boolean {
    return Boolean(this.config.apiToken);
  }

  async get<T>(path: string, query: Record<string, QueryValue> = {}): Promise<T> {
    return this.request<T>("GET", path, { query });
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>("POST", path, { body });
  }

  private async request<T>(
    method: "GET" | "POST",
    path: string,
    options: { query?: Record<string, QueryValue>; body?: unknown } = {},
  ): Promise<T> {
    if (!this.config.apiToken) {
      throw new SevdeskApiError("SEVDESK_API_TOKEN is not configured.");
    }

    const url = new URL(`${this.config.baseUrl.replace(/\/$/, "")}/${path.replace(/^\//, "")}`);
    for (const [key, value] of Object.entries(options.query ?? {})) {
      if (value !== undefined) {
        url.searchParams.set(key, String(value));
      }
    }

    let response: Response;
    try {
      response = await fetch(url, {
        method,
        headers: {
          Authorization: this.config.apiToken,
          Accept: "application/json",
          "Content-Type": "application/json",
          "User-Agent": this.config.userAgent,
        },
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
      });
    } catch (error) {
      throw new SevdeskApiError(error instanceof Error ? error.message : "Unknown network error.");
    }

    const text = await response.text();
    const parsed = parseBody(text);

    if (!response.ok) {
      throw new SevdeskApiError(`sevdesk API returned HTTP ${response.status}.`, response.status, parsed ?? text);
    }

    return parsed as T;
  }
}

function parseBody(text: string): unknown {
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
