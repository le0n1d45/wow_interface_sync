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
import { pullAll, pushAll } from "./sync";
import type { SyncDeps } from "./sync.types";

const SV = "WTF/Account/ACCT1/SavedVariables/Addon.lua";
const EM = "WTF/Account/ACCT1/edit-mode-cache-account.txt";
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
  const fetchFn: FetchLike = async (_url, init) => {
    if (init.method === "PATCH") {
      gistWrites.push(JSON.parse(init.body!).files[GIST_FILE_NAME].content);
      return { status: 200, headers: { get: () => null }, json: async () => ({}) };
    }
    return { status: 200, headers: { get: () => null }, json: async () => ({ files: {} }) };
  };
  return {
    root,
    forever,
    gistWrites,
    deps: {
      config: { repoUrl: remote!.url, gistId: "g1", wowRoot, accountMap, pushBackups: true },
      token: "tok",
      dataDir: join(root, "data"),
      installEnv: { platform: "linux", env: {} },
      fetchFn,
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
    await put(a.forever, EM, "layout-from-a");
    await put(a.forever, CFG, "graphics-a");
    await put(b.forever, `WTF/Account/OTHERACCT/SavedVariables/Addon.lua`, "old-b");
    await put(b.forever, "WTF/Account/OTHERACCT/config-cache.wtf", "graphics-b");

    const pushed = await pushAll(a.deps);
    expect(pushed).toMatchObject({ filesSelected: 2, committed: true, changedFiles: 2, gist: { status: "updated" } });
    expect(gitOut(remote.bare, "ls-tree", "-r", "--name-only", "main").split("\n").sort()).toEqual([
      "WTF/Account/shared/SavedVariables/Addon.lua",
      "WTF/Account/shared/edit-mode-cache-account.txt",
    ]);
    expect(decodeExportString(a.gistWrites[0]).addons).toEqual([{ id: "42", name: "DBM", provider_name: "CurseV2" }]);

    const pulled = await pullAll(b.deps);
    expect(pulled).toMatchObject({ changed: 1, created: 1, identical: 0 });
    const read = async (rel: string) => (await import("node:fs/promises")).readFile(join(b.forever, ...rel.split("/")), "utf8");
    expect(await read("WTF/Account/OTHERACCT/SavedVariables/Addon.lua")).toBe("settings-from-a");
    expect(await read("WTF/Account/OTHERACCT/edit-mode-cache-account.txt")).toBe("layout-from-a");
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
