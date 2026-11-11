/** Outcome of publishing the WowUp export string, kept separate so it never fails the file sync. */
export type GistOutcome =
  | { status: "updated" }
  | { status: "unchanged" }
  | { status: "skipped"; reason: string }
  | { status: "failed"; reason: string };

export interface PushSummary {
  filesSelected: number;
  committed: boolean;
  changedFiles: number;
  gist: GistOutcome;
}

/** Every IPC action returns this instead of throwing, so the UI can show the message. */
export type Result<T> = { ok: true; value: T } | { ok: false; error: string };
