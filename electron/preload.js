const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('edupace', {
  version: () => '1.0.0',
  logs: {
    getDefaultPath: (preferredPath) => ipcRenderer.invoke('edupace:get-default-log-dir', preferredPath),
    pickDirectory: () => ipcRenderer.invoke('edupace:pick-log-dir'),
    readFromDisk: (preferredPath) => ipcRenderer.invoke('edupace:read-logs', preferredPath),
    writeToDisk: (logs, path) => ipcRenderer.invoke('edupace:write-logs', { logs, path }),
    openDirectory: (preferredPath) => ipcRenderer.invoke('edupace:open-log-dir', preferredPath)
  }
});
