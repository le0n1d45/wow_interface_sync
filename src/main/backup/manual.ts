import { selectSyncFiles } from "../wow/sync-files";
import { createBackup } from "./backup";
import type { BackupManifest } from "./backup.types";

/**
 * Snapshots every synced file as it is right now, without pulling or applying anything.
 * Read-only for the game files, so it is safe to run while WoW is open.
 */
export async function createManualBackup(backupsDir: string, foreverDir: string): Promise<BackupManifest> {
  // No account mapping: backups are keyed by local paths so they restore straight back.
  const files = await selectSyncFiles(foreverDir, {});
  if (files.length === 0) throw new Error("No settings files were found to back up. Check the WoW folder in Settings.");
  const paths = files.map((f) => f.repoPath);
  return createBackup(backupsDir, foreverDir, paths, "manual", { changed: paths.length, new: 0 });
}
