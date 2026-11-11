import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { unzipSync } from "fflate";

const MAX_TOTAL_BYTES = 500 * 1024 * 1024;
const MAX_ENTRIES = 20000;

/** Validates a zip entry path: relative, forward-slash, no "." or ".." segments. Returns its segments. */
export function safeEntrySegments(name: string): string[] {
  const normalized = name.replace(/\\/g, "/");
  if (normalized.startsWith("/") || /^[A-Za-z]:/.test(normalized)) throw new Error(`Unsafe path in zip: ${name}`);
  const segments = normalized.split("/").filter((s) => s !== "");
  if (segments.some((s) => s === ".." || s === ".")) throw new Error(`Unsafe path in zip: ${name}`);
  return segments;
}

/**
 * Extracts an addon zip into `destDir` and returns the top-level folder names it created.
 * Addon zips must hold folders at the top level (one folder per addon); anything else is rejected.
 */
export async function extractAddonZip(zip: Uint8Array, destDir: string): Promise<string[]> {
  let total = 0;
  let count = 0;
  const files = unzipSync(zip, {
    filter(file) {
      count++;
      total += file.originalSize;
      if (count > MAX_ENTRIES || total > MAX_TOTAL_BYTES) throw new Error("The zip is unexpectedly large.");
      return true;
    },
  });

  const topLevel = new Set<string>();
  const writes: [string, Uint8Array][] = [];
  for (const [name, data] of Object.entries(files)) {
    const segments = safeEntrySegments(name);
    if (segments.length === 0) continue;
    const isDirectory = name.endsWith("/");
    if (segments.length === 1 && !isDirectory) throw new Error(`Unexpected file at the top level of the zip: ${name}`);
    topLevel.add(segments[0]);
    if (!isDirectory) writes.push([join(destDir, ...segments), data]);
  }
  if (topLevel.size === 0) throw new Error("The zip contains no addon folders.");

  for (const [path, data] of writes) {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, data);
  }
  return [...topLevel].sort();
}
