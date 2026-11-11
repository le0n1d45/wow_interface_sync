import { createWriteStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { pipeline } from "node:stream/promises";
import yauzl from "yauzl";

const MAX_TOTAL_BYTES = 8 * 1024 * 1024 * 1024;
const MAX_ENTRIES = 100000;

/** Validates a zip entry path: relative, forward-slash, no "." or ".." segments. Returns its segments. */
export function safeEntrySegments(name: string): string[] {
  const normalized = name.replace(/\\/g, "/");
  if (normalized.startsWith("/") || /^[A-Za-z]:/.test(normalized)) throw new Error(`Unsafe path in zip: ${name}`);
  const segments = normalized.split("/").filter((s) => s !== "");
  if (segments.some((s) => s === ".." || s === ".")) throw new Error(`Unsafe path in zip: ${name}`);
  return segments;
}

function openZip(path: string): Promise<yauzl.ZipFile> {
  return new Promise((resolve, reject) =>
    yauzl.open(path, { lazyEntries: true, autoClose: true, strictFileNames: false }, (err, zip) => (err ? reject(err) : resolve(zip))),
  );
}

function openEntry(zip: yauzl.ZipFile, entry: yauzl.Entry): Promise<NodeJS.ReadableStream> {
  return new Promise((resolve, reject) => zip.openReadStream(entry, (err, stream) => (err ? reject(err) : resolve(stream))));
}

/**
 * Extracts an addon zip file into `destDir`, one entry at a time straight from disk, so even a very large
 * addon never sits in memory. Returns the top-level folder names it created.
 * Addon zips must hold folders at the top level (one folder per addon); anything else is rejected.
 */
export async function extractAddonZip(zipPath: string, destDir: string): Promise<string[]> {
  const zip = await openZip(zipPath);
  const topLevel = new Set<string>();
  let total = 0;
  let count = 0;

  await new Promise<void>((resolve, reject) => {
    const fail = (e: unknown) => {
      zip.close();
      reject(e);
    };
    zip.on("error", fail);
    zip.on("end", resolve);
    zip.on("entry", (entry: yauzl.Entry) => {
      void (async () => {
        count++;
        total += entry.uncompressedSize;
        if (count > MAX_ENTRIES || total > MAX_TOTAL_BYTES) throw new Error("The zip is unexpectedly large.");

        const segments = safeEntrySegments(entry.fileName);
        const isDirectory = entry.fileName.endsWith("/");
        if (segments.length > 0) {
          if (segments.length === 1 && !isDirectory) throw new Error(`Unexpected file at the top level of the zip: ${entry.fileName}`);
          topLevel.add(segments[0]);
        }
        if (!isDirectory && segments.length > 0) {
          const target = join(destDir, ...segments);
          await mkdir(dirname(target), { recursive: true });
          await pipeline(await openEntry(zip, entry), createWriteStream(target));
        } else if (segments.length > 0) {
          await mkdir(join(destDir, ...segments), { recursive: true });
        }
        zip.readEntry();
      })().catch(fail);
    });
    zip.readEntry();
  });

  if (topLevel.size === 0) throw new Error("The zip contains no addon folders.");
  return [...topLevel].sort();
}
