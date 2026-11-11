import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);

/** Executable names WoW Forever runs as (it ships the retail binary). */
const WOW_PROCESS_NAMES = ["wow.exe", "wow", "world of warcraft"];

export function listHasWow(processNames: string[]): boolean {
  return processNames.some((n) => WOW_PROCESS_NAMES.includes(n.trim().toLowerCase()));
}

export async function isWowRunning(platform: NodeJS.Platform = process.platform): Promise<boolean> {
  try {
    if (platform === "win32") {
      const { stdout } = await run("tasklist", ["/FO", "CSV", "/NH"]);
      return listHasWow(stdout.split(/\r?\n/).map((l) => l.split('","')[0]?.replace(/^"/, "") ?? ""));
    }
    const { stdout } = await run("ps", ["-A", "-o", "comm="]);
    return listHasWow(stdout.split("\n").map((l) => l.split("/").pop() ?? ""));
  } catch {
    return false; // cannot tell: do not block the user on a missing tool
  }
}

export async function assertWowClosed(platform: NodeJS.Platform = process.platform): Promise<void> {
  if (await isWowRunning(platform)) {
    throw new Error("World of Warcraft is running. Close the game before syncing so it does not overwrite the files.");
  }
}
