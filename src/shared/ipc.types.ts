import type { AppConfig, ConfigIssue } from "./config.types";
import type { BackupManifest } from "../main/backup/backup.types";
import type { ImportString, ManualBackupSummary, PullSummary, PushSummary, Result } from "./sync.types";
import type { TokenProtection, TokenStatus } from "./token.types";

export const IPC = {
  configGet: "config:get",
  configSave: "config:save",
  tokenStatus: "token:status",
  tokenSave: "token:save",
  tokenClear: "token:clear",
  syncPush: "sync:push",
  syncPull: "sync:pull",
  backupsList: "backups:list",
  backupsRestore: "backups:restore",
  repoWipe: "repo:wipe",
  copyImportString: "wowup:copy-import-string",
  curseKeyStatus: "curse:status",
  curseKeySave: "curse:save",
  curseKeyClear: "curse:clear",
  backupsCreate: "backups:create",
  backupsDelete: "backups:delete",
  wowDetect: "wow:detect",
  wowRunning: "wow:running",
} as const;

export interface SaveConfigResult {
  ok: boolean;
  issues: ConfigIssue[];
}

export interface SaveTokenResult {
  ok: boolean;
  login?: string;
  problems: string[];
  protection?: TokenProtection;
}

/** API exposed to the renderer through the preload script. */
export interface SyncApi {
  getConfig(): Promise<AppConfig>;
  saveConfig(config: AppConfig): Promise<SaveConfigResult>;
  getTokenStatus(): Promise<TokenStatus>;
  /** Validates the token against the saved config, and stores it only if valid. */
  saveToken(token: string): Promise<SaveTokenResult>;
  clearToken(): Promise<void>;
  push(): Promise<Result<PushSummary>>;
  pull(): Promise<Result<PullSummary>>;
  listBackups(): Promise<BackupManifest[]>;
  /** Restores a backup; returns the id of the safety backup that makes the restore undoable. */
  restoreBackup(id: string): Promise<Result<string>>;
  getCurseKeyStatus(): Promise<TokenStatus>;
  /** Checks the key with CurseForge and stores it (encrypted) only if accepted. */
  saveCurseKey(key: string): Promise<{ ok: boolean; problem?: string }>;
  clearCurseKey(): Promise<void>;
  /** Puts the WowUp import string on the clipboard. Returns what was copied (without the string itself). */
  copyImportString(): Promise<Result<Omit<ImportString, "text">>>;
  /** Deletes every file in the sync repo in one commit (git history keeps the old versions). */
  wipeRepo(): Promise<Result<{ removedFiles: number }>>;
  /** Snapshots the current synced files on demand; no pull involved. */
  createBackup(): Promise<Result<ManualBackupSummary>>;
  deleteBackup(id: string): Promise<Result<true>>;
  /** Auto-detected WoW root folder (the one containing `_forever_`), or null. */
  detectWowRoot(): Promise<string | null>;
  isWowRunning(): Promise<boolean>;
}
