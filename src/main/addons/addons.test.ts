import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { strToU8, zipSync } from "fflate";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FetchLike } from "../auth/token.types";
import type { ExportPayload } from "../wowup/wowup.types";
import type { CfFile, CfMod, CurseApi } from "./addons.types";
import { CurseForgeClient, FOREVER_GAME_VERSION_TYPE_ID, pickForeverFile } from "./curseforge";
import { installMissingAddons } from "./install";
import { extractAddonZip, safeEntrySegments } from "./zip";

const zip = (files: Record<string, string>) => zipSync(Object.fromEntries(Object.entries(files).map(([k, v]) => [k, strToU8(v)])));

const file = (over: Partial<CfFile> = {}): CfFile => ({
  id: 1,
  displayName: "f",
  fileName: "f.zip",
  releaseType: 1,
  fileDate: "2026-01-01T00:00:00Z",
  downloadUrl: "https://cdn/f.zip",
  sortableGameVersions: [{ gameVersionTypeId: FOREVER_GAME_VERSION_TYPE_ID }],
  modules: [{ name: "Addon" }],
  ...over,
});

describe("pickForeverFile", () => {
  const mod = (files: CfFile[]): CfMod => ({ id: 1, name: "M", allowModDistribution: true, latestFiles: files });

  it("takes the newest stable file built for WoW Forever", () => {
    const picked = pickForeverFile(
      mod([
        file({ id: 1, fileDate: "2026-01-01T00:00:00Z" }),
        file({ id: 2, fileDate: "2026-03-01T00:00:00Z" }),
        file({ id: 3, fileDate: "2026-05-01T00:00:00Z", releaseType: 2 }), // newer but beta
        file({ id: 4, fileDate: "2026-06-01T00:00:00Z", sortableGameVersions: [{ gameVersionTypeId: 517 }] }), // retail only
      ]),
    );
    expect(picked?.id).toBe(2);
  });

  it("falls back to a beta when there is no stable file, and returns null when nothing fits Forever", () => {
    expect(pickForeverFile(mod([file({ id: 9, releaseType: 2 })]))?.id).toBe(9);
    expect(pickForeverFile(mod([file({ sortableGameVersions: [{ gameVersionTypeId: 517 }] })]))).toBeNull();
    expect(pickForeverFile(mod([]))).toBeNull();
  });
});

describe("CurseForgeClient", () => {
  const reply = (status: number, body: unknown): ReturnType<FetchLike> =>
    Promise.resolve({ status, headers: { get: () => null }, json: async () => body, text: async () => "" });

  it("sends the key and returns the mod data", async () => {
    let seen: { url: string; key: string } | undefined;
    const f: FetchLike = (url, init) => {
      seen = { url, key: init.headers["x-api-key"] };
      return reply(200, { data: { id: 5, name: "X", allowModDistribution: true, latestFiles: [] } });
    };
    const m = await new CurseForgeClient("KEY", f, async () => {}).getMod(5);
    expect(m.name).toBe("X");
    expect(seen).toEqual({ url: "https://api.curseforge.com/v1/mods/5", key: "KEY" });
  });

  it("explains 404, a rejected key and other errors", async () => {
    const c = (s: number) => new CurseForgeClient("K", () => reply(s, {}), async () => {});
    await expect(c(404).getMod(1)).rejects.toThrow(/Not found/);
    await expect(c(403).getMod(1)).rejects.toThrow(/rejected the API key/);
    await expect(c(500).getMod(1)).rejects.toThrow(/returned 500/);
  });

  it("validates a key", async () => {
    const v = (s: number) => new CurseForgeClient("K", () => reply(s, {}), async () => {}).validateKey();
    expect(await v(200)).toEqual({ ok: true });
    expect((await v(403)).ok).toBe(false);
    expect((await v(500)).problem).toMatch(/500/);
  });
});

