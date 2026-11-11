import type { SyncApi } from "@shared/ipc.types";

declare global {
  interface Window {
    sync: SyncApi;
  }
}
