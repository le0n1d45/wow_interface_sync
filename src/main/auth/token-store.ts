import { chmod, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { SafeStorageLike, TokenFile, TokenProtection, TokenStatus } from "./token.types";

export const TOKEN_FILE_NAME = "token.json";
export const CURSE_KEY_FILE_NAME = "curseforge-key.json";

export function tokenPath(dir: string, fileName = TOKEN_FILE_NAME): string {
  return join(dir, fileName);
}

function protectionFor(safe: SafeStorageLike): TokenProtection {
  if (!safe.isEncryptionAvailable()) return "plaintext";
  return safe.getSelectedStorageBackend?.() === "basic_text" ? "weak-encrypted" : "os-encrypted";
}

/**
 * Stores the GitHub token encrypted with the OS (DPAPI / Keychain / libsecret via Electron safeStorage).
 * Where no keyring exists it falls back to a file readable only by the user, and reports the weaker
 * protection so the UI can warn. The token is never written to the regular config file or logged.
 */
export async function saveToken(dir: string, token: string, safe: SafeStorageLike, fileName = TOKEN_FILE_NAME): Promise<TokenStatus> {
  const protection = protectionFor(safe);
  const file: TokenFile = {
    v: 1,
    protection,
    data: protection === "plaintext" ? token : safe.encryptString(token).toString("base64"),
  };
  const target = tokenPath(dir, fileName);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, JSON.stringify(file), { encoding: "utf8", mode: 0o600 });
  await chmod(target, 0o600).catch(() => {}); // no-op on Windows
  return { stored: true, protection };
}

async function readTokenFile(dir: string, fileName: string): Promise<TokenFile | null> {
  try {
    const file = JSON.parse(await readFile(tokenPath(dir, fileName), "utf8")) as TokenFile;
    return file.v === 1 ? file : null;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw e;
  }
}

export async function tokenStatus(dir: string, fileName = TOKEN_FILE_NAME): Promise<TokenStatus> {
  const file = await readTokenFile(dir, fileName);
  return file ? { stored: true, protection: file.protection } : { stored: false };
}

/** Returns the token, or null if none is stored or it can no longer be decrypted (e.g. different OS user). */
export async function loadToken(dir: string, safe: SafeStorageLike, fileName = TOKEN_FILE_NAME): Promise<string | null> {
  const file = await readTokenFile(dir, fileName);
  if (!file) return null;
  if (file.protection === "plaintext") return file.data;
  try {
    return safe.decryptString(Buffer.from(file.data, "base64"));
  } catch {
    return null;
  }
}

export async function clearToken(dir: string, fileName = TOKEN_FILE_NAME): Promise<void> {
  await rm(tokenPath(dir, fileName), { force: true });
}
