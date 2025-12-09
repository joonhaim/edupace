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

  ses.setPermissionCheckHandler((webContents, permission, requestingOrigin, details) => {
    if (permission === 'serial') {
      return true;
    }
    return false;
  });

  ses.setPermissionRequestHandler((webContents, permission, callback, details) => {
    if (permission === 'serial') {
      callback(true);
      return;
    }

    callback(false);
  });
}

app.on('select-serial-port', (event, portList, webContents, callback, details) => {
  event.preventDefault();

  const requestedPortId = details?.portId;
  const matchingPort = requestedPortId
    ? portList.find((port) => port.portId === requestedPortId)
    : null;

  if (matchingPort) {
    callback(matchingPort.portId);
    return;
  }

  if (portList.length > 0) {
    callback(portList[0].portId);
    return;
  }

  callback('');
});


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
