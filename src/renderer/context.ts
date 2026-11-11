import type { AppConfig } from "@shared/config.types";
import type { TokenStatus } from "@shared/token.types";

export type ViewName = "sync" | "backups" | "settings";

/** Shared state and helpers handed to each view. */
export interface Ctx {
  config: AppConfig;
  token: TokenStatus;
  /** Re-reads settings/token status from the main process and refreshes the header. */
  reload(): Promise<void>;
  go(view: ViewName): void;
  /** Shows a one-time message at the top of the next view. */
  flash(message: string): void;
  /** Disables the button while a job runs or WoW is open. */
  guard<T extends HTMLButtonElement>(button: T): T;
  withBusy<T>(fn: () => Promise<T>): Promise<T>;
}
