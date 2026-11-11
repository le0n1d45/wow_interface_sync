import { describe, expect, it } from "vitest";
import { listHasWow } from "./process";

describe("listHasWow", () => {
  it("matches the WoW binary case-insensitively", () => {
    expect(listHasWow(["explorer.exe", "Wow.exe"])).toBe(true);
    expect(listHasWow(["WoW"])).toBe(true);
  });
  it("does not match unrelated or launcher processes", () => {
    expect(listHasWow(["World of Warcraft Launcher.exe", "wowup.exe", "chrome.exe", ""])).toBe(false);
  });
});
