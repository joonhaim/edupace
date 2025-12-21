import { beatDurationSecForHR, clamp } from './ecgMath.js';
import { compileWaveform, templatePeakAbsY } from './ecgWaveforms.js';

const DEFAULT_BASELINE_HR = 72;
const DEFAULT_PACER_RATE = 70;
const DEFAULT_SENSITIVITY_MV = 2.0;
const DEFAULT_OUTPUT_MA = 5.0;

const INTRINSIC_QRS_PEAK_MV = 6.0;
const PACED_QRS_PEAK_MV = 7.5;
const PACING_CAPTURE_THRESHOLD_MA = 2.0;
const OVERSENSE_SENSITIVITY_MV = 0.3;
const OVERSENSE_PROBABILITY = 0.03;
const BLANKING_SECONDS = 0.08;
const REFRACTORY_SECONDS = 0.26;
const PACED_QRS_DELAY_SECONDS = 0.02;

const HR_DRIFT_STEP = 0.004;
const HR_DRIFT_LIMIT = 0.03;

const LOOKAHEAD_SECONDS = 12;

function interpolate(template, progress) {
    if (!template || !template.x?.length || !template.y?.length) return 0;
    const clamped = clamp(progress, 0, 1);
    const position = clamped * (template.x.length - 1);
    const lower = Math.floor(position);
    const upper = Math.min(template.x.length - 1, lower + 1);
    const ratio = position - lower;
    const yLower = template.y[lower] ?? 0;
    const yUpper = template.y[upper] ?? 0;
    return yLower + (yUpper - yLower) * ratio;
}

function createPacingSpike(progress) {
    if (progress < 0 || progress > 1) return 0;
    const center = 0.5;
    const width = 0.18;
    const distance = Math.abs(progress - center);
    if (distance > width) return 0;
    const normalized = 1 - distance / width;
    return normalized * 8;
}

