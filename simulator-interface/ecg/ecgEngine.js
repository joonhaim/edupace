import { stitchBeats } from './ecgStitcher.js';
import { thirdDegHeartBlock } from './ecgThirdDegree.js';
import { createHeartRateEngine } from '../js/heartRateEngine.js';
import { defaultSettings } from '../js/settingsPanel.js';

const ASYNC_SENSITIVITY_THRESHOLD = 20;
const DEFAULT_PARAMS = {
    rate: 70,
    output: 1.5,
    sensitivity: 2.0
};
const TRACE_COLORS = {
    green: '#9ddb7f',
    blue: '#8db8ff',
    amber: '#ffd166',
    white: '#f8fafc'
};

function initEcgEngine() {
    const canvas = document.getElementById('ecgCanvas');
    if (!canvas) return;

    const frame = canvas.closest('.ecg-frame');
    const overlay = frame?.querySelector('.ecg-overlay');
    const hrValue = document.getElementById('hrValue');
    const paceMode = document.getElementById('paceMode');
    const calibrationInline = frame?.querySelector('.calibration-inline');
    const calibrationValue = calibrationInline?.querySelector('.calibration-value');
    const calibrationToggle = frame?.querySelector('.calibration-toggle');
    const audioToggle = frame?.querySelector('.ecg-audio-toggle');
    const ctx = canvas.getContext('2d');

    const hrEngine = createHeartRateEngine(hrValue);

    const state = {
        settings: { ...defaultSettings },
        params: { ...DEFAULT_PARAMS },
        scenarioId: 'NSR',
        waveform: { x: [], y: [] },
        duration: 0,
        maxAbsY: 1,
        lastWaveTime: 0,
        lastPlaybackTime: 0,
        lastCanvasSize: { width: 0, height: 0 },
        muted: false,
        needsRegenerate: true
    };

    const getAsyncMode = () => state.params.sensitivity > ASYNC_SENSITIVITY_THRESHOLD;

    const applyOverlaySettings = () => {
        if (overlay) {
            overlay.dataset.labelSize = state.settings.labelSize ?? 'large';
        }

        const hrBlock = hrValue?.closest('.vital-block');
        if (hrBlock) {
            hrBlock.hidden = !state.settings.hrDisplay;
        }

        if (paceMode) {
            paceMode.textContent = getAsyncMode() ? 'ASYNC' : 'VVI';
        }

        const hrColor = state.settings.hrColor ?? 'white';
        if (hrValue && TRACE_COLORS[hrColor]) {
            hrValue.style.color = TRACE_COLORS[hrColor];
        }

        if (calibrationValue) {
            calibrationValue.textContent = `${state.settings.amplitudeScaling} mm/mV · ${state.settings.sweepSpeed} mm/s · ${state.settings.sweepWindow} s window`;
        }

        hrEngine.setBeepMode(state.settings.qrsBeep ?? 'classic');
    };

    const setAudioMuted = (muted) => {
        state.muted = Boolean(muted);
        hrEngine.setBeepMuted(state.muted);
        if (audioToggle) {
            audioToggle.classList.toggle('is-muted', state.muted);
            audioToggle.setAttribute('aria-pressed', String(state.muted));
            audioToggle.setAttribute('aria-label', state.muted ? 'Unmute QRS beep' : 'Mute QRS beep');
        }
    };

    const resizeCanvas = () => {
        if (!frame) return;
        const rect = frame.getBoundingClientRect();
        const width = Math.max(1, Math.floor(rect.width));
        const height = Math.max(1, Math.floor(rect.height));
        if (width === state.lastCanvasSize.width && height === state.lastCanvasSize.height) {
            return;
        }
        state.lastCanvasSize = { width, height };
        const dpr = window.devicePixelRatio || 1;
        canvas.width = Math.floor(width * dpr);
        canvas.height = Math.floor(height * dpr);
        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const getScaling = () => {
        const width = state.lastCanvasSize.width || canvas.clientWidth || 1;
        const height = state.lastCanvasSize.height || canvas.clientHeight || 1;
        const sweepWindow = state.settings.sweepWindow || 6;
        const sweepSpeed = state.settings.sweepSpeed || 25;
        const totalMm = sweepWindow * sweepSpeed;
        const pxPerMm = width / totalMm;
        const mmPerMv = state.settings.amplitudeScaling || 10;
        const heightMm = height / pxPerMm;
        const rangeMv = heightMm / mmPerMv;
        return {
            width,
            height,
            sweepWindow,
            sweepSpeed,
            pxPerMm,
            rangeMv,
            yMin: -rangeMv / 2,
            yMax: rangeMv / 2
        };
    };

    const generateWaveform = () => {
        const intrinsicRate = Number(state.settings.intrinsicRate ?? 60);
        const regularity = state.settings.intrinsicRegularity ?? 'regular';
        const jitter = regularity === 'irregular' ? (0.85 + Math.random() * 0.3) : 1;
        const patientHR = Math.max(20, intrinsicRate * jitter);
        const iterations = Math.max(12, Math.ceil((state.settings.sweepWindow * 2) / (60 / patientHR)));
        const asynchronous = getAsyncMode();

        if (state.scenarioId === 'AV3') {
            state.waveform = thirdDegHeartBlock({
                iterations,
                sensitivity: state.params.sensitivity,
                output: state.params.output,
                rate: state.params.rate,
                patientHR,
                asynchronous
            });
        } else {
            state.waveform = stitchBeats({
                patientHR,
                sensitivity: state.params.sensitivity,
                rate: state.params.rate,
                output: state.params.output,
                asynchronous,
                iterations
            });
        }

        const x = state.waveform.x ?? [];
        const y = state.waveform.y ?? [];
        state.duration = x.length ? x[x.length - 1] : 0;
        state.maxAbsY = y.reduce((max, value) => Math.max(max, Math.abs(value)), 1);
        hrEngine.setMaxWaveAmplitude(state.maxAbsY);
        state.lastWaveTime = 0;
        state.lastPlaybackTime = 0;
        hrEngine.reset();
    };

    const findIndexAtTime = (arr, t) => {
        let low = 0;
        let high = arr.length;
        while (low < high) {
            const mid = (low + high) >> 1;
            if (arr[mid] < t) {
                low = mid + 1;
            } else {
                high = mid;
            }
        }
        return low;
    };

    const processSamples = (previousWaveTime, currentWaveTime, playbackTime) => {
        const { x, y } = state.waveform;
        if (!x.length || !y.length || state.duration <= 0) return;

        const processRange = (start, end, timeMapper) => {
            let idx = findIndexAtTime(x, start);
            while (idx < x.length && x[idx] <= end) {
                const timeSeconds = timeMapper(x[idx]);
                hrEngine.processSample(timeSeconds, y[idx]);
                idx += 1;
            }
        };

        if (currentWaveTime >= previousWaveTime) {
            processRange(previousWaveTime, currentWaveTime, (sampleX) => playbackTime - (currentWaveTime - sampleX));
        } else {
            processRange(previousWaveTime, state.duration, (sampleX) => playbackTime - (currentWaveTime + (state.duration - sampleX)));
            processRange(0, currentWaveTime, (sampleX) => playbackTime - (currentWaveTime - sampleX));
        }
    };

    const drawGrid = (scale) => {
        if (!state.settings.gridlines) return;

        const smallMm = state.settings.gridDensity === '2mm' ? 2 : 1;
        const bigMm = smallMm * 5;
        const smallX = smallMm * scale.pxPerMm;
        const bigX = bigMm * scale.pxPerMm;
        const smallY = smallMm * scale.pxPerMm;
        const bigY = bigMm * scale.pxPerMm;

        const intensity = Math.min(Math.max(state.settings.gridIntensity ?? 55, 0), 100) / 100;
        const minorAlpha = 0.16 * intensity;
        const majorAlpha = 0.32 * intensity;

        for (let x = 0; x <= scale.width + 0.5; x += smallX) {
            const isMajor = Math.abs((x / bigX) - Math.round(x / bigX)) < 0.01;
            ctx.beginPath();
            ctx.strokeStyle = `rgba(255, 255, 255, ${isMajor ? majorAlpha : minorAlpha})`;
            ctx.lineWidth = isMajor ? 1.2 : 0.8;
            ctx.moveTo(x, 0);
            ctx.lineTo(x, scale.height);
            ctx.stroke();
        }

        for (let y = 0; y <= scale.height + 0.5; y += smallY) {
            const isMajor = Math.abs((y / bigY) - Math.round(y / bigY)) < 0.01;
            ctx.beginPath();
            ctx.strokeStyle = `rgba(255, 255, 255, ${isMajor ? majorAlpha : minorAlpha})`;
            ctx.lineWidth = isMajor ? 1.2 : 0.8;
            ctx.moveTo(0, y);
            ctx.lineTo(scale.width, y);
            ctx.stroke();
        }
    };

    const drawSensitivityGuide = (scale) => {
        if (!state.settings.sensitivityGuide || !Number.isFinite(state.params.sensitivity)) return;
        const value = state.params.sensitivity;
        if (value <= scale.yMin || value >= scale.yMax) return;

        const y = scale.height - ((value - scale.yMin) / (scale.yMax - scale.yMin)) * scale.height;
        ctx.beginPath();
        ctx.strokeStyle = 'rgba(141, 184, 255, 0.6)';
        ctx.lineWidth = 1.2;
        ctx.setLineDash([6, 6]);
        ctx.moveTo(0, y);
        ctx.lineTo(scale.width, y);
        ctx.stroke();
        ctx.setLineDash([]);
    };

    const drawWaveform = (waveTime) => {
        const { x, y } = state.waveform;
        if (!x.length || !y.length || state.duration <= 0) return;

        const scale = getScaling();
        const windowSize = scale.sweepWindow;
        const segmentStart = (waveTime - windowSize + state.duration) % state.duration;
        const segmentEnd = segmentStart + windowSize;
        const toY = (value) =>
            scale.height - ((value - scale.yMin) / (scale.yMax - scale.yMin)) * scale.height;

        ctx.clearRect(0, 0, scale.width, scale.height);
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, scale.width, scale.height);
        drawGrid(scale);
        drawSensitivityGuide(scale);

        ctx.beginPath();
        let started = false;
        const drawRange = (start, end, offsetSeconds) => {
            let idx = findIndexAtTime(x, start);
            while (idx < x.length && x[idx] <= end) {
                const t = x[idx] + offsetSeconds;
                const px = ((t - segmentStart + state.duration) % state.duration) / windowSize * scale.width;
                const py = toY(y[idx]);
                if (!started) {
                    ctx.moveTo(px, py);
                    started = true;
                } else {
                    ctx.lineTo(px, py);
                }
                idx += 1;
            }
        };

        if (segmentEnd <= state.duration) {
            drawRange(segmentStart, segmentEnd, 0);
        } else {
            drawRange(segmentStart, state.duration, 0);
            drawRange(0, segmentEnd - state.duration, state.duration);
        }

        const traceColor = TRACE_COLORS[state.settings.traceColor] ?? TRACE_COLORS.green;
        const thickness = state.settings.traceThickness ?? 'normal';
        ctx.strokeStyle = traceColor;
        ctx.lineWidth = thickness === 'thick' ? 2.6 : thickness === 'thin' ? 1.2 : 1.8;
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        ctx.stroke();
    };

    const render = (timestamp) => {
        resizeCanvas();
        if (state.needsRegenerate) {
            generateWaveform();
            state.needsRegenerate = false;
        }

        const nowSeconds = timestamp / 1000;
        if (state.lastPlaybackTime === 0) {
            state.lastPlaybackTime = nowSeconds;
        }
        const elapsed = nowSeconds;
        const waveTime = state.duration ? elapsed % state.duration : 0;
        processSamples(state.lastWaveTime, waveTime, elapsed);
        drawWaveform(waveTime);
        state.lastWaveTime = waveTime;
        state.lastPlaybackTime = elapsed;
        requestAnimationFrame(render);
    };

    applyOverlaySettings();
    setAudioMuted(false);
    resizeCanvas();
    requestAnimationFrame(render);

    window.addEventListener('resize', () => resizeCanvas());

    window.addEventListener('edupace-ecg-settings', (event) => {
        state.settings = { ...state.settings, ...(event.detail ?? {}) };
        applyOverlaySettings();
        state.needsRegenerate = true;
    });

    window.addEventListener('edupace-parameters', (event) => {
        const detail = event.detail ?? {};
        if (Number.isFinite(detail.rate)) state.params.rate = detail.rate;
        if (Number.isFinite(detail.output)) state.params.output = detail.output;
        if (Number.isFinite(detail.sensitivity)) state.params.sensitivity = detail.sensitivity;
        if (paceMode) {
            paceMode.textContent = getAsyncMode() ? 'ASYNC' : 'VVI';
        }
        state.needsRegenerate = true;
    });

    window.addEventListener('edupace-scenario-change', (event) => {
        state.scenarioId = event.detail?.id ?? 'NSR';
        state.needsRegenerate = true;
    });

    calibrationToggle?.addEventListener('click', () => {
        if (!calibrationInline) return;
        const isHidden = calibrationInline.hasAttribute('hidden');
        calibrationInline.toggleAttribute('hidden', !isHidden);
    });

    audioToggle?.addEventListener('click', () => {
        setAudioMuted(!state.muted);
    });
}

export { initEcgEngine };
