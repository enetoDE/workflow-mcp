import type { SevdeskConfig } from "./config.js";

type QueryValue = string | number | boolean | undefined;

export class SevdeskApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly sevdeskMessage?: string,
  ) {
    super(message);
    this.name = "SevdeskApiError";
  }
}

export class SevdeskClient {
  constructor(private readonly config: SevdeskConfig) {}

  hasToken(): boolean {
    return Boolean(this.config.apiToken.trim());
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
      throw new SevdeskApiError("Missing required environment variable: SEVDESK_API_TOKEN");
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
      throw new SevdeskApiError("sevDesk API request failed.", response.status, extractSevdeskMessage(parsed));
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

function extractSevdeskMessage(value: unknown): string | undefined {
  if (!value || typeof value !== "object") {
    return typeof value === "string" ? value.slice(0, 500) : undefined;
  }

  const data = value as Record<string, unknown>;
  const candidates = [data.message, data.error, data.errorMessage, data.detail, data.details];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim().slice(0, 500);
    }
  }

  if (Array.isArray(data.errors) && data.errors.length > 0) {
    const first = data.errors[0];
    if (typeof first === "string") {
      return first.slice(0, 500);
    }
    if (first && typeof first === "object") {
      const message = (first as Record<string, unknown>).message;
      if (typeof message === "string" && message.trim()) {
        return message.trim().slice(0, 500);
      }
    }
  }

  return undefined;
}
