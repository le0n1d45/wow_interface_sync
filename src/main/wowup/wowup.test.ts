import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  buildExportPayload,
  decodeExportString,
  encodeExportString,
  findForeverInstallation,
  readForeverExport,
} from "./export-string";
import { locateWowUpData } from "./locate";
import type { WowUpAddon } from "./wowup.types";

const addon = (over: Partial<WowUpAddon>): WowUpAddon => ({
  name: "Addon",
  installationId: "inst-forever",
  providerName: "CurseV2",
  externalId: "100",
  installedExternalReleaseId: "555",
  isIgnored: false,
  ...over,
});

describe("buildExportPayload", () => {
  it("exports only this installation's explicitly non-ignored addons that have an id", () => {
    const payload = buildExportPayload(
      [
        addon({ name: "Keep", externalId: "2" }),
        addon({ name: "OtherInstall", installationId: "inst-retail" }),
        addon({ name: "Ignored", isIgnored: true }),
        addon({ name: "UnsetIgnore", isIgnored: undefined }),
        addon({ name: "NoId", externalId: undefined }),
      ],
      "inst-forever",
    );
    expect(payload.addons).toEqual([{ id: "2", name: "Keep", provider_name: "CurseV2", version_id: "555" }]);
    expect(payload.client_type).toBe("Forever");
  });

  it("omits version_id when unknown and orders deterministically", () => {
    const payload = buildExportPayload(
      [
        addon({ externalId: "9", providerName: "Wago", installedExternalReleaseId: undefined }),
        addon({ externalId: "1", providerName: "CurseV2" }),
      ],
      "inst-forever",
    );
    expect(payload.addons.map((a) => a.provider_name)).toEqual(["CurseV2", "Wago"]);
    expect("version_id" in payload.addons[1]).toBe(false);
  });
});

describe("export string", () => {
  it("is base64 of the JSON and round-trips", () => {
    const payload = buildExportPayload([addon({})], "inst-forever");
    const str = encodeExportString(payload);
    expect(Buffer.from(str, "base64").toString("utf8")).toBe(JSON.stringify(payload));
    expect(decodeExportString(str)).toEqual(payload);
  });

  it("is identical across runs when nothing changed", () => {
    const a = encodeExportString(buildExportPayload([addon({})], "inst-forever"));
    const b = encodeExportString(buildExportPayload([addon({})], "inst-forever"));
    expect(a).toBe(b);
  });

  it("decodes raw JSON like WowUp's import does", () => {
    const payload = buildExportPayload([addon({})], "inst-forever");
    expect(decodeExportString(JSON.stringify(payload))).toEqual(payload);
  });
});

describe("findForeverInstallation", () => {
  const installs = [
    { id: "r", clientType: 0, location: "C:\\WoW\\_retail_" },
    { id: "f1", clientType: 10, location: "D:\\Other\\_forever_" },
    { id: "f2", clientType: 10, location: "C:\\WoW\\_forever_" },
  ];
  it("prefers the install at the configured folder", () => {
    expect(findForeverInstallation(installs, "c:/wow/_forever_/")?.id).toBe("f2");
  });
  it("falls back to the first Forever install, or null", () => {
    expect(findForeverInstallation(installs)?.id).toBe("f1");
    expect(findForeverInstallation([installs[0]])).toBeNull();
  });
});

describe("reading WowUp's data folder", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "wis-wowup-"));
  });
  afterEach(() => rm(dir, { recursive: true, force: true }));

  async function seed(prefs: unknown, addons: unknown) {
    await writeFile(join(dir, "preferences.json"), JSON.stringify(prefs));
    await writeFile(join(dir, "addons.json"), JSON.stringify(addons));
  }

  it("builds the payload from fixture files", async () => {
    await seed(
      { wow_installations: [{ id: "inst-forever", clientType: 10, location: "/x/_forever_" }] },
      { "uuid-1": addon({ name: "DBM" }), "uuid-2": addon({ installationId: "other" }) },
    );
    const payload = await readForeverExport(dir, "/x/_forever_");
    expect(payload.addons.map((a) => a.name)).toEqual(["DBM"]);
  });

  it("explains when there is no Forever installation", async () => {
    await seed({ wow_installations: [{ id: "r", clientType: 0, location: "/x/_retail_" }] }, {});
    await expect(readForeverExport(dir)).rejects.toThrow(/no WoW Forever installation/);
  });

  it("explains when WowUp has no installations at all", async () => {
    await seed({}, {});
    await expect(readForeverExport(dir)).rejects.toThrow(/no installations/);
  });

  it("locates the data folder only when both files exist", async () => {
    const env = { platform: "linux" as const, env: { HOME: dir } };
    expect(await locateWowUpData(env)).toBeNull();
    const app = join(dir, ".config", "WowUpCf");
    await mkdir(app, { recursive: true });
    await writeFile(join(app, "addons.json"), "{}");
    expect(await locateWowUpData(env)).toBeNull();
    await writeFile(join(app, "preferences.json"), "{}");
    expect(await locateWowUpData(env)).toBe(app);
  });

  it("honours an explicit override folder", async () => {
    await seed({}, {});
    expect(await locateWowUpData({ platform: "linux", env: {} }, dir)).toBe(dir);
  });
});
