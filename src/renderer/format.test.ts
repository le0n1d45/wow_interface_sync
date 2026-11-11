import { describe, expect, it } from "vitest";
import { describeBackup, describePull, describeRemoteBackup, describePush, formatAccountMap, parseAccountMap } from "./format";

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
