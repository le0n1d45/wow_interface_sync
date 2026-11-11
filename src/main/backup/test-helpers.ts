import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

export interface Sandbox {
  root: string;
  clone: string;
  forever: string;
  backups: string;
  write(base: "clone" | "forever", rel: string, content: string): Promise<void>;
  read(base: "clone" | "forever", rel: string): Promise<string | null>;
  cleanup(): Promise<void>;
}

export async function makeSandbox(): Promise<Sandbox> {
  const root = await mkdtemp(join(tmpdir(), "wis-sandbox-"));
  const dirs = { clone: join(root, "clone"), forever: join(root, "_forever_") };
  return {
    root,
    ...dirs,
    backups: join(root, "backups"),
    async write(base, rel, content) {
      const p = join(dirs[base], ...rel.split("/"));
      await mkdir(dirname(p), { recursive: true });
      await writeFile(p, content);
    },
    async read(base, rel) {
      try {
        return await readFile(join(dirs[base], ...rel.split("/")), "utf8");
      } catch {
        return null;
      }
    },
    cleanup: () => rm(root, { recursive: true, force: true }),
  };
}
