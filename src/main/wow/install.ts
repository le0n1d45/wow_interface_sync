import { stat } from "node:fs/promises";
import { basename, join } from "node:path";
import type { InstallEnv } from "./wow.types";

export const FOREVER_FOLDER = "_forever_";

async function isDirectory(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory();
  } catch {
    return false;
  }
}

/** Default install locations to probe, per platform. Linux has no standard one (Wine/Lutris), so the user picks. */
export function candidateRoots({ platform, env }: InstallEnv): string[] {
  const game = "World of Warcraft";
  if (platform === "win32") {
    return [env["ProgramFiles(x86)"], env["ProgramFiles"], "C:\\Program Files (x86)", "C:\\Program Files"]
      .filter((p): p is string => !!p)
      .map((p) => join(p, game));
  }
  if (platform === "darwin") return [join("/Applications", game)];
  // WSL can see the Windows install.
  return env["WSL_DISTRO_NAME"]
    ? [join("/mnt/c/Program Files (x86)", game), join("/mnt/c/Program Files", game)]
    : [];
}

/** Accepts either the WoW root or the `_forever_` folder itself; returns the `_forever_` folder, or null. */
export async function resolveForeverDir(rootOrForeverDir: string): Promise<string | null> {
  const trimmed = rootOrForeverDir.replace(/[\\/]+$/, "");
  if (basename(trimmed) === FOREVER_FOLDER) return (await isDirectory(trimmed)) ? trimmed : null;
  const candidate = join(trimmed, FOREVER_FOLDER);
  return (await isDirectory(candidate)) ? candidate : null;
}

/** Finds the first default location that contains a `_forever_` folder. */
export async function detectForeverInstall(installEnv: InstallEnv): Promise<string | null> {
  for (const root of candidateRoots(installEnv)) {
    const dir = await resolveForeverDir(root);
    if (dir) return dir;
  }
  return null;
}
