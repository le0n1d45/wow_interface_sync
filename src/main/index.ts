import { hostname } from "node:os";
import { dirname, join } from "node:path";
import { app, BrowserWindow, ipcMain, safeStorage } from "electron";
import { IPC, type SaveConfigResult, type SaveTokenResult } from "@shared/ipc.types";
import type { Result } from "@shared/sync.types";
import type { AppConfig } from "@shared/config.types";
import { validateToken } from "./auth/github-validate";
import type { FetchLike } from "./auth/token.types";
import { clearToken, loadToken, saveToken, tokenStatus } from "./auth/token-store";
import { listBackups } from "./backup/backup";
import { restoreBackup } from "./backup/restore";
import { pullAll, pushAll } from "./sync/sync";
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

async function syncDeps(): Promise<SyncDeps> {
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
    assertWowClosed: () => assertWowClosed(),
    hostname: hostname(),
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
  ipcMain.handle(IPC.syncPull, () => guard(async () => pullAll(await syncDeps())));
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
  ipcMain.handle(IPC.wowDetect, async () => {
    const dir = await detectForeverInstall({ platform: process.platform, env: process.env });
    return dir ? dirname(dir) : null;
  });
  ipcMain.handle(IPC.wowRunning, () => isWowRunning());
}

function createWindow(): void {
  const win = new BrowserWindow({
    width: 720,
    height: 560,
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
  registerIpc();
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
