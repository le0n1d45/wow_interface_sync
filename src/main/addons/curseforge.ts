import type { FetchLike } from "../auth/token.types";
import type { CfFile, CfMod, CurseApi } from "./addons.types";

const API = "https://api.curseforge.com/v1";

/** CurseForge's game version type id for WoW Forever (the same id WowUp filters on). */
export const FOREVER_GAME_VERSION_TYPE_ID = 88568;

const MAX_DOWNLOAD_BYTES = 200 * 1024 * 1024;

/**
 * The file to install: the newest one built for WoW Forever, preferring stable releases and
 * falling back to beta/alpha only when there is no stable file.
 */
export function pickForeverFile(mod: CfMod): CfFile | null {
  const forever = (mod.latestFiles ?? []).filter((f) => f.sortableGameVersions?.some((g) => g.gameVersionTypeId === FOREVER_GAME_VERSION_TYPE_ID));
  const newest = (files: CfFile[]) => [...files].sort((a, b) => (a.fileDate < b.fileDate ? 1 : -1))[0] ?? null;
  return newest(forever.filter((f) => f.releaseType === 1)) ?? newest(forever);
}

export class CurseForgeClient implements CurseApi {
  constructor(
    private readonly apiKey: string,
    private readonly fetchFn: FetchLike,
    private readonly downloadFn: (url: string) => Promise<Uint8Array>,
  ) {}

  private headers() {
    return { "x-api-key": this.apiKey, Accept: "application/json", "User-Agent": "wow-interface-sync" };
  }

  async getMod(modId: number): Promise<CfMod> {
    const res = await this.fetchFn(`${API}/mods/${modId}`, { headers: this.headers() });
    if (res.status === 404) throw new Error("Not found on CurseForge.");
    if (res.status === 401 || res.status === 403) throw new Error("CurseForge rejected the API key.");
    if (res.status !== 200) throw new Error(`CurseForge returned ${res.status}.`);
    return ((await res.json()) as { data: CfMod }).data;
  }

  async download(url: string): Promise<Uint8Array> {
    const bytes = await this.downloadFn(url);
    if (bytes.byteLength > MAX_DOWNLOAD_BYTES) throw new Error("The download is unexpectedly large.");
    return bytes;
  }

  /** True when CurseForge accepts the key. */
  async validateKey(): Promise<{ ok: boolean; problem?: string }> {
    const res = await this.fetchFn(`${API}/games?pageSize=1`, { headers: this.headers() });
    if (res.status === 200) return { ok: true };
    if (res.status === 401 || res.status === 403) return { ok: false, problem: "CurseForge rejected this key. Check that you copied the whole key." };
    return { ok: false, problem: `CurseForge returned ${res.status}.` };
  }
}
