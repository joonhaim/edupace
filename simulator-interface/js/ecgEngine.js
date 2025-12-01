import { ecgWave, heartRate, stitchBeatsNew } from '../ecg/ecgCore.js';
import { createHeartRateEngine } from './heartRateEngine.js';
import { sendLedCommand } from './arduinoSerialAdapter.js';


const DEFAULT_SECONDS_VISIBLE = 6;
const DEFAULT_SWEEP_SPEED_MM_PER_SEC = 25;
const CALIPER_THRESHOLD = 4;
const LABEL_CLEAR_LEAD_SECONDS = 1;
const MIN_LABEL_LIFETIME_SECONDS = 0.25;

const COLOR_PRESETS = {
    amber: '#f59e0b',
    blue: '#1d4ed8',
    green: '#00e000',
    red: '#dc2626',
    white: '#f5f7fa'
};

const TRACE_COLOR_MAP = {
    amber: '#f59e0b',
    blue: '#1d4ed8',
    green: '#00e000',
    red: '#dc2626',
    white: '#f5f7fa'
};

const ASYNC_SENSITIVITY_THRESHOLD = 20;

function resolveAsyncMode({ sensitivity, mode, asynchronous }) {
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

const engineState = {
    patientRate: 70,
    pacingRate: 70,
    output: 5,
    sensitivity: 2.0,
    regularity: 'Regular',
    asynchronous: false,
    baseSignal: 'Normal',
    poweredOn: false,
    waveformId: 'normal-sinus'
};

let canvas;
let ctx;
let gridCanvas;
let gridCtx;
let waveformPoints = [];
let waveformDuration = 0;
let maxWaveAmplitude = 1;
let sweepX = 0;
let sweepTime = 0;
let lastFrameTime = null;
let animationFrameId = null;
let traceCanvas;
let traceCtx;
let gridDirty = true;
let isPaused = false;
let caliper = null;
let pendingCaliper = null;
let ignoreNextPointerUp = false;
let heartRateEngine = null;
let waveformEvents = [];
let activeBeatLabels = [];
let displaySettings = {
    gridlines: false,
    gridDensity: '2mm',
    gridIntensity: 55,
    sweepSpeed: DEFAULT_SWEEP_SPEED_MM_PER_SEC,
    sweepWindow: DEFAULT_SECONDS_VISIBLE,
    amplitudeScaling: 10,
    traceColor: 'green',
    traceThickness: 'normal',
    hrDisplay: true,
    hrColor: 'blue',
    leadLabel: true,
    leadLabelColor: 'blue',
    labelSize: 'normal',
    calibrationMarkers: true,
    rWaveMarkers: false,
    pacingSpikeLabel: true,
    paceColor: 'amber',
    intrinsicBeatLabels: true,
    senseColor: 'amber',
    colorCodeBeats: true,
    intervalRulers: true
};

const ledElements = {
    pace: document.getElementById('paceLed'),
    sense: document.getElementById('senseLed')
};

const overlayElements = {
    overlay: document.querySelector('.ecg-overlay'),
    leadLabel: document.querySelector('.ecg-label'),
    calibration: document.querySelector('.calibration-inline'),
    calibrationValue: document.querySelector('.calibration-inline .calibration-value'),
    calibrationToggle: document.querySelector('.calibration-toggle'),
    frame: document.querySelector('.ecg-frame'),
    hrBlock: document.querySelector('.ecg-vitals .vital-block'),
    hrValue: document.getElementById('hrValue')
};

let calibrationInfoVisible = false;

function initEcgEngine() {
    canvas = document.getElementById('ecgCanvas');
    if (!canvas) return;
    ctx = canvas.getContext('2d');

    gridCanvas = document.createElement('canvas');
    gridCtx = gridCanvas.getContext('2d');

    traceCanvas = document.createElement('canvas');
    traceCtx = traceCanvas.getContext('2d');
    syncCanvasSize();
    configureTraceStyle();
    applyAnnotationStyles();

    heartRateEngine = createHeartRateEngine(document.getElementById('hrValue'));

    canvas.addEventListener('pointerdown', handlePointerDown);
    canvas.addEventListener('pointermove', handlePointerMove);
    canvas.addEventListener('pointerup', handlePointerUp);
    canvas.addEventListener('pointercancel', handlePointerUp);
    canvas.addEventListener('pointerleave', handlePointerLeave);

    window.addEventListener('resize', handleResize);
    window.addEventListener('edupace-parameters', handleParameterChange);
    window.addEventListener('edupace-scenario-change', handleScenarioChange);
    window.addEventListener('edupace-rule-effects', handleRuleEffects);
    window.addEventListener('edupace-waveform-change', handleWaveformChange);
    window.addEventListener('edupace-ecg-settings', handleDisplaySettings);

    overlayElements.calibrationToggle?.addEventListener('pointerenter', () => setCalibrationVisibility(true));
    overlayElements.calibrationToggle?.addEventListener('focus', () => setCalibrationVisibility(true));
    overlayElements.calibrationToggle?.addEventListener('pointerleave', () => setCalibrationVisibility(false));
    overlayElements.calibrationToggle?.addEventListener('blur', () => setCalibrationVisibility(false));
    overlayElements.frame?.addEventListener('mouseleave', () => setCalibrationVisibility(false));
    overlayElements.frame?.addEventListener('pointerleave', () => setCalibrationVisibility(false));

    regenerateWaveform();
    startAnimationLoop();
    updateCalibrationNote();
}

function handleParameterChange(event) {
    const { rate, output, sensitivity, power, mode, asynchronous } = event.detail ?? {};
    if (Number.isFinite(rate)) engineState.pacingRate = rate;
    if (Number.isFinite(output)) engineState.output = output;
    if (Number.isFinite(sensitivity)) {
        engineState.sensitivity = sensitivity;
    }

    engineState.asynchronous = resolveAsyncMode({
        sensitivity: Number.isFinite(sensitivity) ? sensitivity : engineState.sensitivity,
        mode,
        asynchronous
    });

    if (typeof power === 'boolean') engineState.poweredOn = power;
    regenerateWaveform();
}

function handleScenarioChange(event) {
    const hr = event.detail?.vitals?.hr;
    if (Number.isFinite(hr)) engineState.patientRate = hr;
    if (typeof event.detail?.pacing?.poweredOn === 'boolean') {
        engineState.poweredOn = event.detail.pacing.poweredOn;
    } else {
        engineState.poweredOn = false;
    }
    if (event.detail?.waveformId) {
    engineState.waveformId = event.detail.waveformId;
    engineState.baseSignal = mapWaveformId(event.detail.waveformId);
}
    regenerateWaveform();
}

function handleRuleEffects(event) {
    const hr = event.detail?.effects?.vitals?.hr;
    if (Number.isFinite(hr)) engineState.patientRate = hr;
    if (event.detail?.effects?.waveformId) {
    engineState.waveformId = event.detail.effects.waveformId;
    engineState.baseSignal = mapWaveformId(event.detail.effects.waveformId);
}
    regenerateWaveform();
}

function handleWaveformChange(event) {
    const waveformId = event.detail?.waveformId;
    if (waveformId) {
    engineState.waveformId = waveformId;
    engineState.baseSignal = mapWaveformId(waveformId);
    regenerateWaveform();
}

}

function configureTraceStyle() {
    if (!traceCtx) return;
    const thickness = displaySettings.traceThickness;
    const color = getTraceColor(displaySettings.traceColor);
    traceCtx.lineWidth = thickness === 'thin' ? 1.5 : thickness === 'thick' ? 3 : 2;
    traceCtx.strokeStyle = color;
    traceCtx.lineJoin = 'round';
    traceCtx.lineCap = 'round';
}

function getTraceColor(color) {
    return TRACE_COLOR_MAP[color] || COLOR_PRESETS[color] || color || '#00e000';
}

function resolveColorValue(color, fallback) {
    return COLOR_PRESETS[color] || color || fallback || '#00e000';
}

function applyAnnotationStyles() {
    if (overlayElements.hrBlock) {
        overlayElements.hrBlock.hidden = !displaySettings.hrDisplay;
    }

    const hrColor = resolveColorValue(displaySettings.hrColor, '#9dbcf2');
    if (overlayElements.hrValue) {
        overlayElements.hrValue.style.color = hrColor;
    }

    const leadColor = resolveColorValue(displaySettings.leadLabelColor, '#2563eb');
    if (overlayElements.leadLabel) {
        overlayElements.leadLabel.style.color = leadColor;
    }

    if (overlayElements.overlay) {
        overlayElements.overlay.dataset.labelSize = displaySettings.labelSize;
    }

    const paceLedColor = '#22c55e';
    if (ledElements.pace) {
        ledElements.pace.style.setProperty('--led-on-color', paceLedColor);
    }

    const senseLedColor = '#2563eb';
    if (ledElements.sense) {
        ledElements.sense.style.setProperty('--led-on-color', senseLedColor);
    }
}

function mapWaveformId(waveformId) {
    switch (waveformId) {
        // Baseline intrinsic rhythms
        case 'normal-sinus':
            return 'Normal';
        case 'brady-escape':
            return 'BradyNarrow';

        // Paced rhythms
        case 'ventricular-paced':
            return 'Ventricular pacing';

        // Capture problems
        case 'loss-of-capture':
            // show pacing spike without QRS
            return 'SpikeOnly';
        case 'intermittent-capture':
            // baseline is still paced; alternation is handled by pacemaker logic,
            // but visually this gives you a wide paced morphology
            return 'Ventricular pacing';

        // Ectopy / mixed
        case 'paced-with-ectopy':
            // baseline paced; PVCs injected by scenario logic later if you wish
            return 'Ventricular pacing';
        case 'mixed-wide-narrow':
            // baseline sinus; pacemaker logic creates wide paced beats over it
            return 'Normal';
        case 'pvc':
            return 'PVC';

        // Oversensing / slow intrinsic
        case 'oversensing':
            // slow underlying rhythm with missing paced beats
            return 'BradyNarrow';

        // Random mode: start from sinus by default
        case 'random-mode':
            return 'Normal';

        case 'undersensing':
            return 'Normal'; // or a dedicated template later

        // Fallback
        default:
            return 'Normal';
    }
}


function flashLed(element, type) {
    if (!element) return;

    element.classList.add('led-on');
    setTimeout(() => element.classList.remove('led-on'), 180);
    if (type) {
        sendLedCommand(type);
    }

    const kind = type === 'PACE' ? 'pace' : type === 'SENSE' ? 'sense' : 'unknown';
    if (kind !== 'unknown') {
        window.dispatchEvent(
            new CustomEvent('edupace-led-flash', {
                detail: { kind, source: 'simulation', at: new Date().toISOString() }
            })
        );
    }
}

function processLedEvents(windowStart, windowEnd) {
    if (!engineState.poweredOn || !waveformDuration || !waveformEvents.length) return;

    waveformEvents.forEach((event) => {
        if (!event || typeof event.time !== 'number') return;

        const cyclesOffset = Math.max(0, Math.ceil((windowStart - event.time) / waveformDuration));
        const occurrence = event.time + cyclesOffset * waveformDuration;

        if (occurrence >= windowStart && occurrence <= windowEnd) {
            if (event.type === 'pace') {
                flashLed(ledElements.pace, 'PACE');
            } else if (event.type === 'sense') {
                flashLed(ledElements.sense, 'SENSE');
            }
        }
    });
}

function clearBeatLabels() {
    activeBeatLabels = [];
}

function scheduleBeatLabel(type, occurrenceTime, x, y, secondsVisible) {
    if (!Number.isFinite(occurrenceTime) || !Number.isFinite(x) || !Number.isFinite(y)) return;

    const alreadyScheduled = activeBeatLabels.some(
        (label) => label.type === type && Math.abs(label.sourceTime - occurrenceTime) < 0.0001
    );
    if (alreadyScheduled) return;

    const lifetime = Math.max(MIN_LABEL_LIFETIME_SECONDS, secondsVisible - LABEL_CLEAR_LEAD_SECONDS);
    const expiresAt = occurrenceTime + lifetime;
    activeBeatLabels.push({ type, x, y, expiresAt, sourceTime: occurrenceTime });
}

function processBeatLabelEvents(windowStart, windowEnd, startX, endX, height, secondsVisible) {
    if (!engineState.poweredOn || !waveformDuration || !waveformEvents.length) return;

    const showVP = displaySettings.pacingSpikeLabel;
    const showVS = displaySettings.intrinsicBeatLabels;
    if (!showVP && !showVS) return;

    const windowSpan = windowEnd - windowStart;
    if (windowSpan <= 0) return;

    const xSpan = endX - startX;
    if (!Number.isFinite(xSpan) || xSpan === 0) return;
    waveformEvents.forEach((event) => {
        if (!event || typeof event.time !== 'number') return;

        const cyclesOffset = Math.max(0, Math.ceil((windowStart - event.time) / waveformDuration));
        const occurrence = event.time + cyclesOffset * waveformDuration;

        if (occurrence < windowStart || occurrence > windowEnd) return;

        const labelType = event.type === 'pace' ? 'VP' : 'VS';
        if ((labelType === 'VP' && !showVP) || (labelType === 'VS' && !showVS)) return;

        const ratio = (occurrence - windowStart) / windowSpan;
        const x = startX + ratio * xSpan;
        const y = labelType === 'VP' ? height * 0.18 : height * 0.26;

        scheduleBeatLabel(labelType, occurrence, x, y, secondsVisible);
    });
}

function syncCanvasSize() {
    if (!canvas || !traceCanvas || !gridCanvas) return;
    const rect = canvas.getBoundingClientRect();
    const newWidth = Math.max(Math.round(rect.width || canvas.width || 1), 1);
    const newHeight = Math.max(Math.round(rect.height || canvas.height || 1), 1);

    if (canvas.width !== newWidth || canvas.height !== newHeight) {
        canvas.width = newWidth;
        canvas.height = newHeight;
    }

    if (traceCanvas.width !== newWidth || traceCanvas.height !== newHeight) {
        traceCanvas.width = newWidth;
        traceCanvas.height = newHeight;
        configureTraceStyle();
    }

    if (gridCanvas.width !== newWidth || gridCanvas.height !== newHeight) {
        gridCanvas.width = newWidth;
        gridCanvas.height = newHeight;
    }

    gridDirty = true;
}

function handleResize() {
    syncCanvasSize();
    resetSweep();
}

function regenerateWaveform() {
    const gap = heartRate(engineState.patientRate);
    const ecgFunc = (type) => {
        const resolvedType = type === 'Normal' ? engineState.baseSignal : type;
        return ecgWave(resolvedType);
    };

    const pacingEnabled = engineState.poweredOn;
    const pacingRate = pacingEnabled ? engineState.pacingRate : engineState.patientRate;
    const pacingOutput = pacingEnabled ? engineState.output : 0;
    const pacingAsync = pacingEnabled ? engineState.asynchronous : false;

    const { x, y, events } = stitchBeatsNew(
    ecgFunc,
    gap,
    engineState.regularity,
    engineState.sensitivity,
    pacingRate,
    pacingOutput,
    pacingAsync,
    {
        waveformId: engineState.waveformId
    }
);


    waveformDuration = Math.max(...x, 0);
    waveformPoints = x.map((time, index) => ({ time, value: y[index] }));
    waveformEvents = Array.isArray(events) ? events : [];
    maxWaveAmplitude = Math.max(...y.map((value) => Math.abs(value)), 1);
    heartRateEngine?.setMaxWaveAmplitude(maxWaveAmplitude);
    heartRateEngine?.reset();
    clearBeatLabels();

    if (waveformDuration > 0) {
        sweepTime = ((sweepTime % waveformDuration) + waveformDuration) % waveformDuration;
    }
}

function resetSweep() {
    sweepX = 0;
    sweepTime = 0;
    lastFrameTime = null;
    heartRateEngine?.reset();
    clearBeatLabels();
    if (traceCtx && traceCanvas) {
        traceCtx.clearRect(0, 0, traceCanvas.width, traceCanvas.height);
        configureTraceStyle();
    }
    draw();
}

function startAnimationLoop() {
    if (animationFrameId !== null) return;
    animationFrameId = requestAnimationFrame(stepFrame);
}

function stepFrame(timestamp) {
    if (!canvas) return;

    if (lastFrameTime === null) {
        lastFrameTime = timestamp;
    }

    const deltaSeconds = (timestamp - lastFrameTime) / 1000;
    lastFrameTime = timestamp;

    if (!isPaused && deltaSeconds > 0) {
        advanceSweep(deltaSeconds * (displaySettings.sweepSpeed / DEFAULT_SWEEP_SPEED_MM_PER_SEC));
    }

    draw();
    animationFrameId = requestAnimationFrame(stepFrame);
}

function draw() {
    if (!ctx || !canvas) return;

    const { width, height } = canvas;
    const secondsVisible = getSecondsVisible();
    const pixelsPerSecond = width / secondsVisible;
    const pixelsPerMm = pixelsPerSecond / displaySettings.sweepSpeed;

    drawGrid(width, height, pixelsPerMm);
    drawWaveform(width, height);
    drawBeatLabels(width, height);
    drawCaliper(width, height);
    drawPauseOverlay(width, height);
}

function drawGrid(width, height, pixelsPerMm) {
    if (!pixelsPerMm || !gridCtx || !gridCanvas) return;

    if (gridDirty) {
        gridCtx.clearRect(0, 0, gridCanvas.width, gridCanvas.height);
        gridCtx.save();
        gridCtx.fillStyle = '#000';
        gridCtx.fillRect(0, 0, gridCanvas.width, gridCanvas.height);
        if (displaySettings.gridlines && displaySettings.gridDensity !== 'none') {
            const intensity = clamp(displaySettings.gridIntensity / 100, 0, 1);
            const spacingMm = displaySettings.gridDensity === '1mm' ? 1 : 2;
            const spacingPx = Math.max(pixelsPerMm * spacingMm, 1);
            const majorEvery = 5;
            gridCtx.lineWidth = 1;

            for (let x = 0; x <= gridCanvas.width; x += spacingPx) {
                const isMajor = Math.round(x / spacingPx) % majorEvery === 0;
                gridCtx.strokeStyle = isMajor
                    ? `rgba(255, 255, 255, ${0.32 * intensity})`
                    : `rgba(255, 255, 255, ${0.12 * intensity})`;
                gridCtx.beginPath();
                gridCtx.moveTo(Math.floor(x) + 0.5, 0);
                gridCtx.lineTo(Math.floor(x) + 0.5, gridCanvas.height);
                gridCtx.stroke();
            }

            for (let y = 0; y <= gridCanvas.height; y += spacingPx) {
                const isMajor = Math.round(y / spacingPx) % majorEvery === 0;
                gridCtx.strokeStyle = isMajor
                    ? `rgba(255, 255, 255, ${0.32 * intensity})`
                    : `rgba(255, 255, 255, ${0.12 * intensity})`;
                gridCtx.beginPath();
                gridCtx.moveTo(0, Math.floor(y) + 0.5);
                gridCtx.lineTo(gridCanvas.width, Math.floor(y) + 0.5);
                gridCtx.stroke();
            }
        }
        gridCtx.restore();
        gridDirty = false;
    }

    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(gridCanvas, 0, 0, width, height);
}

function drawWaveform(width, height) {
    if (!traceCanvas || !ctx) return;
    ctx.drawImage(traceCanvas, 0, 0, width, height);
}

function pruneExpiredBeatLabels(currentTime) {
    activeBeatLabels = activeBeatLabels.filter((label) => label.expiresAt > currentTime);
}

function drawBeatLabels(width, height) {
    if (!ctx || !activeBeatLabels.length) return;

    pruneExpiredBeatLabels(sweepTime);
    if (!activeBeatLabels.length) return;

    ctx.save();
    ctx.font = '700 13px "Inter", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const paddingX = 8;
    const paddingY = 4;
    const minBoxWidth = 32;

    activeBeatLabels.forEach((label) => {
        const text = label.type;
        const metrics = ctx.measureText(text);
        const boxWidth = Math.max(minBoxWidth, metrics.width + paddingX * 2);
        const boxHeight = Math.max(18, (metrics.actualBoundingBoxAscent || 8) + (metrics.actualBoundingBoxDescent || 4) + paddingY * 2);
        const x = clamp(label.x, boxWidth / 2, width - boxWidth / 2);
        const y = clamp(label.y, boxHeight / 2, height - boxHeight / 2);
        const bgX = x - boxWidth / 2;
        const bgY = y - boxHeight / 2;

        ctx.fillStyle = 'rgba(2, 6, 23, 0.75)';
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.28)';
        ctx.lineWidth = 1;
        ctx.fillRect(bgX, bgY, boxWidth, boxHeight);
        ctx.strokeRect(bgX, bgY, boxWidth, boxHeight);

        ctx.fillStyle = label.type === 'VP'
            ? resolveColorValue(displaySettings.paceColor, '#f59e0b')
            : resolveColorValue(displaySettings.senseColor, '#f59e0b');
        ctx.fillText(text, x, y + 0.5);
    });

    ctx.restore();
}

