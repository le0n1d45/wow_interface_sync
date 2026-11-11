import { describe, expect, it } from "vitest";
import { describeAddonInstall, describeBackup, describePull, describeRemoteBackup, describePush, formatAccountMap, parseAccountMap } from "./format";

describe("account map text", () => {
  it("parses LOCAL=shared lines and ignores junk", () => {
    expect(parseAccountMap("ACCT1 = main\n\nbad line\r\nB=c")).toEqual({ ACCT1: "main", B: "c" });
  });
  it("round-trips", () => {
    expect(parseAccountMap(formatAccountMap({ A: "x", B: "y" }))).toEqual({ A: "x", B: "y" });
  });
});

describe("describePush", () => {
  it("summarises commits and gist outcome", () => {
    expect(describePush({ filesSelected: 5, committed: true, changedFiles: 1, gist: { status: "updated" } })).toBe(
      "Pushed 1 changed file. WowUp export string updated.",
    );
    expect(describePush({ filesSelected: 5, committed: false, changedFiles: 0, gist: { status: "skipped", reason: "no WowUp" } })).toBe(
      "Nothing to push (5 files already up to date). WowUp export skipped: no WowUp",
    );
  });
});

describe("describePull", () => {
  it("reports changes or a no-op", () => {
    expect(describePull(3, 1, 9)).toBe("Pulled: 3 changed, 1 new.");
    expect(describePull(0, 0, 9)).toBe("Already up to date (9 files match).");
  });
});

describe("describeBackup", () => {
  const f = (n: number) => Array.from({ length: n }, (_, i) => ({ path: `p${i}`, existedBefore: true }));
  it("labels each kind of backup", () => {
    expect(describeBackup({ reason: "manual", summary: { changed: 2, new: 0 }, files: f(2) })).toBe("Manual backup: 2 files");
    expect(describeBackup({ reason: "manual", summary: { changed: 1, new: 0 }, files: f(1) })).toBe("Manual backup: 1 file");
    expect(describeBackup({ reason: "restore", summary: { changed: 1, new: 0 }, files: f(1) })).toBe("Before a restore");
    expect(describeBackup({ reason: "pull", summary: { changed: 3, new: 1 }, files: f(4) })).toBe("Before a pull: 3 changed, 1 new");
  });
});

describe("describeRemoteBackup", () => {
  it("reports success, failure and skips", () => {
    expect(describeRemoteBackup({ status: "pushed" })?.kind).toBe("ok");
    expect(describeRemoteBackup({ status: "failed", reason: "offline" })).toEqual({
      kind: "warn",
      text: "The backup was kept on this computer, but could not be saved to GitHub: offline",
    });
    expect(describeRemoteBackup({ status: "skipped", reason: "Uploading backups is turned off in Settings." })?.text).toContain("this computer only");
    expect(describeRemoteBackup({ status: "skipped", reason: "Nothing changed, so nothing was backed up." })).toBeNull();
  });
});

describe("describeAddonInstall", () => {
  const done = (over: object) => ({ status: "done" as const, summary: { installed: [], alreadyPresent: 0, ignored: 0, needManual: [], ...over } });

  it("summarises installs, existing addons and manual ones, with details", () => {
    const n = describeAddonInstall(done({ installed: ["DBM", "Details"], alreadyPresent: 20, needManual: [{ name: "Foo", reason: "Blocked." }] }))!;
    expect(n.kind).toBe("warn");
    expect(n.text).toBe("Addons: installed 2 new addons, 20 already present, 1 needs installing in WowUp. Rescan in WowUp to see them.");
    expect(n.details).toEqual(["+ DBM", "+ Details", "! Foo: Blocked."]);
  });

  it("is a quiet success when everything is already there", () => {
    expect(describeAddonInstall(done({ alreadyPresent: 5 }))).toMatchObject({ kind: "ok", text: "Addons: 5 already present." });
    expect(describeAddonInstall(done({}))?.text).toBe("Addons: nothing to install.");
  });

  it("explains skips and failures, but says nothing when the user turned it off", () => {
    expect(describeAddonInstall({ status: "skipped", reason: "Addon downloads are turned off in Settings." })).toBeNull();
    expect(describeAddonInstall({ status: "skipped", reason: "Add a CurseForge API key in Settings to download addons automatically." })?.kind).toBe("info");
    expect(describeAddonInstall({ status: "failed", reason: "offline" })).toEqual({ kind: "warn", text: "Addons were not downloaded: offline" });
  });
});
