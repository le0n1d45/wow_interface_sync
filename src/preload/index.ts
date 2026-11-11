import { contextBridge, ipcRenderer } from "electron";
import { IPC, type SyncApi } from "@shared/ipc.types";

const api: SyncApi = {
  getConfig: () => ipcRenderer.invoke(IPC.configGet),
  saveConfig: (config) => ipcRenderer.invoke(IPC.configSave, config),
  getTokenStatus: () => ipcRenderer.invoke(IPC.tokenStatus),
  saveToken: (token) => ipcRenderer.invoke(IPC.tokenSave, token),
  clearToken: () => ipcRenderer.invoke(IPC.tokenClear),
  push: () => ipcRenderer.invoke(IPC.syncPush),
  pull: () => ipcRenderer.invoke(IPC.syncPull),
  onProgress: (callback) => {
    const listener = (_evt: Electron.IpcRendererEvent, progress: Parameters<typeof callback>[0]) => callback(progress);
    ipcRenderer.on(IPC.syncProgress, listener);
    return () => ipcRenderer.removeListener(IPC.syncProgress, listener);
  },
  listBackups: () => ipcRenderer.invoke(IPC.backupsList),
  restoreBackup: (id) => ipcRenderer.invoke(IPC.backupsRestore, id),
  getCurseKeyStatus: () => ipcRenderer.invoke(IPC.curseKeyStatus),
  saveCurseKey: (key) => ipcRenderer.invoke(IPC.curseKeySave, key),
  clearCurseKey: () => ipcRenderer.invoke(IPC.curseKeyClear),
  copyImportString: () => ipcRenderer.invoke(IPC.copyImportString),
  wipeRepo: () => ipcRenderer.invoke(IPC.repoWipe),
  createBackup: () => ipcRenderer.invoke(IPC.backupsCreate),
  deleteBackup: (id) => ipcRenderer.invoke(IPC.backupsDelete, id),
  detectWowRoot: () => ipcRenderer.invoke(IPC.wowDetect),
  isWowRunning: () => ipcRenderer.invoke(IPC.wowRunning),
};

contextBridge.exposeInMainWorld("sync", api);
