import type { PipedriveConfig } from "./config.js";

type QueryValue = string | number | boolean | undefined;
type PipedriveListResponse = {
  data?: unknown;
  additional_data?: {
    next_cursor?: string | null;
    pagination?: {
      more_items_in_collection?: boolean;
      next_start?: number;
    };
    [key: string]: unknown;
  };
  [key: string]: unknown;
};

export class PipedriveApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "PipedriveApiError";
  }
}

export class PipedriveClient {
  constructor(private readonly config: PipedriveConfig) {}

  isConfigured(): boolean {
    return Boolean(this.config.apiToken && this.config.apiV1BaseUrl && this.config.apiV2BaseUrl);
  }

  async getV1<T>(path: string, query: Record<string, QueryValue> = {}): Promise<T> {
    return this.request<T>("GET", "v1", path, { query });
  }

  async getV2<T>(path: string, query: Record<string, QueryValue> = {}): Promise<T> {
    return this.request<T>("GET", "v2", path, { query });
  }

  async getAllV1Offset<T extends PipedriveListResponse>(path: string, query: Record<string, QueryValue> = {}): Promise<T> {
    const limit = query.limit ?? 500;
    let start = typeof query.start === "number" ? query.start : 0;
    const data: unknown[] = [];
    const seenStarts = new Set<number>();
    let pages = 0;
    let lastPage: PipedriveListResponse | undefined;

    while (!seenStarts.has(start)) {
      seenStarts.add(start);
      const page = await this.getV1<PipedriveListResponse>(path, { ...query, limit, start });
      pages += 1;
      lastPage = page;

      if (Array.isArray(page.data)) {
        data.push(...page.data);
      } else {
        return page as T;
      }

      const pagination = page.additional_data?.pagination;
      if (!pagination?.more_items_in_collection || pagination.next_start === undefined) {
        break;
      }

      start = pagination.next_start;
    }

    return withAggregatedData(lastPage, data, pages) as T;
  }

  async getAllV2<T extends PipedriveListResponse>(path: string, query: Record<string, QueryValue> = {}): Promise<T> {
    const limit = query.limit ?? 500;
    let cursor = query.cursor;
    const data: unknown[] = [];
    const seenCursors = new Set<string>();
    let pages = 0;
    let lastPage: PipedriveListResponse | undefined;

    while (true) {
      const cursorKey = cursor === undefined ? "__initial__" : String(cursor);
      if (seenCursors.has(cursorKey)) {
        break;
      }
      seenCursors.add(cursorKey);

      const page = await this.getV2<PipedriveListResponse>(path, { ...query, limit, cursor });
      pages += 1;
      lastPage = page;

      if (Array.isArray(page.data)) {
        data.push(...page.data);
      } else {
        return page as T;
      }

      const nextCursor = page.additional_data?.next_cursor;
      if (!nextCursor) {
        break;
      }

      cursor = nextCursor;
    }

    return withAggregatedData(lastPage, data, pages) as T;
  }

  async postV1<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>("POST", "v1", path, { body });
  }

  async postV2<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>("POST", "v2", path, { body });
  }

  async patchV2<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>("PATCH", "v2", path, { body });
  }

  async putV1<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>("PUT", "v1", path, { body });
  }

  private async request<T>(
    method: "GET" | "POST" | "PATCH" | "PUT",
    version: "v1" | "v2",
    path: string,
    options: { query?: Record<string, QueryValue>; body?: unknown } = {},
  ): Promise<T> {
    if (!this.config.apiToken) {
      throw new PipedriveApiError("PIPEDRIVE_API_TOKEN is not configured.");
    }

    const baseUrl = version === "v1" ? this.config.apiV1BaseUrl : this.config.apiV2BaseUrl;
    if (!baseUrl) {
      throw new PipedriveApiError("PIPEDRIVE_DOMAIN is not configured.");
    }

    const url = new URL(`${baseUrl.replace(/\/$/, "")}/${path.replace(/^\//, "")}`);
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
          Accept: "application/json",
          "Content-Type": "application/json",
          "x-api-token": this.config.apiToken,
        },
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
      });
    } catch (error) {
      throw new PipedriveApiError(error instanceof Error ? error.message : "Unknown network error.");
    }

    const text = await response.text();
    const parsed = parseResponseBody(text);

    if (!response.ok) {
      throw new PipedriveApiError(`Pipedrive API returned HTTP ${response.status}.`, response.status, parsed ?? text);
    }

    if (isPipedriveFailure(parsed)) {
      throw new PipedriveApiError(parsed.error ?? "Pipedrive API returned success=false.", response.status, parsed);
    }

    return parsed as T;
  }
}

function parseResponseBody(text: string): unknown {
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function isPipedriveFailure(value: unknown): value is { success: false; error?: string } {
  return Boolean(value && typeof value === "object" && (value as { success?: unknown }).success === false);
}

function withAggregatedData(page: PipedriveListResponse | undefined, data: unknown[], pages: number): PipedriveListResponse {
  return {
    ...(page ?? {}),
    data,
    additional_data: {
      ...(page?.additional_data ?? {}),
      fetched_pages: pages,
      fetched_count: data.length,
    },
  };
}
