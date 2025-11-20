const SAMPLES_PER_SECOND = 250;
const SECONDS_VISIBLE = 10;
const BUFFER_LENGTH = SAMPLES_PER_SECOND * SECONDS_VISIBLE;

const canvas = document.getElementById('ecgCanvas');
const ctx = canvas?.getContext('2d') ?? null;
const leadLabel = document.getElementById('leadLabel');

let isPaused = false;
let caliper = null;
let pendingCaliper = null;
let ignoreNextPointerUp = false;


const waveformCache = new Map();
let waveformIndex = null;
let activeWaveformId = null;

const engineState = {
    buffer: new Array(BUFFER_LENGTH).fill(0),
    spikes: new Array(BUFFER_LENGTH).fill(0),
    sweepPosition: 0,
    samplesWritten: 0,
    beatStartSeconds: 0,
    beatDurationSeconds: null,
    totalSamples:0,
    parameters: {
        rate: null,
        output: null,
        sensitivity: null
    },
    waveform: null,
    timerId: null
};

const defaultWaveform = {
    id: 'fallback-normal',
    label: 'Lead II',
    appearance: { scale: 88, color: '#7dd3fc' },
    rhythm: { baseRate: 72, intrinsicRate: 72, rrJitter: 0.02 },
    baseline: { wanderAmplitude: 0.05, wanderFrequency: 0.25, noise: 0.02 },
    morphology: {
        pWave: { center: 0.18, width: 0.045, amplitude: 0.16 },
        qrs: { center: 0.32, width: 0.018, qAmplitude: -0.3, rAmplitude: 1.2, sAmplitude: -0.35 },
        tWave: { center: 0.58, width: 0.12, amplitude: 0.42 }
    }
};

function initEcgEngine() {
    if (!canvas || !ctx) {
        return;
    }

    canvas.addEventListener('pointerdown', handlePointerDown);
    canvas.addEventListener('pointermove', handlePointerMove);
    canvas.addEventListener('pointerup', handlePointerUp);
    canvas.addEventListener('pointerleave', handlePointerUp);


    draw();

    window.addEventListener('edupace-scenario-change', (event) => {
        const waveformId = event.detail?.waveformId;
        if (waveformId) {
            setWaveform(waveformId);
        }
    });

    window.addEventListener('edupace-waveform-change', (event) => {
        const waveformId = event.detail?.waveformId;
        if (waveformId) {
            setWaveform(waveformId);
        }
    });

    window.addEventListener('edupace-parameters', (event) => {
        Object.assign(engineState.parameters, event.detail ?? {});
    });

    if (engineState.timerId) {
        clearInterval(engineState.timerId);
    }

    engineState.timerId = setInterval(step, 1000 / SAMPLES_PER_SECOND);
}

async function setWaveform(waveformId) {
    if (!waveformId || waveformId === activeWaveformId) {
        return;
    }

    const waveform = await loadWaveform(waveformId);
    if (!waveform) {
        return;
    }

    activeWaveformId = waveformId;
    engineState.waveform = waveform;
    engineState.sweepPosition = 0;
    engineState.samplesWritten = 0;
    engineState.beatDurationSeconds = null;
    engineState.beatStartSeconds = 0;
    engineState.totalSamples = 0;
    engineState.buffer.fill(0);
    engineState.spikes.fill(0);

    if (leadLabel && waveform.label) {
        leadLabel.textContent = waveform.label;
    }
}

async function loadWaveform(waveformId) {
    if (waveformCache.has(waveformId)) {
        return waveformCache.get(waveformId);
    }

    const index = await loadWaveformIndex();
    const entry = index.get(waveformId);
    if (!entry) {
        console.warn(`Waveform ${waveformId} not found in index`);
        return null;
    }

    const response = await fetch(`data/waveforms/${entry.file}`, { cache: 'no-store' });
    if (!response.ok) {
        console.error(`Unable to load waveform ${waveformId}`);
        return null;
    }

    const waveform = await response.json();
    waveformCache.set(waveformId, waveform);
    return waveform;
}

async function loadWaveformIndex() {
    if (waveformIndex) {
        return waveformIndex;
    }

    try {
        const response = await fetch('data/waveforms/index.json', { cache: 'no-store' });
        const payload = await response.json();
        waveformIndex = new Map();
        (payload.waveforms ?? []).forEach((wf) => {
            waveformIndex.set(wf.id, wf);
        });
    } catch (error) {
        console.error('Unable to load waveform index', error);
        waveformIndex = new Map();
    }

    return waveformIndex;
}

