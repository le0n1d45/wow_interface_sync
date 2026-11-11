import { describe, expect, it } from "vitest";
import { isSetUp, repoLabel, shortPath } from "./setup";

const cfg = { repoUrl: "https://github.com/me/r", gistId: "abc", wowRoot: "C:\\WoW", accountMap: {} };

describe("isSetUp", () => {
  it("needs every field and a stored token", () => {
    expect(isSetUp(cfg, { stored: true })).toBe(true);
    expect(isSetUp(cfg, { stored: false })).toBe(false);
    expect(isSetUp({ ...cfg, gistId: "" }, { stored: true })).toBe(false);
    expect(isSetUp({ ...cfg, wowRoot: "" }, { stored: true })).toBe(false);
    expect(isSetUp({ ...cfg, repoUrl: "" }, { stored: true })).toBe(false);
  });
});

describe("labels", () => {
  it("shortens repo URLs", () => {
    expect(repoLabel("https://github.com/me/wow-settings.git")).toBe("me/wow-settings");
    expect(repoLabel("")).toBe("Not set");
  });
  it("shortens paths on either separator", () => {
    expect(shortPath("C:\\Program Files (x86)\\World of Warcraft")).toBe("Program Files (x86)/World of Warcraft");
    expect(shortPath("/mnt/c/WoW/")).toBe("c/WoW");
    expect(shortPath("")).toBe("Not set");
  });
});
