const { app, BrowserWindow, Menu, shell } = require('electron');
const path = require('path');

let mainWindow = null;
let aboutWindow = null;

// -----------------------------------------------------------------------------
// Main window
// -----------------------------------------------------------------------------
function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1180,
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

  // Open external links in browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // HTML fullscreen → native fullscreen
  mainWindow.webContents.on('enter-html-full-screen', () => {
    if (!mainWindow.isFullScreen()) mainWindow.setFullScreen(true);
  });

  mainWindow.webContents.on('leave-html-full-screen', () => {
    if (mainWindow.isFullScreen()) mainWindow.setFullScreen(false);
  });

  // --------- Web Serial integration (Arduino / hardware console) ---------
  const ses = mainWindow.webContents.session;

  ses.setPermissionCheckHandler((_, permission) => {
    return permission === 'serial';
  });

  ses.setPermissionRequestHandler((_, permission, callback) => {
    callback(permission === 'serial');
  });

  ses.setDevicePermissionHandler(({ deviceType }) => {
    return deviceType === 'serial';
  });
}

// -----------------------------------------------------------------------------
// About window
// -----------------------------------------------------------------------------
function openAboutWindow() {
  if (aboutWindow && !aboutWindow.isDestroyed()) {
    aboutWindow.focus();
    return;
  }

  aboutWindow = new BrowserWindow({
    width: 420,
    height: 320,
    resizable: false,
    minimizable: false,
    maximizable: false,
    title: 'About EduPace',
    parent: mainWindow ?? undefined,
    modal: process.platform === 'darwin',
    show: true,
    webPreferences: {
      // no preload needed for about
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  // Remove menu from the dialog
  aboutWindow.setMenu(null);

  // Open any links externally
  aboutWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // Prevent navigation away from about.html (extra safety)
  aboutWindow.webContents.on('will-navigate', (event, url) => {
    event.preventDefault();
    shell.openExternal(url);
  });

  const version = app.getVersion();
  const build = process.env.BUILD_HASH || 'dev';
  const home = 'https://github.com/joonhaim/edupace';

  aboutWindow.loadFile(path.join(__dirname, 'about.html'), {
    query: { version, build, home }
  });

  aboutWindow.on('closed', () => {
    aboutWindow = null;
  });
}


// -----------------------------------------------------------------------------
// Application menu
// -----------------------------------------------------------------------------
function buildMenu() {
  const isMac = process.platform === 'darwin';

  const template = [
    // macOS App menu
    ...(isMac
      ? [{
          label: app.name,
          submenu: [
            { label: 'About EduPace', click: openAboutWindow },
            { type: 'separator' },
            { role: 'services' },
            { type: 'separator' },
            { role: 'hide' },
            { role: 'hideOthers' },
            { role: 'unhide' },
            { type: 'separator' },
            { role: 'quit' }
          ]
        }]
      : []),

    {
      label: 'File',
      submenu: [
        isMac ? { role: 'close' } : { role: 'quit' }
      ]
    },

    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },

    {
      label: 'Window',
      submenu: isMac
        ? [{ role: 'minimize' }, { role: 'zoom' }, { type: 'separator' }, { role: 'front' }]
        : [{ role: 'minimize' }, { role: 'close' }]
    },

    // Windows / Linux: About goes here
    {
      role: 'help',
      submenu: [
        { label: 'About EduPace', click: openAboutWindow },
        { type: 'separator' },
        {
          label: 'Documentation',
          click: () => shell.openExternal('https://github.com/your-org/edupace')
        }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

// -----------------------------------------------------------------------------
// App lifecycle
// -----------------------------------------------------------------------------
app.whenReady().then(() => {
  createMainWindow();
  buildMenu();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
      buildMenu();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
