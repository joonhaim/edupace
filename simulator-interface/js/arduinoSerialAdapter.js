const ui = {
    connectionStatus: null,
    connectionStatusText: null,
    connectionDeviceName: null,
    powerStatus: null,
    lockStatus: null,
    connectBtn: null,
    rate: null,
    output: null,
    sensitivity: null,
    sensitivityUnit: null,
    paceMode: null,
    paceLed: null,
    senseLed: null,
    ledTestPace: null,
    ledTestSense: null,
    inputModeRadios: [],
    connectionGroup: null,
    devicePopover: null,
    devicePopoverClose: null,
    deviceOverlay: null,
    deviceList: null,
    deviceListEmpty: null,
    refreshDevicesBtn: null,
    requestDeviceBtn: null,
    unsupportedHint: null,
    unsupportedHintClose: null
};

let defaultPaceMode = '--';
const ASYNC_SENSITIVITY_THRESHOLD = 20;

const serialState = {
    port: null,
    reader: null,
    writer: null,
    keepReading: false,
    buffer: '',
    label: ''
};

const LAST_PORT_STORAGE_KEY = 'edupace:last-serial-port';

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const parameterState = {
    rate: null,
    output: null,
    sensitivity: null,
    mode: null,
    power: null,
    locked: null,
    asynchronous: false
};
let isPoweredOn = false;
let unsupportedHintDismissed = false;
let hasInitialized = false;
const resettableParameterKeys = Object.keys(parameterState);
// Include common USB-serial bridge vendors used on Arduino-compatible boards.
const EDUPACE_VENDOR_IDS = new Set([0x2341, 0x2a03, 0x1a86, 0x10c4, 0x0403, 0x067b]);
const EDUPACE_PRODUCT_IDS = new Set([0x0266, 0x0366, 0x0066]);
const EDUPACE_PORT_FILTERS = Array.from(EDUPACE_VENDOR_IDS, (vendorId) => ({ vendorId }));

function refreshUiBindings() {
    ui.connectionStatus = document.getElementById('connectionStatus');
    ui.connectionStatusText = document.querySelector('#connectionStatus .status-text');
    ui.connectionDeviceName = document.getElementById('connectionDeviceName');
    ui.powerStatus = document.getElementById('powerStatus');
    ui.lockStatus = document.getElementById('lockStatus');
    ui.connectBtn = document.getElementById('connectBtn');
    ui.rate = document.getElementById('rateValue');
    ui.output = document.getElementById('outputValue');
    ui.sensitivity = document.getElementById('sensValue');
    ui.sensitivityUnit = document.querySelector('#sensValue + .param-unit');
    ui.paceMode = document.getElementById('paceMode');
    ui.paceLed = document.getElementById('paceLed');
    ui.senseLed = document.getElementById('senseLed');
    ui.ledTestPace = document.getElementById('ledTestPace');
    ui.ledTestSense = document.getElementById('ledTestSense');
    ui.inputModeRadios = document.querySelectorAll('input[name="inputMode"]');
    ui.connectionGroup = document.querySelector('.connection-group');
    ui.devicePopover = document.getElementById('devicePopover');
    ui.devicePopoverClose = document.getElementById('devicePopoverClose');
    ui.deviceOverlay = document.getElementById('devicePopoverOverlay');
    ui.deviceList = document.getElementById('deviceList');
    ui.deviceListEmpty = document.getElementById('deviceListEmpty');
    ui.refreshDevicesBtn = document.getElementById('refreshDevicesBtn');
    ui.requestDeviceBtn = document.getElementById('requestDeviceBtn');
}

