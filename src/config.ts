import type { PipedriveConfig } from "./integrations/pipedrive/config.js";
import { loadPipedriveConfig } from "./integrations/pipedrive/config.js";
import type { SevdeskConfig } from "./integrations/sevdesk/config.js";
import { loadSevdeskConfig } from "./integrations/sevdesk/config.js";

export type AppConfig = {
  integrations: {
    pipedrive: PipedriveConfig;
    sevdesk: SevdeskConfig;
  };
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  return {
    integrations: {
      pipedrive: loadPipedriveConfig(env),
      sevdesk: loadSevdeskConfig(env),
    },
  };
}