function advanceSweep(deltaSeconds) {
    if (!traceCtx || !traceCanvas || !waveformPoints.length || waveformDuration <= 0) return;

    const width = traceCanvas.width;
    const height = traceCanvas.height;
    const secondsVisible = getSecondsVisible();
    const pixelsPerSecond = width / secondsVisible;
    const amplitude = height * 0.18 * (displaySettings.amplitudeScaling / 10);
    const scaleY = amplitude / maxWaveAmplitude;
    const midY = height * 0.55;

    let remainingPixels = deltaSeconds * pixelsPerSecond;

    while (remainingPixels > 0) {
        const availablePixels = width - sweepX;
        const stepPixels = Math.min(remainingPixels, availablePixels);
        const startTime = sweepTime;
        const endTime = sweepTime + stepPixels / pixelsPerSecond;
        const startX = sweepX;
        const endX = sweepX + stepPixels;

        processLedEvents(startTime, endTime);
        processBeatLabelEvents(startTime, endTime, startX, endX, height, secondsVisible);
        drawSweepSegment(startX, endX, startTime, endTime, midY, scaleY, height);

        sweepX = endX >= width ? 0 : endX;
        sweepTime = endTime;
        remainingPixels -= stepPixels;
    }
}

function drawSweepSegment(startX, endX, startTime, endTime, midY, scaleY, height) {
    if (!traceCtx) return;
    const clearStart = Math.max(0, Math.min(startX, endX));
    const clearEnd = Math.min(traceCanvas.width, Math.max(startX, endX) + traceCtx.lineWidth * 2);
    traceCtx.clearRect(clearStart, 0, clearEnd - clearStart, height);

    const distance = Math.max(1, Math.abs(endX - startX));
    const timeSpan = endTime - startTime;
    const step = Math.max(1, Math.floor(distance / 6));

    traceCtx.beginPath();
    for (let offset = 0; offset <= distance; offset += step) {
        const ratio = offset / distance;
        const x = startX + ratio * (endX - startX);
        const time = startTime + ratio * timeSpan;
        const value = sampleWaveform(time);
        const y = valueToY(value, midY, scaleY);
        heartRateEngine?.processSample(time, value);
        if (offset === 0) {
            traceCtx.moveTo(x, y);
        } else {
            traceCtx.lineTo(x, y);
        }
    }
    const finalValue = sampleWaveform(endTime);
    heartRateEngine?.processSample(endTime, finalValue);
    const finalY = valueToY(finalValue, midY, scaleY);
    traceCtx.lineTo(endX, finalY);
    traceCtx.stroke();
}

