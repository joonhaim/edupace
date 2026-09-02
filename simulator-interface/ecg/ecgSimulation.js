import { createScenarioScheduler, getSupportedScenarioIds } from './ecgScenarios.js';
import { createWaveformEvent } from './ecgWaveformLibrary.js';

const EPSILON = 1e-7;
const HISTORY_SECONDS = 18;
const DEFAULT_CONFIG = Object.freeze({
    scenarioId: 'NSR',
    intrinsicRate: 60,
    intrinsicRegularity: 'regular',
    pacingRate: 70,
    output: 1.5,
    sensitivity: 2,
    power: false,
    asynchronous: false
});

function lowerBound(values, target) {
    let lo = 0;
    let hi = values.length;
    while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (values[mid] < target) lo = mid + 1;
        else hi = mid;
    }
    return lo;
}

function sampleEvent(event, time) {
    if (time < event.start || time > event.end) return 0;
    const localTime = time - event.start;
    const { x, y } = event.template;
    const index = lowerBound(x, localTime);
    if (index <= 0) return y[0] * event.amplitude;
    if (index >= x.length) return y[y.length - 1] * event.amplitude;

    const x0 = x[index - 1];
    const x1 = x[index];
    const fraction = (localTime - x0) / (x1 - x0 || EPSILON);
    return (y[index - 1] + fraction * (y[index] - y[index - 1])) * event.amplitude;
}

function normalizeConfig(config) {
    return {
        ...DEFAULT_CONFIG,
        ...config,
        scenarioId: getSupportedScenarioIds().includes(config?.scenarioId)
            ? config.scenarioId
            : DEFAULT_CONFIG.scenarioId
    };
}

export function createEcgSimulation(initialConfig = {}, options = {}) {
    const random = options.random ?? Math.random;
    let config = normalizeConfig(initialConfig);
    let time = 0;
    let waveformEvents = [];
    let controlEvents = [];
    let scenario = createScenarioScheduler(config.scenarioId, { startTime: time, random });
    let nextPaceTime = Infinity;
    let lastControlTime = time;
    let ventricularRefractoryUntil = -Infinity;

    const pacingInterval = () => 60 / Math.min(220, Math.max(30, Number(config.pacingRate) || 70));
    const pacingEnabled = () => config.power !== false && Number(config.pacingRate) > 0;

    function schedulePacerFrom(anchor) {
        nextPaceTime = pacingEnabled() ? anchor + pacingInterval() : Infinity;
    }

    function appendWaveform(morphology, startTime, amplitude) {
        waveformEvents.push(createWaveformEvent(morphology, startTime, amplitude));
    }

    function emitControl(kind, eventTime, detail = {}) {
        controlEvents.push({ kind, time: eventTime, ...detail });
    }

    function processIntrinsic(event) {
        const suppressed = event.ventricular
            && !config.asynchronous
            && event.time < ventricularRefractoryUntil;
        const amplitude = event.morphology === '3rd degree heart block P wave'
            ? 0.8 + random() * 0.4
            : 0.7 + random() * 0.6;

        if (!suppressed) {
            appendWaveform(event.morphology, event.time, amplitude);
        }

        if (!event.canBeSensed || suppressed || !pacingEnabled() || config.asynchronous) return;

        if (amplitude >= Number(config.sensitivity)) {
            lastControlTime = event.time;
            schedulePacerFrom(event.time);
            emitControl('sense', event.time, { scenarioId: config.scenarioId });
        }
    }

    function processPace(eventTime) {
        const captureThreshold = 1.4 + random() * 0.2;
        const captured = Number(config.output) >= captureThreshold;
        const morphology = captured
            ? (config.scenarioId === 'AV3'
                ? '3rd degree heart block ventricular pacing'
                : 'Ventricular pacing')
            : 'Pacing spike without capture';

        appendWaveform(morphology, eventTime, captured ? 0.85 + random() * 0.3 : 1);
        emitControl('pace', eventTime, { captured, scenarioId: config.scenarioId });
        lastControlTime = eventTime;
        if (captured) ventricularRefractoryUntil = eventTime + 0.3;
        schedulePacerFrom(eventTime);
    }

    function pruneHistory() {
        const cutoff = time - HISTORY_SECONDS;
        if (cutoff <= 0) return;
        waveformEvents = waveformEvents.filter((event) => event.end >= cutoff);
        controlEvents = controlEvents.filter((event) => event.time >= cutoff);
    }

    function advanceTo(targetTime) {
        const target = Math.max(time, Number(targetTime) || 0);
        const emitted = [];

        while (true) {
            const intrinsicTime = scenario.nextTime();
            const eventTime = Math.min(intrinsicTime, nextPaceTime);
            if (eventTime > target + EPSILON) break;

            const controlStart = controlEvents.length;
            if (intrinsicTime <= nextPaceTime + EPSILON) {
                processIntrinsic(scenario.takeNext(config));
            } else {
                processPace(nextPaceTime);
            }
            emitted.push(...controlEvents.slice(controlStart));
        }

        time = target;
        pruneHistory();
        return emitted;
    }

    function updateConfig(changes = {}, effectiveTime = time) {
        advanceTo(effectiveTime);
        const previous = config;
        config = normalizeConfig({ ...config, ...changes });

        if (previous.scenarioId !== config.scenarioId) {
            scenario = createScenarioScheduler(config.scenarioId, { startTime: time, random });
        } else {
            scenario.reconfigure?.(time, previous, config);
        }

        const pacerChanged = previous.power !== config.power
            || previous.pacingRate !== config.pacingRate
            || previous.asynchronous !== config.asynchronous;
        if (pacerChanged) {
            schedulePacerFrom(Math.max(time, lastControlTime));
        }
    }

    function sampleAt(sampleTime) {
        let value = 0;
        for (const event of waveformEvents) {
            if (event.start > sampleTime) break;
            if (event.end >= sampleTime) value += sampleEvent(event, sampleTime);
        }
        return value;
    }

    function sampleRange(startTime, endTime) {
        const start = Math.min(startTime, endTime);
        const end = Math.max(startTime, endTime);
        let best = sampleAt(start);
        let bestAbs = Math.abs(best);

        for (const event of waveformEvents) {
            if (event.start > end) break;
            if (event.end < start) continue;
            const { x } = event.template;
            const first = lowerBound(x, start - event.start);
            for (let index = Math.max(0, first - 1); index < x.length; index += 1) {
                const pointTime = event.start + x[index];
                if (pointTime > end) break;
                if (pointTime < start) continue;
                const value = sampleAt(pointTime);
                if (Math.abs(value) > bestAbs) {
                    best = value;
                    bestAbs = Math.abs(value);
                }
            }
        }

        const endValue = sampleAt(end);
        return Math.abs(endValue) > bestAbs ? endValue : best;
    }

    function reset(nextConfig = config) {
        config = normalizeConfig(nextConfig);
        time = 0;
        waveformEvents = [];
        controlEvents = [];
        scenario = createScenarioScheduler(config.scenarioId, { startTime: time, random });
        nextPaceTime = Infinity;
        lastControlTime = time;
        ventricularRefractoryUntil = -Infinity;
        schedulePacerFrom(time);
    }

    reset(config);

    return {
        advanceTo,
        updateConfig,
        sampleAt,
        sampleRange,
        reset,
        getTime: () => time,
        getConfig: () => ({ ...config }),
        getEvents: () => controlEvents.map((event) => ({ ...event }))
    };
}
