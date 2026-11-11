import { readdir } from "node:fs/promises";
import { join, sep } from "node:path";
import { isSyncPath } from "../wow/sync-rules";
import { assertAccountMapUnique, repoToLocalPath } from "../wow/sync-files";
import type { AccountMap } from "../wow/wow.types";
import type { FileChange } from "./backup.types";
import { resolveLocal, sha256OfFile } from "./fs-utils";

/**
 * Compares the synced files in the repo clone against the local `_forever_` install.
 * Content hashes decide "identical", not mtimes, because git checkouts reset modification times.
 */
export async function diffCloneAgainstLocal(
  cloneDir: string,
  foreverDir: string,
  accountMap: AccountMap = {},
): Promise<FileChange[]> {
  assertAccountMapUnique(accountMap);
  let entries;
  try {
    entries = await readdir(join(cloneDir, "WTF"), { recursive: true, withFileTypes: true });
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw e;
  }

  const changes: FileChange[] = [];
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const sourcePath = join(entry.parentPath, entry.name);
    const repoPath = sourcePath.slice(cloneDir.length + 1).split(sep).join("/");
    if (!isSyncPath(repoPath)) continue;

    const localPath = repoToLocalPath(repoPath, accountMap);
    const localHash = await sha256OfFile(resolveLocal(foreverDir, localPath));
    const status =
      localHash === null ? "new" : localHash === (await sha256OfFile(sourcePath)) ? "identical" : "changed";
    changes.push({ localPath, sourcePath, status });
  }
  return changes.sort((a, b) => (a.localPath < b.localPath ? -1 : a.localPath > b.localPath ? 1 : 0));
}
