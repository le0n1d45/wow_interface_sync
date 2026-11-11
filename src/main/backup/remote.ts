import * as fs from "node:fs";
import { readdir } from "node:fs/promises";
import { join, sep } from "node:path";
import git from "isomorphic-git";
import { pushFiles } from "../git/repo";
import type { RepoOptions } from "../git/git.types";
import type { SyncFile } from "../wow/wow.types";

/** Backups kept in the repo per computer. Older ones are removed there; local backups are never auto-deleted. */
export const REMOTE_BACKUP_KEEP = 20;

/** Folder name for this computer inside the repo's backups/ folder. */
export function safeHostName(host: string): string {
  return host.replace(/[^A-Za-z0-9._-]/g, "_") || "computer";
}

/** The backup folder, uploaded verbatim (manifest + files) under backups/<computer>/<id>/. */
export async function backupFilesForRepo(backupsDir: string, id: string, host: string): Promise<SyncFile[]> {
  const root = join(backupsDir, id);
  const entries = await readdir(root, { recursive: true, withFileTypes: true });
  return entries
    .filter((e) => e.isFile())
    .map((e) => {
      const absolutePath = join(e.parentPath, e.name);
      const rel = absolutePath.slice(root.length + 1).split(sep).join("/");
      return { absolutePath, repoPath: `backups/${safeHostName(host)}/${id}/${rel}` };
    })
    .sort((a, b) => (a.repoPath < b.repoPath ? -1 : 1));
}

/**
 * Tracked paths to delete so this computer keeps at most `keep` backups once the one being added lands.
 * Ids are timestamps, so sorting them sorts by age. Other computers' folders are never touched.
 */
export function pruneTargets(trackedPaths: string[], host: string, keep: number): string[] {
  const prefix = `backups/${safeHostName(host)}/`;
  const mine = trackedPaths.filter((p) => p.startsWith(prefix));
  const idOf = (p: string) => p.slice(prefix.length).split("/")[0];
  const ids = [...new Set(mine.map(idOf))].sort();
  const drop = new Set(ids.slice(0, Math.max(0, ids.length + 1 - keep)));
  return mine.filter((p) => drop.has(idOf(p)));
}

async function trackedPaths(dir: string): Promise<string[]> {
  try {
    return await git.listFiles({ fs, dir, ref: "HEAD" });
  } catch {
    return []; // brand-new repo with no commits yet
  }
}

/** Uploads one backup, then trims this computer's oldest backups in the repo beyond the newest `keep`. */
export async function pushBackup(o: RepoOptions, backupsDir: string, id: string, host: string, keep = REMOTE_BACKUP_KEEP): Promise<void> {
  const files = await backupFilesForRepo(backupsDir, id, host);
  await pushFiles(o, files, `Backup ${id} from ${host}`, async (dir) => pruneTargets(await trackedPaths(dir), host, keep));
}