function valueToY(value, midY, scaleY) {
    return midY - value * scaleY;
}

function sampleWaveform(timeSeconds) {
    if (!waveformDuration || !waveformPoints.length) return 0;

    const wrappedTime = ((timeSeconds % waveformDuration) + waveformDuration) % waveformDuration;
    let left = 0;
    let right = waveformPoints.length - 1;

    while (right - left > 1) {
        const mid = Math.floor((left + right) / 2);
        if (waveformPoints[mid].time <= wrappedTime) {
            left = mid;
        } else {
            right = mid;
        }
    }

    const leftPoint = waveformPoints[left];
    const rightPoint = waveformPoints[Math.min(left + 1, waveformPoints.length - 1)];

    if (rightPoint.time === leftPoint.time) return leftPoint.value;

    const ratio = (wrappedTime - leftPoint.time) / (rightPoint.time - leftPoint.time);
    return leftPoint.value + ratio * (rightPoint.value - leftPoint.value);
}

function broadcastPauseState(paused) {
    window.dispatchEvent(
        new CustomEvent('edupace-telemetry-pause', {
            detail: { paused }
        })
    );
}


function handlePointerDown(event) {
    if (!canvas) return;
    event.preventDefault();
    const { x } = getPointerPosition(event);

    if (!isPaused) {
        isPaused = true;
        caliper = null;
        pendingCaliper = null;
        ignoreNextPointerUp = true;
        broadcastPauseState(true);
        draw();
        return;
    }

    if (!displaySettings.intervalRulers) {
        isPaused = false;
        caliper = null;
        pendingCaliper = null;
        ignoreNextPointerUp = false;
        broadcastPauseState(false);
        draw();
        return;
    }

    pendingCaliper = {
        startX: x,
        endX: x,
        active: false
    };
}

