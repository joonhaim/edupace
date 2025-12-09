const { app, BrowserWindow, protocol, shell } = require('electron');
const path = require('path');

// Treat the bundled simulator assets as a secure origin so Web Serial and
// other modern APIs are available when loading over the custom protocol.
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'app',
    privileges: {
      secure: true,
      standard: true,
      supportFetchAPI: true,
    },
  },
]);

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    backgroundColor: '#10131b',
    fullscreenable: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: false,
      experimentalFeatures: true,
      enableBlinkFeatures: 'Serial',
    },
  });

  const appRoot = path.join(__dirname, '..', 'simulator-interface');

  protocol.registerFileProtocol('app', (request, callback) => {
    const url = new URL(request.url);
    const safePath = url.pathname.replace(/^\/+/, '');
    const relativePath = safePath.startsWith('simulator-interface/')
      ? safePath.slice('simulator-interface/'.length)
      : safePath;
    const filePath = path.normalize(path.join(appRoot, relativePath));
    callback({ path: filePath });
  });

  mainWindow.loadURL('app://index.html');

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // --------- Web Serial integration for Electron ---------
  const ses = mainWindow.webContents.session;

  ses.setDevicePermissionHandler(({ deviceType }) => {
    if (deviceType === 'serial') {
      return true;
    }
    return false;
  });

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
