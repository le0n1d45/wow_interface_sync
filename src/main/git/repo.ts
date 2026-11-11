import * as fs from "node:fs";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import git from "isomorphic-git";
import http from "isomorphic-git/http/node";
import { copyFileAtomic } from "../backup/fs-utils";
import type { SyncFile } from "../wow/wow.types";
import type { PushResult, RepoOptions } from "./git.types";

const AUTHOR = { name: "WoW Interface Sync", email: "noreply@wow-interface-sync.invalid" };
const DEFAULT_BRANCH = "main";

const onAuth = (token: string) => () => ({ username: token, password: "x-oauth-basic" });

async function hasCommits(dir: string): Promise<boolean> {
  try {
    await git.resolveRef({ fs, dir, ref: "HEAD" });
    return true;
  } catch {
    return false;
  }
}

/** Fresh clone. A remote with no commits clones "successfully" onto an unborn branch, which we point at `main`. */
async function cloneFresh(o: RepoOptions): Promise<void> {
  await rm(o.cloneDir, { recursive: true, force: true });
  try {
    await git.clone({ fs, http, dir: o.cloneDir, url: o.repoUrl, onAuth: onAuth(o.token), singleBranch: true });
  } catch (e) {
    // Some servers reject cloning an empty repo outright; start a local repo that the first push will populate.
    if (!isEmptyRemoteError(e)) throw e;
    await rm(o.cloneDir, { recursive: true, force: true });
    await git.init({ fs, dir: o.cloneDir, defaultBranch: DEFAULT_BRANCH });
    await git.addRemote({ fs, dir: o.cloneDir, remote: "origin", url: o.repoUrl });
  }
  if (!(await hasCommits(o.cloneDir))) {
    await git.writeRef({ fs, dir: o.cloneDir, ref: "HEAD", value: `refs/heads/${DEFAULT_BRANCH}`, symbolic: true, force: true });
  }
}

function isEmptyRemoteError(e: unknown): boolean {
  const err = e as { code?: string; message?: string };
  return err.code === "NotFoundError" || /could not find (HEAD|refs)/i.test(err.message ?? "");
}

/** Brings the clone to the remote's latest state. Diverged or damaged clones are rebuilt: they hold nothing precious. */
export async function syncClone(o: RepoOptions): Promise<void> {
  if (!fs.existsSync(join(o.cloneDir, ".git")) || !(await hasCommits(o.cloneDir))) return cloneFresh(o);
  try {
    await git.pull({
      fs,
      http,
      dir: o.cloneDir,
      onAuth: onAuth(o.token),
      fastForwardOnly: true,
      singleBranch: true,
      author: AUTHOR,
    });
  } catch (e) {
    const code = (e as { code?: string }).code;
    if (code === "HttpError" || code === "UnauthorizedError" || code === "ForbiddenError") throw e;
    await cloneFresh(o); // diverged history or corrupt clone
  }
}

/** Returns repo paths to delete, given the clone. Only used to trim old backups; synced settings stay additive. */
export type DeletePaths = (cloneDir: string) => Promise<string[]>;

async function commitLocalFiles(o: RepoOptions, files: SyncFile[], message: string, deletePaths?: DeletePaths): Promise<PushResult> {
  for (const f of files) await copyFileAtomic(f.absolutePath, join(o.cloneDir, ...f.repoPath.split("/")));
  let removed = 0;
  for (const path of (await deletePaths?.(o.cloneDir)) ?? []) {
    await rm(join(o.cloneDir, ...path.split("/")), { force: true });
    await git.remove({ fs, dir: o.cloneDir, filepath: path });
    removed++;
  }

  // statusMatrix rows are [path, HEAD, WORKDIR, STAGE]; [1,1,1] is unchanged and WORKDIR 0 is a deletion,
  // which is never staged because the repo is additive.
  const rows = await git.statusMatrix({ fs, dir: o.cloneDir });
  const toStage = rows.filter(([, head, workdir, stage]) => workdir !== 0 && !(head === 1 && workdir === 1 && stage === 1));
  if (toStage.length === 0 && removed === 0) return { committed: false, changedFiles: 0 };

  for (const [path] of toStage) await git.add({ fs, dir: o.cloneDir, filepath: path });
  const commitOid = await git.commit({ fs, dir: o.cloneDir, message, author: AUTHOR });
  return { committed: true, changedFiles: toStage.length, commitOid };
}

/**
 * Copies the local files into the clone, commits what changed, and pushes.
 * Additive: files missing locally are never deleted from the repo (other machines may own them).
 * If the remote moved underneath us, the clone is rebuilt from it and the local files are re-applied.
 */
export async function pushFiles(o: RepoOptions, files: SyncFile[], message: string, deletePaths?: DeletePaths): Promise<PushResult> {
  for (let attempt = 0; ; attempt++) {
    await syncClone(o);
    const result = await commitLocalFiles(o, files, message, deletePaths);
    if (!result.committed) return result;
    try {
      const ref = (await git.currentBranch({ fs, dir: o.cloneDir })) ?? DEFAULT_BRANCH;
      await git.push({ fs, http, dir: o.cloneDir, onAuth: onAuth(o.token), remote: "origin", ref });
      return result;
    } catch (e) {
      const code = (e as { code?: string }).code;
      if (attempt >= 1 || code === "HttpError" || code === "UnauthorizedError" || code === "ForbiddenError") throw e;
      await cloneFresh(o); // push rejected as non-fast-forward: start over from the remote's state
    }
  }
}

/**
 * Removes every file from the repo in a single commit and pushes it. This is a normal commit, not a history
 * rewrite: the old versions stay in the repo's git history, so a mistake can be undone from GitHub.
 */
export async function deleteAllFiles(o: RepoOptions, message: string): Promise<{ removedFiles: number }> {
  for (let attempt = 0; ; attempt++) {
    await syncClone(o);
    let paths: string[];
    try {
      paths = await git.listFiles({ fs, dir: o.cloneDir, ref: "HEAD" });
    } catch {
      return { removedFiles: 0 }; // empty repo
    }
    if (paths.length === 0) return { removedFiles: 0 };

    for (const path of paths) {
      await rm(join(o.cloneDir, ...path.split("/")), { force: true });
      await git.remove({ fs, dir: o.cloneDir, filepath: path });
    }
    await git.commit({ fs, dir: o.cloneDir, message, author: AUTHOR });
    try {
      const ref = (await git.currentBranch({ fs, dir: o.cloneDir })) ?? DEFAULT_BRANCH;
      await git.push({ fs, http, dir: o.cloneDir, onAuth: onAuth(o.token), remote: "origin", ref });
      return { removedFiles: paths.length };
    } catch (e) {
      const code = (e as { code?: string }).code;
      if (attempt >= 1 || code === "HttpError" || code === "UnauthorizedError" || code === "ForbiddenError") throw e;
      await cloneFresh(o); // remote moved underneath us: start again from its state
    }
  }
}
