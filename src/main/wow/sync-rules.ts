/**
 * What gets synced for WoW Forever: the built-in UI's Edit Mode layouts and addon saved variables.
 * Game/graphics settings (Config.wtf, config-cache.wtf, key bindings, caches) are deliberately left out.
 * Matching is on the POSIX path relative to the `_forever_` folder, so it works for local files and repo paths alike.
 * Backups (`.lua.bak`) and `.old` files never match because every rule anchors on the exact extension.
 */
const SYNC_PATTERNS: RegExp[] = [
  // Global saved variables, minus Blizzard's login-screen/console state which is machine-specific.
  /^WTF\/SavedVariables\/(?!Blizzard_(?:Console|GlueSavedVariables)\.lua$)[^/]+\.lua$/,
  // Account-wide addon settings and Edit Mode layouts.
  /^WTF\/Account\/[^/]+\/SavedVariables\/[^/]+\.lua$/,
  /^WTF\/Account\/[^/]+\/edit-mode-cache-account\.txt$/,
  // Per-character addon settings, Edit Mode layouts and addon enable state: Account/<acct>/<realm>/<char>/...
  /^WTF\/Account\/[^/]+\/[^/]+\/[^/]+\/(?:SavedVariables\/[^/]+\.lua|edit-mode-cache-character\.txt|AddOns\.txt)$/,
];

export function isSyncPath(relativePosixPath: string): boolean {
  // Repo contents are untrusted: never let "." / ".." segments walk out of the install folder.
  if (relativePosixPath.split("/").some((s) => s === "." || s === "..")) return false;
  return SYNC_PATTERNS.some((p) => p.test(relativePosixPath));
}
