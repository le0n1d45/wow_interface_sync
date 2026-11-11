import { createBackup, backupFilePath, readManifest } from "./backup";
import type { BackupManifest } from "./backup.types";
import { copyFileAtomic, removeIfExists, resolveLocal } from "./fs-utils";

/** Puts the files of backup `id` back. Files that did not exist then are deleted. Does not snapshot first. */
export async function applyBackup(backupsDir: string, foreverDir: string, manifest: BackupManifest): Promise<void> {
  for (const file of manifest.files) {
    const target = resolveLocal(foreverDir, file.path);
    if (file.existedBefore) await copyFileAtomic(backupFilePath(backupsDir, manifest.id, file.path), target);
    else await removeIfExists(target);
  }
}

/**
 * Restores a backup. The current state of the affected files is snapshotted first, so the
 * restore can itself be undone. Returns the id of that safety backup.
 */
export async function restoreBackup(backupsDir: string, foreverDir: string, id: string): Promise<string> {
  const manifest = await readManifest(backupsDir, id);
  const safety = await createBackup(
    backupsDir,
    foreverDir,
    manifest.files.map((f) => f.path),
    "restore",
    { changed: manifest.files.length, new: 0 },
  );
  await applyBackup(backupsDir, foreverDir, manifest);
  return safety.id;
}
