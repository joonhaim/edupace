const ui = {
    connectionStatus: document.getElementById('connectionStatus'),
    powerStatus: document.getElementById('powerStatus'),
    lockStatus: document.getElementById('lockStatus'),
    connectBtn: document.getElementById('connectBtn'),
    rate: document.getElementById('rateValue'),
    output: document.getElementById('outputValue'),
    sensitivity: document.getElementById('sensValue'),
    paceMode: document.getElementById('paceMode'),
    paceLed: document.getElementById('paceLed'),
    senseLed: document.getElementById('senseLed'),
    ledTestPace: document.getElementById('testPaceLed'),
    ledTestSense: document.getElementById('testSenseLed'),
    inputModeRadios: document.querySelectorAll('input[name="inputMode"]')
};

const defaultPaceMode = ui.paceMode?.textContent ?? '--';

const serialState = {
    port: null,
    reader: null,
    writer: null,
    keepReading: false,
    buffer: ''
};

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const parameterState = {
    rate: null,
    output: null,
    sensitivity: null
};

function setBasePaceMode(mode) {
    if (!ui.paceMode) return;

    const baseMode = mode ?? defaultPaceMode;
    ui.paceMode.dataset.baseMode = baseMode;
    ui.paceMode.textContent = baseMode;
}

function applyAsyncModeFromSensitivity(sensitivity) {
    if (!ui.paceMode) return;

    const baseMode = ui.paceMode.dataset.baseMode ?? defaultPaceMode;
    if (typeof sensitivity === 'number' && sensitivity > 20) {
        ui.paceMode.textContent = 'ASYNC';
    } else {
        ui.paceMode.textContent = baseMode;
    }
}

function initHardwareIntegration() {
    const supported = 'serial' in navigator;

    setBasePaceMode(defaultPaceMode);

    if (!supported) {
        updateConnectionStatus('UNSUPPORTED BROWSER', false, true);
        ui.connectBtn.disabled = true;
    }

    ui.connectBtn.addEventListener('click', () => {
        if (serialState.port) {
            disconnectFromHardware();
        } else {
            connectToHardware();
        }
    });

    ui.inputModeRadios.forEach((radio) => {
        radio.addEventListener('change', (event) => {
            if (event.target.value === 'virtual') {
                disconnectFromHardware();
                ui.connectBtn.disabled = true;
                updateConnectionStatus('VIRTUAL', true);
            } else {
                ui.connectBtn.disabled = !supported;
                updateConnectionStatus(serialState.port ? 'CONNECTED' : 'DISCONNECTED', Boolean(serialState.port));
            }
        });
    });

    ui.ledTestPace.addEventListener('click', () => triggerPaceFlash());
    ui.ledTestSense.addEventListener('click', () => triggerSenseFlash());

    window.addEventListener('edupace-parameters', (event) => {
        const sensitivity = event.detail?.sensitivity;
        applyAsyncModeFromSensitivity(sensitivity);
    });

    window.edupaceHardware = {
        connectToHardware,
        disconnectFromHardware,
        triggerPaceFlash,
        triggerSenseFlash,
        sendLedCommand
    };
}

async function connectToHardware() {
    if (!('serial' in navigator)) {
        return;
    }

    try {
        const port = await navigator.serial.requestPort();
        await port.open({ baudRate: 115200 });

        serialState.port = port;
        serialState.writer = port.writable?.getWriter() ?? null;
        serialState.reader = port.readable?.getReader() ?? null;
        serialState.keepReading = true;
        serialState.buffer = '';

        port.addEventListener('disconnect', () => {
            disconnectFromHardware();
        });

        updateConnectionStatus('CONNECTED', true);
        ui.connectBtn.textContent = 'Disconnect';

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

    updateConnectionStatus('DISCONNECTED', false);
    ui.connectBtn.textContent = 'Connect';
}

function updateConnectionStatus(text, connected, unsupported = false) {
    ui.connectionStatus.textContent = text;
    ui.connectionStatus.classList.toggle('chip-connected', connected && !unsupported);
    ui.connectionStatus.classList.toggle('chip-disconnected', !connected && !unsupported);
    ui.connectionStatus.classList.toggle('chip-unsupported', unsupported);
}

async function readLoop() {
    if (!serialState.reader) {
        return;
    }

    try {
        while (serialState.keepReading) {
            const { value, done } = await serialState.reader.read();

            if (done || !value) {
                break;
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
    const payload = parsePayload(line);
    let parameterChanged = false;

    if (payload.rate !== undefined) {
        ui.rate.textContent = payload.rate;
        parameterState.rate = payload.rate;
        parameterChanged = true;
    }

    if (payload.output !== undefined) {
        ui.output.textContent = payload.output;
        parameterState.output = payload.output;
        parameterChanged = true;
    }

    if (payload.sensitivity !== undefined) {
        ui.sensitivity.textContent = payload.sensitivity;
        parameterState.sensitivity = payload.sensitivity;
        parameterChanged = true;
    }

    if (payload.power !== undefined) {
        ui.powerStatus.textContent = `Power: ${payload.power}`;
    }

    if (payload.lock !== undefined) {
        ui.lockStatus.textContent = `Lock: ${payload.lock ? 'ON' : 'OFF'}`;
    }

    if (payload.mode !== undefined) {
        setBasePaceMode(payload.mode);
    }

    if (payload.paceLed) {
        flashLed(ui.paceLed);
    }

    if (payload.senseLed) {
        flashLed(ui.senseLed);
    }
    
    if (parameterChanged) {
        window.dispatchEvent(
            new CustomEvent('edupace-parameters', {
                detail: { ...parameterState }
            })
        );
    }

    applyAsyncModeFromSensitivity(parameterState.sensitivity);
}

function parsePayload(line) {
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

function flashLed(ledElement) {
    ledElement.classList.add('led-on');
    setTimeout(() => {
        ledElement.classList.remove('led-on');
    }, 180);
}

function triggerPaceFlash() {
    flashLed(ui.paceLed);
    sendLedCommand('PACE');
}

function triggerSenseFlash() {
    flashLed(ui.senseLed);
    sendLedCommand('SENSE');
}

async function sendLedCommand(type) {
    if (!serialState.writer) {
        return;
    }

    const command = type === 'PACE' ? 'LED_PACE\n' : 'LED_SENSE\n';
    await serialState.writer.write(encoder.encode(command));
}

export { initHardwareIntegration };