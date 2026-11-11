import type { AppConfig } from "@shared/config.types";
import type { PushSummary } from "@shared/sync.types";

export function parseAccountMap(text: string): Record<string, string> {
  const map: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) {
    const [local, shared] = line.split("=").map((s) => s.trim());
    if (local && shared) map[local] = shared;
  }
  return map;
}

export function formatAccountMap(map: AppConfig["accountMap"]): string {
  return Object.entries(map).map(([l, s]) => `${l}=${s}`).join("\n");
}

export function describePush(r: PushSummary): string {
  const files = r.committed
    ? `Pushed ${r.changedFiles} changed file${r.changedFiles === 1 ? "" : "s"}.`
    : `Nothing to push (${r.filesSelected} files already up to date).`;
  const gist = {
    updated: "WowUp export string updated.",
    unchanged: "WowUp export string already current.",
    skipped: `WowUp export skipped: ${r.gist.status === "skipped" ? r.gist.reason : ""}`,
    failed: `WowUp export failed: ${r.gist.status === "failed" ? r.gist.reason : ""}`,
  }[r.gist.status];
  return `${files} ${gist}`;
}

export function describePull(changed: number, created: number, identical: number): string {
  if (changed + created === 0) return `Already up to date (${identical} files match).`;
  return `Pulled: ${changed} changed, ${created} new.`;
}
