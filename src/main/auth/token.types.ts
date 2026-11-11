import type { TokenProtection } from "@shared/token.types";

export type { TokenProtection, TokenStatus } from "@shared/token.types";

/** The subset of Electron's `safeStorage` we use, so the store can be tested without Electron. */
export interface SafeStorageLike {
  isEncryptionAvailable(): boolean;
  encryptString(plain: string): Buffer;
  decryptString(encrypted: Buffer): string;
  /** Linux only: "basic_text" means Electron has no keyring and the "encryption" is just obfuscation. */
  getSelectedStorageBackend?(): string;
}

export interface TokenFile {
  v: 1;
  protection: TokenProtection;
  /** base64 ciphertext, or the raw token when protection is "plaintext". */
  data: string;
}

export interface TokenValidation {
  ok: boolean;
  /** GitHub login the token belongs to, when it was accepted. */
  login?: string;
  problems: string[];
}

export type FetchLike = (url: string, init: { headers: Record<string, string>; method?: string; body?: string }) => Promise<{
  status: number;
  headers: { get(name: string): string | null };
  json(): Promise<unknown>;
  text(): Promise<string>;
}>;
