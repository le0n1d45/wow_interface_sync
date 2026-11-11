import type { AppConfig } from "@shared/config.types";
import type { BackupManifest } from "../main/backup/backup.types";
import type { AddonInstallOutcome, PushSummary, RemoteBackupOutcome } from "@shared/sync.types";

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

export function describeBackup(b: Pick<BackupManifest, "reason" | "summary" | "files">): string {
  if (b.reason === "manual") return `Manual backup: ${b.files.length} file${b.files.length === 1 ? "" : "s"}`;
  if (b.reason === "restore") return "Before a restore";
  return `Before a pull: ${b.summary.changed} changed, ${b.summary.new} new`;
}

/** What to tell the user about the repo copy of a backup. Skips that are not worth mentioning return null. */
export function describeRemoteBackup(o: RemoteBackupOutcome): { kind: "ok" | "warn"; text: string } | null {
  if (o.status === "pushed") return { kind: "ok", text: "A copy of the backup was saved to GitHub." };
  if (o.status === "failed") return { kind: "warn", text: `The backup was kept on this computer, but could not be saved to GitHub: ${o.reason}` };
  return o.reason.startsWith("Nothing changed") ? null : { kind: "warn", text: `The backup was kept on this computer only. ${o.reason}` };
}

export interface Note {
  kind: "ok" | "warn" | "info";
  text: string;
  details?: string[];
}

/** What to tell the user about downloading addons during a pull. Null when they turned it off. */
export function describeAddonInstall(o: AddonInstallOutcome): Note | null {
  if (o.status === "failed") return { kind: "warn", text: `Addons were not downloaded: ${o.reason}` };
  if (o.status === "skipped") return o.reason.includes("turned off") ? null : { kind: "info", text: o.reason };

  const { installed, alreadyPresent, needManual } = o.summary;
  const parts: string[] = [];
  if (installed.length) parts.push(`installed ${installed.length} new addon${installed.length === 1 ? "" : "s"}`);
  if (alreadyPresent) parts.push(`${alreadyPresent} already present`);
  if (needManual.length) parts.push(`${needManual.length} need${needManual.length === 1 ? "s" : ""} installing in WowUp`);
  const text = parts.length ? `Addons: ${parts.join(", ")}.` : "Addons: nothing to install.";
  const details = [...installed.map((n) => `+ ${n}`), ...needManual.map((m) => `! ${m.name}: ${m.reason}`)];
  return { kind: needManual.length ? "warn" : "ok", text: installed.length ? `${text} Rescan in WowUp to see them.` : text, details };
}
