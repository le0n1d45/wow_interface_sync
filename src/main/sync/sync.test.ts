import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FetchLike } from "../auth/token.types";
import { listBackups } from "../backup/backup";
import { restoreBackup } from "../backup/restore";
import { gitOut, hasSystemGit, startTestRemote, type TestRemote } from "../git/test-server";
import { GIST_FILE_NAME } from "../gist/gist";
import { decodeExportString } from "../wowup/export-string";
import { strToU8, zipSync } from "fflate";
import { getImportString, pullAll, pushAll } from "./sync";
import type { SyncDeps } from "./sync.types";

const SV = "WTF/Account/ACCT1/SavedVariables/Addon.lua";
const EM = "WTF/Account/ACCT1/SavedVariables/Other.lua";
const CFG = "WTF/Account/ACCT1/config-cache.wtf";

interface Machine {
  root: string;
  forever: string;
  deps: SyncDeps;
  gistWrites: string[];
}

let tmp: string;
let remote: TestRemote | undefined;
beforeEach(async () => {
  tmp = await mkdtemp(join(tmpdir(), "wis-e2e-"));
});
afterEach(async () => {
  await remote?.close();
  remote = undefined;
  await rm(tmp, { recursive: true, force: true });
});

async function put(base: string, rel: string, content: string) {
  const p = join(base, ...rel.split("/"));
  await mkdir(dirname(p), { recursive: true });
  await writeFile(p, content);
}

async function machine(name: string, accountMap: Record<string, string> = {}, withWowUp = true): Promise<Machine> {
  const root = join(tmp, name);
  const wowRoot = join(root, "World of Warcraft");
  const forever = join(wowRoot, "_forever_");
  await mkdir(forever, { recursive: true });
  const wowupDir = join(root, "wowup");
  if (withWowUp) {
    await put(wowupDir, "preferences.json", JSON.stringify({ wow_installations: [{ id: "i1", clientType: 10, location: forever }] }));
    await put(wowupDir, "addons.json", JSON.stringify({ a: { name: "DBM", installationId: "i1", providerName: "CurseV2", externalId: "42", isIgnored: false } }));
  }
  const gistWrites: string[] = [];
  let gistContent: string | undefined;
  const reply = (body: unknown) => ({ status: 200, headers: { get: () => null }, json: async () => body, text: async () => "" });
  const fetchFn: FetchLike = async (_url, init) => {
    if (init.method === "PATCH") {
      gistContent = JSON.parse(init.body!).files[GIST_FILE_NAME].content as string;
      gistWrites.push(gistContent);
      return reply({});
    }
    return reply({ files: gistContent === undefined ? {} : { [GIST_FILE_NAME]: { content: gistContent } } });
  };
  return {
    root,
    forever,
    gistWrites,
    deps: {
      config: { repoUrl: remote!.url, gistId: "g1", wowRoot, accountMap, pushBackups: true, installAddonsOnPull: false },
      token: "tok",
      dataDir: join(root, "data"),
      installEnv: { platform: "linux", env: {} },
      fetchFn,
      download: async () => {
        throw new Error("no network in tests");
      },
      assertWowClosed: async () => {},
      wowupDataDir: withWowUp ? wowupDir : join(root, "missing"),
      hostname: name,
    },
  };
}