function handlePointerMove(event) {
    if (!isPaused || !displaySettings.intervalRulers || !pendingCaliper) return;

    event.preventDefault();
    const { x } = getPointerPosition(event);
    if (!pendingCaliper.active) {
        pendingCaliper.active = Math.abs(x - pendingCaliper.startX) > CALIPER_THRESHOLD;
    }
    if (pendingCaliper.active) {
        const maxWidth = canvas?.width || canvas?.clientWidth || 0;
        pendingCaliper.endX = clamp(x, 0, maxWidth);
        draw();
    }
}

function handlePointerUp(event) {
    if (!isPaused || !displaySettings.intervalRulers) return;

    event?.preventDefault();

    if (ignoreNextPointerUp) {
        ignoreNextPointerUp = false;
        return;
    }

    if (pendingCaliper && pendingCaliper.active) {
        caliper = { ...pendingCaliper };
        pendingCaliper = null;
        draw();
        return;
    }

    pendingCaliper = null;
    caliper = null;
    isPaused = false;
    broadcastPauseState(false);
}

function handlePointerLeave(event) {
    if (!canvas) return;

    if (!isPaused || !displaySettings.intervalRulers) {
        handlePointerUp(event);
        return;
    }

    if (pendingCaliper?.active) {
        caliper = { ...pendingCaliper };
    }

    pendingCaliper = null;
    draw();
}

