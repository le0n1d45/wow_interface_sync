import { createWriteStream } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import { dirname } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ByteProgress } from "./addons.types";

/** A single addon download may be large (voice packs), but not unbounded. */
export const MAX_DOWNLOAD_BYTES = 4 * 1024 * 1024 * 1024;

type FetchBody = (url: string, init: { headers: Record<string, string> }) => Promise<Response>;

/**
 * Streams `url` to `destFile` without holding it in memory, reporting progress as bytes arrive.
 * A partial file is removed if anything goes wrong.
 */
export async function downloadToFile(url: string, destFile: string, onBytes?: ByteProgress, fetchFn: FetchBody = fetch): Promise<void> {
  const res = await fetchFn(url, { headers: { "User-Agent": "wow-interface-sync" } });
  if (!res.ok || !res.body) throw new Error(`Download failed (${res.status}).`);
  const header = res.headers.get("content-length");
  const total = header && Number(header) > 0 ? Number(header) : null;
  if (total !== null && total > MAX_DOWNLOAD_BYTES) throw new Error("The download is unexpectedly large.");

  await mkdir(dirname(destFile), { recursive: true });
  let received = 0;
  const source = Readable.fromWeb(res.body as never);
  source.on("data", (chunk: Buffer) => {
    received += chunk.length;
    if (received > MAX_DOWNLOAD_BYTES) source.destroy(new Error("The download is unexpectedly large."));
    onBytes?.(received, total);
  });
  try {
    await pipeline(source, createWriteStream(destFile));
    if (total !== null && received < total) throw new Error("The download ended early.");
  } catch (e) {
    await rm(destFile, { force: true });
    throw e;
  }
}
