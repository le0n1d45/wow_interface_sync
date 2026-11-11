import type { FetchLike } from "../auth/token.types";

export const GIST_FILE_NAME = "wowup-forever.txt";

export interface GistUpdateResult {
  updated: boolean;
}

/**
 * Writes the WowUp export string to the gist, but only when it differs from what is already there,
 * so an unchanged addon list produces no new gist revision.
 */
export async function updateGist(
  token: string,
  gistId: string,
  content: string,
  fetchFn: FetchLike,
  fileName = GIST_FILE_NAME,
): Promise<GistUpdateResult> {
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "User-Agent": "wow-interface-sync",
  };
  const url = `https://api.github.com/gists/${encodeURIComponent(gistId)}`;

  const current = await fetchFn(url, { headers });
  if (current.status === 404) throw new Error("Gist not found. Check the gist ID and that the token can access it.");
  if (current.status !== 200) throw new Error(`Could not read the gist (GitHub returned ${current.status}).`);
  const existing = ((await current.json()) as { files?: Record<string, { content?: string; truncated?: boolean }> })
    .files?.[fileName];
  if (existing && !existing.truncated && existing.content === content) return { updated: false };

  const res = await fetchFn(url, {
    method: "PATCH",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({ files: { [fileName]: { content } } }),
  });
  if (res.status !== 200) throw new Error(`Could not update the gist (GitHub returned ${res.status}).`);
  return { updated: true };
}

/** Reads the export string back from the gist. Returns null when the gist has no export file yet. */
export async function readGistFile(token: string, gistId: string, fetchFn: FetchLike, fileName = GIST_FILE_NAME): Promise<string | null> {
  const headers = { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "User-Agent": "wow-interface-sync" };
  const res = await fetchFn(`https://api.github.com/gists/${encodeURIComponent(gistId)}`, { headers });
  if (res.status === 404) throw new Error("Gist not found. Check the gist ID and that the token can access it.");
  if (res.status !== 200) throw new Error(`Could not read the gist (GitHub returned ${res.status}).`);
  const file = ((await res.json()) as { files?: Record<string, { content?: string; truncated?: boolean; raw_url?: string }> }).files?.[fileName];
  if (!file) return null;
  if (file.truncated && file.raw_url) {
    const raw = await fetchFn(file.raw_url, { headers });
    if (raw.status !== 200) throw new Error(`Could not read the gist file (GitHub returned ${raw.status}).`);
    return await raw.text();
  }
  return file.content ?? null;
}