function getPointerPosition(event) {
    const rect = canvas.getBoundingClientRect();
    return {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top
    };
}

function drawCaliper(width, height) {
    const activeCaliper = pendingCaliper?.active ? pendingCaliper : caliper;
    if (!isPaused || !displaySettings.intervalRulers || !activeCaliper || !ctx) return;

    const start = Math.max(0, Math.min(width, activeCaliper.startX));
    const end = Math.max(0, Math.min(width, activeCaliper.endX));
    const left = Math.min(start, end);
    const right = Math.max(start, end);
    const midY = height * 0.15;

    ctx.save();
    ctx.strokeStyle = '#f97316';
    ctx.fillStyle = 'rgba(249, 115, 22, 0.8)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 4]);

    ctx.beginPath();
    ctx.moveTo(left, 0);
    ctx.lineTo(left, height);
    ctx.moveTo(right, 0);
    ctx.lineTo(right, height);
    ctx.stroke();

    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(left, midY);
    ctx.lineTo(right, midY);
    ctx.stroke();

    const diffSeconds = ((right - left) / width) * getSecondsVisible();
    const diffMs = Math.max(0, diffSeconds * 1000);
    const label = `${diffMs.toFixed(0)} ms`;
    const textX = (left + right) / 2;

    ctx.font = '600 18px "IBM Plex Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText(label, textX, midY - 8);
    ctx.restore();
}