function createUnsupportedHint() {
    if (!ui.connectionGroup || ui.unsupportedHint) return;

    const hint = document.createElement('div');
    hint.className = 'hint-toast connection-unsupported-hint';
    hint.setAttribute('role', 'alert');

    const text = document.createElement('span');
    text.textContent =
        'This browser does not support connection with the EduPace device. Please use Chrome, Edge, or any other browser that supports the Web Serial API.';

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'hint-toast-close';
    closeBtn.setAttribute('aria-label', 'Dismiss unsupported browser notice');
    closeBtn.innerHTML = '&times;';
    closeBtn.addEventListener('click', () => {
        unsupportedHintDismissed = true;
        setUnsupportedHintVisible(false);
    });

    hint.appendChild(text);
    hint.appendChild(closeBtn);

    ui.connectionGroup.appendChild(hint);
    ui.unsupportedHint = hint;
    ui.unsupportedHintClose = closeBtn;
}

function setUnsupportedHintVisible(visible) {
    if (!ui.unsupportedHint) return;

    const shouldShow = visible && !unsupportedHintDismissed;
    ui.unsupportedHint.classList.toggle('is-visible', shouldShow);
}

function toggleDevicePopover(visible) {
    if (!ui.devicePopover) return;

    const shouldShow = typeof visible === 'boolean' ? visible : !ui.devicePopover.classList.contains('is-visible');
    ui.devicePopover.classList.toggle('is-visible', shouldShow);
    ui.devicePopover.setAttribute('aria-hidden', shouldShow ? 'false' : 'true');

    if (ui.deviceOverlay) {
        ui.deviceOverlay.toggleAttribute('hidden', !shouldShow);
    }

    if (shouldShow) {
        populateDeviceList();
    }
}

function isEduPaceDevice(info) {
    if (!info) return false;
    if (!EDUPACE_VENDOR_IDS.has(info.usbVendorId)) return false;
    if (!info.usbProductId) return true;
    if (!EDUPACE_PRODUCT_IDS.size) return true;
    if (EDUPACE_PRODUCT_IDS.has(info.usbProductId)) return true;
    // Fall back to vendor-only matching so newer Arduino IDs still surface as EduPace devices.
    return true;
}

function formatUsbId(info) {
    const vendor = info?.usbVendorId ? info.usbVendorId.toString(16).padStart(4, '0') : '----';
    const product = info?.usbProductId ? info.usbProductId.toString(16).padStart(4, '0') : '----';
    return `${vendor}:${product}`;
}

function describeSerialPort(port, index = 0) {
    if (!port || typeof port.getInfo !== 'function') {
        return {
            name: `Serial device ${index + 1}`,
            meta: 'Awaiting device details'
        };
    }

    const info = port.getInfo();
    const serial = info?.serialNumber;
    const isEduPace = isEduPaceDevice(info);
    const identifier = getDeviceIdentifier(info, serial, index);

    let name = 'USB Serial Device';
    if (isEduPace) {
        name = identifier ? `EduPace Device · ${identifier}` : 'EduPace Device';
    } else if (info?.usbVendorId || info?.usbProductId) {
        name = `USB ${formatUsbId(info)}`;
    }

    return {
        name,
        meta: serial ? `Serial: ${serial}` : isEduPace ? `USB ${formatUsbId(info)}` : 'Click to connect to this port'
    };
}

function getDeviceIdentifier(info, serial, index) {
    if (serial) {
        const trimmed = String(serial).replace(/\s+/g, '');
        return trimmed.length > 4 ? trimmed.slice(-4).toUpperCase() : trimmed.toUpperCase();
    }
    const usb = formatUsbId(info);
    const suffix = usb.split(':')[1] ?? '';
    return suffix ? suffix.toUpperCase() : `#${index + 1}`;
}

function rememberLastPort(port) {
    try {
        const info = port?.getInfo?.();
        if (!info) return;

        const payload = {
            vendorId: info.usbVendorId ?? null,
            productId: info.usbProductId ?? null,
            serial: info.serialNumber ?? null
        };

        localStorage.setItem(LAST_PORT_STORAGE_KEY, JSON.stringify(payload));
    } catch (error) {
        console.error('Unable to remember serial device', error);
    }
}

function clearRememberedPort() {
    localStorage.removeItem(LAST_PORT_STORAGE_KEY);
}

