import type { SevdeskConfig } from "./integrations/sevdesk/config.js";
import { loadSevdeskConfig } from "./integrations/sevdesk/config.js";

export type AppConfig = {
  integrations: {
    sevdesk: SevdeskConfig;
  };
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  return {
    integrations: {
      sevdesk: loadSevdeskConfig(env),
    },
  };
}
