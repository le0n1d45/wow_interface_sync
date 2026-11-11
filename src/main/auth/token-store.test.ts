import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { clearToken, loadToken, saveToken, tokenPath, tokenStatus } from "./token-store";
import type { SafeStorageLike } from "./token.types";

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "wis-token-"));
});
afterEach(() => rm(dir, { recursive: true, force: true }));

const fakeSafe = (over: Partial<SafeStorageLike> = {}): SafeStorageLike => ({
  isEncryptionAvailable: () => true,
  encryptString: (s) => Buffer.from(s.split("").reverse().join("")),
  decryptString: (b) => b.toString().split("").reverse().join(""),
  ...over,
});

describe("token store", () => {
  it("reports nothing stored initially", async () => {
    expect(await tokenStatus(dir)).toEqual({ stored: false });
    expect(await loadToken(dir, fakeSafe())).toBeNull();
  });

  it("encrypts on disk and round-trips", async () => {
    const status = await saveToken(dir, "ghp_secret123", fakeSafe());
    expect(status).toEqual({ stored: true, protection: "os-encrypted" });
    expect(await readFile(tokenPath(dir), "utf8")).not.toContain("ghp_secret123");
    expect(await loadToken(dir, fakeSafe())).toBe("ghp_secret123");
    expect(await tokenStatus(dir)).toEqual({ stored: true, protection: "os-encrypted" });
  });

  it("flags the weak Linux basic_text backend", async () => {
    const safe = fakeSafe({ getSelectedStorageBackend: () => "basic_text" });
    expect((await saveToken(dir, "t", safe)).protection).toBe("weak-encrypted");
  });

  it("falls back to a user-only plaintext file when encryption is unavailable", async () => {
    const safe = fakeSafe({ isEncryptionAvailable: () => false });
    expect((await saveToken(dir, "tok", safe)).protection).toBe("plaintext");
    expect(await loadToken(dir, safe)).toBe("tok");
    if (process.platform !== "win32") expect((await stat(tokenPath(dir))).mode & 0o777).toBe(0o600);
  });

  it("returns null when the ciphertext can no longer be decrypted", async () => {
    await saveToken(dir, "tok", fakeSafe());
    const broken = fakeSafe({ decryptString: () => { throw new Error("different user"); } });
    expect(await loadToken(dir, broken)).toBeNull();
  });

  it("ignores an unknown file version", async () => {
    await writeFile(tokenPath(dir), JSON.stringify({ v: 2, protection: "plaintext", data: "x" }));
    expect(await tokenStatus(dir)).toEqual({ stored: false });
  });

  it("clears the token, and clearing twice is fine", async () => {
    await saveToken(dir, "tok", fakeSafe());
    await clearToken(dir);
    await clearToken(dir);
    expect(await tokenStatus(dir)).toEqual({ stored: false });
  });
});
