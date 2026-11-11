import { describe, expect, it } from "vitest";
import { describePull, describePush, formatAccountMap, parseAccountMap } from "./format";

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
