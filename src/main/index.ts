import { hostname } from "node:os";
import { dirname, join } from "node:path";
import { app, BrowserWindow, clipboard, ipcMain, Menu, nativeTheme, safeStorage } from "electron";
import { IPC, type SaveConfigResult, type SaveTokenResult } from "@shared/ipc.types";
import type { Result, SyncProgress } from "@shared/sync.types";
import type { AppConfig } from "@shared/config.types";
import { validateToken } from "./auth/github-validate";
import type { FetchLike } from "./auth/token.types";
import { CurseForgeClient } from "./addons/curseforge";
import { downloadToFile } from "./addons/download";
import { clearToken, CURSE_KEY_FILE_NAME, loadToken, saveToken, tokenStatus } from "./auth/token-store";
import { deleteBackup, listBackups } from "./backup/backup";
import { createManualBackup } from "./backup/manual";
import { restoreBackup } from "./backup/restore";
import { getImportString, manualBackup, pullAll, pushAll, wipeRepo } from "./sync/sync";
import type { SyncDeps } from "./sync/sync.types";
import { detectForeverInstall, resolveForeverDir } from "./wow/install";
import { assertWowClosed, isWowRunning } from "./wow/process";
import { loadConfig, saveConfig, validateConfig } from "./config";

const configDir = () => app.getPath("userData");
const backupsDir = () => join(configDir(), "backups");

async function guard<T>(fn: () => Promise<T>): Promise<Result<T>> {
  try {
    return { ok: true, value: await fn() };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

async function syncDeps(onProgress?: (p: SyncProgress) => void): Promise<SyncDeps> {
  const config = await loadConfig(configDir());
  const issues = validateConfig(config);
  if (issues.length > 0) throw new Error(`Finish the settings first: ${issues.map((i) => i.message).join("; ")}`);
  const token = await loadToken(configDir(), safeStorage);
  if (!token) throw new Error("No GitHub token stored. Add one in the settings.");
  return {
    config,
    token,
    dataDir: configDir(),
    installEnv: { platform: process.platform, env: process.env },
    fetchFn: fetch as unknown as FetchLike,
    curseKey: await loadToken(configDir(), safeStorage, CURSE_KEY_FILE_NAME),
    download: downloadToFile,
    onProgress,
    assertWowClosed: () => assertWowClosed(),
    hostname: hostname(),
  };
}

/**
 * Forwards progress to the window. Download byte counts arrive many times a second, so those are sent at
 * most every 100 ms; a change of addon or step is always sent right away.
 */
function progressSender(send: (p: SyncProgress) => void): (p: SyncProgress) => void {
  let lastKey = "";
  let lastSent = 0;
  return (p) => {
    const key = p.stage === "addons" ? `${p.index}:${p.step}` : p.stage;
    const now = Date.now();
    if (key === lastKey && now - lastSent < 100) return;
    lastKey = key;
    lastSent = now;
    send(p);
  };
}

function registerIpc(): void {
  ipcMain.handle(IPC.configGet, () => loadConfig(configDir()));
  ipcMain.handle(IPC.configSave, async (_evt, config: AppConfig): Promise<SaveConfigResult> => {
    const issues = validateConfig(config);
    if (issues.length === 0) await saveConfig(configDir(), config);
    return { ok: issues.length === 0, issues };
  });
  ipcMain.handle(IPC.tokenStatus, () => tokenStatus(configDir()));
  ipcMain.handle(IPC.tokenClear, () => clearToken(configDir()));
  ipcMain.handle(IPC.tokenSave, async (_evt, token: string): Promise<SaveTokenResult> => {
    const config = await loadConfig(configDir());
    const check = await validateToken(token.trim(), config.repoUrl, config.gistId, fetch);
    if (!check.ok) return { ok: false, login: check.login, problems: check.problems };
    const stored = await saveToken(configDir(), token.trim(), safeStorage);
    return { ok: true, login: check.login, problems: [], protection: stored.protection };
  });
  ipcMain.handle(IPC.syncPush, () => guard(async () => pushAll(await syncDeps())));
  ipcMain.handle(IPC.syncPull, (evt) =>
    guard(async () => pullAll(await syncDeps(progressSender((p) => evt.sender.send(IPC.syncProgress, p))))),
  );
  ipcMain.handle(IPC.curseKeyStatus, () => tokenStatus(configDir(), CURSE_KEY_FILE_NAME));
  ipcMain.handle(IPC.curseKeyClear, () => clearToken(configDir(), CURSE_KEY_FILE_NAME));
  ipcMain.handle(IPC.curseKeySave, async (_evt, key: string) => {
    const check = await new CurseForgeClient(key.trim(), fetch as unknown as FetchLike, downloadToFile).validateKey();
    if (check.ok) await saveToken(configDir(), key.trim(), safeStorage, CURSE_KEY_FILE_NAME);
    return check;
  });
  ipcMain.handle(IPC.copyImportString, () =>
    guard(async () => {
      const { text, ...info } = await getImportString(await syncDeps());
      clipboard.writeText(text); // copied in the main process: the clipboard API needs no page permission there
      return info;
    }),
  );
  ipcMain.handle(IPC.repoWipe, () => guard(async () => wipeRepo(await syncDeps())));
  ipcMain.handle(IPC.backupsList, () => listBackups(backupsDir()));
  ipcMain.handle(IPC.backupsRestore, (_evt, id: string) =>
    guard(async () => {
      await assertWowClosed();
      const config = await loadConfig(configDir());
      const foreverDir = await resolveForeverDir(config.wowRoot);
      if (!foreverDir) throw new Error("WoW Forever folder not found. Check the settings.");
      return restoreBackup(backupsDir(), foreverDir, id);
    }),
  );
  ipcMain.handle(IPC.backupsCreate, () =>
    guard(async () => {
      // Full sync dependencies (token etc.) are only needed to upload; without them the backup stays local.
      try {
        return await manualBackup(await syncDeps());
      } catch (e) {
        const config = await loadConfig(configDir());
        const foreverDir = await resolveForeverDir(config.wowRoot);
        if (!foreverDir) throw new Error("WoW Forever folder not found. Check the settings.");
        const backup = await createManualBackup(backupsDir(), foreverDir);
        return { backup, remote: { status: "skipped" as const, reason: (e as Error).message } };
      }
    }),
  );
  ipcMain.handle(IPC.backupsDelete, (_evt, id: string) =>
    guard(async () => {
      await deleteBackup(backupsDir(), id);
      return true as const;
    }),
  );
  ipcMain.handle(IPC.wowDetect, async () => {
    const dir = await detectForeverInstall({ platform: process.platform, env: process.env });
    return dir ? dirname(dir) : null;
  });
  ipcMain.handle(IPC.wowRunning, () => isWowRunning());
}

function createWindow(): void {
  const win = new BrowserWindow({
    width: 860,
    height: 700,
    minWidth: 640,
    minHeight: 560,
    title: "WoW Interface Sync",
    backgroundColor: nativeTheme.shouldUseDarkColors ? "#0e1014" : "#f3f4f7",
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  if (process.env["ELECTRON_RENDERER_URL"]) {
    void win.loadURL(process.env["ELECTRON_RENDERER_URL"]);
  } else {
    void win.loadFile(join(__dirname, "../renderer/index.html"));
  }
}

void app.whenReady().then(() => {
  // No File/Edit/View/Window menu on Windows and Linux. macOS keeps its app menu (needed for Cmd+Q, copy/paste).
  if (process.platform !== "darwin") Menu.setApplicationMenu(null);
  registerIpc();
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
