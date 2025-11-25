import { ecgWave, heartRate, stitchBeatsNew } from '../ecg/ecgCore.js';

const SECONDS_VISIBLE = 10;
const GRID_LARGE_SPACING = 50;
const GRID_SMALL_SPACING = 10;
const CALIPER_THRESHOLD = 4;

const engineState = {
    patientRate: 70,
    pacingRate: 70,
    output: 5,
    sensitivity: 2.0,
    regularity: 'Regular',
    asynchronous: false,
    baseSignal: 'Normal'
};

let canvas;
let ctx;
let ecgPoints = [];
let isPaused = false;
let caliper = null;
let pendingCaliper = null;
let ignoreNextPointerUp = false;

function initEcgEngine() {
    canvas = document.getElementById('ecgCanvas');
    if (!canvas) return;
    ctx = canvas.getContext('2d');

    canvas.addEventListener('pointerdown', handlePointerDown);
    canvas.addEventListener('pointermove', handlePointerMove);
    canvas.addEventListener('pointerup', handlePointerUp);
    canvas.addEventListener('pointercancel', handlePointerUp);
    canvas.addEventListener('pointerleave', handlePointerUp);

    window.addEventListener('resize', draw);
    window.addEventListener('edupace-parameters', handleParameterChange);
    window.addEventListener('edupace-scenario-change', handleScenarioChange);
    window.addEventListener('edupace-rule-effects', handleRuleEffects);
    window.addEventListener('edupace-waveform-change', handleWaveformChange);

    regenerateWaveform();
    draw();
}

function handleParameterChange(event) {
    const { rate, output, sensitivity } = event.detail ?? {};
    if (Number.isFinite(rate)) engineState.pacingRate = rate;
    if (Number.isFinite(output)) engineState.output = output;
    if (Number.isFinite(sensitivity)) engineState.sensitivity = sensitivity;
    regenerateWaveform();
}

function handleScenarioChange(event) {
    const hr = event.detail?.vitals?.hr;
    if (Number.isFinite(hr)) engineState.patientRate = hr;
    if (event.detail?.waveformId) {
        engineState.baseSignal = mapWaveformId(event.detail.waveformId);
    }
    regenerateWaveform();
}

function handleRuleEffects(event) {
    const hr = event.detail?.effects?.vitals?.hr;
    if (Number.isFinite(hr)) engineState.patientRate = hr;
    if (event.detail?.effects?.waveformId) {
        engineState.baseSignal = mapWaveformId(event.detail.effects.waveformId);
    }
    regenerateWaveform();
}

function handleWaveformChange(event) {
    const waveformId = event.detail?.waveformId;
    if (waveformId) {
        engineState.baseSignal = mapWaveformId(waveformId);
        regenerateWaveform();
    }
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

function regenerateWaveform() {
    const gap = heartRate(engineState.patientRate);
    const ecgFunc = (type) => {
        const resolvedType = type === 'Normal' ? engineState.baseSignal : type;
        return ecgWave(resolvedType);
    };

    const { x, y } = stitchBeatsNew(
        ecgFunc,
        gap,
        engineState.regularity,
        engineState.sensitivity,
        engineState.pacingRate,
        engineState.output,
        engineState.asynchronous
    );

    const maxTime = Math.max(...x, 1);
    const timeScale = SECONDS_VISIBLE / maxTime;
    ecgPoints = x.map((time, index) => ({ x: time * timeScale, y: y[index] }));
    draw();
}

function draw() {
    if (!ctx || !canvas) return;

    const { width, height } = canvas;
    ctx.clearRect(0, 0, width, height);

    drawGrid(width, height);
    drawWaveform(width, height);
    drawCaliper(width, height);
    drawPauseOverlay(width, height);
}

function drawGrid(width, height) {
    ctx.save();
    ctx.fillStyle = '#020617';
    ctx.fillRect(0, 0, width, height);

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.lineWidth = 1;

    for (let x = 0; x <= width; x += GRID_LARGE_SPACING) {
        ctx.beginPath();
        ctx.moveTo(x + 0.5, 0);
        ctx.lineTo(x + 0.5, height);
        ctx.stroke();
    }

    for (let y = 0; y <= height; y += GRID_LARGE_SPACING) {
        ctx.beginPath();
        ctx.moveTo(0, y + 0.5);
        ctx.lineTo(width, y + 0.5);
        ctx.stroke();
    }

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    for (let x = 0; x <= width; x += GRID_SMALL_SPACING) {
        ctx.beginPath();
        ctx.moveTo(x + 0.5, 0);
        ctx.lineTo(x + 0.5, height);
        ctx.stroke();
    }
    for (let y = 0; y <= height; y += GRID_SMALL_SPACING) {
        ctx.beginPath();
        ctx.moveTo(0, y + 0.5);
        ctx.lineTo(width, y + 0.5);
        ctx.stroke();
    }
    ctx.restore();
}

function drawWaveform(width, height) {
    if (!ecgPoints.length || !ctx) return;
    const midY = height * 0.55;
    const amplitude = height * 0.18;
    const maxAbs = Math.max(...ecgPoints.map((point) => Math.abs(point.y)), 1);
    const scaleY = amplitude / maxAbs;

    ctx.save();
    ctx.strokeStyle = '#22d3ee';
    ctx.lineWidth = 2;
    ctx.beginPath();

    ecgPoints.forEach((point, index) => {
        const x = (point.x / SECONDS_VISIBLE) * width;
        const y = midY - point.y * scaleY;
        if (index === 0) {
            ctx.moveTo(x, y);
        } else {
            ctx.lineTo(x, y);
        }
    });

    ctx.stroke();
    ctx.restore();
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
        pendingCaliper.active = Math.abs(x - pendingCaliper.startX) > CALIPER_THRESHOLD;    }
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
