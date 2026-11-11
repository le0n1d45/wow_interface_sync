/** User settings persisted to disk. Holds no secrets: the GitHub token is stored separately. */
export interface AppConfig {
  /** HTTPS URL of the private GitHub repo that holds the synced files. */
  repoUrl: string;
  /** ID of the gist that receives the WowUp export string. */
  gistId: string;
  /** World of Warcraft root folder, the one that contains `_forever_`. */
  wowRoot: string;
  /** Maps this machine's WTF account folder name to the shared name used in the repo. */
  accountMap: Record<string, string>;
  /** Also upload each backup to the repo, under backups/<computer>/. */
  pushBackups: boolean;
}

export type ConfigIssue = { field: keyof AppConfig; message: string };
