import { join } from "node:path";
import { readGistFile, updateGist } from "../gist/gist";
import { deleteAllFiles, pushFiles, syncClone } from "../git/repo";
import type { AddonInstallOutcome, ImportString } from "@shared/sync.types";
import { CurseForgeClient } from "../addons/curseforge";
import { installMissingAddons } from "../addons/install";
import { readManifest } from "../backup/backup";
import { createManualBackup } from "../backup/manual";
import { pullIntoInstall } from "../backup/pull";
import { pushBackup } from "../backup/remote";
import { resolveForeverDir } from "../wow/install";
import { selectSyncFiles } from "../wow/sync-files";
import { decodeExportString, encodeExportString, readForeverExport } from "../wowup/export-string";
import { locateWowUpData } from "../wowup/locate";
import type { GistOutcome, ManualBackupSummary, PullSummary, PushSummary, RemoteBackupOutcome, SyncDeps } from "./sync.types";

const repoOptions = (d: SyncDeps) => ({
  cloneDir: join(d.dataDir, "repo"),
  repoUrl: d.config.repoUrl,
  token: d.token,
});

const backupsDir = (d: SyncDeps) => join(d.dataDir, "backups");

/** Best effort: a failed upload never fails the local backup that already succeeded. */
export async function uploadBackup(d: SyncDeps, id: string): Promise<RemoteBackupOutcome> {
  if (!d.config.pushBackups) return { status: "skipped", reason: "Uploading backups is turned off in Settings." };
  try {
    await readManifest(backupsDir(d), id);
    await pushBackup(repoOptions(d), backupsDir(d), id, d.hostname);
    return { status: "pushed" };
  } catch (e) {
    return { status: "failed", reason: (e as Error).message };
  }
}

async function requireForeverDir(d: SyncDeps): Promise<string> {
  const dir = await resolveForeverDir(d.config.wowRoot);
  if (!dir) throw new Error(`No "_forever_" folder found in ${d.config.wowRoot}. Check the WoW folder in settings.`);
  return dir;
}

async function publishExportString(d: SyncDeps, foreverDir: string): Promise<GistOutcome> {
  try {
    const dataDir = await locateWowUpData(d.installEnv, d.wowupDataDir);
    if (!dataDir) return { status: "skipped", reason: "WowUp's data folder was not found." };
    const payload = await readForeverExport(dataDir, foreverDir);
    const result = await updateGist(d.token, d.config.gistId, encodeExportString(payload), d.fetchFn);
    return { status: result.updated ? "updated" : "unchanged" };
  } catch (e) {
    return { status: "failed", reason: (e as Error).message };
  }
}

/** Local -> repo (+ gist). Safe to repeat; commits only what changed. */
export async function pushAll(d: SyncDeps): Promise<PushSummary> {
  await d.assertWowClosed();
  const foreverDir = await requireForeverDir(d);
  const files = await selectSyncFiles(foreverDir, d.config.accountMap);
  const pushed = await pushFiles(repoOptions(d), files, `Sync from ${d.hostname} at ${new Date().toISOString()}`);
  const gist = await publishExportString(d, foreverDir);
  return { filesSelected: files.length, committed: pushed.committed, changedFiles: pushed.changedFiles, gist };
}

/** Repo -> local, after backing up whatever would change. */
export async function pullAll(d: SyncDeps): Promise<PullSummary> {
  await d.assertWowClosed();
  const foreverDir = await requireForeverDir(d);
  const opts = repoOptions(d);
  d.onProgress?.({ stage: "settings" });
  await syncClone(opts);
  const result = await pullIntoInstall({
    cloneDir: opts.cloneDir,
    foreverDir,
    backupsDir: backupsDir(d),
    accountMap: d.config.accountMap,
    assertWowClosed: d.assertWowClosed,
  });
  const remoteBackup: RemoteBackupOutcome = result.backupId
    ? await uploadBackup(d, result.backupId)
    : { status: "skipped", reason: "Nothing changed, so nothing was backed up." };
  const addons = await installAddonsFromGist(d, foreverDir);
  return { ...result, remoteBackup, addons };
}

/** Downloads the gist list's addons that are not installed yet. Never fails the pull that already succeeded. */
export async function installAddonsFromGist(d: SyncDeps, foreverDir: string): Promise<AddonInstallOutcome> {
  if (!d.config.installAddonsOnPull) return { status: "skipped", reason: "Addon downloads are turned off in Settings." };
  if (!d.curseKey) return { status: "skipped", reason: "Add a CurseForge API key in Settings to download addons automatically." };
  try {
    const raw = await readGistFile(d.token, d.config.gistId, d.fetchFn);
    if (!raw?.trim()) return { status: "skipped", reason: "The gist has no addon list yet. Push from a computer that has WowUp first." };
    const summary = await installMissingAddons(decodeExportString(raw.trim()), {
      api: new CurseForgeClient(d.curseKey, d.fetchFn, d.download),
      addonsDir: join(foreverDir, "Interface", "AddOns"),
      stagingDir: join(d.dataDir, "staging"),
      onProgress: d.onProgress,
    });
    return { status: "done", summary };
  } catch (e) {
    return { status: "failed", reason: (e as Error).message };
  }
}

/** Snapshots the current synced files on demand and uploads the snapshot. Safe while WoW is open: nothing is written to the game. */
export async function manualBackup(d: SyncDeps): Promise<ManualBackupSummary> {
  const foreverDir = await requireForeverDir(d);
  const backup = await createManualBackup(backupsDir(d), foreverDir);
  return { backup, remote: await uploadBackup(d, backup.id) };
}

/** Deletes every file in the sync repo (settings and uploaded backups) in one commit. Local files are not touched. */
export async function wipeRepo(d: SyncDeps): Promise<{ removedFiles: number }> {
  return deleteAllFiles(repoOptions(d), `Delete all data (requested from ${d.hostname} at ${new Date().toISOString()})`);
}

/**
 * The WowUp import string to paste into WowUp's Import dialog. Prefers the gist, which holds the list your
 * other computers pushed (what a new computer needs); falls back to this computer's own WowUp data.
 */
export async function getImportString(d: SyncDeps): Promise<ImportString> {
  const fromGist = await readGistFile(d.token, d.config.gistId, d.fetchFn);
  if (fromGist?.trim()) {
    const text = fromGist.trim();
    return { text, addonCount: decodeExportString(text).addons.length, source: "gist" };
  }
  const dataDir = await locateWowUpData(d.installEnv, d.wowupDataDir);
  if (!dataDir) {
    throw new Error("The gist has no addon list yet. Push from a computer that has WowUp first, then try again.");
  }
  const foreverDir = await requireForeverDir(d);
  const payload = await readForeverExport(dataDir, foreverDir);
  return { text: encodeExportString(payload), addonCount: payload.addons.length, source: "local" };
}
