export type { AddonInstallSummary } from "@shared/sync.types";

/** The slice of CurseForge's mod/file data the installer needs (api.curseforge.com/v1/mods/{id}). */
export interface CfFile {
  id: number;
  displayName: string;
  fileName: string;
  /** 1 = release, 2 = beta, 3 = alpha. */
  releaseType: number;
  fileDate: string;
  /** Null when the author does not allow downloads from other apps. */
  downloadUrl: string | null;
  /** Size of the download in bytes. */
  fileLength?: number;
  sortableGameVersions: { gameVersionTypeId: number }[];
  /** The addon folders this file contains. */
  modules: { name: string }[];
}

export interface CfMod {
  id: number;
  name: string;
  allowModDistribution: boolean | null;
  latestFiles: CfFile[];
}

/** Called with bytes received so far and the total size (null when the server doesn't say). */
export type ByteProgress = (received: number, total: number | null) => void;

/** What the installer needs from CurseForge, so it can be tested without the network. */
export interface CurseApi {
  getMod(modId: number): Promise<CfMod>;
  /** Streams the file at `url` to `destFile`, reporting bytes as they arrive. */
  download(url: string, destFile: string, onBytes?: ByteProgress): Promise<void>;
}
