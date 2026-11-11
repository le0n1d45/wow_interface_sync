import { createBackup, DEFAULT_BACKUP_RETENTION, pruneBackups } from "./backup";
import type { PullResult } from "./backup.types";
import { diffCloneAgainstLocal } from "./diff";
import { copyFileAtomic, resolveLocal } from "./fs-utils";
import { applyBackup } from "./restore";
import type { AccountMap } from "../wow/wow.types";

export interface PullOptions {
  cloneDir: string;
  foreverDir: string;
  backupsDir: string;
  accountMap?: AccountMap;
  retention?: number;
  /** Throws if the game is running. Injected so it can be tested without a process list. */
  assertWowClosed: () => Promise<void>;
  /** Writes one incoming file. Injectable so failures can be simulated in tests. */
  applyFile?: (from: string, to: string) => Promise<void>;
}

/**
 * Applies the repo clone to the local install without losing anything:
 * diff, back up exactly the files that will change, verify the backup, then write.
 * If a write fails midway, the backup is applied again so the install is left as it was.
 */
export async function pullIntoInstall(opts: PullOptions): Promise<PullResult> {
  await opts.assertWowClosed();
  const changes = await diffCloneAgainstLocal(opts.cloneDir, opts.foreverDir, opts.accountMap);
  const todo = changes.filter((c) => c.status !== "identical");
  const identical = changes.length - todo.length;
  if (todo.length === 0) return { backupId: null, changed: 0, created: 0, identical };

  const changed = todo.filter((c) => c.status === "changed").length;
  const created = todo.length - changed;
  const manifest = await createBackup(
    opts.backupsDir,
    opts.foreverDir,
    todo.map((c) => c.localPath),
    "pull",
    { changed, new: created },
  );

  const applyFile = opts.applyFile ?? copyFileAtomic;
  try {
    for (const c of todo) await applyFile(c.sourcePath, resolveLocal(opts.foreverDir, c.localPath));
  } catch (e) {
    try {
      await applyBackup(opts.backupsDir, opts.foreverDir, manifest);
    } catch (rollbackError) {
      throw new Error(
        `Pull failed (${(e as Error).message}) and the automatic rollback also failed (${(rollbackError as Error).message}). ` +
          `Restore backup ${manifest.id} manually.`,
      );
    }
    throw new Error(`Pull failed and was rolled back (backup ${manifest.id}): ${(e as Error).message}`);
  }

  await pruneBackups(opts.backupsDir, opts.retention ?? DEFAULT_BACKUP_RETENTION);
  return { backupId: manifest.id, changed, created, identical };
}
