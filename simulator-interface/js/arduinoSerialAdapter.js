const ui = {
    connectionStatus: document.getElementById('connectionStatus'),
    connectionStatusText: document.querySelector('#connectionStatus .status-text'),
    powerStatus: document.getElementById('powerStatus'),
    lockStatus: document.getElementById('lockStatus'),
    connectBtn: document.getElementById('connectBtn'),
    rate: document.getElementById('rateValue'),
    output: document.getElementById('outputValue'),
    sensitivity: document.getElementById('sensValue'),
    sensitivityUnit: document.querySelector('#sensValue + .param-unit'),
    paceMode: document.getElementById('paceMode'),
    paceLed: document.getElementById('paceLed'),
    senseLed: document.getElementById('senseLed'),
    ledTestPace: document.getElementById('ledTestPace'),
    ledTestSense: document.getElementById('ledTestSense'),
    inputModeRadios: document.querySelectorAll('input[name="inputMode"]'),
    connectionGroup: document.querySelector('.connection-group'),
    unsupportedHint: null,
    unsupportedHintClose: null
};

const defaultPaceMode = ui.paceMode?.textContent ?? '--';
const ASYNC_SENSITIVITY_THRESHOLD = 20;

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
    sensitivity: null,
    mode: null,
    power: null,
    locked: null,
    asynchronous: false
};
let isPoweredOn = false;
let unsupportedHintDismissed = false;
const resettableParameterKeys = Object.keys(parameterState);

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

function setBasePaceMode(mode) {
    if (!ui.paceMode) return;

    const baseMode = mode ?? defaultPaceMode;
    ui.paceMode.dataset.baseMode = baseMode;
    ui.paceMode.textContent = baseMode;
}

function formatSensitivityValue(value) {
    return Number.isFinite(value) ? value.toFixed(1) : '--';
}

function applySensitivityDisplay({ sensitivity, mode, asynchronous, power }) {
    if (!ui.sensitivity) return;

    const powered = typeof power === 'boolean' ? power : isPoweredOn;
    const asyncMode = powered && isAsyncMode({ sensitivity, mode, asynchronous, power: powered });

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

    if (ui.rate) {
        ui.rate.textContent = powered && Number.isFinite(rate) ? `${Math.round(rate)}` : '--';
    }

    if (ui.output) {
        ui.output.textContent = powered && Number.isFinite(output) ? output.toFixed(1) : '--';
    }

    applySensitivityDisplay({ sensitivity, mode, asynchronous, power: powered });

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


function initHardwareIntegration() {
    const supported = 'serial' in navigator;

    createUnsupportedHint();
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
    resetParameters();


    updateConnectionStatus('DISCONNECTED', false);
    ui.connectBtn.textContent = 'Connect';
}

function updateConnectionStatus(text, connected, unsupported = false) {
    if (ui.connectionStatusText) {
        ui.connectionStatusText.textContent = text;
    } else {
        ui.connectionStatus.textContent = text;
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
        ui.rate.textContent = payload.rate;
        updateParam('rate', payload.rate);
    }

    if (payload.output !== undefined) {
        ui.output.textContent = payload.output;
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