describe.skipIf(!hasSystemGit)("push on one machine, pull on another", () => {
  it("syncs settings across machines, maps accounts, publishes the export string, and can be undone", async () => {
    remote = await startTestRemote({ empty: true });
    const a = await machine("pc-a", { ACCT1: "shared" });
    const b = await machine("pc-b", { OTHERACCT: "shared" });

    await put(a.forever, `WTF/${SV.slice(4)}`, "settings-from-a");
    await put(a.forever, EM, "other-from-a");
    await put(a.forever, "WTF/Account/ACCT1/edit-mode-cache-account.txt", "layout-from-a");
    await put(a.forever, CFG, "graphics-a");
    await put(b.forever, `WTF/Account/OTHERACCT/SavedVariables/Addon.lua`, "old-b");
    await put(b.forever, "WTF/Account/OTHERACCT/edit-mode-cache-account.txt", "keep-b-layout");
    await put(b.forever, "WTF/Account/OTHERACCT/config-cache.wtf", "graphics-b");

    const pushed = await pushAll(a.deps);
    expect(pushed).toMatchObject({ filesSelected: 2, committed: true, changedFiles: 2, gist: { status: "updated" } });
    expect(gitOut(remote.bare, "ls-tree", "-r", "--name-only", "main").split("\n").sort()).toEqual([
      "WTF/Account/shared/SavedVariables/Addon.lua",
      "WTF/Account/shared/SavedVariables/Other.lua",
    ]);
    expect(decodeExportString(a.gistWrites[0]).addons).toEqual([{ id: "42", name: "DBM", provider_name: "CurseV2" }]);

    const pulled = await pullAll(b.deps);
    expect(pulled).toMatchObject({ changed: 1, created: 1, identical: 0 });
    const read = async (rel: string) => (await import("node:fs/promises")).readFile(join(b.forever, ...rel.split("/")), "utf8");
    expect(await read("WTF/Account/OTHERACCT/SavedVariables/Addon.lua")).toBe("settings-from-a");
    expect(await read("WTF/Account/OTHERACCT/SavedVariables/Other.lua")).toBe("other-from-a");
    expect(await read("WTF/Account/OTHERACCT/edit-mode-cache-account.txt")).toBe("keep-b-layout"); // game-synced, untouched
    expect(await read("WTF/Account/OTHERACCT/config-cache.wtf")).toBe("graphics-b"); // graphics untouched

    // Undo the pull.
    const [backup] = await listBackups(join(b.deps.dataDir, "backups"));
    expect(backup.id).toBe(pulled.backupId);
    await restoreBackup(join(b.deps.dataDir, "backups"), b.forever, backup.id);
    expect(await read("WTF/Account/OTHERACCT/SavedVariables/Addon.lua")).toBe("old-b");

    // The pull's backup was also uploaded, into this computer's own folder.
    expect(pulled.remoteBackup).toEqual({ status: "pushed" });
    expect(gitOut(remote.bare, "ls-tree", "-r", "--name-only", "main")).toContain(`backups/pc-b/${pulled.backupId}/manifest.json`);

    // A second pull of unchanged content makes nothing new.
    await pullAll(b.deps);
    expect((await pullAll(b.deps)).backupId).toBeNull();
  });

  it("keeps the local backup and pull when the upload is turned off or fails", async () => {
    remote = await startTestRemote({ empty: true });
    const a = await machine("pc-a");
    const b = await machine("pc-b");
    await put(a.forever, SV, "from-a");
    await pushAll(a.deps);

    b.deps.config.pushBackups = false;
    await put(b.forever, SV, "old-b");
    const off = await pullAll(b.deps);
    expect(off.changed).toBe(1);
    expect(off.remoteBackup.status).toBe("skipped");
    expect(gitOut(remote.bare, "ls-tree", "-r", "--name-only", "main")).not.toContain("backups/");

    // Upload on, but the server goes away right after the pull's files are applied.
    b.deps.config.pushBackups = true;
    await put(a.forever, SV, "from-a-2");
    await pushAll(a.deps);
    await put(b.forever, SV, "old-b-2");
    const { uploadBackup } = await import("./sync");
    await remote.close();
    remote = undefined;
    const failed = await uploadBackup(b.deps, off.backupId!);
    expect(failed.status).toBe("failed");
  });

  it("gives a new computer the import string that another computer pushed", async () => {
    remote = await startTestRemote({ empty: true });
    const a = await machine("pc-a");
    await put(a.forever, SV, "x");
    await pushAll(a.deps);

    // Same gist, different computer with no WowUp at all.
    const fresh = await machine("pc-new", {}, false);
    fresh.deps.fetchFn = a.deps.fetchFn;
    const got = await getImportString(fresh.deps);
    expect(got).toMatchObject({ source: "gist", addonCount: 1 });
    expect(decodeExportString(got.text).addons[0]).toMatchObject({ id: "42", name: "DBM" });
  });

  it("falls back to this computer's WowUp when the gist is empty, and explains when neither exists", async () => {
    remote = await startTestRemote({ empty: true });
    const withWowUp = await machine("pc-a");
    expect(await getImportString(withWowUp.deps)).toMatchObject({ source: "local", addonCount: 1 });

    const bare = await machine("pc-b", {}, false);
    await expect(getImportString(bare.deps)).rejects.toThrow(/gist has no addon list yet/);
  });

  it("on pull, downloads the gist's missing addons when enabled and a key is set; off or keyless it does not", async () => {
    remote = await startTestRemote({ empty: true });
    const a = await machine("pc-a"); // has WowUp with addon 42 (DBM) and pushes the list to the gist
    await put(a.forever, SV, "x");
    await pushAll(a.deps);

    const b = await machine("pc-b", {}, false);
    b.deps.fetchFn = async (url, init) => {
      if (url === "https://api.curseforge.com/v1/mods/42") {
        const file = { id: 1, displayName: "f", fileName: "f.zip", releaseType: 1, fileDate: "2026-01-01T00:00:00Z", downloadUrl: "https://cdn/42.zip", sortableGameVersions: [{ gameVersionTypeId: 88568 }], modules: [{ name: "DBM-Core" }] };
        return { status: 200, headers: { get: () => null }, json: async () => ({ data: { id: 42, name: "DBM", allowModDistribution: true, latestFiles: [file] } }), text: async () => "" };
      }
      return a.deps.fetchFn(url, init); // the gist
    };
    const downloads: string[] = [];
    b.deps.download = async (url) => {
      downloads.push(url);
      return zipSync({ "DBM-Core/DBM-Core.toc": strToU8("## Title: DBM") });
    };

    // Off by default: nothing downloaded, nothing said.
    const off = await pullAll(b.deps);
    expect(off.addons).toEqual({ status: "skipped", reason: "Addon downloads are turned off in Settings." });

    // On, but no key: explains what is missing.
    b.deps.config.installAddonsOnPull = true;
    expect((await pullAll(b.deps)).addons).toMatchObject({ status: "skipped", reason: expect.stringContaining("CurseForge API key") });
    expect(downloads).toEqual([]);

    // On with a key: installs into Interface/AddOns, and a second pull leaves it alone.
    b.deps.curseKey = "KEY";
    const on = await pullAll(b.deps);
    expect(on.addons).toEqual({ status: "done", summary: { installed: ["DBM"], alreadyPresent: 0, ignored: 0, needManual: [] } });
    expect(await (await import("node:fs/promises")).readFile(join(b.forever, "Interface", "AddOns", "DBM-Core", "DBM-Core.toc"), "utf8")).toBe("## Title: DBM");
    const again = await pullAll(b.deps);
    expect(again.addons).toMatchObject({ status: "done", summary: { installed: [], alreadyPresent: 1 } });
    expect(downloads).toHaveLength(1);
  });

  it("a failing addon download never fails the pull", async () => {
    remote = await startTestRemote({ empty: true });
    const a = await machine("pc-a");
    await put(a.forever, SV, "x");
    await pushAll(a.deps);
    const b = await machine("pc-b", {}, false);
    b.deps.fetchFn = async (url, init) => (url.includes("curseforge") ? { status: 500, headers: { get: () => null }, json: async () => ({}), text: async () => "" } : a.deps.fetchFn(url, init));
    b.deps.config.installAddonsOnPull = true;
    b.deps.curseKey = "KEY";
    const r = await pullAll(b.deps);
    expect(r.created).toBe(1); // the settings still arrived
    expect(r.addons).toMatchObject({ status: "done", summary: { needManual: [{ name: "DBM", reason: expect.stringContaining("returned 500") }] } });
  });

  it("does not fail the file sync when WowUp is missing; reports it instead", async () => {
    remote = await startTestRemote({ empty: true });
    const a = await machine("pc-a", {}, false);
    await put(a.forever, SV, "x");
    const r = await pushAll(a.deps);
    expect(r.committed).toBe(true);
    expect(r.gist).toEqual({ status: "skipped", reason: "WowUp's data folder was not found." });
  });

  it("refuses both directions while WoW is running, touching nothing", async () => {
    remote = await startTestRemote({ empty: true });
    const a = await machine("pc-a");
    a.deps.assertWowClosed = async () => {
      throw new Error("WoW is running");
    };
    await expect(pushAll(a.deps)).rejects.toThrow("WoW is running");
    await expect(pullAll(a.deps)).rejects.toThrow("WoW is running");
    expect(gitOut(remote.bare, "rev-list", "--all", "--count")).toBe("0");
  });

  it("explains a wrong WoW folder", async () => {
    remote = await startTestRemote({ empty: true });
    const a = await machine("pc-a");
    a.deps.config.wowRoot = join(tmp, "nowhere");
    await expect(pushAll(a.deps)).rejects.toThrow(/No "_forever_" folder/);
  });
});
