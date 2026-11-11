export type TokenProtection = "os-encrypted" | "weak-encrypted" | "plaintext";

export interface TokenStatus {
  stored: boolean;
  protection?: TokenProtection;
}
