export interface RepoOptions {
  /** Local working clone of the private repo. Disposable: it can always be rebuilt from the remote. */
  cloneDir: string;
  repoUrl: string;
  token: string;
}

export interface PushResult {
  committed: boolean;
  /** Files whose content changed in this commit. */
  changedFiles: number;
  commitOid?: string;
}
