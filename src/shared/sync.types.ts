import type { BackupManifest, PullResult } from "../main/backup/backup.types";

/** Outcome of publishing the WowUp export string, kept separate so it never fails the file sync. */
export type GistOutcome =
  | { status: "updated" }
  | { status: "unchanged" }
  | { status: "skipped"; reason: string }
  | { status: "failed"; reason: string };

export interface PushSummary {
  filesSelected: number;
  committed: boolean;
  changedFiles: number;
  gist: GistOutcome;
}

/** Every IPC action returns this instead of throwing, so the UI can show the message. */
export type Result<T> = { ok: true; value: T } | { ok: false; error: string };

/** Whether a backup also reached the repo. Never fails the local backup or pull. */
export type RemoteBackupOutcome =
  | { status: "pushed" }
  | { status: "skipped"; reason: string }
  | { status: "failed"; reason: string };

export interface PullSummary extends PullResult {
  remoteBackup: RemoteBackupOutcome;
}

export interface ManualBackupSummary {
  backup: BackupManifest;
  remote: RemoteBackupOutcome;
}
