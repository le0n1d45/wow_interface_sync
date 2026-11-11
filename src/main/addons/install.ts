import { cp, mkdir, readdir, rename, rm } from "node:fs/promises";
import { join } from "node:path";
import type { ExportPayload } from "../wowup/wowup.types";
import { pickForeverFile } from "./curseforge";
import type { AddonInstallSummary, CurseApi } from "./addons.types";
import type { SyncProgress } from "@shared/sync.types";
import { extractAddonZip } from "./zip";

const CURSE_PROVIDERS = new Set(["Curse", "CurseV2"]);

export interface InstallOptions {
  api: CurseApi;
  /** `<WoW>/_forever_/Interface/AddOns` */
  addonsDir: string;
  /** Scratch folder; each addon is extracted here first, then moved into place. */
  stagingDir: string;
  onProgress?: (p: Extract<SyncProgress, { stage: "addons" }>) => void;
}

async function listFolders(dir: string): Promise<Set<string>> {
  try {
    return new Set((await readdir(dir, { withFileTypes: true })).filter((e) => e.isDirectory()).map((e) => e.name.toLowerCase()));
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return new Set();
    throw e;
  }
}

/** rename is atomic on one drive; across drives fall back to copy + delete. */
async function moveDir(from: string, to: string): Promise<void> {
  try {
    await rename(from, to);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "EXDEV") throw e;
    await cp(from, to, { recursive: true });
    await rm(from, { recursive: true, force: true });
  }
}

/**
 * Downloads the addons in a WowUp export that are not installed yet, so WowUp finds them on its next scan.
 * Additive only: an addon is skipped (never overwritten) if any of its folders already exists.
 * One addon failing never stops the rest; it is reported for manual installation instead.
 */
export async function installMissingAddons(payload: ExportPayload, opts: InstallOptions): Promise<AddonInstallSummary> {
  const summary: AddonInstallSummary = { installed: [], alreadyPresent: 0, ignored: 0, needManual: [] };
  await mkdir(opts.addonsDir, { recursive: true });
  const present = await listFolders(opts.addonsDir);

  const seen = new Set<string>();
  const entries = payload.addons.filter((a) => {
    const key = `${a.provider_name}:${a.id}`;
    if (seen.has(key)) return false; // WowUp's export can list the same addon more than once
    seen.add(key);
    return true;
  });

  let done = 0;
  for (const entry of entries) {
    const index = done++;
    const report = (step: "checking" | "downloading" | "extracting", name: string, received = 0, size: number | null = null) =>
      opts.onProgress?.({ stage: "addons", name, index, total: entries.length, step, received, size });
    report("checking", entry.name);
    if (!CURSE_PROVIDERS.has(entry.provider_name)) {
      summary.needManual.push({ name: entry.name, reason: `Comes from ${entry.provider_name}, which this app can't download from. Install it in WowUp.` });
      continue;
    }
    const stage = join(opts.stagingDir, `${entry.id}-${Date.now()}`);
    const zipFile = `${stage}.zip`;
    try {
      const mod = await opts.api.getMod(Number(entry.id));
      const file = pickForeverFile(mod);
      if (!file) {
        summary.needManual.push({ name: mod.name, reason: "CurseForge has no file for WoW Forever. Install it in WowUp." });
        continue;
      }
      if (file.modules.length === 0) {
        summary.ignored++; // meta package: nothing to put in AddOns
        continue;
      }
      if (file.modules.some((m) => present.has(m.name.toLowerCase()))) {
        summary.alreadyPresent++;
        continue;
      }
      if (!file.downloadUrl) {
        summary.needManual.push({ name: mod.name, reason: "The author doesn't allow downloads from other apps. Install it in WowUp." });
        continue;
      }

      report("downloading", mod.name, 0, file.fileLength ?? null);
      await opts.api.download(file.downloadUrl, zipFile, (received, total) => report("downloading", mod.name, received, total ?? file.fileLength ?? null));
      report("extracting", mod.name, file.fileLength ?? 0, file.fileLength ?? null);
      const folders = await extractAddonZip(zipFile, stage);
      if (folders.some((f) => present.has(f.toLowerCase()))) {
        summary.alreadyPresent++; // the zip holds a folder we already have: still never overwrite
        continue;
      }
      for (const folder of folders) {
        await moveDir(join(stage, folder), join(opts.addonsDir, folder));
        present.add(folder.toLowerCase());
      }
      summary.installed.push(mod.name);
    } catch (e) {
      summary.needManual.push({ name: entry.name, reason: `${(e as Error).message} Install it in WowUp.` });
    } finally {
      await rm(stage, { recursive: true, force: true });
      await rm(zipFile, { force: true });
    }
  }
  return summary;
}