function getRememberedPortInfo() {
    try {
        const raw = localStorage.getItem(LAST_PORT_STORAGE_KEY);
        return raw ? JSON.parse(raw) : null;
    } catch (error) {
        console.error('Unable to read stored serial device', error);
        return null;
    }
}

function portsMatchSavedInfo(port, saved) {
    if (!port || !saved) return false;

    const info = port.getInfo?.();
    if (!info) return false;

    const vendorMatches = saved.vendorId ? info.usbVendorId === saved.vendorId : true;
    const productMatches = saved.productId ? info.usbProductId === saved.productId : true;
    const serialMatches = saved.serial ? info.serialNumber === saved.serial : true;

    return vendorMatches && productMatches && serialMatches;
}

function renderDeviceList(ports) {
    if (!ui.deviceList || !ui.deviceListEmpty) return;

    ui.deviceList.innerHTML = '';
    const list = Array.isArray(ports) ? ports : [];

    if (list.length === 0) {
        ui.deviceListEmpty.hidden = false;
        return;
    }

    ui.deviceListEmpty.hidden = true;

    const sorted = [...list].sort((a, b) => {
        const aIsEdu = isEduPaceDevice(a?.getInfo?.());
        const bIsEdu = isEduPaceDevice(b?.getInfo?.());
        if (aIsEdu === bIsEdu) return 0;
        return aIsEdu ? -1 : 1;
    });

    sorted.forEach((port, index) => {
        const { name, meta } = describeSerialPort(port, index);
        const option = document.createElement('div');
        option.className = 'device-option';

        const icon = document.createElement('div');
        icon.className = 'device-icon';
        icon.innerHTML =
            '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="2" width="16" height="12" rx="2" /><path d="M7 16h10" /><path d="M9 20h6" /><path d="M12 14v6" /></svg>';

        const textColumn = document.createElement('div');
        textColumn.className = 'device-info';
        const title = document.createElement('div');
        title.className = 'device-title';
        title.textContent = name;

        const metaText = document.createElement('div');
        metaText.className = 'device-meta';
        metaText.textContent = meta;

        textColumn.append(title, metaText);

        const connectButton = document.createElement('button');
        connectButton.type = 'button';
        connectButton.className = 'btn btn-small';
        connectButton.textContent = 'CONNECT';
        connectButton.addEventListener('click', () => handleDeviceSelection(port, name));

        option.append(icon, textColumn, connectButton);
        ui.deviceList.appendChild(option);
    });
}

async function populateDeviceList({ requestAccess = false } = {}) {
    if (!ui.deviceList) return;
    const isElectron = /electron/i.test(navigator.userAgent ?? '');

    if (!('serial' in navigator)) {
        ui.deviceList.innerHTML = '';
        if (ui.deviceListEmpty) {
            ui.deviceListEmpty.hidden = false;
            ui.deviceListEmpty.textContent = 'This browser does not support serial devices.';
        }
        return;
    }

    if (requestAccess) {
        try {
            await navigator.serial.requestPort({ filters: EDUPACE_PORT_FILTERS });
        } catch (error) {
            if (error?.name !== 'NotFoundError') {
                console.error('Unable to request serial device', error);
            }
        }
    }

    try {
        const ports = await navigator.serial.getPorts();
        const connectedPorts = ports.filter((port) => Boolean(port));
        const filteredPorts = isElectron
            ? connectedPorts.filter((port) => isEduPaceDevice(port?.getInfo?.()))
            : connectedPorts;

        if (isElectron && filteredPorts.length === 0) {
            ui.deviceList.innerHTML = '';
            ui.deviceListEmpty.hidden = false;
            ui.deviceListEmpty.textContent =
                'No EduPace devices detected. Connect the console and press Scan to request access.';
            return;
        }

        renderDeviceList(filteredPorts);
    } catch (error) {
        console.error('Unable to list serial ports', error);
        if (ui.deviceListEmpty) {
            ui.deviceListEmpty.hidden = false;
            ui.deviceListEmpty.textContent = 'Unable to list serial ports.';
        }
    }
}

