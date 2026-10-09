// Use Chromium's serial implementation on Windows and macOS. Do not infer
// device identity from a USB vendor: clones and OS drivers can omit that data.
function installSerialAccess(window, dialog) {
  const contents = window.webContents;
  const session = contents.session;
  const isApp = (origin = '') => origin === 'file://' || origin.startsWith('file:///');
  session.setPermissionCheckHandler((requester, permission, origin) =>
    requester === contents && permission === 'serial' && isApp(origin));
  session.setPermissionRequestHandler((requester, permission, callback, details) => {
    callback(requester === contents && permission === 'serial' && isApp(details.requestingUrl));
  });
  // Keep Electron's default device grants: only ports explicitly selected by
  // the user are exposed through getPorts(), for this WebContents' lifetime.
  const pending = new Set();
  const select = async (event, ports, requester, callback) => {
    event.preventDefault();
    if (requester !== contents || !isApp(contents.getURL()) || pending.size) {
      callback('');
      return;
    }
    const available = new Set(ports.map(port => port.portId));
    const removed = (_, port) => available.delete(port.portId);
    let finished = false;
    const finish = id => {
      if (finished) return;
      finished = true;
      session.removeListener('serial-port-removed', removed);
      pending.delete(finish);
      callback(id);
    };
    pending.add(finish);
    session.on('serial-port-removed', removed);
    try {
      const result = await dialog.showMessageBox(window, {
        type: 'info',
        title: 'Connect EduPace via USB',
        message: ports.length ? 'Select the Arduino serial port' : 'No serial ports detected',
        detail: ports.length
          ? 'Choose the port belonging to your EduPace console. Close Arduino Serial Monitor or any other app using this port first.'
          : 'Connect a USB data cable to the Arduino USB port, then try again. Check that the board appears in your operating system; a USB serial driver may be required.',
        buttons: ['Cancel', ...ports.map(port =>
          `${port.displayName || 'Serial device'} — ${port.portName}${port.serialNumber ? ` (${port.serialNumber})` : ''}`)],
        defaultId: ports.length ? 1 : 0,
        cancelId: 0,
        noLink: true
      });
      const port = ports[result.response - 1];
      finish(port && available.has(port.portId) ? port.portId : '');
    } catch (error) {
      console.error('Unable to select serial port', error);
      finish('');
    }
  };
  session.on('select-serial-port', select);
  window.once('closed', () => {
    for (const finish of pending) finish('');
    session.removeListener('select-serial-port', select);
  });
}

module.exports = { installSerialAccess };
