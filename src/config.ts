import type { SevdeskConfig } from "./integrations/sevdesk/config.js";
import { loadSevdeskConfig, type SevdeskConfigEnv } from "./integrations/sevdesk/config.js";

export type AppConfig = {
  integrations: {
    sevdesk: SevdeskConfig;
  };
};

export function loadConfig(env: SevdeskConfigEnv = process.env): AppConfig {
  return {
    integrations: {
      sevdesk: loadSevdeskConfig(env),
    },
  };
}