async function restoreLastPortConnection() {
    if (!('serial' in navigator)) return;

    const saved = getRememberedPortInfo();
    if (!saved) return;

    try {
        const ports = await navigator.serial.getPorts();
        const matchingPort = ports.find((port) => portsMatchSavedInfo(port, saved));

        if (!matchingPort) {
            clearRememberedPort();
            return;
        }

        updateConnectionStatus('Reconnecting...', false);
        if (ui.connectBtn) {
            ui.connectBtn.textContent = 'Connecting...';
            ui.connectBtn.disabled = true;
        }

        await connectToHardware(matchingPort, describeSerialPort(matchingPort).name);
    } catch (error) {
        console.error('Unable to restore previous serial device', error);
        clearRememberedPort();
    } finally {
        if (!serialState.port && ui.connectBtn) {
            ui.connectBtn.textContent = 'CONNECT';
            ui.connectBtn.disabled = false;
        }
    }
}

async function handleDeviceSelection(port, label) {
    if (!port) return;

    toggleDevicePopover(false);
    ui.connectBtn.textContent = 'Connecting...';
    ui.connectBtn.disabled = true;

    try {
        await connectToHardware(port, label);
    } finally {
        ui.connectBtn.disabled = false;
        if (!serialState.port) {
            ui.connectBtn.textContent = 'CONNECT';
        }
    }
}

function setBasePaceMode(mode) {
    if (!ui.paceMode) return;

    const baseMode = mode ?? defaultPaceMode;
    ui.paceMode.dataset.baseMode = baseMode;
    ui.paceMode.textContent = baseMode;
}

function formatSensitivityValue(value) {
    return Number.isFinite(value) ? value.toFixed(1) : '--';
}

function applySensitivityDisplay({ sensitivity, power, asyncMode }) {
    if (!ui.sensitivity) return;

    const powered = typeof power === 'boolean' ? power : isPoweredOn;

    if (powered) {
        ui.sensitivity.textContent = asyncMode ? 'ASYNC' : formatSensitivityValue(sensitivity);
    } else {
        ui.sensitivity.textContent = '--';
    }

    if (ui.sensitivityUnit) {
        ui.sensitivityUnit.textContent = powered && !asyncMode ? 'mV' : '';
    }
}

function isAsyncMode({ power, sensitivity, mode, asynchronous }) {
    if (power === false) {
        return false;
    }

    if (typeof asynchronous === 'boolean') {
        return asynchronous;
    }

    if (typeof mode === 'string' && mode.trim().toUpperCase() === 'ASYNC') {
        return true;
    }

    if (typeof sensitivity === 'number') {
        return sensitivity > ASYNC_SENSITIVITY_THRESHOLD;
    }

    return false;
}

function applyAsyncModeIndicator({ sensitivity, mode, asynchronous, power }) {
    if (!ui.paceMode) return;

    const baseMode = ui.paceMode.dataset.baseMode ?? defaultPaceMode;
    const asyncMode = isAsyncMode({ sensitivity, mode, asynchronous, power });

    if (asyncMode) {
        ui.paceMode.textContent = 'ASYNC';
    } else {
        ui.paceMode.textContent = baseMode;
    }
}

function applyParameterDisplay({ rate, output, sensitivity, power, asynchronous, mode, locked }) {
    const powered = typeof power === 'boolean' ? power : isPoweredOn;
    const asyncMode = isAsyncMode({ power: powered, sensitivity, asynchronous, mode });

    if (ui.rate) {
        ui.rate.textContent = powered && Number.isFinite(rate) ? `${Math.round(rate)}` : '--';
    }

    if (ui.output) {
        ui.output.textContent = powered && Number.isFinite(output) ? output.toFixed(1) : '--';
    }

    applySensitivityDisplay({ sensitivity, power: powered, asyncMode });

    const parametersCard = document.querySelector('.parameters-card');
    const controlGroups = parametersCard?.querySelectorAll('[data-virtual-control]') ?? [];

    if (parametersCard) {
        parametersCard.classList.toggle('is-powered-off', !powered);
        parametersCard.classList.toggle('is-locked', Boolean(powered && locked));
    }

    controlGroups.forEach((group) => {
        const disabled = Boolean(!powered || locked);
        group.setAttribute('aria-disabled', String(disabled));
    });
}


