const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('edupace', {
  version: () => '1.0.0',
  setWindowFullscreen: (enabled) => ipcRenderer.invoke('edupace:set-fullscreen', Boolean(enabled)),
});

ipcRenderer.on('edupace:fullscreen-changed', (_event, isFullscreen) => {
  window.dispatchEvent(new CustomEvent('edupace-fullscreen-changed', { detail: { isFullscreen } }));
});
