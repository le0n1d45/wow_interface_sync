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
  addons: AddonInstallOutcome;
}

export interface ManualBackupSummary {
  backup: BackupManifest;
  remote: RemoteBackupOutcome;
}

export interface ImportString {
  text: string;
  addonCount: number;
  /** "gist" is the list your other computers pushed; "local" was built from this computer's WowUp. */
  source: "gist" | "local";
}

export interface AddonInstallSummary {
  /** Names of addons that were downloaded and installed. */
  installed: string[];
  /** Addons whose folders were already in Interface/AddOns, left untouched. */
  alreadyPresent: number;
  /** Entries with nothing to install (CurseForge meta packages). */
  ignored: number;
  /** Addons that must be installed some other way, with the reason. */
  needManual: { name: string; reason: string }[];
}

export type AddonInstallOutcome =
  | { status: "done"; summary: AddonInstallSummary }
  | { status: "skipped"; reason: string }
  | { status: "failed"; reason: string };

/** Live progress of a pull, sent to the window while it runs. */
export type SyncProgress =
  | { stage: "settings" }
  | {
      stage: "addons";
      /** The addon being worked on. */
      name: string;
      /** 0-based position among the addons to process, and how many there are. */
      index: number;
      total: number;
      step: "checking" | "downloading" | "extracting";
      /** Bytes downloaded so far and the file's size, when known. */
      received: number;
      size: number | null;
    };