describe("zip extraction", () => {
  let dir: string;
  let out: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "wis-zip-"));
    out = join(dir, "out");
  });
  afterEach(() => rm(dir, { recursive: true, force: true }));

  /** Writes zip bytes to a file and extracts them, like the installer does after a download. */
  async function extract(bytes: Uint8Array): Promise<string[]> {
    const file = join(dir, "addon.zip");
    await writeFile(file, bytes);
    return extractAddonZip(file, out);
  }

  it("extracts addon folders and reports their names", async () => {
    const names = await extract(zip({ "Addon/Addon.toc": "## Title: A", "Addon/Core.lua": "x", "Addon_Options/Options.lua": "y" }));
    expect(names).toEqual(["Addon", "Addon_Options"]);
    expect(await readFile(join(out, "Addon", "Core.lua"), "utf8")).toBe("x");
  });

  it("rejects path traversal and writes nothing", async () => {
    await expect(extract(zip({ "Addon/ok.lua": "x", "Addon/../../evil.lua": "y" }))).rejects.toThrow(/relative path|Unsafe path/);
    expect(await readdir(dir)).not.toContain("evil.lua");
    expect(await readdir(join(dir, ".."))).not.toContain("evil.lua");
  });

  it("rejects loose top-level files and empty zips", async () => {
    await expect(extract(zip({ "readme.txt": "x" }))).rejects.toThrow(/top level/);
    await expect(extract(zipSync({}))).rejects.toThrow(/no addon folders/);
  });

  it("flags unsafe entry names", () => {
    for (const bad of ["../x", "a/../../x", "/abs", "C:\\x", "a/./b"]) expect(() => safeEntrySegments(bad)).toThrow(/Unsafe/);
    expect(safeEntrySegments("Addon\\Sub\\f.lua")).toEqual(["Addon", "Sub", "f.lua"]);
  });
});

