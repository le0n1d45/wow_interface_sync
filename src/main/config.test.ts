import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { configPath, defaultConfig, loadConfig, saveConfig, validateConfig } from "./config";

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "wis-config-"));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

const valid = {
  repoUrl: "https://github.com/me/wow-settings",
  gistId: "aa5a315d61ae9438b18d",
  wowRoot: "C:\\Program Files (x86)\\World of Warcraft",
  accountMap: { ACCT1: "main" },
  pushBackups: true,
};

describe("config persistence", () => {
  it("returns defaults when no file exists", async () => {
    expect(await loadConfig(dir)).toEqual(defaultConfig());
  });

  it("round-trips a saved config", async () => {
    await saveConfig(dir, valid);
    expect(await loadConfig(dir)).toEqual(valid);
  });

  it("creates the directory and leaves no temp file", async () => {
    const nested = join(dir, "a", "b");
    await saveConfig(nested, valid);
    expect(JSON.parse(await readFile(configPath(nested), "utf8"))).toEqual(valid);
    await expect(readFile(`${configPath(nested)}.tmp`)).rejects.toThrow();
  });

  it("fills missing fields from defaults", async () => {
    await saveConfig(dir, { repoUrl: valid.repoUrl } as never);
    expect((await loadConfig(dir)).accountMap).toEqual({});
  });
});

describe("validateConfig", () => {
  it("accepts a valid config", () => {
    expect(validateConfig(valid)).toEqual([]);
  });

  it("flags each bad field", () => {
    const fields = validateConfig(defaultConfig()).map((i) => i.field);
    expect(fields).toEqual(["repoUrl", "gistId", "wowRoot"]);
  });

  it("accepts .git suffix and rejects ssh URLs", () => {
    expect(validateConfig({ ...valid, repoUrl: "https://github.com/me/r.git" })).toEqual([]);
    expect(validateConfig({ ...valid, repoUrl: "git@github.com:me/r.git" })).toHaveLength(1);
  });
});
