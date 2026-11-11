import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { AppConfig, ConfigIssue } from "@shared/config.types";

export const CONFIG_FILE_NAME = "config.json";

export function defaultConfig(): AppConfig {
  return { repoUrl: "", gistId: "", wowRoot: "", accountMap: {}, pushBackups: true, installAddonsOnPull: false };
}

export function configPath(dir: string): string {
  return join(dir, CONFIG_FILE_NAME);
}

export function validateConfig(config: AppConfig): ConfigIssue[] {
  const issues: ConfigIssue[] = [];
  if (!/^https:\/\/github\.com\/[^/\s]+\/[^/\s]+?(\.git)?\/?$/.test(config.repoUrl)) {
    issues.push({ field: "repoUrl", message: "Must be an https://github.com/<owner>/<repo> URL" });
  }
  if (!/^[0-9a-f]{20,40}$/i.test(config.gistId)) {
    issues.push({ field: "gistId", message: "Must be a gist ID (hex string)" });
  }
  if (config.wowRoot.trim() === "") {
    issues.push({ field: "wowRoot", message: "Required" });
  }
  return issues;
}

/** Loads the config, returning defaults for any missing file or field. */
export async function loadConfig(dir: string): Promise<AppConfig> {
  let raw: string;
  try {
    raw = await readFile(configPath(dir), "utf8");
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return defaultConfig();
    throw e;
  }
  const parsed = JSON.parse(raw) as Partial<AppConfig>;
  return { ...defaultConfig(), ...parsed };
}

/** Writes atomically (temp file + rename) so a crash never leaves a half-written config. */
export async function saveConfig(dir: string, config: AppConfig): Promise<void> {
  const target = configPath(dir);
  await mkdir(dirname(target), { recursive: true });
  const tmp = `${target}.tmp`;
  await writeFile(tmp, JSON.stringify(config, null, 2), "utf8");
  await rename(tmp, target);
}
