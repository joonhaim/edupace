import { ecgWave, heartRate, stitchBeatsNew } from '../ecg/ecgCore.js';
import { createHeartRateEngine } from './heartRateEngine.js';

const SECONDS_VISIBLE = 6;
const SWEEP_SPEED_MM_PER_SEC = 25;
const CALIPER_THRESHOLD = 4;

const engineState = {
    patientRate: 70,
    pacingRate: 70,
    output: 5,
    sensitivity: 2.0,
    regularity: 'Regular',
    asynchronous: false,
    baseSignal: 'Normal',
    poweredOn: false
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

    heartRateEngine = createHeartRateEngine(document.getElementById('hrValue'));

    canvas.addEventListener('pointerdown', handlePointerDown);
    canvas.addEventListener('pointermove', handlePointerMove);
    canvas.addEventListener('pointerup', handlePointerUp);
    canvas.addEventListener('pointercancel', handlePointerUp);
    canvas.addEventListener('pointerleave', handlePointerUp);

    window.addEventListener('resize', handleResize);
    window.addEventListener('edupace-parameters', handleParameterChange);
    window.addEventListener('edupace-scenario-change', handleScenarioChange);
    window.addEventListener('edupace-rule-effects', handleRuleEffects);
    window.addEventListener('edupace-waveform-change', handleWaveformChange);

    regenerateWaveform();
    startAnimationLoop();
}

function handleParameterChange(event) {
    const { rate, output, sensitivity, power } = event.detail ?? {};
    if (Number.isFinite(rate)) engineState.pacingRate = rate;
    if (Number.isFinite(output)) engineState.output = output;
    if (Number.isFinite(sensitivity)) engineState.sensitivity = sensitivity;
    if (typeof power === 'boolean') engineState.poweredOn = power;
    regenerateWaveform({ keepSweep: true });
}

function handleScenarioChange(event) {
    const previousBaseSignal = engineState.baseSignal;
    const hr = event.detail?.vitals?.hr;
    if (Number.isFinite(hr)) engineState.patientRate = hr;
    if (typeof event.detail?.pacing?.poweredOn === 'boolean') {
        engineState.poweredOn = event.detail.pacing.poweredOn;
    } else {
        engineState.poweredOn = false;
    }
    if (event.detail?.waveformId) {
        engineState.baseSignal = mapWaveformId(event.detail.waveformId);
    }
    const waveformChanged = engineState.baseSignal !== previousBaseSignal;
    regenerateWaveform({ keepSweep: !waveformChanged });
}

function handleRuleEffects(event) {
    const previousBaseSignal = engineState.baseSignal;
    const hr = event.detail?.effects?.vitals?.hr;
    if (Number.isFinite(hr)) engineState.patientRate = hr;
    if (event.detail?.effects?.waveformId) {
        engineState.baseSignal = mapWaveformId(event.detail.effects.waveformId);
    }
    const waveformChanged = engineState.baseSignal !== previousBaseSignal;
    regenerateWaveform({ keepSweep: !waveformChanged });
}

function handleWaveformChange(event) {
    const waveformId = event.detail?.waveformId;
    if (waveformId) {
        engineState.baseSignal = mapWaveformId(waveformId);
        regenerateWaveform();
    }
}

function configureTraceStyle() {
    if (!traceCtx) return;
    traceCtx.lineWidth = 2;
    traceCtx.strokeStyle = '#00E000';
    traceCtx.lineJoin = 'round';
    traceCtx.lineCap = 'round';
}

function mapWaveformId(waveformId) {
    switch (waveformId) {
        case 'loss-of-capture':
            return 'Ventricular pacing';
        case 'normal-sinus':
        default:
            return 'Normal';
    }
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

function regenerateWaveform(options = {}) {
    const { keepSweep = false } = options;
    const gap = heartRate(engineState.patientRate);
    const ecgFunc = (type) => {
        const resolvedType = type === 'Normal' ? engineState.baseSignal : type;
        return ecgWave(resolvedType);
    };

    const pacingEnabled = engineState.poweredOn;
    const pacingRate = pacingEnabled ? engineState.pacingRate : engineState.patientRate;
    const pacingOutput = pacingEnabled ? engineState.output : 0;
    const pacingAsync = pacingEnabled ? engineState.asynchronous : false;

    const { x, y } = stitchBeatsNew(
        ecgFunc,
        gap,
        engineState.regularity,
        engineState.sensitivity,
        pacingRate,
        pacingOutput,
        pacingAsync
    );

    waveformDuration = Math.max(...x, 0);
    waveformPoints = x.map((time, index) => ({ time, value: y[index] }));
    maxWaveAmplitude = Math.max(...y.map((value) => Math.abs(value)), 1);
    heartRateEngine?.setMaxWaveAmplitude(maxWaveAmplitude);
    heartRateEngine?.reset();

    if (keepSweep) {
        sweepTime = ((sweepTime % waveformDuration) + waveformDuration) % waveformDuration;
        return;
    }

    resetSweep();
}

function resetSweep() {
    sweepX = 0;
    sweepTime = 0;
    lastFrameTime = null;
    heartRateEngine?.reset();
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
        advanceSweep(deltaSeconds);
    }

    draw();
    animationFrameId = requestAnimationFrame(stepFrame);
}

function draw() {
    if (!ctx || !canvas) return;

    const { width, height } = canvas;
    const pixelsPerSecond = width / SECONDS_VISIBLE;
    const pixelsPerMm = pixelsPerSecond / SWEEP_SPEED_MM_PER_SEC;

    drawGrid(width, height, pixelsPerMm);
    drawWaveform(width, height);
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

function advanceSweep(deltaSeconds) {
    if (!traceCtx || !traceCanvas || !waveformPoints.length || waveformDuration <= 0) return;

    const width = traceCanvas.width;
    const height = traceCanvas.height;
    const pixelsPerSecond = width / SECONDS_VISIBLE;
    const amplitude = height * 0.18;
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


function handlePointerDown(event) {
    if (!canvas) return;
    event.preventDefault();
    const { x } = getPointerPosition(event);

    if (!isPaused) {
        isPaused = true;
        caliper = null;
        pendingCaliper = null;
        ignoreNextPointerUp = true;
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
    if (!isPaused || !pendingCaliper) return;

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
    if (!isPaused) return;

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
    if (!isPaused || !activeCaliper || !ctx) return;

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

    const diffSeconds = ((right - left) / width) * SECONDS_VISIBLE;
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
    ctx.fillText('Click and drag to place calipers, or tap to resume', width / 2, subY);
    ctx.restore();
}


function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
}

export { initEcgEngine };