async function initHardwareIntegration() {
    refreshUiBindings();
    if (!ui.connectBtn || !ui.connectionStatus) {
        return;
    }
    if (hasInitialized) {
        return;
    }
    hasInitialized = true;

    const supported = 'serial' in navigator;

    createUnsupportedHint();
    defaultPaceMode = ui.paceMode?.textContent ?? '--';
    setBasePaceMode(defaultPaceMode);

    if (!supported) {
        updateConnectionStatus('UNSUPPORTED BROWSER', false, true);
        if (ui.connectBtn) {
            ui.connectBtn.disabled = true;
        }
    }

    populateDeviceList();
    await restoreLastPortConnection();

    ui.connectBtn?.addEventListener('click', () => {
        if (serialState.port) {
            disconnectFromHardware();
        } else {
            toggleDevicePopover(true);
        }
    });

    ui.devicePopoverClose?.addEventListener('click', () => toggleDevicePopover(false));
    ui.deviceOverlay?.addEventListener('click', () => toggleDevicePopover(false));
    ui.refreshDevicesBtn?.addEventListener('click', () => populateDeviceList());
    ui.requestDeviceBtn?.addEventListener('click', () => populateDeviceList({ requestAccess: true }));

    ui.inputModeRadios.forEach((radio) => {
        radio.addEventListener('change', (event) => {
            if (event.target.value === 'virtual') {
                disconnectFromHardware();
                ui.connectBtn.disabled = true;
                updateConnectionStatus('VIRTUAL', true);
                toggleDevicePopover(false);
            } else {
                ui.connectBtn.disabled = !supported;
                updateConnectionStatus(serialState.port ? 'CONNECTED' : 'DISCONNECTED', Boolean(serialState.port));
            }
        });
    });

    ui.ledTestPace?.addEventListener('click', () => triggerPaceFlash());
    ui.ledTestSense?.addEventListener('click', () => triggerSenseFlash());

    window.addEventListener('edupace-parameters', (event) => {
        const sensitivity = event.detail?.sensitivity;
        const mode = event.detail?.mode;
        const asynchronous = event.detail?.asynchronous;
        if (typeof event.detail?.power === 'boolean') {
            isPoweredOn = event.detail.power;
        }
        applyAsyncModeIndicator({ sensitivity, mode, asynchronous, power: isPoweredOn });
        applyParameterDisplay({ ...event.detail, power: isPoweredOn });
    });

    window.edupaceHardware = {
        connectToHardware,
        disconnectFromHardware,
        triggerPaceFlash,
        triggerSenseFlash,
        sendLedCommand
    };
}

function resetParameters() {
    resettableParameterKeys.forEach((key) => {
        parameterState[key] = key === 'asynchronous' ? false : null;
    });
    isPoweredOn = false;
    applyParameterDisplay(parameterState);
    applyAsyncModeIndicator(parameterState);
}


async function connectToHardware(selectedPort = null, labelOverride = '') {
    if (!('serial' in navigator)) {
        return;
    }

    try {
        const port = selectedPort ?? (await navigator.serial.requestPort({ filters: EDUPACE_PORT_FILTERS }));
        await port.open({ baudRate: 115200 });

        serialState.port = port;
        serialState.writer = port.writable?.getWriter() ?? null;
        serialState.reader = port.readable?.getReader() ?? null;
        serialState.keepReading = true;
        serialState.buffer = '';
        serialState.label = labelOverride || describeSerialPort(port).name;

        rememberLastPort(port);

        port.addEventListener('disconnect', () => {
            disconnectFromHardware();
        });

        updateConnectionStatus(serialState.label ? 'Connected' : 'CONNECTED', true);
        ui.connectBtn.textContent = 'DISCONNECT';
        ui.connectBtn.disabled = false;

        toggleDevicePopover(false);

        readLoop();
    } catch (error) {
        updateConnectionStatus('DISCONNECTED', false);
        console.error('Unable to connect to hardware', error);
    }
}