function step() {
    if (!ctx || !canvas) return;
    if (isPaused) return;

    const { value, spike } = generateSample();

    engineState.buffer[engineState.sweepPosition] = value;
    engineState.spikes[engineState.sweepPosition] = spike;

    engineState.sweepPosition = (engineState.sweepPosition + 1) % BUFFER_LENGTH;
    engineState.samplesWritten = Math.min(engineState.samplesWritten + 1, BUFFER_LENGTH);
    engineState.totalSamples += 1;

    draw();
}

function generateSample() {
    const waveform = engineState.waveform ?? defaultWaveform;
    const nowSeconds = engineState.totalSamples / SAMPLES_PER_SECOND;
    const effective = resolveEffectiveConfig(waveform);

    const phase = computePhase(nowSeconds, effective);

    let v = baselineWander(effective, nowSeconds);
    v += renderPWave(effective, phase);
    v += renderQrs(effective, phase);
    v += renderTWave(effective, phase);
    v += noise(effective);

    const spike = shouldShowSpike(effective, phase) ? 1 : 0;

    return { value: v, spike };
}

function resolveEffectiveConfig(waveform) {
    const appearance = waveform.appearance ?? {};
    const rhythm = waveform.rhythm ?? {};
    const morphology = waveform.morphology ?? {};
    const pacing = waveform.pacing ?? {};

    const baseRate = clamp(engineState.parameters.rate ?? rhythm.baseRate ?? rhythm.intrinsicRate ?? 70, 30, 180);
    let rate = baseRate;
    let capture = true;
    let spikesVisible = Boolean(pacing.enabled);

    const inhibited = pacing.enabled &&
        typeof pacing.inhibitBelowSensitivity === 'number' &&
        engineState.parameters.sensitivity !== null &&
        engineState.parameters.sensitivity !== undefined &&
        engineState.parameters.sensitivity < pacing.inhibitBelowSensitivity;

    if (pacing.enabled) {
        const captureThreshold = pacing.captureThreshold ?? 0;
        capture = Boolean(!pacing.forceNoCapture && (engineState.parameters.output ?? captureThreshold) >= captureThreshold);

        if (pacing.forceNoCapture) {
            capture = false;
        }

        if (inhibited) {
            capture = false;
            spikesVisible = false;
            rate = rhythm.intrinsicRate ?? rate;
        }
    } else {
        capture = false;
        rate = rhythm.intrinsicRate ?? rate;
    }

    const qrsMorphology = capture
        ? morphology.pacedQrs ?? morphology.qrs
        : pacing.escapeMorphology?.qrs ?? morphology.qrs;

    return {
        appearance: {
            scale: appearance.scale ?? 88,
            color: appearance.color ?? '#7dd3fc'
        },
        rhythm,
        baseline: waveform.baseline ?? {},
        morphology: {
            pWave: morphology.pWave,
            qrs: qrsMorphology,
            tWave: morphology.tWave
        },
        pacing: {
            enabled: Boolean(pacing.enabled),
            spikesVisible,
            spikePhase: pacing.spikePhase ?? (qrsMorphology?.center ?? 0.3) - 0.02,
            spikeWidth: pacing.spikeWidth ?? 0.006,
            spikeAmplitude: pacing.spikeAmplitude ?? 2.2
        },
        rate,
        capture
    };
}

function computePhase(nowSeconds, effective) {
    const beatDuration = 60 / Math.max(effective.rate, 0.1);

    if (engineState.beatDurationSeconds === null) {
        engineState.beatDurationSeconds = beatDuration;
        engineState.beatStartSeconds = nowSeconds;
    }

    const beatEnd = engineState.beatStartSeconds + engineState.beatDurationSeconds;
    if (nowSeconds >= beatEnd) {
        const jitter = effective.rhythm?.rrJitter ?? 0;
        const jitterFactor = 1 + (Math.random() - 0.5) * 2 * jitter;
        engineState.beatDurationSeconds = clamp(beatDuration * jitterFactor, beatDuration * 0.6, beatDuration * 1.4);
        engineState.beatStartSeconds = beatEnd;
    }

    const elapsed = nowSeconds - engineState.beatStartSeconds;
    return clamp(elapsed / engineState.beatDurationSeconds, 0, 1);
}

function baselineWander(effective, nowSeconds) {
    const wanderAmplitude = effective.baseline?.wanderAmplitude ?? 0.05;
    const wanderFrequency = effective.baseline?.wanderFrequency ?? 0.25;
    return wanderAmplitude * Math.sin(2 * Math.PI * wanderFrequency * nowSeconds);
}

function renderPWave(effective, phase) {
    const pWave = effective.morphology.pWave;
    if (!pWave) return 0;
    return gaussian(phase, pWave.center ?? 0.18, pWave.width ?? 0.04) * (pWave.amplitude ?? 0.15);
}

