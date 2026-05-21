export type SevdeskConfig = {
  apiToken?: string;
  baseUrl: string;
  userAgent: string;
  defaultContactCategoryId: number;
  defaultCountryId: number;
  defaultUnityId: number;
  defaultContactPersonId?: number;
};

function optionalPositiveInteger(value: string | undefined, name: string): number | undefined {
  if (!value) {
    return undefined;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }

  return parsed;
}

function positiveInteger(value: string | undefined, name: string, fallback: number): number {
  return optionalPositiveInteger(value, name) ?? fallback;
}

export function loadSevdeskConfig(env: NodeJS.ProcessEnv = process.env): SevdeskConfig {
  return {
    apiToken: env.SEVDESK_API_TOKEN,
    baseUrl: env.SEVDESK_API_BASE_URL ?? "https://my.sevdesk.de/api/v1",
    userAgent: env.SEVDESK_USER_AGENT ?? "workflow-mcp local Claude Desktop integration",
    defaultContactCategoryId: positiveInteger(env.SEVDESK_DEFAULT_CONTACT_CATEGORY_ID, "SEVDESK_DEFAULT_CONTACT_CATEGORY_ID", 3),
    defaultCountryId: positiveInteger(env.SEVDESK_DEFAULT_COUNTRY_ID, "SEVDESK_DEFAULT_COUNTRY_ID", 1),
    defaultUnityId: positiveInteger(env.SEVDESK_DEFAULT_UNITY_ID, "SEVDESK_DEFAULT_UNITY_ID", 1),
    defaultContactPersonId: optionalPositiveInteger(env.SEVDESK_CONTACT_PERSON_ID, "SEVDESK_CONTACT_PERSON_ID"),
  };
}
