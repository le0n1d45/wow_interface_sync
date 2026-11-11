import type { AppConfig } from "@shared/config.types";
import type { FetchLike } from "../auth/token.types";
import type { InstallEnv } from "../wow/wow.types";

export interface SyncDeps {
  config: AppConfig;
  token: string;
  /** App data folder: holds the repo clone and the backups. */
  dataDir: string;
  installEnv: InstallEnv;
  fetchFn: FetchLike;
  /** Throws if WoW is running. */
  assertWowClosed: () => Promise<void>;
  /** The user's own CurseForge API key, if they added one. Needed to download addons on pull. */
  curseKey?: string | null;
  /** Downloads a file's bytes (CurseForge's CDN needs no key). */
  download: (url: string) => Promise<Uint8Array>;
  /** Overrides auto-detection of WowUp's data folder. */
  wowupDataDir?: string;
  hostname: string;
}

export type { GistOutcome, ManualBackupSummary, PullSummary, PushSummary, RemoteBackupOutcome } from "@shared/sync.types";