function drawPauseOverlay(width, height) {
    if (!isPaused || !ctx) return;

    ctx.save();
    ctx.fillStyle = 'rgba(2, 6, 23, 0.10)';
    ctx.fillRect(0, 0, width, height);

    ctx.fillStyle = '#f8fafc';
    ctx.textAlign = 'center';
    const mainY = height - 60;   // primary message 60px from bottom
    const subY  = height - 34;   // secondary message 34px from bottom
    ctx.font = '600 20px "Inter", sans-serif';
    ctx.fillText('Telemetry paused', width / 2, mainY);
    ctx.font = '14px "Inter", sans-serif';
    const subline = displaySettings.intervalRulers
        ? 'Click and drag to place calipers, or tap to resume'
        : 'Click anywhere to resume playback';
    ctx.fillText(subline, width / 2, subY);
    ctx.restore();
}


function handleDisplaySettings(event) {
    const settings = event.detail ?? {};
    let needsTraceStyle = false;
    let needsSweepReset = false;
    let needsAnnotationUpdate = false;

    if (typeof settings.gridlines === 'boolean' && settings.gridlines !== displaySettings.gridlines) {
        displaySettings.gridlines = settings.gridlines;
        gridDirty = true;
    }

    if (typeof settings.gridDensity === 'string' && settings.gridDensity !== displaySettings.gridDensity) {
        displaySettings.gridDensity = settings.gridDensity;
        gridDirty = true;
    }

    if (Number.isFinite(settings.gridIntensity) && settings.gridIntensity !== displaySettings.gridIntensity) {
        displaySettings.gridIntensity = clamp(settings.gridIntensity, 0, 100);
        gridDirty = true;
    }

    if (Number.isFinite(settings.sweepSpeed) && settings.sweepSpeed > 0) {
        if (settings.sweepSpeed !== displaySettings.sweepSpeed) {
            displaySettings.sweepSpeed = settings.sweepSpeed;
            gridDirty = true;
            needsSweepReset = true;
        }
    }

    if (Number.isFinite(settings.sweepWindow) && settings.sweepWindow > 0) {
        if (settings.sweepWindow !== displaySettings.sweepWindow) {
            displaySettings.sweepWindow = settings.sweepWindow;
            needsSweepReset = true;
        }
    }

    if (Number.isFinite(settings.amplitudeScaling) && settings.amplitudeScaling > 0) {
        if (settings.amplitudeScaling !== displaySettings.amplitudeScaling) {
            displaySettings.amplitudeScaling = settings.amplitudeScaling;
            needsSweepReset = true;
        }
    }

    if (typeof settings.traceColor === 'string' && settings.traceColor !== displaySettings.traceColor) {
        displaySettings.traceColor = settings.traceColor;
        needsTraceStyle = true;
    }

    if (
        typeof settings.traceThickness === 'string' &&
        settings.traceThickness !== displaySettings.traceThickness
    ) {
        displaySettings.traceThickness = settings.traceThickness;
        needsTraceStyle = true;
    }

    if (typeof settings.leadLabel === 'boolean') {
        displaySettings.leadLabel = settings.leadLabel;
        if (overlayElements.leadLabel) overlayElements.leadLabel.hidden = !settings.leadLabel;
    }

    if (typeof settings.leadLabelColor === 'string') {
        displaySettings.leadLabelColor = settings.leadLabelColor;
        needsAnnotationUpdate = true;
    }

    if (typeof settings.labelSize === 'string') {
        const normalizedSize = ['compact', 'normal', 'large'].includes(settings.labelSize)
            ? settings.labelSize
            : 'normal';
        if (normalizedSize !== displaySettings.labelSize) {
            displaySettings.labelSize = normalizedSize;
            needsAnnotationUpdate = true;
        }
    }

    if (typeof settings.calibrationMarkers === 'boolean') {
        displaySettings.calibrationMarkers = settings.calibrationMarkers;
        setCalibrationVisibility(calibrationInfoVisible && displaySettings.calibrationMarkers);
    }

    if (typeof settings.rWaveMarkers === 'boolean') {
        displaySettings.rWaveMarkers = settings.rWaveMarkers;
        setCanvasStateFlag('rwave', settings.rWaveMarkers);
    }

    if (typeof settings.pacingSpikeLabel === 'boolean') {
        displaySettings.pacingSpikeLabel = settings.pacingSpikeLabel;
        setCanvasStateFlag('pacelabel', settings.pacingSpikeLabel);
        if (!settings.pacingSpikeLabel) clearBeatLabels();
    }

    if (typeof settings.paceColor === 'string') {
        displaySettings.paceColor = settings.paceColor;
        needsAnnotationUpdate = true;
    }

    if (typeof settings.intrinsicBeatLabels === 'boolean') {
        displaySettings.intrinsicBeatLabels = settings.intrinsicBeatLabels;
        setCanvasStateFlag('intrinsic', settings.intrinsicBeatLabels);
        if (!settings.intrinsicBeatLabels) clearBeatLabels();
    }

    if (typeof settings.senseColor === 'string') {
        displaySettings.senseColor = settings.senseColor;
        needsAnnotationUpdate = true;
    }

    if (typeof settings.colorCodeBeats === 'boolean') {
        displaySettings.colorCodeBeats = settings.colorCodeBeats;
        setCanvasStateFlag('colorcode', settings.colorCodeBeats);
    }

    if (typeof settings.intervalRulers === 'boolean') {
        displaySettings.intervalRulers = settings.intervalRulers;
        if (!settings.intervalRulers) {
            caliper = null;
            pendingCaliper = null;
            ignoreNextPointerUp = false;
        }
    }

    if (typeof settings.hrDisplay === 'boolean') {
        displaySettings.hrDisplay = settings.hrDisplay;
        needsAnnotationUpdate = true;
    }

    if (typeof settings.hrColor === 'string') {
        displaySettings.hrColor = settings.hrColor;
        needsAnnotationUpdate = true;
    }

    if (needsTraceStyle) {
        configureTraceStyle();
    }

    if (needsAnnotationUpdate) {
        applyAnnotationStyles();
    }

    updateCalibrationNote();

    if (needsSweepReset) {
        resetSweep();
    } else {
        draw();
    }
}

