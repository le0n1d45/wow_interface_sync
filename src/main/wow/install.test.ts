import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { candidateRoots, detectForeverInstall, resolveForeverDir } from "./install";

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "wis-install-"));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("resolveForeverDir", () => {
  it("finds _forever_ under the WoW root", async () => {
    await mkdir(join(dir, "_forever_"));
    expect(await resolveForeverDir(dir)).toBe(join(dir, "_forever_"));
  });

  it("accepts the _forever_ folder itself, with a trailing slash", async () => {
    await mkdir(join(dir, "_forever_"));
    expect(await resolveForeverDir(`${join(dir, "_forever_")}/`)).toBe(join(dir, "_forever_"));
  });

  it("returns null for a retail-only install", async () => {
    await mkdir(join(dir, "_retail_"));
    expect(await resolveForeverDir(dir)).toBeNull();
  });

  it("returns null for a missing path", async () => {
    expect(await resolveForeverDir(join(dir, "nope"))).toBeNull();
  });
});

describe("candidateRoots", () => {
  it("probes Program Files on Windows", () => {
    const roots = candidateRoots({ platform: "win32", env: { "ProgramFiles(x86)": "D:\\PF86" } });
    expect(roots[0]).toContain("World of Warcraft");
    expect(roots[0]).toContain("PF86");
  });

  it("probes /Applications on macOS", () => {
    expect(candidateRoots({ platform: "darwin", env: {} })).toEqual(["/Applications/World of Warcraft"]);
  });

  it("probes /mnt/c only under WSL, nothing on plain Linux", () => {
    expect(candidateRoots({ platform: "linux", env: {} })).toEqual([]);
    expect(candidateRoots({ platform: "linux", env: { WSL_DISTRO_NAME: "Ubuntu" } })[0]).toContain("/mnt/c/");
  });
});

describe("detectForeverInstall", () => {
  it("returns null when nothing is found", async () => {
    expect(await detectForeverInstall({ platform: "linux", env: {} })).toBeNull();
  });
});
