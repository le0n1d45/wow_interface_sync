export type ChangeStatus = "new" | "changed" | "identical";

/** One synced file compared between the repo clone and the local install. */
export interface FileChange {
  /** POSIX path relative to the `_forever_` folder, e.g. `WTF/Account/ACCT1/SavedVariables/X.lua`. */
  localPath: string;
  /** Absolute path of the incoming file inside the repo clone. */
  sourcePath: string;
  status: ChangeStatus;
}

export type BackupReason = "pull" | "restore" | "manual";

export interface BackupFileEntry {
  /** POSIX path relative to the `_forever_` folder. */
  path: string;
  /** False when the file did not exist locally, so restoring means deleting it. */
  existedBefore: boolean;
  sha256?: string;
}

export interface BackupManifest {
  id: string;
  createdAt: string;
  reason: BackupReason;
  summary: { changed: number; new: number };
  files: BackupFileEntry[];
}

export interface PullResult {
  /** Null when nothing differed, so no backup was needed. */
  backupId: string | null;
  changed: number;
  created: number;
  identical: number;
}
