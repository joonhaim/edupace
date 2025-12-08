const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('edupace', {
  version: () => '1.0.0',
});