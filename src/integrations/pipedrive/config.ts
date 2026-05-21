export type PipedriveConfig = {
  apiToken?: string;
  domain?: string;
  apiV1BaseUrl?: string;
  apiV2BaseUrl?: string;
};

function normalizeDomain(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }

  try {
    const url = trimmed.startsWith("http://") || trimmed.startsWith("https://") ? new URL(trimmed) : new URL(`https://${trimmed}`);
    return url.hostname;
  } catch {
    return trimmed.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  }
}

export function loadPipedriveConfig(env: NodeJS.ProcessEnv = process.env): PipedriveConfig {
  const domain = normalizeDomain(env.PIPEDRIVE_DOMAIN);

  return {
    apiToken: env.PIPEDRIVE_API_TOKEN,
    domain,
    apiV1BaseUrl: domain ? `https://${domain}/api/v1` : undefined,
    apiV2BaseUrl: domain ? `https://${domain}/api/v2` : undefined,
  };
}
