export type AccountMap = Record<string, string>;

/** A file selected for syncing, addressed both on disk and in the shared repo. */
export interface SyncFile {
  absolutePath: string;
  /** POSIX path inside the repo, rooted at `WTF/`, with the account folder renamed via the account map. */
  repoPath: string;
}

export interface InstallEnv {
  platform: NodeJS.Platform;
  env: Record<string, string | undefined>;
}
