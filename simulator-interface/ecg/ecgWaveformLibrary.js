import { getECGWave } from './ecgMorphology.js';

const MORPHOLOGY_SCALES = Object.freeze({
    Normal: { time: 0.03333, amplitude: 'normalize' },
    'Ventricular pacing': { time: 0.03333, amplitude: 'normalize' },
    'Mobitz type II - no conduction': { time: 0.03333, amplitude: 0.08 },
    'Slow conduction': { time: 0.03333, amplitude: 'normalize' },
    '3rd degree heart block P wave': { time: 0.06 / 0.9, amplitude: 0.1477 },
    '3rd degree heart block R wave': { time: 0.16 / 3.05, amplitude: 'normalize' },
    '3rd degree heart block ventricular pacing': { time: 0.4 / 3.872, amplitude: 'normalize' }
});

function range(values) {
    let min = Infinity;
    let max = -Infinity;
    values.forEach((value) => {
        min = Math.min(min, value);
        max = Math.max(max, value);
    });
    return Math.max(1e-9, max - min);
}

function createTemplate(signalType) {
    const source = getECGWave(signalType);
    const scale = MORPHOLOGY_SCALES[signalType];
    if (!scale) throw new Error(`No ECG scale configured for ${signalType}`);

    const amplitudeScale = scale.amplitude === 'normalize'
        ? 1 / range(source.y)
        : scale.amplitude;
    const xStart = source.x[0] ?? 0;

    return Object.freeze({
        type: signalType,
        x: Object.freeze(source.x.map((value) => (value - xStart) * scale.time)),
        y: Object.freeze(source.y.map((value) => value * amplitudeScale))
    });
}

const TEMPLATE_NAMES = Object.keys(MORPHOLOGY_SCALES);
const TEMPLATES = new Map(TEMPLATE_NAMES.map((name) => [name, createTemplate(name)]));

const FAILED_CAPTURE_TEMPLATE = Object.freeze({
    type: 'Pacing spike without capture',
    x: Object.freeze([0, 0.006, 0.012]),
    y: Object.freeze([0, 0.48, 0])
});

export function getWaveformTemplate(signalType) {
    if (signalType === FAILED_CAPTURE_TEMPLATE.type) return FAILED_CAPTURE_TEMPLATE;
    const template = TEMPLATES.get(signalType);
    if (!template) throw new Error(`Unknown ECG template: ${signalType}`);
    return template;
}

export function createWaveformEvent(signalType, startTime, amplitude = 1) {
    const template = getWaveformTemplate(signalType);
    const safeAmplitude = Number.isFinite(amplitude) ? amplitude : 1;
    return {
        type: signalType,
        start: startTime,
        end: startTime + (template.x[template.x.length - 1] ?? 0),
        amplitude: safeAmplitude,
        template
    };
}
