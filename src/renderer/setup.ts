import type { AppConfig } from "@shared/config.types";
import type { TokenStatus } from "@shared/token.types";

/** Settings are complete when the repo, gist and WoW folder are filled in and a token is stored. */
export function isSetUp(config: AppConfig, token: TokenStatus): boolean {
  return Boolean(config.repoUrl && config.gistId && config.wowRoot && token.stored);
}

/** "https://github.com/me/wow-settings.git" -> "me/wow-settings" */
export function repoLabel(repoUrl: string): string {
  const m = /github\.com\/([^/\s]+\/[^/\s]+?)(?:\.git)?\/?$/.exec(repoUrl);
  return m ? m[1] : repoUrl || "Not set";
}

/** Last path segment, for showing a long WoW install path compactly. */
export function shortPath(path: string): string {
  const parts = path.split(/[\\/]+/).filter(Boolean);
  return parts.slice(-2).join("/") || "Not set";
}
