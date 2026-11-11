import type { FetchLike, TokenValidation } from "./token.types";

const API = "https://api.github.com";

export function parseRepoUrl(url: string): { owner: string; repo: string } | null {
  const m = /^https:\/\/github\.com\/([^/\s]+)\/([^/\s]+?)(?:\.git)?\/?$/.exec(url);
  return m ? { owner: m[1], repo: m[2] } : null;
}

/**
 * Checks a token before it is stored: it must be a classic token with `repo` and `gist` scopes
 * (fine-grained tokens cannot write gists), belong to a user who can push to the repo,
 * and own the gist that will receive the export string.
 */
export async function validateToken(
  token: string,
  repoUrl: string,
  gistId: string,
  fetchFn: FetchLike,
): Promise<TokenValidation> {
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "User-Agent": "wow-interface-sync",
  };
  const get = (path: string) => fetchFn(`${API}${path}`, { headers });
  const problems: string[] = [];

  const user = await get("/user");
  if (user.status === 401) return { ok: false, problems: ["GitHub rejected the token (expired or mistyped)."] };
  if (user.status !== 200) return { ok: false, problems: [`GitHub returned ${user.status} for the token check.`] };
  const login = ((await user.json()) as { login: string }).login;

  const scopes = user.headers.get("x-oauth-scopes");
  if (scopes === null) {
    problems.push("Use a classic personal access token with the repo and gist scopes (fine-grained tokens cannot write gists).");
  } else {
    const have = scopes.split(",").map((s) => s.trim());
    for (const need of ["repo", "gist"]) {
      if (!have.includes(need)) problems.push(`The token is missing the "${need}" scope.`);
    }
  }

  const parsed = parseRepoUrl(repoUrl);
  if (!parsed) {
    problems.push("The repository URL is not a valid https://github.com/<owner>/<repo> URL.");
  } else {
    const repo = await get(`/repos/${parsed.owner}/${parsed.repo}`);
    if (repo.status !== 200) {
      problems.push(`Cannot access ${parsed.owner}/${parsed.repo} (GitHub returned ${repo.status}).`);
    } else {
      const body = (await repo.json()) as { permissions?: { push?: boolean }; private?: boolean };
      if (!body.permissions?.push) problems.push("The token cannot push to the repository.");
      if (body.private === false) problems.push("The repository is public; your settings should live in a private repo.");
    }
  }

  const gist = await get(`/gists/${gistId}`);
  if (gist.status !== 200) {
    problems.push(`Cannot access the gist (GitHub returned ${gist.status}).`);
  } else if (((await gist.json()) as { owner?: { login?: string } }).owner?.login !== login) {
    problems.push("The gist belongs to a different account, so it cannot be updated with this token.");
  }

  return { ok: problems.length === 0, login, problems };
}
