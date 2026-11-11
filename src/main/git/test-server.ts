import { spawn, spawnSync } from "node:child_process";
import { createServer, type Server } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

export const hasSystemGit = spawnSync("git", ["--version"]).status === 0;

export interface TestRemote {
  url: string;
  bare: string;
  close(): Promise<void>;
}

const pkt = (s: string) => (s.length + 4).toString(16).padStart(4, "0") + s;

/**
 * A minimal git smart-HTTP server backed by a bare repo, so the real isomorphic-git client can be
 * tested end to end. Test-only: it shells out to the system git, which the app itself never does.
 */
export async function startTestRemote(opts: { empty?: boolean; seed?: (dir: string) => void } = {}): Promise<TestRemote> {
  const root = await mkdtemp(join(tmpdir(), "wis-remote-"));
  const bare = join(root, "repo.git");
  spawnSync("git", ["init", "--bare", "-b", "main", bare]);

  const server: Server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://x");
    const service = url.searchParams.get("service") ?? url.pathname.split("/").pop() ?? "";
    const cmd = service.replace("git-", "");
    if (cmd !== "upload-pack" && cmd !== "receive-pack") {
      res.writeHead(404).end();
      return;
    }
    const isAdvert = req.method === "GET";
    const args = [cmd, "--stateless-rpc", ...(isAdvert ? ["--advertise-refs"] : []), bare];
    const child = spawn("git", args);
    res.writeHead(200, {
      "Content-Type": isAdvert ? `application/x-git-${cmd}-advertisement` : `application/x-git-${cmd}-result`,
      "Cache-Control": "no-cache",
    });
    if (isAdvert) res.write(pkt(`# service=git-${cmd}\n`) + "0000");
    child.stdout.pipe(res);
    if (isAdvert) child.stdin.end();
    else req.pipe(child.stdin);
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const port = (server.address() as { port: number }).port;

  if (!opts.empty) {
    const work = join(root, "seed");
    spawnSync("git", ["clone", "-q", bare, work]);
    opts.seed?.(work);
    const env = { ...process.env, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t" };
    spawnSync("git", ["-C", work, "add", "-A"], { env });
    spawnSync("git", ["-C", work, "commit", "-q", "-m", "seed", "--allow-empty"], { env });
    spawnSync("git", ["-C", work, "push", "-q", "origin", "HEAD:main"], { env });
  }

  return {
    url: `http://127.0.0.1:${port}/repo.git`,
    bare,
    close: async () => {
      server.close();
      await rm(root, { recursive: true, force: true });
    },
  };
}

export function gitOut(bare: string, ...args: string[]): string {
  return spawnSync("git", ["--git-dir", bare, ...args], { encoding: "utf8" }).stdout.trim();
}
