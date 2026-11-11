import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { ExportPayload, WowUpAddon, WowUpInstallation } from "./wowup.types";

/** WowClientType.Forever in wowup-lib (Retail=0 ... Anniversary=9, Forever=10). */
export const FOREVER_CLIENT_TYPE = 10;
export const FOREVER_CLIENT_NAME = "Forever";

/** Stable on purpose: a timestamp would change the string on every run and force needless gist updates. */
export const COLLECTION_NAME = "wow_interface_sync";

const norm = (p: string) => p.replace(/[\\/]+$/, "").replace(/\\/g, "/").toLowerCase();

/** Picks the Forever installation; if several exist, prefers the one at `foreverDir`. */
export function findForeverInstallation(
  installations: WowUpInstallation[],
  foreverDir?: string,
): WowUpInstallation | null {
  const forever = installations.filter((i) => i.clientType === FOREVER_CLIENT_TYPE);
  if (foreverDir) {
    const exact = forever.find((i) => norm(i.location) === norm(foreverDir));
    if (exact) return exact;
  }
  return forever[0] ?? null;
}

/**
 * Mirrors WowUp's own export (addon-broker.service.ts getExportPayload): only addons that are
 * explicitly not ignored (`isIgnored === false`) and that have a provider id are exported.
 */
export function buildExportPayload(addons: WowUpAddon[], installationId: string): ExportPayload {
  const exported = addons
    .filter((a) => a.installationId === installationId && a.isIgnored === false && a.externalId)
    .map((a) => ({
      id: a.externalId as string,
      name: a.name,
      provider_name: a.providerName,
      ...(a.installedExternalReleaseId ? { version_id: a.installedExternalReleaseId } : {}),
    }))
    .sort((x, y) => (x.provider_name + x.id < y.provider_name + y.id ? -1 : 1));
  return { collection_name: COLLECTION_NAME, client_type: FOREVER_CLIENT_NAME, addons: exported };
}

/** base64(utf8(JSON)): exactly what WowUp's export dialog produces and its import accepts. */
export function encodeExportString(payload: ExportPayload): string {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64");
}

export function decodeExportString(str: string): ExportPayload {
  const json = str.trim().startsWith("{") ? str : Buffer.from(str, "base64").toString("utf8");
  return JSON.parse(json) as ExportPayload;
}

async function readJson<T>(path: string, retries = 3): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return JSON.parse(await readFile(path, "utf8")) as T;
    } catch (e) {
      // WowUp may be mid-write; a short retry covers a torn read.
      if (!(e instanceof SyntaxError) || attempt >= retries) throw e;
      await new Promise((r) => setTimeout(r, 150));
    }
  }
}

/** Reads WowUp's data folder and returns the Forever export payload. */
export async function readForeverExport(wowupDataDir: string, foreverDir?: string): Promise<ExportPayload> {
  const prefs = await readJson<Record<string, unknown>>(join(wowupDataDir, "preferences.json"));
  const installations = prefs["wow_installations"];
  if (!Array.isArray(installations)) {
    throw new Error("WowUp's preferences have no installations. Has WowUp been set up for WoW Forever?");
  }
  const install = findForeverInstallation(installations as WowUpInstallation[], foreverDir);
  if (!install) throw new Error("WowUp has no WoW Forever installation configured.");

  const store = await readJson<Record<string, WowUpAddon>>(join(wowupDataDir, "addons.json"));
  if (typeof store !== "object" || store === null) throw new Error("WowUp's addon list has an unexpected format.");
  return buildExportPayload(Object.values(store), install.id);
}
