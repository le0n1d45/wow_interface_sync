import { readdir } from "node:fs/promises";
import { join, sep } from "node:path";
import { isSyncPath } from "./sync-rules";
import type { AccountMap, SyncFile } from "./wow.types";

const ACCOUNT_SEGMENT = 2; // WTF / Account / <account>

/** Throws if two local accounts would be written to the same shared name. */
export function assertAccountMapUnique(accountMap: AccountMap): void {
  const seen = new Map<string, string>();
  for (const [local, shared] of Object.entries(accountMap)) {
    const other = seen.get(shared);
    if (other !== undefined) throw new Error(`Accounts "${other}" and "${local}" both map to "${shared}"`);
    seen.set(shared, local);
  }
}

/** Renames the account folder in a `WTF/Account/<account>/...` path; other paths pass through. */
export function renameAccount(posixPath: string, rename: (account: string) => string): string {
  const parts = posixPath.split("/");
  if (parts[0] === "WTF" && parts[1] === "Account" && parts.length > ACCOUNT_SEGMENT + 1) {
    parts[ACCOUNT_SEGMENT] = rename(parts[ACCOUNT_SEGMENT]);
  }
  return parts.join("/");
}

export function localToRepoPath(localPath: string, accountMap: AccountMap): string {
  return renameAccount(localPath, (a) => accountMap[a] ?? a);
}

export function repoToLocalPath(repoPath: string, accountMap: AccountMap): string {
  const inverse = Object.fromEntries(Object.entries(accountMap).map(([local, shared]) => [shared, local]));
  return renameAccount(repoPath, (a) => inverse[a] ?? a);
}

/** Lists the files under `<foreverDir>/WTF` that should be synced, in a stable, locale-independent order. */
export async function selectSyncFiles(foreverDir: string, accountMap: AccountMap = {}): Promise<SyncFile[]> {
  assertAccountMapUnique(accountMap);
  let entries;
  try {
    entries = await readdir(join(foreverDir, "WTF"), { recursive: true, withFileTypes: true });
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw e;
  }

  const files: SyncFile[] = [];
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const absolutePath = join(entry.parentPath, entry.name);
    const localPath = absolutePath.slice(foreverDir.length + 1).split(sep).join("/");
    if (isSyncPath(localPath)) files.push({ absolutePath, repoPath: localToRepoPath(localPath, accountMap) });
  }
  return files.sort((a, b) => (a.repoPath < b.repoPath ? -1 : a.repoPath > b.repoPath ? 1 : 0));
}
