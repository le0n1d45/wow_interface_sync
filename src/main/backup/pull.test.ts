import { rm, utimes } from "node:fs/promises";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { listBackups } from "./backup";
import { copyFileAtomic, resolveLocal } from "./fs-utils";
import { pullIntoInstall } from "./pull";
import { restoreBackup } from "./restore";
import { diffCloneAgainstLocal } from "./diff";
import { makeSandbox, type Sandbox } from "./test-helpers";

const SV = "WTF/Account/ACCT1/SavedVariables/Addon.lua";
const EM = "WTF/SavedVariables/Global.lua";
const NEWF = "WTF/SavedVariables/Fresh.lua";
const CFG = "WTF/Account/ACCT1/config-cache.wtf";

let sb: Sandbox;
beforeEach(async () => {
  sb = await makeSandbox();
});
afterEach(() => sb.cleanup());

const opts = () => ({
  cloneDir: sb.clone,
  foreverDir: sb.forever,
  backupsDir: sb.backups,
  assertWowClosed: async () => {},
});

describe("pullIntoInstall", () => {
  it("backs up changed files, adds new ones, skips identical, and ignores non-synced files", async () => {
    await sb.write("forever", SV, "local-sv");
    await sb.write("forever", EM, "same");
    await sb.write("forever", CFG, "local-graphics");
    await sb.write("clone", SV, "remote-sv");
    await sb.write("clone", EM, "same");
    await sb.write("clone", NEWF, "fresh");
    await sb.write("clone", CFG, "remote-graphics");

    const r = await pullIntoInstall(opts());

    expect(r).toMatchObject({ changed: 1, created: 1, identical: 1 });
    expect(await sb.read("forever", SV)).toBe("remote-sv");
    expect(await sb.read("forever", NEWF)).toBe("fresh");
    expect(await sb.read("forever", CFG)).toBe("local-graphics");

    const [backup] = await listBackups(sb.backups);
    expect(backup.id).toBe(r.backupId);
    expect(backup.files.map((f) => [f.path, f.existedBefore]).sort()).toEqual([
      [SV, true],
      [NEWF, false],
    ]);
  });

  it("makes no backup and no writes when nothing differs", async () => {
    await sb.write("forever", SV, "x");
    await sb.write("clone", SV, "x");
    const r = await pullIntoInstall(opts());
    expect(r).toEqual({ backupId: null, changed: 0, created: 0, identical: 1 });
    expect(await listBackups(sb.backups)).toEqual([]);
  });

  it("compares content, not modification time", async () => {
    await sb.write("forever", SV, "x");
    await sb.write("clone", SV, "x");
    await utimes(`${sb.clone}/${SV}`, new Date(2000, 1, 1), new Date(2000, 1, 1));
    const changes = await diffCloneAgainstLocal(sb.clone, sb.forever);
    expect(changes.map((c) => c.status)).toEqual(["identical"]);
  });

  it("never deletes local files that are absent from the repo", async () => {
    await sb.write("forever", "WTF/SavedVariables/OnlyLocal.lua", "keep");
    await sb.write("clone", SV, "remote");
    await pullIntoInstall(opts());
    expect(await sb.read("forever", "WTF/SavedVariables/OnlyLocal.lua")).toBe("keep");
  });

  it("applies the account map in both directions", async () => {
    await sb.write("forever", SV, "local");
    await sb.write("clone", "WTF/Account/main/SavedVariables/Addon.lua", "remote");
    await pullIntoInstall({ ...opts(), accountMap: { ACCT1: "main" } });
    expect(await sb.read("forever", SV)).toBe("remote");
  });

  it("refuses to run (touching nothing) while WoW is running", async () => {
    await sb.write("forever", SV, "local");
    await sb.write("clone", SV, "remote");
    await expect(
      pullIntoInstall({ ...opts(), assertWowClosed: async () => { throw new Error("WoW is running"); } }),
    ).rejects.toThrow("WoW is running");
    expect(await sb.read("forever", SV)).toBe("local");
    expect(await listBackups(sb.backups)).toEqual([]);
  });

  it("rolls back automatically if a write fails midway", async () => {
    const B = "WTF/SavedVariables/B.lua";
    await sb.write("forever", SV, "local-1");
    await sb.write("forever", B, "local-2");
    await sb.write("clone", SV, "remote-1");
    await sb.write("clone", B, "remote-2");

    let calls = 0;
    const applyFile = async (from: string, to: string) => {
      if (++calls === 2) throw new Error("disk full");
      await copyFileAtomic(from, to);
    };

    await expect(pullIntoInstall({ ...opts(), applyFile })).rejects.toThrow(/rolled back.*disk full/);
    expect(await sb.read("forever", SV)).toBe("local-1");
    expect(await sb.read("forever", B)).toBe("local-2");
  });

  it("names the backup when the automatic rollback fails too", async () => {
    await sb.write("forever", SV, "local");
    await sb.write("clone", SV, "remote");
    await rm(sb.backups, { recursive: true, force: true });
    const applyFile = async () => {
      // Simulate losing the backup files after they were verified, then failing.
      await rm(sb.backups, { recursive: true, force: true });
      throw new Error("disk full");
    };
    await expect(pullIntoInstall({ ...opts(), applyFile })).rejects.toThrow(/rollback also failed.*Restore backup/);
  });
});

describe("restoreBackup", () => {
  it("restores changed files, deletes created ones, and is itself undoable", async () => {
    await sb.write("forever", SV, "original");
    await sb.write("clone", SV, "pulled");
    await sb.write("clone", NEWF, "fresh");
    const { backupId } = await pullIntoInstall(opts());
    expect(await sb.read("forever", SV)).toBe("pulled");

    const safetyId = await restoreBackup(sb.backups, sb.forever, backupId!);
    expect(await sb.read("forever", SV)).toBe("original");
    expect(await sb.read("forever", NEWF)).toBeNull();

    // Undo the restore.
    await restoreBackup(sb.backups, sb.forever, safetyId);
    expect(await sb.read("forever", SV)).toBe("pulled");
    expect(await sb.read("forever", NEWF)).toBe("fresh");
  });

  it("rejects malformed backup ids", async () => {
    await expect(restoreBackup(sb.backups, sb.forever, "../etc")).rejects.toThrow(/Invalid backup id/);
  });
});

describe("resolveLocal", () => {
  it("rejects traversal and empty segments", () => {
    for (const bad of ["../x", "WTF/../x", "WTF//x", "./x", ""]) {
      expect(() => resolveLocal("/base", bad)).toThrow(/Unsafe path/);
    }
  });
  it("joins safe paths under the base", () => {
    expect(resolveLocal("/base", "WTF/a.lua")).toMatch(/base[\\/]WTF[\\/]a\.lua$/);
  });
});
