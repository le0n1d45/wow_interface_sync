import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { deleteBackup, listBackups } from "./backup";
import { createManualBackup } from "./manual";
import { restoreBackup } from "./restore";
import { makeSandbox, type Sandbox } from "./test-helpers";

const SV = "WTF/Account/ACCT1/SavedVariables/Addon.lua";
const EM = "WTF/Account/ACCT1/edit-mode-cache-account.txt";

let sb: Sandbox;
beforeEach(async () => {
  sb = await makeSandbox();
});
afterEach(() => sb.cleanup());

describe("createManualBackup", () => {
  it("snapshots every synced file and nothing else, without touching the game files", async () => {
    await sb.write("forever", SV, "sv");
    await sb.write("forever", EM, "em");
    await sb.write("forever", "WTF/Config.wtf", "graphics");

    const m = await createManualBackup(sb.backups, sb.forever);

    expect(m.reason).toBe("manual");
    expect(m.files.map((f) => f.path).sort()).toEqual([SV, EM].sort());
    expect(m.files.every((f) => f.existedBefore)).toBe(true);
    expect(await sb.read("forever", SV)).toBe("sv");
    expect((await listBackups(sb.backups))[0].id).toBe(m.id);
  });

  it("can be restored after the files change", async () => {
    await sb.write("forever", SV, "good");
    const m = await createManualBackup(sb.backups, sb.forever);
    await sb.write("forever", SV, "broken");
    await restoreBackup(sb.backups, sb.forever, m.id);
    expect(await sb.read("forever", SV)).toBe("good");
  });

  it("explains when there is nothing to back up", async () => {
    await expect(createManualBackup(sb.backups, sb.forever)).rejects.toThrow(/No settings files/);
    expect(await listBackups(sb.backups)).toEqual([]);
  });

  it("is never deleted by later backups or restores", async () => {
    await sb.write("forever", SV, "x");
    const manual = await createManualBackup(sb.backups, sb.forever);
    for (let i = 0; i < 12; i++) {
      await new Promise((r) => setTimeout(r, 3));
      await restoreBackup(sb.backups, sb.forever, manual.id); // each restore makes its own safety backup
    }
    expect(await listBackups(sb.backups)).toHaveLength(13);
  });
});

describe("deleteBackup", () => {
  it("removes a backup and rejects bad or unknown ids", async () => {
    await sb.write("forever", SV, "x");
    const m = await createManualBackup(sb.backups, sb.forever);
    await deleteBackup(sb.backups, m.id);
    expect(await listBackups(sb.backups)).toEqual([]);
    await expect(deleteBackup(sb.backups, m.id)).rejects.toThrow();
    await expect(deleteBackup(sb.backups, "../x")).rejects.toThrow(/Invalid backup id/);
  });
});