async function disconnectFromHardware() {
    serialState.keepReading = false;

    if (serialState.reader) {
        await serialState.reader.cancel();
        serialState.reader.releaseLock();
    }

    if (serialState.writer) {
        serialState.writer.releaseLock();
    }

    if (serialState.port) {
        await serialState.port.close();
    }

    serialState.port = null;
    serialState.reader = null;
    serialState.writer = null;
    serialState.buffer = '';
    serialState.label = '';
    resetParameters();
    clearRememberedPort();


    updateConnectionStatus('DISCONNECTED', false);
    ui.connectBtn.textContent = 'CONNECT';
    ui.connectBtn.disabled = false;
}

async function handleSerialDisconnect() {
    await disconnectFromHardware();
}

function updateConnectionStatus(text, connected, unsupported = false) {
    if (ui.connectionStatusText) {
        ui.connectionStatusText.textContent = text;
    } else {
        ui.connectionStatus.textContent = text;
    }
    if (ui.connectionDeviceName) {
        const deviceLabel = connected && !unsupported && serialState.label ? serialState.label : '';
        ui.connectionDeviceName.textContent = deviceLabel;
        ui.connectionDeviceName.toggleAttribute('hidden', !deviceLabel);
        if (deviceLabel) {
            ui.connectionDeviceName.title = deviceLabel;
        } else {
            ui.connectionDeviceName.removeAttribute('title');
        }
    }
    ui.connectionStatus.classList.toggle('chip-connected', connected && !unsupported);
    ui.connectionStatus.classList.toggle('chip-disconnected', !connected && !unsupported);
    ui.connectionStatus.classList.toggle('chip-unsupported', unsupported);
    setUnsupportedHintVisible(unsupported);

    window.dispatchEvent(
        new CustomEvent('edupace-connection', {
            detail: { status: text, connected, unsupported }
        })
    );
}

async function readLoop() {
    if (!serialState.reader) {
        return;
    }

    try {
        while (serialState.keepReading) {
            const { value, done } = await serialState.reader.read();

            if (done) {
                await handleSerialDisconnect();
                break;
            }

            if (!value) {
                continue;
            }

            const decoded = decoder.decode(value);
            serialState.buffer += decoded;

            const lines = serialState.buffer.split(/\r?\n/);
            serialState.buffer = lines.pop() ?? '';

            lines.filter(Boolean).forEach((line) => handleHardwareMessage(line));
        }
    } catch (error) {
        console.error('Web Serial read error', error);
        disconnectFromHardware();
    }
}

function handleHardwareMessage(line) {
    const trimmedLine = line.trim();
    if (trimmedLine === '') {
        return;
    }
    const payload = parsePayload(line);
    let parameterChanged = false;

    const inferPower = () => {
        if (payload.power !== undefined) {
            return payload.power.toUpperCase() === 'ON';
        }
        if (
            parameterState.power === null &&
            (payload.rate !== undefined || payload.output !== undefined || payload.sensitivity !== undefined)
        ) {
            return true;
        }
        return parameterState.power;
    };


    const updateParam = (key, value) => {
        if (value === undefined) return;
        if (parameterState[key] !== value) {
            parameterState[key] = value;
            parameterChanged = true;
        }
    };

    if (payload.rate !== undefined) {
        updateParam('rate', payload.rate);
    }

    if (payload.output !== undefined) {
        updateParam('output', payload.output);
    }

    if (payload.sensitivity !== undefined) {
        updateParam('sensitivity', payload.sensitivity);
    }

    if (payload.power !== undefined) {
        ui.powerStatus.textContent = `Power: ${payload.power}`;
        isPoweredOn = payload.power.toUpperCase() === 'ON';
        updateParam('power', isPoweredOn);
    }

    if (payload.lock !== undefined) {
        ui.lockStatus.textContent = `Lock: ${payload.lock ? 'ON' : 'OFF'}`;
        updateParam('locked', payload.lock);
    }

    if (payload.mode !== undefined) {
        setBasePaceMode(payload.mode);
        updateParam('mode', payload.mode);
    }

    const nextPowerState = inferPower();
    if (parameterState.power !== nextPowerState) {
        parameterChanged = true;
        parameterState.power = nextPowerState;
        isPoweredOn = Boolean(nextPowerState);
    }

    const asyncMode = isAsyncMode({ ...parameterState, power: nextPowerState });
    if (parameterState.asynchronous !== asyncMode) {
        parameterChanged = true;
        parameterState.asynchronous = asyncMode;
    }

    if (payload.paceLed) {
        flashLed(ui.paceLed, 'pace');
    }

    if (payload.senseLed) {
        flashLed(ui.senseLed, 'sense');
    }

    if (parameterChanged) {
        window.dispatchEvent(
            new CustomEvent('edupace-parameters', {
                detail: { ...parameterState }
            })
        );
    }

    applyParameterDisplay(parameterState);
    applyAsyncModeIndicator(parameterState);
}

