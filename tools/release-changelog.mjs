#!/usr/bin/env node
/**
 * Turns CHANGELOG.md into release notes, for the release workflow.
 *
 * usage: node tools/release-changelog.mjs <CHANGELOG.md> <version> <notes-file> [date]
 *
 * Finds the notes for <version> and writes them to <notes-file>:
 *   - the body of the "## [Unreleased]" section, which is then moved under a new
 *     "## [<version>] - <date>" heading in the changelog (the changelog file is rewritten), or
 *   - when Unreleased is empty, the body of an existing "## [<version>]" section (a release
 *     heading added by hand, or left by an earlier run of a release that failed part way);
 *     the changelog is left as it is.
 * Exits with status 1 and writes nothing when neither has any entries, so the workflow can
 * fall back to GitHub's generated notes.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

/** @returns {Map<string, [number, number]>} section name -> [heading line index, end line index) */
function spans(lines) {
  const headings = [];
  lines.forEach((line, i) => {
    const m = /^## \[(.+?)\]/.exec(line);
    if (m) headings.push([i, m[1]]);
  });
  return new Map(headings.map(([i, name], n) => [name, [i, n + 1 < headings.length ? headings[n + 1][0] : lines.length]]));
}

/** The body of a section, or "" when it has no bullet entries. */
function body(lines, [start, end]) {
  const text = lines.slice(start + 1, end).join("\n").replace(/^\n+|\n+$/g, "");
  return /^- /m.test(text) ? text : "";
}

/**
 * @param {string} changelog the CHANGELOG.md text
 * @returns {{ changelog: string, notes: string } | null} null when the version has no entries
 */
export function applyRelease(changelog, version, date) {
  const lines = changelog.split("\n");
  const found = spans(lines);

  const unreleased = found.get("Unreleased");
  if (unreleased) {
    const notes = body(lines, unreleased);
    if (notes) {
      lines.splice(unreleased[0] + 1, 0, "", `## [${version}] - ${date}`);
      return { changelog: lines.join("\n"), notes };
    }
  }
  const existing = found.get(version);
  const notes = existing ? body(lines, existing) : "";
  return notes ? { changelog, notes } : null;
}

function main([path, version, notesPath, date]) {
  const result = applyRelease(readFileSync(path, "utf8"), version, date ?? new Date().toISOString().slice(0, 10));
  if (!result) return 1;
  writeFileSync(path, result.changelog);
  writeFileSync(notesPath, `${result.notes}\n`);
  return 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  if (![3, 4].includes(process.argv.length - 2)) {
    console.error("usage: release-changelog.mjs <CHANGELOG.md> <version> <notes-file> [date]");
    process.exit(2);
  }
  process.exit(main(process.argv.slice(2)));
}
