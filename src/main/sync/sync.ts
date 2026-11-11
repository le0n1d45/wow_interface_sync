import { join } from "node:path";
import { updateGist } from "../gist/gist";
import { pushFiles, syncClone } from "../git/repo";
import { pullIntoInstall } from "../backup/pull";
import { resolveForeverDir } from "../wow/install";
import { selectSyncFiles } from "../wow/sync-files";
import { encodeExportString, readForeverExport } from "../wowup/export-string";
import { locateWowUpData } from "../wowup/locate";
import type { GistOutcome, PullSummary, PushSummary, SyncDeps } from "./sync.types";

const repoOptions = (d: SyncDeps) => ({
  cloneDir: join(d.dataDir, "repo"),
  repoUrl: d.config.repoUrl,
  token: d.token,
});

async function requireForeverDir(d: SyncDeps): Promise<string> {
  const dir = await resolveForeverDir(d.config.wowRoot);
  if (!dir) throw new Error(`No "_forever_" folder found in ${d.config.wowRoot}. Check the WoW folder in settings.`);
  return dir;
}

async function publishExportString(d: SyncDeps, foreverDir: string): Promise<GistOutcome> {
  try {
    const dataDir = await locateWowUpData(d.installEnv, d.wowupDataDir);
    if (!dataDir) return { status: "skipped", reason: "WowUp's data folder was not found." };
    const payload = await readForeverExport(dataDir, foreverDir);
    const result = await updateGist(d.token, d.config.gistId, encodeExportString(payload), d.fetchFn);
    return { status: result.updated ? "updated" : "unchanged" };
  } catch (e) {
    return { status: "failed", reason: (e as Error).message };
  }
}

/** Local -> repo (+ gist). Safe to repeat; commits only what changed. */
export async function pushAll(d: SyncDeps): Promise<PushSummary> {
  await d.assertWowClosed();
  const foreverDir = await requireForeverDir(d);
  const files = await selectSyncFiles(foreverDir, d.config.accountMap);
  const pushed = await pushFiles(repoOptions(d), files, `Sync from ${d.hostname} at ${new Date().toISOString()}`);
  const gist = await publishExportString(d, foreverDir);
  return { filesSelected: files.length, committed: pushed.committed, changedFiles: pushed.changedFiles, gist };
}

/** Repo -> local, after backing up whatever would change. */
export async function pullAll(d: SyncDeps): Promise<PullSummary> {
  await d.assertWowClosed();
  const foreverDir = await requireForeverDir(d);
  const opts = repoOptions(d);
  await syncClone(opts);
  return pullIntoInstall({
    cloneDir: opts.cloneDir,
    foreverDir,
    backupsDir: join(d.dataDir, "backups"),
    accountMap: d.config.accountMap,
    assertWowClosed: d.assertWowClosed,
  });
}
