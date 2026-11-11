import { describe, expect, it } from "vitest";
import { parseRepoUrl, validateToken } from "./github-validate";
import type { FetchLike } from "./token.types";

type Route = { status: number; body?: unknown; scopes?: string | null };
function fakeFetch(routes: Record<string, Route>, seen: string[] = []): FetchLike {
  return async (url, init) => {
    const path = url.replace("https://api.github.com", "");
    seen.push(`${path}|${init.headers.Authorization}`);
    const r = routes[path] ?? { status: 404 };
    return {
      status: r.status,
      headers: { get: (n) => (n.toLowerCase() === "x-oauth-scopes" ? (r.scopes ?? null) : null) },
      json: async () => r.body,
      text: async () => String(r.body ?? ""),
    };
  };
}

const REPO = "https://github.com/me/wow";
const GIST = "abc123def456abc123de";
const good: Record<string, Route> = {
  "/user": { status: 200, body: { login: "me" }, scopes: "gist, repo" },
  "/repos/me/wow": { status: 200, body: { permissions: { push: true }, private: true } },
  [`/gists/${GIST}`]: { status: 200, body: { owner: { login: "me" } } },
};

describe("parseRepoUrl", () => {
  it("parses plain and .git URLs", () => {
    expect(parseRepoUrl("https://github.com/me/wow")).toEqual({ owner: "me", repo: "wow" });
    expect(parseRepoUrl("https://github.com/me/wow.git/")).toEqual({ owner: "me", repo: "wow" });
    expect(parseRepoUrl("git@github.com:me/wow.git")).toBeNull();
  });
});

describe("validateToken", () => {
  it("accepts a good token and sends it as a bearer token", async () => {
    const seen: string[] = [];
    const r = await validateToken("tok", REPO, GIST, fakeFetch(good, seen));
    expect(r).toEqual({ ok: true, login: "me", problems: [] });
    expect(seen[0]).toBe("/user|Bearer tok");
  });

  it("stops early on a rejected token", async () => {
    const r = await validateToken("bad", REPO, GIST, fakeFetch({ "/user": { status: 401 } }));
    expect(r.ok).toBe(false);
    expect(r.problems[0]).toMatch(/rejected/);
  });

  it("rejects fine-grained tokens (no scopes header)", async () => {
    const r = await validateToken("t", REPO, GIST, fakeFetch({ ...good, "/user": { status: 200, body: { login: "me" } } }));
    expect(r.problems.join()).toMatch(/classic/);
  });

  it("names each missing scope", async () => {
    const r = await validateToken("t", REPO, GIST, fakeFetch({ ...good, "/user": { status: 200, body: { login: "me" }, scopes: "repo" } }));
    expect(r.problems).toEqual(['The token is missing the "gist" scope.']);
  });

  it("flags a repo the token cannot push to or that is public", async () => {
    const noPush = await validateToken("t", REPO, GIST, fakeFetch({ ...good, "/repos/me/wow": { status: 200, body: { permissions: { push: false }, private: true } } }));
    expect(noPush.problems).toEqual(["The token cannot push to the repository."]);
    const pub = await validateToken("t", REPO, GIST, fakeFetch({ ...good, "/repos/me/wow": { status: 200, body: { permissions: { push: true }, private: false } } }));
    expect(pub.problems[0]).toMatch(/public/);
  });

  it("flags a missing repo and a gist owned by someone else", async () => {
    const r = await validateToken("t", REPO, GIST, fakeFetch({ ...good, "/repos/me/wow": { status: 404 }, [`/gists/${GIST}`]: { status: 200, body: { owner: { login: "other" } } } }));
    expect(r.problems).toHaveLength(2);
    expect(r.problems[0]).toMatch(/Cannot access me\/wow/);
    expect(r.problems[1]).toMatch(/different account/);
  });

  it("flags an invalid repo URL without calling the repo API", async () => {
    const seen: string[] = [];
    const r = await validateToken("t", "git@github.com:me/wow.git", GIST, fakeFetch(good, seen));
    expect(r.problems[0]).toMatch(/not a valid/);
    expect(seen.some((s) => s.startsWith("/repos/"))).toBe(false);
  });
});
