/**
 * What gets synced for WoW Forever: addon settings only (SavedVariables, plus each character's AddOns.txt, which
 * records which addons are enabled). The game's own settings are deliberately left out: graphics and options
 * (Config.wtf, config-cache.wtf), key bindings, caches, and the Edit Mode layouts, which WoW Forever already syncs.
 * Matching is on the POSIX path relative to the `_forever_` folder, so it works for local files and repo paths alike.
 * Backups (`.lua.bak`) and `.old` files never match because every rule anchors on the exact extension.
 */
const SYNC_PATTERNS: RegExp[] = [
  // Global saved variables, minus Blizzard's login-screen/console state which is machine-specific.
  /^WTF\/SavedVariables\/(?!Blizzard_(?:Console|GlueSavedVariables)\.lua$)[^/]+\.lua$/,
  // Account-wide addon settings.
  /^WTF\/Account\/[^/]+\/SavedVariables\/[^/]+\.lua$/,
  // Per-character addon settings and addon enable state: Account/<acct>/<realm>/<char>/...
  /^WTF\/Account\/[^/]+\/[^/]+\/[^/]+\/(?:SavedVariables\/[^/]+\.lua|AddOns\.txt)$/,
];

export function isSyncPath(relativePosixPath: string): boolean {
  // Repo contents are untrusted: never let "." / ".." segments walk out of the install folder.
  if (relativePosixPath.split("/").some((s) => s === "." || s === "..")) return false;
  return SYNC_PATTERNS.some((p) => p.test(relativePosixPath));
}
