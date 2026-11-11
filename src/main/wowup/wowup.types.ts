/** Subset of WowUp's stored `Addon` that the export needs (wowup-lib/src/addons.ts). */
export interface WowUpAddon {
  name: string;
  installationId: string;
  providerName: string;
  externalId?: string;
  installedExternalReleaseId?: string;
  isIgnored?: boolean;
}

/** Subset of WowUp's `WowInstallation` (wowup-lib/src/models/warcraft.ts). */
export interface WowUpInstallation {
  id: string;
  /** Numeric WowClientType enum value. */
  clientType: number;
  location: string;
}

export interface ExportAddon {
  name: string;
  provider_name: string;
  id: string;
  version_id?: string;
}

/** The JSON WowUp encodes into its addon export string. */
export interface ExportPayload {
  collection_name: string;
  client_type: string;
  addons: ExportAddon[];
}