describe("installMissingAddons", () => {
  let root: string;
  let addons: string;
  let staging: string;
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "wis-install-"));
    addons = join(root, "AddOns");
    staging = join(root, "staging");
    await mkdir(addons, { recursive: true });
  });
  afterEach(() => rm(root, { recursive: true, force: true }));

  const entry = (id: string, name: string, provider = "Curse") => ({ id, name, provider_name: provider });
  const payload = (...addonList: ReturnType<typeof entry>[]): ExportPayload => ({ collection_name: "c", client_type: "Forever", addons: addonList });

  /** A fake CurseForge: mods by id, zips by url. */
  function api(mods: Record<string, CfMod | Error>, zips: Record<string, Uint8Array> = {}, downloads: string[] = []): CurseApi {
    return {
      async getMod(id) {
        const m = mods[String(id)];
        if (!m) throw new Error("Not found on CurseForge.");
        if (m instanceof Error) throw m;
        return m;
      },
      async download(url, dest, onBytes) {
        downloads.push(url);
        const z = zips[url];
        if (!z) throw new Error("Download failed (404).");
        await mkdir(dirname(dest), { recursive: true });
        await writeFile(dest, z);
        onBytes?.(z.byteLength, z.byteLength);
      },
    };
  }
  const mod = (id: number, name: string, f: Partial<CfFile> = {}): CfMod => ({ id, name, allowModDistribution: true, latestFiles: [file({ ...f, downloadUrl: f.downloadUrl === undefined ? `https://cdn/${id}.zip` : f.downloadUrl })] });
  const opts = (a: CurseApi) => ({ api: a, addonsDir: addons, stagingDir: staging });

  it("downloads and installs a missing addon, leaving no staging files behind", async () => {
    const a = api({ "1": mod(1, "DBM", { modules: [{ name: "DBM-Core" }] }) }, { "https://cdn/1.zip": zip({ "DBM-Core/DBM-Core.toc": "t", "DBM-Core/x.lua": "x" }) });
    const s = await installMissingAddons(payload(entry("1", "DBM")), opts(a));
    expect(s.installed).toEqual(["DBM"]);
    expect(await readFile(join(addons, "DBM-Core", "x.lua"), "utf8")).toBe("x");
    expect(await readdir(staging)).toEqual([]); // no temp zip or folder left behind
  });

  it("never overwrites: skips an addon whose folder already exists, without downloading", async () => {
    await mkdir(join(addons, "details"), { recursive: true }); // different letter case
    await writeFile(join(addons, "details", "mine.lua"), "my edits");
    const downloads: string[] = [];
    const a = api({ "2": mod(2, "Details", { modules: [{ name: "Details" }] }) }, {}, downloads);
    const s = await installMissingAddons(payload(entry("2", "Details")), opts(a));
    expect(s).toMatchObject({ installed: [], alreadyPresent: 1 });
    expect(downloads).toEqual([]);
    expect(await readFile(join(addons, "details", "mine.lua"), "utf8")).toBe("my edits");
  });

  it("also refuses when the downloaded zip holds a folder that already exists", async () => {
    await mkdir(join(addons, "Shared"), { recursive: true });
    const a = api({ "3": mod(3, "Pack", { modules: [{ name: "Pack" }] }) }, { "https://cdn/3.zip": zip({ "Pack/Pack.toc": "t", "Shared/lib.lua": "x" }) });
    const s = await installMissingAddons(payload(entry("3", "Pack")), opts(a));
    expect(s.alreadyPresent).toBe(1);
    await expect(readdir(join(addons, "Pack"))).rejects.toThrow(); // nothing moved in
  });

  it("lists what must be installed by hand, and keeps going after a failure", async () => {
    const a = api(
      {
        "10": mod(10, "Blocked", { downloadUrl: null }),
        "11": mod(11, "Retail only", {}) && { ...mod(11, "Retail only"), latestFiles: [file({ sortableGameVersions: [{ gameVersionTypeId: 517 }] })] },
        "12": new Error("CurseForge returned 500."),
        "13": mod(13, "Good", { modules: [{ name: "Good" }] }),
      },
      { "https://cdn/13.zip": zip({ "Good/Good.toc": "t" }) },
    );
    const s = await installMissingAddons(
      payload(entry("10", "Blocked"), entry("11", "Retail only"), entry("12", "Flaky"), entry("13", "Good"), entry("W1", "From Wago", "Wago"), entry("99", "Gone")),
      opts(a),
    );
    expect(s.installed).toEqual(["Good"]);
    const reasons = Object.fromEntries(s.needManual.map((m) => [m.name, m.reason]));
    expect(reasons["Blocked"]).toMatch(/doesn't allow downloads/);
    expect(reasons["Retail only"]).toMatch(/no file for WoW Forever/);
    expect(reasons["Flaky"]).toMatch(/returned 500/);
    expect(reasons["From Wago"]).toMatch(/Wago/);
    expect(reasons["Gone"]).toMatch(/Not found/);
    expect(s.needManual.every((m) => m.reason.includes("WowUp"))).toBe(true);
  });

  it("ignores meta packages and de-duplicates repeated entries", async () => {
    const downloads: string[] = [];
    const a = api(
      { "20": mod(20, "Meta", { modules: [] }), "21": mod(21, "Once", { modules: [{ name: "Once" }] }) },
      { "https://cdn/21.zip": zip({ "Once/Once.toc": "t" }) },
      downloads,
    );
    const s = await installMissingAddons(payload(entry("20", "Meta"), entry("21", "Once"), entry("21", "Once"), entry("20", "Meta")), opts(a));
    expect(s).toMatchObject({ installed: ["Once"], ignored: 1 });
    expect(downloads).toEqual(["https://cdn/21.zip"]);
  });

  it("creates the AddOns folder when it does not exist yet", async () => {
    await rm(addons, { recursive: true, force: true });
    const a = api({ "30": mod(30, "New", { modules: [{ name: "New" }] }) }, { "https://cdn/30.zip": zip({ "New/New.toc": "t" }) });
    await installMissingAddons(payload(entry("30", "New")), opts(a));
    expect((await readdir(addons)).sort()).toEqual(["New"]);
  });

  it("reports progress: each addon's step and its download bytes, with the file size from CurseForge as a fallback", async () => {
    const a = api(
      { "40": mod(40, "Big Voice Pack", { modules: [{ name: "Voices" }], fileLength: 1234 }), "41": mod(41, "Small", { modules: [{ name: "Small" }] }) },
      { "https://cdn/40.zip": zip({ "Voices/v.lua": "x" }), "https://cdn/41.zip": zip({ "Small/s.lua": "y" }) },
    );
    const events: string[] = [];
    await installMissingAddons(payload(entry("40", "Big"), entry("41", "Small")), {
      ...opts(a),
      onProgress: (p) => events.push(`${p.index + 1}/${p.total} ${p.step} ${p.name} ${p.received}/${p.size}`),
    });
    expect(events[0]).toBe("1/2 checking Big 0/null");
    expect(events).toContain("1/2 downloading Big Voice Pack 0/1234"); // size known before the first byte
    // The size the server reports during the download wins over CurseForge's listed length.
    expect(events.some((e) => /^1\/2 downloading Big Voice Pack ([1-9]\d*)\/\1$/.test(e))).toBe(true);
    expect(events).toContain("1/2 extracting Big Voice Pack 1234/1234");
    expect(events.filter((e) => e.startsWith("2/2")).map((e) => e.split(" ")[1])).toEqual(["checking", "downloading", "downloading", "extracting"]);
  });

  it("falls back to CurseForge's listed size when the server sends no Content-Length", async () => {
    const a: CurseApi = {
      getMod: async () => mod(50, "Voices", { modules: [{ name: "Voices" }], fileLength: 1234 }),
      async download(_url, dest, onBytes) {
        onBytes?.(500, null); // server gave no total
        await mkdir(dirname(dest), { recursive: true });
        await writeFile(dest, zip({ "Voices/v.lua": "x" }));
      },
    };
    const events: string[] = [];
    await installMissingAddons(payload(entry("50", "Voices")), { ...opts(a), onProgress: (p) => events.push(`${p.step} ${p.received}/${p.size}`) });
    expect(events).toContain("downloading 500/1234");
  });
});