function renderQrs(effective, phase) {
    const qrs = effective.morphology.qrs;
    if (!qrs) return 0;

    const center = qrs.center ?? 0.3;
    const width = qrs.width ?? 0.02;
    const qAmp = qrs.qAmplitude ?? -0.28;
    const rAmp = qrs.rAmplitude ?? 1.2;
    const sAmp = qrs.sAmplitude ?? -0.35;

    let v = 0;
    v += gaussian(phase, center - width * 0.55, width * 0.4) * qAmp;
    v += gaussian(phase, center, width * 0.25) * rAmp;
    v += gaussian(phase, center + width * 0.55, width * 0.35) * sAmp;
    return v;
}

function renderTWave(effective, phase) {
    const tWave = effective.morphology.tWave;
    if (!tWave) return 0;
    return gaussian(phase, tWave.center ?? 0.6, tWave.width ?? 0.12) * (tWave.amplitude ?? 0.3);
}

function noise(effective) {
    const noiseAmplitude = effective.baseline?.noise ?? 0.02;
    return (Math.random() - 0.5) * noiseAmplitude;
}

function shouldShowSpike(effective, phase) {
    if (!effective.pacing.enabled || !effective.pacing.spikesVisible) {
        return false;
    }

    const window = effective.pacing.spikeWidth ?? 0.006;
    const distance = Math.abs(phase - effective.pacing.spikePhase);
    return distance < window;
}

function draw() {
    if (!ctx || !canvas) return;

    const width = canvas.clientWidth || canvas.width || 1200;
    const height = canvas.clientHeight || canvas.height || 350;

    canvas.width = width;
    canvas.height = height;

    drawGrid(width, height);

    const active = engineState.waveform ?? defaultWaveform;
    const appearance = active.appearance ?? {};
    const scale = appearance.scale ?? 88;
    const color = appearance.color ?? '#7dd3fc';
    const mid = height / 2;

    const stepX = width / BUFFER_LENGTH;
    const samplesAvailable = Math.min(engineState.samplesWritten, BUFFER_LENGTH);

    const segments = [];
    if (samplesAvailable === BUFFER_LENGTH) {
        const tailCount = BUFFER_LENGTH - engineState.sweepPosition;
        if (tailCount > 0) {
            segments.push({ start: engineState.sweepPosition, count: tailCount });
        }
        if (engineState.sweepPosition > 0) {
            segments.push({ start: 0, count: engineState.sweepPosition });
        }
    } else if (engineState.sweepPosition > 0) {
        segments.push({ start: 0, count: engineState.sweepPosition });
    }

    if (segments.length === 0) {
        return;
    }
    
    ctx.lineWidth = 2;
    ctx.strokeStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 8;
    segments.forEach(({ start, count }) => {
        ctx.beginPath();
        for (let i = 0; i < count; i++) {
            const x = (start + i) * stepX;
            const y = mid - engineState.buffer[start + i] * scale;
            if (i === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        }
    ctx.stroke();
    });
    ctx.shadowBlur = 0;

    ctx.strokeStyle = '#fbbf24';
    ctx.lineWidth = 1.5;
    segments.forEach(({ start, count }) => {
        for (let i = 0; i < count; i++) {
            const index = start + i;
            if (engineState.spikes[index]) {
                const x = index * stepX;
                ctx.beginPath();
                ctx.moveTo(x, mid - scale - 10);
                ctx.lineTo(x, mid + scale + 10);
                ctx.stroke();
            }
        }
    });
    ctx.shadowBlur = 0;
    drawCaliper(width, height);
    drawPauseOverlay(width, height);
}

function drawGrid(width, height) {
    ctx.fillStyle = '#030a14';
    ctx.fillRect(0, 0, width, height);

    const small = 12;
    ctx.lineWidth = 0.6;
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.08)';
    for (let x = 0; x <= width; x += small) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
    }
    for (let y = 0; y <= height; y += small) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
    }

    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(226, 232, 240, 0.12)';
    for (let x = 0; x <= width; x += small * 5) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
    }
    for (let y = 0; y <= height; y += small * 5) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
    }
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
        pendingCaliper.active = Math.abs(x - pendingCaliper.startX) > 4;
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
    ctx.fillStyle = 'rgba(2, 6, 23, 0.55)';
    ctx.fillRect(0, 0, width, height);

    ctx.fillStyle = '#f8fafc';
    ctx.textAlign = 'center';
    ctx.font = '600 20px "Inter", sans-serif';
    ctx.fillText('Telemetry paused', width / 2, height / 2 - 20);
    ctx.font = '14px "Inter", sans-serif';
    ctx.fillText('Click and drag to place calipers, or tap to resume', width / 2, height / 2 + 4);
    ctx.restore();
}

function gaussian(x, center, width) {
    const sigma = width || 0.01;
    const z = (x - center) / sigma;
    return Math.exp(-0.5 * z * z);
}

function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
}

export { initEcgEngine };
