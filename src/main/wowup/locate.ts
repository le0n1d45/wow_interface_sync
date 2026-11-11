import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import type { InstallEnv } from "../wow/wow.types";

/** Folder names WowUp's Electron userData may use (package name vs product name). */
const APP_DIR_NAMES = ["WowUpCf", "WowUp-CF", "wowup-cf", "WowUp"];

async function isFile(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}

async function appDataRoots({ platform, env }: InstallEnv): Promise<string[]> {
  const home = env["HOME"] ?? env["USERPROFILE"] ?? "";
  if (platform === "win32") return env["APPDATA"] ? [env["APPDATA"]] : [];
  if (platform === "darwin") return [join(home, "Library", "Application Support")];
  const roots = [env["XDG_CONFIG_HOME"] ?? join(home, ".config")];
  if (env["WSL_DISTRO_NAME"]) {
    try {
      for (const user of await readdir("/mnt/c/Users")) roots.push(join("/mnt/c/Users", user, "AppData", "Roaming"));
    } catch {
      // no Windows drive mounted
    }
  }
  return roots;
}

/** Finds WowUp's data folder: the one that holds both `addons.json` and `preferences.json`. */
export async function locateWowUpData(installEnv: InstallEnv, override?: string): Promise<string | null> {
  const candidates = override
    ? [override]
    : (await appDataRoots(installEnv)).flatMap((root) => APP_DIR_NAMES.map((n) => join(root, n)));
  for (const dir of candidates) {
    if ((await isFile(join(dir, "addons.json"))) && (await isFile(join(dir, "preferences.json")))) return dir;
  }
  return null;
}