export function createEcgSignalGenerator() {
    const normalTemplate = compileWaveform('Normal');
    const pacedTemplate = compileWaveform('Ventricular pacing');

    const normalPeak = templatePeakAbsY('Normal') || 1;
    const pacedPeak = templatePeakAbsY('Ventricular pacing') || 1;

    const meta = {
        waveformDuration: Number.POSITIVE_INFINITY,
        waveformEvents: [],
        maxWaveAmplitude: Math.max(
            INTRINSIC_QRS_PEAK_MV,
            PACED_QRS_PEAK_MV,
            8
        )
    };

    const state = {
        parameters: {
            rate: DEFAULT_PACER_RATE,
            output: DEFAULT_OUTPUT_MA,
            sensitivity: DEFAULT_SENSITIVITY_MV,
            power: false,
            asynchronous: false
        },
        scenario: {},
        ruleEffects: {},
        waveformId: null,
        secondsVisible: 6,
        beats: [],
        hrDrift: 0,
        hrCurrent: DEFAULT_BASELINE_HR,
        nextIntrinsicTime: 0,
        nextEscapeTime: null,
        lastDemandReset: 0,
        lastDepolarizationTime: -Infinity,
        lastSenseOrPaceTime: -Infinity
    };

    function getBaseHr() {
        const effectHr = state.ruleEffects?.hr;
        const scenarioHr = state.scenario?.vitals?.hr;
        const candidate = Number.isFinite(effectHr)
            ? effectHr
            : Number.isFinite(scenarioHr)
                ? scenarioHr
                : DEFAULT_BASELINE_HR;
        return Math.max(30, candidate);
    }

    function getEscapeInterval() {
        const rate = Number.isFinite(state.parameters.rate)
            ? state.parameters.rate
            : DEFAULT_PACER_RATE;
        if (rate <= 0) return Infinity;
        return 60 / rate;
    }

    function computeNextIntrinsicInterval() {
        stepHrDrift();
        const effectiveHr = clamp(state.hrCurrent * (1 + state.hrDrift), 30, 200);
        const rr = 60 / effectiveHr;
        state.hrCurrent = effectiveHr;
        return rr;
    }

    function stepHrDrift() {
        const delta = (Math.random() * 2 - 1) * HR_DRIFT_STEP;
        state.hrDrift = clamp(state.hrDrift + delta, -HR_DRIFT_LIMIT, HR_DRIFT_LIMIT);
    }

    function resetTimeline(startTime = 0) {
        state.beats.length = 0;
        meta.waveformEvents.length = 0;
        state.hrDrift = 0;
        state.hrCurrent = getBaseHr();
        const firstInterval = computeNextIntrinsicInterval();
        state.nextIntrinsicTime = startTime + firstInterval;
        state.lastDemandReset = startTime;
        state.lastDepolarizationTime = -Infinity;
        state.lastSenseOrPaceTime = -Infinity;
        state.nextEscapeTime = state.parameters.power ? startTime + getEscapeInterval() : null;
    }

    function addWaveformEvent(time, type) {
        if (!Number.isFinite(time)) return;
        meta.waveformEvents.push({ time, type });
    }

    function pushBeat(beat) {
        if (!beat) return;
        state.beats.push(beat);
    }

    function scheduleUntil(targetTime) {
        const upperBound = targetTime + LOOKAHEAD_SECONDS;
        while (true) {
            const nextIntrinsic = Number.isFinite(state.nextIntrinsicTime)
                ? state.nextIntrinsicTime
                : Infinity;
            const nextPace = getNextPaceTime();
            const nextEvent = Math.min(nextIntrinsic, nextPace);
            if (!Number.isFinite(nextEvent) || nextEvent > upperBound) break;

            if (nextIntrinsic <= nextPace) {
                scheduleIntrinsic(nextIntrinsic);
            } else {
                schedulePace(nextPace);
            }
        }

        pruneOldData(targetTime);
    }

    function getNextPaceTime() {
        if (!state.parameters.power) return Infinity;
        if (!Number.isFinite(state.nextEscapeTime)) return Infinity;
        return state.nextEscapeTime;
    }

    function scheduleIntrinsic(at) {
        const sensed = evaluateSensing(at);
        const duration = beatDurationSecForHR(state.hrCurrent);
        const amplitudeScale = INTRINSIC_QRS_PEAK_MV / normalPeak;
        pushBeat({
            start: at,
            duration,
            template: 'normal',
            amplitude: amplitudeScale
        });

        state.lastDepolarizationTime = at;
        if (sensed) {
            addWaveformEvent(at, 'sense');
            state.lastSenseOrPaceTime = at;
            state.lastDemandReset = at;
            state.nextEscapeTime = state.parameters.power ? at + getEscapeInterval() : null;
        }

        const interval = computeNextIntrinsicInterval();
        state.nextIntrinsicTime = at + interval;
    }

    function evaluateSensing(at) {
        if (!state.parameters.power || state.parameters.asynchronous) return false;
        const sinceLastSense = at - state.lastSenseOrPaceTime;
        if (sinceLastSense < BLANKING_SECONDS) return false;

        const intrinsicPeak = INTRINSIC_QRS_PEAK_MV * (0.9 + Math.random() * 0.2);
        const sensitivity = Number.isFinite(state.parameters.sensitivity)
            ? state.parameters.sensitivity
            : DEFAULT_SENSITIVITY_MV;

        const baseSense = intrinsicPeak >= sensitivity;
        const oversense = sensitivity <= OVERSENSE_SENSITIVITY_MV && Math.random() < OVERSENSE_PROBABILITY;
        return baseSense || oversense;
    }

    function schedulePace(at) {
        addWaveformEvent(at, 'pace');
        state.lastSenseOrPaceTime = at;
        const escapeInterval = getEscapeInterval();
        state.lastDemandReset = at;
        state.nextEscapeTime = at + escapeInterval;

        // Always render a spike to make pacing visibly obvious.
        pushBeat({
            start: at,
            duration: 0.12,
            template: 'spike',
            amplitude: 1
        });

        const captureEligible = at - state.lastDepolarizationTime >= REFRACTORY_SECONDS;
        const output = Number.isFinite(state.parameters.output)
            ? state.parameters.output
            : DEFAULT_OUTPUT_MA;
        const captures = captureEligible && output >= PACING_CAPTURE_THRESHOLD_MA;

        if (captures) {
            const duration = beatDurationSecForHR(60 / escapeInterval);
            const amplitudeScale = PACED_QRS_PEAK_MV / pacedPeak;
            const startTime = at + PACED_QRS_DELAY_SECONDS;
            pushBeat({
                start: startTime,
                duration,
                template: 'paced',
                amplitude: amplitudeScale
            });
            state.lastDepolarizationTime = startTime;
        }
    }

    function pruneOldData(currentTime) {
        const retention = state.secondsVisible * 2;
        const cutoff = currentTime - retention;
        state.beats = state.beats.filter((beat) => (beat.start + beat.duration) > cutoff);
        meta.waveformEvents = meta.waveformEvents.filter((event) => event.time > cutoff - state.secondsVisible);
    }

    function sampleActiveBeat(timeSeconds) {
        if (!state.beats.length) return 0;
        const active = [...state.beats].reverse().find((beat) => {
            return timeSeconds >= beat.start && timeSeconds <= beat.start + beat.duration;
        });
        if (!active) return 0;

        if (active.template === 'spike') {
            const progress = (timeSeconds - active.start) / Math.max(active.duration, 0.001);
            return createPacingSpike(progress);
        }

        const template = active.template === 'paced' ? pacedTemplate : normalTemplate;
        const progress = clamp((timeSeconds - active.start) / Math.max(active.duration, 0.001), 0, 1);
        const value = interpolate(template, progress);
        return value * active.amplitude;
    }

    function sample(timeSeconds) {
        if (!Number.isFinite(timeSeconds)) return 0;
        scheduleUntil(timeSeconds);
        return sampleActiveBeat(timeSeconds);
    }

    function regenerate(secondsVisible = 6) {
        state.secondsVisible = Number(secondsVisible) || state.secondsVisible;
        resetTimeline(0);
    }

    function updateParameters(parameters = {}) {
        state.parameters = {
            ...state.parameters,
            ...parameters
        };
    }

    function updateScenario(scenario = {}) {
        state.scenario = scenario;
    }

    function updateRuleEffects(effects = {}) {
        state.ruleEffects = effects;
    }

    function updateWaveformId(waveformId) {
        state.waveformId = waveformId || null;
    }

    function getMeta() {
        return meta;
    }

    function getState() {
        return {
            poweredOn: Boolean(state.parameters.power),
            rate: state.parameters.rate,
            output: state.parameters.output,
            sensitivity: state.parameters.sensitivity,
            asynchronous: state.parameters.asynchronous
        };
    }

    resetTimeline(0);

    return {
        regenerate,
        sample,
        getMeta,
        getState,
        updateParameters,
        updateScenario,
        updateRuleEffects,
        updateWaveformId
    };
}
