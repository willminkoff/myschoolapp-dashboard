// Preload for the setup wizard: the only bridge between the wizard page and
// the main process. CommonJS on purpose — Electron preloads don't load ESM
// from a `"type": "module"` package.
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("api", {
  getState: () => ipcRenderer.invoke("wizard:getState"),
  saveConfig: (cfg) => ipcRenderer.invoke("wizard:saveConfig", cfg),
  signIn: (schoolId) => ipcRenderer.invoke("wizard:signIn", schoolId),
  finish: () => ipcRenderer.invoke("wizard:finish"),
});
