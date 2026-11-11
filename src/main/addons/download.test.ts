import { createServer, type Server } from "node:http";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { downloadToFile } from "./download";

let server: Server;
let base: string;
let dir: string;
const payload = Buffer.alloc(300_000, 7);

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "wis-dl-"));
  server = createServer((req, res) => {
    if (req.url === "/sized") {
      res.writeHead(200, { "Content-Length": payload.length });
      res.end(payload);
    } else if (req.url === "/chunked") {
      res.writeHead(200); // no Content-Length
      res.write(payload.subarray(0, 100_000));
      setTimeout(() => res.end(payload.subarray(100_000)), 20);
    } else if (req.url === "/truncated") {
      res.writeHead(200, { "Content-Length": payload.length });
      res.write(payload.subarray(0, 1000));
      setTimeout(() => res.destroy(), 20); // connection drops mid-download
    } else {
      res.writeHead(404).end();
    }
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});
afterEach(async () => {
  server.closeAllConnections();
  server.close();
  await rm(dir, { recursive: true, force: true });
});

describe("downloadToFile", () => {
  it("streams to a file and reports growing byte counts with the total", async () => {
    const dest = join(dir, "a.zip");
    const seen: [number, number | null][] = [];
    await downloadToFile(`${base}/sized`, dest, (r, t) => seen.push([r, t]));
    expect((await readFile(dest)).equals(payload)).toBe(true);
    expect(seen.at(-1)).toEqual([payload.length, payload.length]);
    expect(seen.map((s) => s[0])).toEqual([...seen.map((s) => s[0])].sort((a, b) => a - b));
  });

  it("works without a Content-Length, reporting a null total", async () => {
    const dest = join(dir, "b.zip");
    const seen: [number, number | null][] = [];
    await downloadToFile(`${base}/chunked`, dest, (r, t) => seen.push([r, t]));
    expect((await readFile(dest)).length).toBe(payload.length);
    expect(seen.every(([, t]) => t === null)).toBe(true);
  });

  it("fails on an HTTP error and on a connection that drops, leaving no partial file", async () => {
    await expect(downloadToFile(`${base}/missing`, join(dir, "c.zip"))).rejects.toThrow(/Download failed \(404\)/);
    await expect(downloadToFile(`${base}/truncated`, join(dir, "d.zip"))).rejects.toThrow();
    expect(await readdir(dir)).toEqual([]);
  });
});
