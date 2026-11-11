import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  assertAccountMapUnique,
  localToRepoPath,
  repoToLocalPath,
  selectSyncFiles,
} from "./sync-files";

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "wis-forever-"));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

async function touch(rel: string): Promise<void> {
  const p = join(dir, rel);
  await mkdir(dirname(p), { recursive: true });
  await writeFile(p, "x");
}

describe("selectSyncFiles", () => {
  it("returns [] when there is no WTF folder", async () => {
    expect(await selectSyncFiles(dir)).toEqual([]);
  });

  it("selects only edit-mode layouts and addon settings, sorted", async () => {
    for (const f of [
      "WTF/Config.wtf",
      "WTF/SavedVariables/Details.lua",
      "WTF/SavedVariables/Details.lua.bak",
      "WTF/SavedVariables/Blizzard_Console.lua",
      "WTF/Account/ACCT1/config-cache.wtf",
      "WTF/Account/ACCT1/edit-mode-cache-account.txt",
      "WTF/Account/ACCT1/SavedVariables/DBM-Core.lua",
      "WTF/Account/ACCT1/Dark Iron/Mychar/AddOns.txt",
      "WTF/Account/ACCT1/Dark Iron/Mychar/edit-mode-cache-character.txt",
      "WTF/Account/ACCT1/Dark Iron/Mychar/layout-local.txt",
      "WTF/Account/ACCT1/Dark Iron/Mychar/SavedVariables/Details.lua",
      "Interface/AddOns/Details/Details.lua",
    ]) await touch(f);

    const files = await selectSyncFiles(dir);
    expect(files.map((f) => f.repoPath)).toEqual([
      "WTF/Account/ACCT1/Dark Iron/Mychar/AddOns.txt",
      "WTF/Account/ACCT1/Dark Iron/Mychar/SavedVariables/Details.lua",
      "WTF/Account/ACCT1/Dark Iron/Mychar/edit-mode-cache-character.txt",
      "WTF/Account/ACCT1/SavedVariables/DBM-Core.lua",
      "WTF/Account/ACCT1/edit-mode-cache-account.txt",
      "WTF/SavedVariables/Details.lua",
    ]);
    expect(files[0].absolutePath).toBe(join(dir, "WTF/Account/ACCT1/Dark Iron/Mychar/AddOns.txt"));
  });

  it("renames the account folder via the account map", async () => {
    await touch("WTF/Account/ACCT1/edit-mode-cache-account.txt");
    await touch("WTF/Account/OTHER/edit-mode-cache-account.txt");
    const files = await selectSyncFiles(dir, { ACCT1: "main" });
    expect(files.map((f) => f.repoPath)).toEqual([
      "WTF/Account/OTHER/edit-mode-cache-account.txt",
      "WTF/Account/main/edit-mode-cache-account.txt",
    ]);
  });

  it("rejects an account map with duplicate shared names", async () => {
    await expect(selectSyncFiles(dir, { A: "x", B: "x" })).rejects.toThrow(/both map to "x"/);
  });
});

describe("account path mapping", () => {
  const map = { ACCT1: "main" };

  it("round-trips local and repo paths", () => {
    const local = "WTF/Account/ACCT1/SavedVariables/X.lua";
    const repo = localToRepoPath(local, map);
    expect(repo).toBe("WTF/Account/main/SavedVariables/X.lua");
    expect(repoToLocalPath(repo, map)).toBe(local);
  });

  it("leaves non-account paths alone", () => {
    expect(localToRepoPath("WTF/SavedVariables/X.lua", map)).toBe("WTF/SavedVariables/X.lua");
    expect(localToRepoPath("WTF/Account/ACCT1", map)).toBe("WTF/Account/ACCT1");
  });

  it("assertAccountMapUnique passes for distinct names", () => {
    expect(() => assertAccountMapUnique({ A: "x", B: "y" })).not.toThrow();
  });
});
