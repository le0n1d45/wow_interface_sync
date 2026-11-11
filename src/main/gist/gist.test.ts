import { describe, expect, it } from "vitest";
import type { FetchLike } from "../auth/token.types";
import { GIST_FILE_NAME, updateGist } from "./gist";

interface Call { url: string; method?: string; body?: string; auth: string }

function fakeFetch(getStatus: number, files: unknown, patchStatus = 200, calls: Call[] = []): FetchLike {
  return async (url, init) => {
    calls.push({ url, method: init.method, body: init.body, auth: init.headers.Authorization });
    const isPatch = init.method === "PATCH";
    return {
      status: isPatch ? patchStatus : getStatus,
      headers: { get: () => null },
      json: async () => ({ files }),
    };
  };
}

describe("updateGist", () => {
  it("patches only the export file when content differs", async () => {
    const calls: Call[] = [];
    const r = await updateGist("tok", "g1", "NEW", fakeFetch(200, { [GIST_FILE_NAME]: { content: "OLD" } }, 200, calls));
    expect(r).toEqual({ updated: true });
    expect(calls[1].method).toBe("PATCH");
    expect(JSON.parse(calls[1].body!)).toEqual({ files: { [GIST_FILE_NAME]: { content: "NEW" } } });
    expect(calls[1].auth).toBe("Bearer tok");
  });

  it("does nothing when the content is unchanged", async () => {
    const calls: Call[] = [];
    const r = await updateGist("t", "g1", "SAME", fakeFetch(200, { [GIST_FILE_NAME]: { content: "SAME" } }, 200, calls));
    expect(r).toEqual({ updated: false });
    expect(calls).toHaveLength(1);
  });

  it("creates the file when the gist does not have it yet", async () => {
    expect((await updateGist("t", "g1", "X", fakeFetch(200, {}))).updated).toBe(true);
  });

  it("explains a missing gist and failed updates", async () => {
    await expect(updateGist("t", "g1", "X", fakeFetch(404, {}))).rejects.toThrow(/Gist not found/);
    await expect(updateGist("t", "g1", "X", fakeFetch(500, {}))).rejects.toThrow(/returned 500/);
    await expect(updateGist("t", "g1", "X", fakeFetch(200, {}, 403))).rejects.toThrow(/update the gist.*403/);
  });
});
