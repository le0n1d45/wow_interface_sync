import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { gitOut, hasSystemGit, startTestRemote, type TestRemote } from "../git/test-server";
import { listBackups } from "./backup";
import { createManualBackup } from "./manual";
import { backupFilesForRepo, pruneTargets, pushBackup, REMOTE_BACKUP_KEEP, safeHostName } from "./remote";
import { makeSandbox, type Sandbox } from "./test-helpers";

const SV = "WTF/Account/ACCT1/SavedVariables/Addon.lua";

let sb: Sandbox;
let remote: TestRemote | undefined;
let clones: string;
beforeEach(async () => {
  sb = await makeSandbox();
  clones = await mkdtemp(join(tmpdir(), "wis-rb-"));
});
afterEach(async () => {
  await remote?.close();
  remote = undefined;
  await sb.cleanup();
  await rm(clones, { recursive: true, force: true });
});

describe("safeHostName", () => {
  it("keeps normal names and replaces unsafe characters", () => {
    expect(safeHostName("GAMING-PC")).toBe("GAMING-PC");
    expect(safeHostName("my pc/../x")).toBe("my_pc_.._x");
    expect(safeHostName("")).toBe("computer");
  });
});

describe("backupFilesForRepo", () => {
  it("places the whole backup folder under backups/<computer>/<id>/", async () => {
    await sb.write("forever", SV, "x");
    const m = await createManualBackup(sb.backups, sb.forever);
    const files = await backupFilesForRepo(sb.backups, m.id, "gaming pc");
    expect(files.map((f) => f.repoPath)).toEqual([
      `backups/gaming_pc/${m.id}/files/${SV}`,
      `backups/gaming_pc/${m.id}/manifest.json`,
    ]);
  });
});

describe("pruneTargets", () => {
  const f = (host: string, id: string) => [`backups/${host}/${id}/manifest.json`, `backups/${host}/${id}/files/WTF/a.lua`];
  const tracked = [...f("pc-a", "2026-01-01"), ...f("pc-a", "2026-01-02"), ...f("pc-a", "2026-01-03"), ...f("pc-b", "2025-01-01"), "WTF/SavedVariables/X.lua"];

  it("drops only this computer's oldest backups, leaving room for the one being added", () => {
    // keep=3 including the new one -> keep the 2 newest existing, drop the oldest
    expect(pruneTargets(tracked, "pc-a", 3)).toEqual(f("pc-a", "2026-01-01"));
    expect(pruneTargets(tracked, "pc-a", 2).sort()).toEqual([...f("pc-a", "2026-01-01"), ...f("pc-a", "2026-01-02")].sort());
  });
  it("deletes nothing while under the limit, and never touches other computers or settings", () => {
    expect(pruneTargets(tracked, "pc-a", 4)).toEqual([]);
    expect(pruneTargets(tracked, "pc-b", 1)).toEqual(f("pc-b", "2025-01-01"));
    expect(pruneTargets(tracked, "pc-c", 1)).toEqual([]);
  });
});

describe.skipIf(!hasSystemGit)("pushBackup", () => {
  it("keeps each computer in its own folder and trims the repo to the newest 20 per computer, leaving local backups alone", async () => {
    remote = await startTestRemote({ empty: true });
    const opts = (name: string) => ({ cloneDir: join(clones, name), repoUrl: remote!.url, token: "t" });

    await sb.write("forever", SV, "x");
    const ids: string[] = [];
    for (let i = 0; i < REMOTE_BACKUP_KEEP + 3; i++) {
      const m = await createManualBackup(sb.backups, sb.forever);
      ids.push(m.id);
      await pushBackup(opts("c1"), sb.backups, m.id, "pc-a");
      await new Promise((r) => setTimeout(r, 3));
    }
    const other = await createManualBackup(sb.backups, sb.forever);
    await pushBackup(opts("c2"), sb.backups, other.id, "pc-b");

    const tree = gitOut(remote.bare, "ls-tree", "-r", "--name-only", "main").split("\n");
    const manifestsA = tree.filter((p) => p.startsWith("backups/pc-a/") && p.endsWith("manifest.json"));
    expect(manifestsA).toHaveLength(REMOTE_BACKUP_KEEP);
    expect(manifestsA[0]).toContain(ids[3]); // the 3 oldest are gone from the repo
    expect(manifestsA.some((p) => p.includes(ids[0]))).toBe(false);
    expect(tree.filter((p) => p.startsWith("backups/pc-b/") && p.endsWith("manifest.json"))).toHaveLength(1);
    expect((await listBackups(sb.backups)).length).toBe(REMOTE_BACKUP_KEEP + 4); // nothing local was deleted
  }, 120000);
});
