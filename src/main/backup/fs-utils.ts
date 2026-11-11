import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

export async function sha256OfFile(path: string): Promise<string | null> {
  try {
    return createHash("sha256").update(await readFile(path)).digest("hex");
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw e;
  }
}

/** Writes via temp file + rename so a crash never leaves a half-written file in place. */
export async function copyFileAtomic(from: string, to: string): Promise<void> {
  await mkdir(dirname(to), { recursive: true });
  const tmp = `${to}.wis-tmp`;
  await copyFile(from, tmp);
  await rename(tmp, to);
}

export async function writeFileAtomic(to: string, data: string): Promise<void> {
  await mkdir(dirname(to), { recursive: true });
  const tmp = `${to}.wis-tmp`;
  await writeFile(tmp, data, "utf8");
  await rename(tmp, to);
}

export async function removeIfExists(path: string): Promise<void> {
  await rm(path, { force: true });
}

/** Converts a POSIX path relative to the `_forever_` folder into an absolute OS path. */
export function resolveLocal(foreverDir: string, posixPath: string): string {
  if (posixPath.split("/").some((s) => s === ".." || s === "." || s === "")) {
    throw new Error(`Unsafe path: ${posixPath}`);
  }
  return join(foreverDir, ...posixPath.split("/"));
}
