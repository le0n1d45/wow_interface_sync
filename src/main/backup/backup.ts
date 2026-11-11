import { copyFile, mkdir, readdir, readFile, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { BackupFileEntry, BackupManifest, BackupReason } from "./backup.types";
import { resolveLocal, sha256OfFile, writeFileAtomic } from "./fs-utils";

const MANIFEST = "manifest.json";
const FILES_DIR = "files";

function newBackupId(now = new Date()): string {
  return now.toISOString().replace(/[:.]/g, "-");
}

/**
 * Snapshots the given local files (POSIX paths relative to `foreverDir`) into a new backup.
 * Paths that do not exist locally are recorded as `existedBefore: false` so a restore deletes them.
 * The backup is verified (copy hash == source hash) before this returns; any failure throws.
 */
export async function createBackup(
  backupsDir: string,
  foreverDir: string,
  paths: string[],
  reason: BackupReason,
  summary: { changed: number; new: number },
): Promise<BackupManifest> {
  const id = newBackupId();
  const root = join(backupsDir, id);
  const files: BackupFileEntry[] = [];

  try {
    for (const path of paths) {
      const source = resolveLocal(foreverDir, path);
      const hash = await sha256OfFile(source);
      if (hash === null) {
        files.push({ path, existedBefore: false });
        continue;
      }
      const dest = join(root, FILES_DIR, ...path.split("/"));
      await mkdir(dirname(dest), { recursive: true });
      await copyFile(source, dest);
      if ((await sha256OfFile(dest)) !== hash) throw new Error(`Backup verification failed for ${path}`);
      files.push({ path, existedBefore: true, sha256: hash });
    }

    const manifest: BackupManifest = { id, createdAt: new Date().toISOString(), reason, summary, files };
    await writeFileAtomic(join(root, MANIFEST), JSON.stringify(manifest, null, 2));
    return manifest;
  } catch (e) {
    await rm(root, { recursive: true, force: true });
    throw e;
  }
}

export async function readManifest(backupsDir: string, id: string): Promise<BackupManifest> {
  if (!/^[0-9A-Za-z-]+$/.test(id)) throw new Error(`Invalid backup id: ${id}`);
  return JSON.parse(await readFile(join(backupsDir, id, MANIFEST), "utf8")) as BackupManifest;
}

/** Newest first. Folders without a readable manifest (e.g. an interrupted backup) are ignored. */
export async function listBackups(backupsDir: string): Promise<BackupManifest[]> {
  let ids: string[];
  try {
    ids = await readdir(backupsDir);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw e;
  }
  const manifests: BackupManifest[] = [];
  for (const id of ids) {
    try {
      manifests.push(await readManifest(backupsDir, id));
    } catch {
      // skip
    }
  }
  return manifests.sort((a, b) => (a.id < b.id ? 1 : a.id > b.id ? -1 : 0));
}

export function backupFilePath(backupsDir: string, id: string, path: string): string {
  resolveLocal("/", path); // validates the path has no traversal segments
  return join(backupsDir, id, FILES_DIR, ...path.split("/"));
}

/** Deletes one backup. */
export async function deleteBackup(backupsDir: string, id: string): Promise<void> {
  await readManifest(backupsDir, id); // validates the id and that it exists
  await rm(join(backupsDir, id), { recursive: true, force: true });
}
