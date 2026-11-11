import type { AppConfig } from "@shared/config.types";
import type { BackupManifest } from "../main/backup/backup.types";
import { h, msg } from "./dom";
import { describePull, describePush, formatAccountMap, parseAccountMap } from "./format";

const app = document.getElementById("app")!;
let wowRunning = false;
let busy = false;
let config: AppConfig;
let runningTimer: ReturnType<typeof setInterval> | undefined;
const syncButtons: HTMLButtonElement[] = [];

function refreshButtons(): void {
  for (const b of syncButtons) b.disabled = busy || wowRunning;
}

async function withBusy<T>(fn: () => Promise<T>): Promise<T> {
  busy = true;
  refreshButtons();
  try {
    return await fn();
  } finally {
    busy = false;
    refreshButtons();
  }
}

function syncButton(label: string, onClick: () => void, primary = false): HTMLButtonElement {
  const b = h("button", { class: primary ? "primary" : "", textContent: label, onclick: onClick });
  syncButtons.push(b);
  return b;
}

async function render(): Promise<void> {
  config = await window.sync.getConfig();
  const token = await window.sync.getTokenStatus();
  syncButtons.length = 0;

  const repoUrl = h("input", { value: config.repoUrl, placeholder: "https://github.com/you/wow-settings" });
  const gistId = h("input", { value: config.gistId, placeholder: "gist ID (the hex string in the gist URL)" });
  const wowRoot = h("input", { value: config.wowRoot, placeholder: "Folder containing _forever_" });
  const accounts = h("textarea", { value: formatAccountMap(config.accountMap), placeholder: "LOCALACCOUNT=shared-name" });
  const tokenInput = h("input", { type: "password", placeholder: token.stored ? "Stored. Enter a new token to replace it" : "ghp_..." });
  const settingsOut = h("div");

  const detect = h("button", {
    textContent: "Detect",
    onclick: async () => {
      const found = await window.sync.detectWowRoot();
      wowRoot.value = found ?? wowRoot.value;
      settingsOut.replaceChildren(found ? msg("ok", `Found WoW Forever in ${found}`) : msg("warn", "Could not find it automatically. Type the folder path."));
    },
  });

  const save = h("button", {
    class: "primary",
    textContent: "Save settings",
    onclick: async () => {
      const next: AppConfig = {
        repoUrl: repoUrl.value.trim(),
        gistId: gistId.value.trim(),
        wowRoot: wowRoot.value.trim(),
        accountMap: parseAccountMap(accounts.value),
      };
      const saved = await window.sync.saveConfig(next);
      if (!saved.ok) {
        settingsOut.replaceChildren(msg("err", saved.issues.map((i) => `${i.field}: ${i.message}`).join("; ")));
        return;
      }
      if (tokenInput.value.trim()) {
        const t = await window.sync.saveToken(tokenInput.value);
        if (!t.ok) {
          settingsOut.replaceChildren(msg("err", ...t.problems.map((p) => h("div", { textContent: p }))));
          return;
        }
        tokenInput.value = "";
        const weak = t.protection !== "os-encrypted";
        settingsOut.replaceChildren(
          msg(weak ? "warn" : "ok", `Saved. Token verified for ${t.login}.${weak ? " This system has no secure keyring, so the token is only lightly protected." : ""}`),
        );
      } else {
        settingsOut.replaceChildren(msg("ok", "Settings saved."));
      }
    },
  });

  const clearToken = h("button", {
    textContent: "Remove stored token",
    disabled: !token.stored,
    onclick: async () => {
      await window.sync.clearToken();
      void render();
    },
  });

  const syncOut = h("div");
  const backupsList = h("ul", { class: "backups" });

  async function loadBackups(): Promise<void> {
    const backups = await window.sync.listBackups();
    backupsList.replaceChildren(
      ...(backups.length === 0
        ? [h("li", { class: "muted", textContent: "No backups yet. One is made automatically before every pull that changes files." })]
        : backups.map(backupRow)),
    );
  }

  function backupRow(b: BackupManifest): HTMLLIElement {
    const when = new Date(b.createdAt).toLocaleString();
    const what = b.reason === "pull" ? `Before a pull: ${b.summary.changed} changed, ${b.summary.new} new` : "Before a restore";
    return h(
      "li",
      {},
      h(
        "div",
        {},
        h("div", { textContent: when }),
        h("div", { class: "muted", textContent: what }),
        h("details", {}, h("summary", { textContent: `${b.files.length} files` }), h("div", { class: "muted files", textContent: b.files.map((f) => f.path).join("\n") })),
      ),
      syncButton("Restore this backup", () => void restore(b.id, when)),
    );
  }

  async function restore(id: string, when: string): Promise<void> {
    if (!confirm(`Restore the backup from ${when}? Your current files are backed up first, so you can undo this.`)) return;
    const r = await withBusy(() => window.sync.restoreBackup(id));
    syncOut.replaceChildren(r.ok ? msg("ok", `Restored the backup from ${when}.`) : msg("err", r.error));
    await loadBackups();
  }

  const push = syncButton("Push to GitHub", async () => {
    syncOut.replaceChildren(msg("warn", "Pushing..."));
    const r = await withBusy(() => window.sync.push());
    syncOut.replaceChildren(r.ok ? msg("ok", describePush(r.value)) : msg("err", r.error));
  }, true);

  const pull = syncButton("Pull from GitHub", async () => {
    syncOut.replaceChildren(msg("warn", "Pulling..."));
    const r = await withBusy(() => window.sync.pull());
    if (!r.ok) {
      syncOut.replaceChildren(msg("err", r.error));
      return;
    }
    const { backupId, changed, created, identical } = r.value;
    const undo = backupId
      ? h("button", {
          textContent: "Undo",
          onclick: async () => {
            const u = await withBusy(() => window.sync.restoreBackup(backupId));
            syncOut.replaceChildren(u.ok ? msg("ok", "Pull undone. Your previous files are back.") : msg("err", u.error));
            await loadBackups();
          },
        })
      : null;
    syncOut.replaceChildren(msg("ok", describePull(changed, created, identical), undo));
    await loadBackups();
  });

  const runningBanner = h("div");
  const updateRunning = async () => {
    wowRunning = await window.sync.isWowRunning();
    runningBanner.replaceChildren(wowRunning ? msg("warn", "World of Warcraft is running. Close it to sync or restore, so the game does not overwrite the files.") : "");
    refreshButtons();
  };

  app.replaceChildren(
    h("div", {}, h("h1", { textContent: "WoW Interface Sync" }), h("div", { class: "muted", textContent: "WoW Forever: Edit Mode layouts and addon settings, kept in a private GitHub repo." })),
    runningBanner,
    h("section", { class: "card" }, h("h2", { textContent: "Sync" }), h("div", { class: "row" }, push, pull), syncOut),
    h("section", { class: "card" }, h("h2", { textContent: "Backups" }), backupsList),
    h(
      "section",
      { class: "card" },
      h("h2", { textContent: "Settings" }),
      h("label", { textContent: "Private repo URL" }, repoUrl),
      h("label", { textContent: "Gist ID (receives the WowUp export string)" }, gistId),
      h("div", { class: "row" }, h("label", { textContent: "WoW folder (contains _forever_)" }, wowRoot), detect),
      h("label", { textContent: "Account mapping, only if account folder names differ between your computers (one per line: LOCAL=shared)" }, accounts),
      h("label", { textContent: "GitHub token (classic, scopes: repo + gist)" }, tokenInput),
      h("div", { class: "muted", textContent: token.stored ? `A token is stored (${token.protection}).` : "No token stored yet." }),
      h("div", { class: "row" }, save, clearToken),
      settingsOut,
    ),
  );

  await loadBackups();
  await updateRunning();
  clearInterval(runningTimer);
  runningTimer = setInterval(() => void updateRunning(), 5000);
}

void render();