function parsePayload(line) {
    const trimmed = line.trim().toUpperCase();
    if (trimmed === 'POWER_ON') {
        return { power: 'ON' };
    }
    if (trimmed === 'POWER_OFF') {
        return { power: 'OFF' };
    }
    if (trimmed === 'LOCK_ON') {
        return { lock: true };
    }
    if (trimmed === 'LOCK_OFF') {
        return { lock: false };
    }
    if (trimmed === 'PACE_LED') {
        return { paceLed: true };
    }
    if (trimmed === 'SENSE_LED') {
        return { senseLed: true };
    }

    const payload = {};
    const segments = line.split(/[;,]/);

    segments.forEach((segment) => {
        const [rawKey, rawValue] = segment.split(/[:=]/);
        if (!rawKey || rawValue === undefined) {
            return;
        }

        const key = rawKey.trim().toLowerCase();
        const value = rawValue.trim();

        switch (key) {
            case 'pace':
            case 'rate':
                payload.rate = Number.parseFloat(value);
                break;
            case 'output':
                payload.output = Number.parseFloat(value);
                break;
            case 'sense':
            case 'sensitivity':
                payload.sensitivity = Number.parseFloat(value);
                break;
            case 'power':
                payload.power = value.toUpperCase();
                break;
            case 'lock':
                payload.lock = value === '1' || value.toLowerCase() === 'true';
                break;
            case 'mode':
                payload.mode = value.toUpperCase();
                break;
            case 'paceled':
                payload.paceLed = value === '1' || value.toLowerCase() === 'true';
                break;
            case 'senseled':
                payload.senseLed = value === '1' || value.toLowerCase() === 'true';
                break;
            default:
                break;
        }
    });

    return payload;
}

function flashLed(ledElement, kind = 'pace') {
    if (!isPoweredOn) {
        return;
    }

    ledElement.classList.add('led-on');
    setTimeout(() => {
        ledElement.classList.remove('led-on');
    }, 180);

    window.dispatchEvent(
        new CustomEvent('edupace-led-flash', {
            detail: {
                kind,
                source: serialState.port ? 'hardware' : 'ui',
                at: new Date().toISOString()
            }
        })
    );
}

function triggerPaceFlash() {
    flashLed(ui.paceLed, 'pace');
    sendLedCommand('PACE');
}

function triggerSenseFlash() {
    flashLed(ui.senseLed, 'sense');
    sendLedCommand('SENSE');
}

async function sendLedCommand(type) {
    if (!serialState.writer) {
        return;
    }

    const isPace = type === 'PACE';
    const onCommand = isPace ? 'GREEN_ON\n' : 'BLUE_ON\n';
    const offCommand = isPace ? 'GREEN_OFF\n' : 'BLUE_OFF\n';

    await serialState.writer.write(encoder.encode(onCommand));
    setTimeout(() => {
        serialState.writer?.write(encoder.encode(offCommand));
    }, 180);
}

export { initHardwareIntegration, sendLedCommand };
