import { compileWaveform } from './ecgWaveforms.js';
import { heartRate, stitchBeatsNew } from './ecgPacingEngine.js';

const DEFAULT_SECONDS_VISIBLE = 6;
const ASYNC_SENSITIVITY_THRESHOLD = 20;

const defaultEngineState = {
    patientRate: 70,
    pacingRate: 70,
    output: 5,
    sensitivity: 2.0,
    regularity: 'Regular',
    asynchronous: false,
    poweredOn: false,
    waveformId: 'c0-normal-sinus'
};

function resolveAsyncMode({ sensitivity, asynchronous }) {
    if (typeof asynchronous === 'boolean') {
        return asynchronous;
    }

    if (typeof sensitivity === 'number') {
        return sensitivity > ASYNC_SENSITIVITY_THRESHOLD;
    }

    return false;
}

export function createEcgSignalGenerator() {
    const engineState = { ...defaultEngineState };

    let waveformPoints = [];
    let waveformDuration = 0;
    let waveformEvents = [];
    let maxWaveAmplitude = 1;

    const resetWaveform = () => {
        waveformPoints = [];
        waveformEvents = [];
        waveformDuration = 0;
        maxWaveAmplitude = 1;
    };

    const regenerate = (secondsVisible = DEFAULT_SECONDS_VISIBLE) => {
        const intrinsicRate =
            Number.isFinite(engineState.patientRate) && engineState.patientRate > 0
                ? engineState.patientRate
                : defaultEngineState.patientRate;

        const gap = heartRate(intrinsicRate);

        const pacingEnabled =
            engineState.poweredOn && Number.isFinite(engineState.pacingRate) && engineState.pacingRate > 0;

        const pacerRate = pacingEnabled ? engineState.pacingRate : intrinsicRate;
        const pacingOutput = pacingEnabled ? engineState.output : 0;

        const { x, y, events } = stitchBeatsNew(
            compileWaveform,
            gap,
            engineState.regularity,
            engineState.sensitivity,
            pacerRate,
            pacingOutput,
            pacingEnabled && engineState.asynchronous,
            {
                waveformId: engineState.waveformId,
                durationSec: secondsVisible,
                pacemakerEnabled: pacingEnabled,
                patientHR: intrinsicRate
            }
        );

        if (!Array.isArray(x) || !Array.isArray(y) || x.length === 0 || y.length === 0) {
            resetWaveform();
            return;
        }

        waveformDuration = Math.max(...x, 0);
        waveformPoints = x.map((time, index) => ({ time, value: y[index] }));
        waveformEvents = Array.isArray(events) ? events : [];
        maxWaveAmplitude = Math.max(...y.map((value) => Math.abs(value)), 1);
    };

    const sample = (timeSeconds) => {
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
    };

    const updateParameters = ({ rate, output, sensitivity, power, asynchronous }) => {
        if (Number.isFinite(rate)) engineState.pacingRate = rate;
        if (Number.isFinite(output)) engineState.output = output;
        if (Number.isFinite(sensitivity)) {
            engineState.sensitivity = sensitivity;
        }

        engineState.asynchronous = resolveAsyncMode({
            sensitivity: Number.isFinite(sensitivity) ? sensitivity : engineState.sensitivity,
            asynchronous
        });

        if (typeof power === 'boolean') engineState.poweredOn = power;
    };

    const updateScenario = (detail = {}) => {
        const hr = detail?.vitals?.hr;
        if (Number.isFinite(hr)) engineState.patientRate = hr;
        if (typeof detail?.pacing?.poweredOn === 'boolean') {
            engineState.poweredOn = detail.pacing.poweredOn;
        } else {
            engineState.poweredOn = false;
        }

        if (detail?.waveformId) {
            updateWaveformId(detail.waveformId);
        }
    };

    const updateRuleEffects = (detail = {}) => {
        const hr = detail?.effects?.vitals?.hr;
        if (Number.isFinite(hr)) engineState.patientRate = hr;
        if (detail?.effects?.waveformId) {
            updateWaveformId(detail.effects.waveformId);
        }
    };

    const updateWaveformId = (waveformId) => {
        if (!waveformId) return;
        engineState.waveformId = waveformId;
    };

    const getMeta = () => ({
        waveformDuration,
        waveformEvents,
        maxWaveAmplitude
    });

    const getState = () => ({ ...engineState });

    return {
        getMeta,
        getState,
        regenerate,
        resetWaveform,
        sample,
        updateParameters,
        updateRuleEffects,
        updateScenario,
        updateWaveformId
    };
}
