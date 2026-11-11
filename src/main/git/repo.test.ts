import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import * as fs from "node:fs";
import git from "isomorphic-git";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { SyncFile } from "../wow/wow.types";
import { pushFiles, syncClone } from "./repo";
import { gitOut, hasSystemGit, startTestRemote, type TestRemote } from "./test-server";

const SV = "WTF/Account/main/SavedVariables/Addon.lua";

let work: string;
let remote: TestRemote | undefined;
beforeEach(async () => {
  work = await mkdtemp(join(tmpdir(), "wis-git-"));
});
afterEach(async () => {
  await remote?.close();
  remote = undefined;
  await rm(work, { recursive: true, force: true });
});

async function localFile(repoPath: string, content: string): Promise<SyncFile> {
  const absolutePath = join(work, "local", ...repoPath.split("/"));
  await mkdir(dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, content);
  return { absolutePath, repoPath };
}

const opts = (url: string, name = "clone") => ({ cloneDir: join(work, name), repoUrl: url, token: "tok" });

describe.skipIf(!hasSystemGit)("git sync against a local smart-HTTP remote", () => {
  it("pushes into an empty remote, creating the first commit", async () => {
    remote = await startTestRemote({ empty: true });
    const r = await pushFiles(opts(remote.url), [await localFile(SV, "v1")], "first");
    expect(r).toMatchObject({ committed: true, changedFiles: 1 });
    expect(gitOut(remote.bare, "show", `main:${SV}`)).toBe("v1");
    expect(gitOut(remote.bare, "log", "--format=%an|%s", "-1")).toBe("WoW Interface Sync|first");
  });

  it("commits only changed files and skips a no-op push", async () => {
    remote = await startTestRemote({ empty: true });
    const o = opts(remote.url);
    const a = await localFile(SV, "v1");
    const b = await localFile("WTF/SavedVariables/B.lua", "b1");
    await pushFiles(o, [a, b], "one");

    expect(await pushFiles(o, [a, b], "noop")).toEqual({ committed: false, changedFiles: 0 });

    await writeFile(a.absolutePath, "v2");
    const r = await pushFiles(o, [a, b], "two");
    expect(r.changedFiles).toBe(1);
    expect(gitOut(remote.bare, "rev-list", "--count", "main")).toBe("2");
  });

  it("pulls remote changes into the clone with a fast-forward", async () => {
    remote = await startTestRemote({ seed: (d) => void 0 });
    const m1 = opts(remote.url, "m1");
    const m2 = opts(remote.url, "m2");
    await pushFiles(m1, [await localFile(SV, "from-m1")], "m1");
    await syncClone(m2);
    expect(await readFile(join(m2.cloneDir, ...SV.split("/")), "utf8")).toBe("from-m1");

    await pushFiles(m1, [await localFile(SV, "from-m1-v2")], "m1 again");
    await syncClone(m2);
    expect(await readFile(join(m2.cloneDir, ...SV.split("/")), "utf8")).toBe("from-m1-v2");
  });

  it("fast-forwards a stale clone before pushing, keeping the other machine's commit", async () => {
    remote = await startTestRemote({ empty: true });
    const m1 = opts(remote.url, "m1");
    const m2 = opts(remote.url, "m2");
    await pushFiles(m1, [await localFile("WTF/SavedVariables/Shared.lua", "base")], "base");
    await syncClone(m2); // m2 is now at "base"

    await pushFiles(m1, [await localFile("WTF/SavedVariables/Shared.lua", "m1-edit")], "m1 edit");
    // m2's clone is stale; pushing must not fail or lose m1's commit.
    const r = await pushFiles(m2, [await localFile("WTF/SavedVariables/Other.lua", "m2-file")], "m2");
    expect(r.committed).toBe(true);
    expect(gitOut(remote.bare, "show", "main:WTF/SavedVariables/Shared.lua")).toBe("m1-edit");
    expect(gitOut(remote.bare, "show", "main:WTF/SavedVariables/Other.lua")).toBe("m2-file");
  });

  it("never deletes repo files that are missing locally", async () => {
    remote = await startTestRemote({ empty: true });
    const o = opts(remote.url);
    await pushFiles(o, [await localFile("WTF/SavedVariables/A.lua", "a"), await localFile("WTF/SavedVariables/B.lua", "b")], "both");
    await pushFiles(o, [await localFile("WTF/SavedVariables/A.lua", "a2")], "only a");
    expect(gitOut(remote.bare, "show", "main:WTF/SavedVariables/B.lua")).toBe("b");
  });

  it("rebuilds a truly diverged clone (unpushed local commit + remote moved) and still pushes", async () => {
    remote = await startTestRemote({ empty: true });
    const m1 = opts(remote.url, "m1");
    const m2 = opts(remote.url, "m2");
    await pushFiles(m1, [await localFile("WTF/SavedVariables/Shared.lua", "base")], "base");
    await syncClone(m2);

    // m2 makes a commit that never reaches the remote (e.g. an earlier push failed).
    await writeFile(join(m2.cloneDir, "orphan.txt"), "unpushed");
    await git.add({ fs, dir: m2.cloneDir, filepath: "orphan.txt" });
    await git.commit({ fs, dir: m2.cloneDir, message: "unpushed", author: { name: "t", email: "t@t" } });

    await pushFiles(m1, [await localFile("WTF/SavedVariables/Shared.lua", "m1-edit")], "m1 edit");
    const r = await pushFiles(m2, [await localFile("WTF/SavedVariables/Other.lua", "m2-file")], "m2");

    expect(r.committed).toBe(true);
    expect(gitOut(remote.bare, "show", "main:WTF/SavedVariables/Shared.lua")).toBe("m1-edit");
    expect(gitOut(remote.bare, "show", "main:WTF/SavedVariables/Other.lua")).toBe("m2-file");
    expect(gitOut(remote.bare, "ls-tree", "-r", "--name-only", "main")).not.toContain("orphan.txt");
  });
});