function setCanvasStateFlag(key, enabled) {
    if (!canvas) return;
    canvas.dataset[key] = enabled ? 'on' : 'off';
}

function setCalibrationVisibility(visible) {
    calibrationInfoVisible = Boolean(visible) && displaySettings.calibrationMarkers;
    if (overlayElements.calibration) {
        overlayElements.calibration.hidden = !calibrationInfoVisible;
        overlayElements.calibration.classList.toggle('is-visible', calibrationInfoVisible);
    }

    if (overlayElements.calibrationToggle) {
        overlayElements.calibrationToggle.setAttribute('aria-expanded', calibrationInfoVisible ? 'true' : 'false');
    }
}

function getSecondsVisible() {
    return displaySettings.sweepWindow;
}

function updateCalibrationNote() {
    const secondsVisible = getSecondsVisible();
    const windowText = Number.isInteger(secondsVisible)
        ? secondsVisible.toString()
        : secondsVisible.toFixed(1);

    if (overlayElements.calibrationValue) {
        overlayElements.calibrationValue.textContent = `${displaySettings.amplitudeScaling} mm/mV · ${displaySettings.sweepSpeed} mm/s · ${windowText} s window`;
    }

    setCalibrationVisibility(calibrationInfoVisible && displaySettings.calibrationMarkers);

    if (overlayElements.leadLabel) {
        overlayElements.leadLabel.hidden = !displaySettings.leadLabel;
    }
}

function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
}

export { initEcgEngine };
