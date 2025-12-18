const { app, BrowserWindow, shell } = require('electron');
const path = require('path');

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    backgroundColor: '#000000',
    fullscreenable: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: false,
      experimentalFeatures: true
    },
  });

  const indexPath = path.join(__dirname, '..', 'simulator-interface', 'index.html');
  mainWindow.loadFile(indexPath);

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.webContents.on('enter-html-full-screen', () => {
    if (!mainWindow.isFullScreen()) {
      mainWindow.setFullScreen(true);
    }
  });

  mainWindow.webContents.on('leave-html-full-screen', () => {
    if (mainWindow.isFullScreen()) {
      mainWindow.setFullScreen(false);
    }
  });

  // --------- Web Serial integration for Electron ---------
  const ses = mainWindow.webContents.session;

  ses.setPermissionCheckHandler((webContents, permission) => {
    if (permission === 'serial') {
      return true;
    }
    return false;
  });

  ses.setPermissionRequestHandler((webContents, permission, callback) => {
    if (permission === 'serial') {
      callback(true);
      return;
    }

    callback(false);
  });

  ses.setDevicePermissionHandler(({ deviceType }) => {
    if (deviceType === 'serial') {
      return true;
    }
    return false;
  });
}


app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
