import { execFileSync, spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
// @ts-expect-error plain .mjs script with JSDoc types
import { applyRelease } from "./release-changelog.mjs";

const HEAD = "# Changelog\n\nIntro text.\n\n";
const OLD = "## [0.1.0] - 2026-11-01\n\n### Added\n- First release.\n";

describe("applyRelease", () => {
  it("moves Unreleased entries under a dated version heading and returns them as the notes", () => {
    const text = `${HEAD}## [Unreleased]\n\n### Added\n- New thing.\n\n### Fixed\n- Old bug.\n\n${OLD}`;
    const r = applyRelease(text, "0.2.0", "2026-11-11");
    expect(r.notes).toBe("### Added\n- New thing.\n\n### Fixed\n- Old bug.");
    expect(r.changelog).toBe(`${HEAD}## [Unreleased]\n\n## [0.2.0] - 2026-11-11\n\n### Added\n- New thing.\n\n### Fixed\n- Old bug.\n\n${OLD}`);
    expect(r.changelog).toContain(OLD); // older releases untouched
  });

  it("uses an existing version section when Unreleased is empty and leaves the changelog alone", () => {
    const text = `${HEAD}## [Unreleased]\n\n## [0.2.0] - 2026-11-10\n\n### Added\n- Done earlier.\n\n${OLD}`;
    const r = applyRelease(text, "0.2.0", "2026-11-11");
    expect(r.notes).toBe("### Added\n- Done earlier.");
    expect(r.changelog).toBe(text);
  });

  it("returns null when there is nothing to release, including headings with no bullets", () => {
    expect(applyRelease(`${HEAD}## [Unreleased]\n\n### Added\n\n${OLD}`, "0.2.0", "d")).toBeNull();
    expect(applyRelease(`${HEAD}${OLD}`, "0.2.0", "d")).toBeNull();
  });

  it("works when Unreleased is the only section", () => {
    const r = applyRelease(`${HEAD}## [Unreleased]\n\n### Added\n- Only entry.\n`, "0.1.0", "2026-11-11");
    expect(r.notes).toBe("### Added\n- Only entry.");
    expect(r.changelog).toContain("## [0.1.0] - 2026-11-11");
  });
});

describe("release-changelog.mjs command line", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "wis-changelog-"));
  });
  afterEach(() => rm(dir, { recursive: true, force: true }));

  const script = join(__dirname, "release-changelog.mjs");

  it("rewrites the changelog, writes the notes and exits 0", async () => {
    const cl = join(dir, "CHANGELOG.md");
    const notes = join(dir, "notes.md");
    await writeFile(cl, `${HEAD}## [Unreleased]\n\n### Added\n- Thing.\n`);
    execFileSync(process.execPath, [script, cl, "1.0.0", notes, "2026-11-11"]);
    expect(await readFile(notes, "utf8")).toBe("### Added\n- Thing.\n");
    expect(await readFile(cl, "utf8")).toContain("## [1.0.0] - 2026-11-11");
  });

  it("exits 1 and writes no notes when there is nothing to release", async () => {
    const cl = join(dir, "CHANGELOG.md");
    await writeFile(cl, `${HEAD}## [Unreleased]\n\n`);
    const r = spawnSync(process.execPath, [script, cl, "1.0.0", join(dir, "notes.md")]);
    expect(r.status).toBe(1);
    await expect(readFile(join(dir, "notes.md"))).rejects.toThrow();
  });
});
