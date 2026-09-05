const MIN_RATE = 20;
const MAX_RATE = 220;

function beatInterval(config, random) {
    const rate = Math.min(MAX_RATE, Math.max(MIN_RATE, Number(config.intrinsicRate) || 60));
    const base = 60 / rate;
    if (config.intrinsicRegularity !== 'irregular') return base;
    return base * (0.85 + random() * 0.3);
}

function createSingleRhythm(morphology, options = {}) {
    return ({ startTime, random }) => {
        let nextBeatTime = startTime + 0.05;
        let beatNumber = 0;
        const pendingVentricular = [];

        return {
            nextTime: () => Math.min(nextBeatTime, pendingVentricular[0]?.time ?? Infinity),
            takeNext(config) {
                if (pendingVentricular.length && pendingVentricular[0].time <= nextBeatTime) {
                    return pendingVentricular.shift();
                }
                const time = nextBeatTime;
                beatNumber += 1;
                nextBeatTime += beatInterval(config, random);

                const conducted = options.conductionProbability === undefined
                    || random() < options.conductionProbability;

                if (conducted) {
                    pendingVentricular.push({
                        time: time + (morphology === 'Slow conduction' ? 0.25 : 0.16),
                        morphology: 'Intrinsic ventricular',
                        ventricular: true,
                        canBeSensed: true,
                        beatNumber
                    });
                }
                return {
                    time,
                    morphology: 'Atrial P wave',
                    ventricular: false,
                    canBeSensed: false,
                    beatNumber
                };
            },
            reconfigure(time, previous, next) {
                if (previous.intrinsicRate !== next.intrinsicRate) {
                    nextBeatTime = Math.min(nextBeatTime, time + beatInterval(next, random));
                }
            }
        };
    };
}

function createThirdDegreeBlock({ startTime, random }) {
    let nextAtrialTime = startTime + 0.05;
    let nextVentricularTime = startTime + 0.22;

    const atrialInterval = (config) => beatInterval(config, random) * 0.7;
    const ventricularInterval = (config) => beatInterval(config, random);

    return {
        nextTime: () => Math.min(nextAtrialTime, nextVentricularTime),
        takeNext(config) {
            if (nextAtrialTime <= nextVentricularTime) {
                const time = nextAtrialTime;
                nextAtrialTime += atrialInterval(config);
                return {
                    time,
                    morphology: '3rd degree heart block P wave',
                    ventricular: false,
                    canBeSensed: false
                };
            }

            const time = nextVentricularTime;
            nextVentricularTime += ventricularInterval(config);
            return {
                time,
                morphology: 'Escape ventricular',
                ventricular: true,
                canBeSensed: true
            };
        },
        reconfigure(time, previous, next) {
            if (previous.intrinsicRate !== next.intrinsicRate) {
                nextAtrialTime = Math.min(nextAtrialTime, time + atrialInterval(next));
                nextVentricularTime = Math.min(nextVentricularTime, time + ventricularInterval(next));
            }
        }
    };
}

const SCENARIOS = Object.freeze({
    NSR: createSingleRhythm('Normal'),
    Mobitz2: createSingleRhythm('Normal', { conductionProbability: 0.8 }),
    SlowConduction: createSingleRhythm('Slow conduction'),
    AV3: createThirdDegreeBlock
});

export function createScenarioScheduler(scenarioId, context) {
    return (SCENARIOS[scenarioId] ?? SCENARIOS.NSR)(context);
}

export function getSupportedScenarioIds() {
    return Object.keys(SCENARIOS);
}
