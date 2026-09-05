import assert from 'node:assert/strict';
import test from 'node:test';

import { createEcgSimulation } from '../simulator-interface/ecg/ecgSimulation.js';
import { getSupportedScenarioIds } from '../simulator-interface/ecg/ecgScenarios.js';

function seededRandom(seed = 1) {
    let value = seed >>> 0;
    return () => {
        value = (1664525 * value + 1013904223) >>> 0;
        return value / 0x100000000;
    };
}

test('all existing ECG scenarios are registered', () => {
    assert.deepEqual(getSupportedScenarioIds().sort(), [
        'AV3',
        'Mobitz2',
        'NSR',
        'SlowConduction'
    ]);
});

for (const scenarioId of getSupportedScenarioIds()) {
    test(`${scenarioId} produces a live signal`, () => {
        const simulation = createEcgSimulation(
            { scenarioId, intrinsicRate: 60, power: false },
            { random: seededRandom(5) }
        );
        simulation.advanceTo(3);

        const peak = Math.max(...Array.from({ length: 600 }, (_, index) =>
            Math.abs(simulation.sampleRange(index / 200, (index + 1) / 200))
        ));
        assert.ok(peak > 0.05, `Expected ${scenarioId} to produce a visible waveform`);
    });
}

test('the signal timeline continues beyond each six-second sweep', () => {
    const simulation = createEcgSimulation(
        { scenarioId: 'NSR', intrinsicRate: 60, power: false },
        { random: seededRandom(7) }
    );

    simulation.advanceTo(5.9);
    const firstSweep = Array.from({ length: 60 }, (_, index) =>
        simulation.sampleAt(0.1 + index * 0.095)
    );

    simulation.advanceTo(11.9);
    const secondSweep = Array.from({ length: 60 }, (_, index) =>
        simulation.sampleAt(6.1 + index * 0.095)
    );

    assert.equal(simulation.getTime(), 11.9);
    assert.notDeepEqual(secondSweep, firstSweep);
});

test('configuration changes take effect without rewinding simulation time', () => {
    const simulation = createEcgSimulation(
        { scenarioId: 'NSR', intrinsicRate: 60, power: false },
        { random: seededRandom(11) }
    );

    simulation.advanceTo(4);
    const historicalSample = simulation.sampleAt(3.25);
    simulation.updateConfig({ scenarioId: 'SlowConduction', intrinsicRate: 45 }, 4);

    assert.equal(simulation.getTime(), 4);
    assert.equal(simulation.sampleAt(3.25), historicalSample);
    assert.equal(simulation.getConfig().scenarioId, 'SlowConduction');

    simulation.advanceTo(8);
    assert.equal(simulation.getTime(), 8);
});

test('pacemaker events remain absolute and unique across sweep boundaries', () => {
    const simulation = createEcgSimulation(
        {
            scenarioId: 'NSR',
            intrinsicRate: 50,
            pacingRate: 60,
            output: 2,
            sensitivity: 2,
            power: true,
            asynchronous: true
        },
        { random: seededRandom(19) }
    );

    const firstEvents = simulation.advanceTo(6).filter((event) => event.kind === 'pace');
    const secondEvents = simulation.advanceTo(12).filter((event) => event.kind === 'pace');
    const allTimes = [...firstEvents, ...secondEvents].map((event) => event.time);

    assert.ok(firstEvents.length >= 5);
    assert.ok(secondEvents.length >= 5);
    assert.ok(secondEvents.every((event) => event.time > 6));
    assert.equal(new Set(allTimes).size, allTimes.length);
});

test('demand pacing is inhibited by sensed intrinsic beats', () => {
    const simulation = createEcgSimulation(
        {
            scenarioId: 'NSR',
            intrinsicRate: 75,
            pacingRate: 50,
            output: 2,
            sensitivity: 0.1,
            power: true,
            asynchronous: false
        },
        { random: seededRandom(23) }
    );

    const events = simulation.advanceTo(10);
    assert.ok(events.some((event) => event.kind === 'sense'));
    assert.equal(events.filter((event) => event.kind === 'pace').length, 0);
});

const eventsOf = (events, kind) => events.filter(event => event.kind === kind);
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-6, `${actual} != ${expected}`);
function pacedSimulation(changes = {}, random = () => 0.5) {
    return createEcgSimulation({ power: true, intrinsicRate: 60, pacingRate: 60, output: 2, ...changes }, { random });
}
function assertRefractorySpacing(events) {
    const beats = eventsOf(events, 'ventricular');
    for (let i = 1; i < beats.length; i++) assert.ok(beats[i].time - beats[i - 1].time >= 0.3 - 1e-7);
}

test('VVI senses at QRS onset, using a separate 5 mV R wave including equality', () => {
    for (const random of [() => 0, () => 0.999]) {
        const sim = pacedSimulation({ intrinsicRate: 90, sensitivity: 5 }, random);
        assert.equal(eventsOf(sim.advanceTo(0.20), 'sense').length, 0);
        const events = sim.advanceTo(10);
        close(eventsOf(events, 'sense')[0].time, 0.21);
        assert.equal(eventsOf(events, 'pace').length, 0);
        assert.ok(eventsOf(events, 'sense').length > 10);
    }
});

test('slower intrinsic rhythm permits VVI capture and resets the escape interval', () => {
    const sim = pacedSimulation({ intrinsicRate: 30 });
    const events = sim.advanceTo(2);
    const pace = eventsOf(events, 'pace')[0];
    close(pace.time, 1.21);
    assert.equal(pace.captured, true);
    assert.ok(events.some(event => event.kind === 'ventricular' && event.source === 'paced' && event.time === pace.time));
    assertRefractorySpacing(events);
});

for (const asynchronous of [false, true]) {
    test(`${asynchronous ? 'VOO competition' : 'VVI undersensing'} cannot capture during intrinsic refractoriness`, () => {
        const sim = pacedSimulation({ intrinsicRate: 80, sensitivity: 6, asynchronous });
        const events = sim.advanceTo(4);
        const firstPace = eventsOf(events, 'pace')[0];
        close(firstPace.time, 1);
        assert.equal(firstPace.captured, false); // QRS at .96
        assert.equal(firstPace.refractory, true);
        assert.equal(eventsOf(events, 'sense').length, 0);
        assert.ok(eventsOf(events, 'pace').some(event => event.captured));
        assertRefractorySpacing(events);
        assert.ok(sim.sampleAt(1.006) > sim.sampleAt(1) + 0.1, 'Refractory pulse still draws a spike');
        if (asynchronous) assert.deepEqual(eventsOf(events, 'pace').map(event => event.time), [1, 2, 3, 4]);
    });
}

test('below-threshold output creates only a spike, without ventricular events', () => {
    const sim = pacedSimulation({ intrinsicRate: 20, output: 1.49, asynchronous: true });
    const events = sim.advanceTo(2);
    assert.ok(eventsOf(events, 'pace').every(event => !event.captured));
    assert.equal(eventsOf(events, 'ventricular').length, 1);
    assert.ok(sim.sampleAt(1.006) > 0.4);
    close(sim.sampleAt(1.02), 0);
    close(sim.sampleAt(1.1), 0);
});

test('capture threshold is stable and captures at equality', () => {
    const sim = pacedSimulation({ intrinsicRate: 20, output: 1.5, asynchronous: true }, seededRandom(2));
    const events = sim.advanceTo(9);
    assert.ok(eventsOf(events, 'pace').every(event => event.captured === !event.refractory));
    assert.equal(sim.getState().captureThresholdMa, 1.5);
    sim.updateConfig({ captureThresholdMa: 2, output: 1.9 });
    assert.equal(eventsOf(sim.advanceTo(10), 'pace')[0].captured, false);
});

test('device blanking is distinct from myocardium and follows failed pulses too', () => {
    const sim = pacedSimulation({ intrinsicRate: 60 / 0.94, output: 0 });
    sim.advanceTo(0.21);
    close(sim.getState().pacerSensingBlankedUntil, 0.33);
    close(sim.getState().ventricularRefractoryUntil, 0.51);
    // A failed pulse at 1.0 blanks sensing of the QRS at 1.15.
    sim.reset({ power: true, intrinsicRate: 60 / 0.94, output: 0, pacingRate: 60, sensitivity: 6 });
    sim.advanceTo(1);
    close(sim.getState().pacerSensingBlankedUntil, 1.2);
    close(sim.getState().ventricularRefractoryUntil, 0.51);
    sim.updateConfig({ sensitivity: 2 });
    const events = sim.advanceTo(1.15);
    assert.equal(eventsOf(events, 'ventricular').length, 1);
    assert.equal(eventsOf(events, 'sense').length, 0);
    close(sim.getState().nextPaceTime, 2);
    close(sim.getState().ventricularRefractoryUntil, 1.45);
});

test('complete AV block keeps atrial events independent of ventricular pacing', () => {
    const off = pacedSimulation({ scenarioId: 'AV3', intrinsicRate: 30, power: false });
    const on = pacedSimulation({ scenarioId: 'AV3', intrinsicRate: 30, asynchronous: true });
    const offEvents = off.advanceTo(8);
    const onEvents = on.advanceTo(8);
    assert.deepEqual(eventsOf(onEvents, 'atrial'), eventsOf(offEvents, 'atrial'));
    assert.ok(eventsOf(onEvents, 'ventricular').some(event => event.source === 'paced'));
    assertRefractorySpacing(onEvents);
    const normal = pacedSimulation({ intrinsicRate: 20, asynchronous: true });
    normal.advanceTo(1.8);
    close(normal.sampleAt(1.6), 0);
});

test('standard pacing is limited to 30–200 ppm with a 300 ms boundary inclusive of capture', () => {
    for (const [pacingRate, interval] of [[10, 2], [250, 0.3]]) {
        const sim = pacedSimulation({ pacingRate, asynchronous: true, intrinsicRate: 20 });
        const events = sim.advanceTo(3);
        const paces = eventsOf(events, 'pace');
        close(paces[0].time, interval);
        for (let i = 1; i < paces.length; i++) close(paces[i].time - paces[i - 1].time, interval);
        assertRefractorySpacing(events);
        if (pacingRate === 250) assert.ok(paces.slice(1).every(event => event.captured));
    }
});

test('ventricular templates begin at QRS and retain narrow intrinsic and broad paced widths', async () => {
    const { getWaveformTemplate } = await import('../simulator-interface/ecg/ecgWaveformLibrary.js');
    const intrinsic = getWaveformTemplate('Intrinsic ventricular');
    const paced = getWaveformTemplate('Paced ventricular');
    close(intrinsic.x[0], 0);
    close(intrinsic.x[100], 0.09);
    close(paced.x[0], 0);
    close(paced.x[100], 0.15);
});

test('rapid irregular atrial activity retains delayed ventricular conduction events', async () => {
    const { createScenarioScheduler } = await import('../simulator-interface/ecg/ecgScenarios.js');
    const scheduler = createScenarioScheduler('SlowConduction', { startTime: 0, random: () => 0 });
    const config = { intrinsicRate: 220, intrinsicRegularity: 'irregular' };
    const firstP = scheduler.takeNext(config);
    const secondP = scheduler.takeNext(config);
    const firstQrs = scheduler.takeNext(config);
    assert.equal(firstP.ventricular, false);
    assert.equal(secondP.ventricular, false);
    assert.equal(firstQrs.ventricular, true);
    close(firstQrs.time, firstP.time + 0.25);
});

test('NSR visual gain stays within 0.95–1.05 and varies smoothly without changing sensing', async () => {
    const { getWaveformTemplate } = await import('../simulator-interface/ecg/ecgWaveformLibrary.js');
    const template = getWaveformTemplate('Intrinsic ventricular');
    const peak = Math.max(...template.y);
    const peakTime = template.x[template.y.indexOf(peak)];
    let target = 1;
    const sim = pacedSimulation({ intrinsicRate: 60, pacingRate: 30, sensitivity: 5 }, () => target);
    const gains = [];
    for (let beat = 0; beat < 12; beat++) {
        target = beat < 6 ? 1 : 0;
        const qrsTime = 0.21 + beat;
        const events = sim.advanceTo(qrsTime + peakTime);
        assert.equal(eventsOf(events, 'sense').length, 1);
        assert.equal(eventsOf(events, 'pace').length, 0);
        gains.push(sim.sampleAt(qrsTime + peakTime) / peak);
    }
    assert.ok(gains.every(gain => gain >= 0.95 && gain <= 1.05));
    assert.ok(gains[5] > gains[0]);
    assert.ok(gains[11] < gains[6]);
    for (let i = 1; i < gains.length; i++) assert.ok(Math.abs(gains[i] - gains[i - 1]) <= 0.025);
    assert.equal(sim.getState().rWaveAmplitudeMv, 5);
    target = 1;
    sim.reset();
    sim.advanceTo(0.21 + peakTime);
    close(sim.sampleAt(0.21 + peakTime) / peak, gains[0]);
});

test('stable sensitivity guide predicts sensing at 2, 4, 5 and 6 mV', async () => {
    const { getSensitivityGuideAmplitude, getNominalRWaveDisplayAmplitude } =
        await import('../simulator-interface/ecg/ecgWaveformLibrary.js');
    const nominal = getNominalRWaveDisplayAmplitude();
    for (const [sensitivity, fraction, sensed] of [[2, 0.4, true], [4, 0.8, true], [5, 1, true], [6, 1.2, false]]) {
        const sim = pacedSimulation({ sensitivity, pacingRate: 30 }, seededRandom(42));
        const guide = () => getSensitivityGuideAmplitude(sensitivity, sim.getState().rWaveAmplitudeMv);
        close(guide(), nominal * fraction);
        const initialGuide = guide();
        const events = sim.advanceTo(0.21);
        assert.equal(eventsOf(events, 'sense').length > 0, sensed);
        assert.equal(guide() <= nominal, sensed);
        sim.advanceTo(8);
        assert.equal(guide(), initialGuide);
    }
    // Changing the patient's R-wave sensing amplitude changes the guide, not ECG gain.
    const a = pacedSimulation({ rWaveAmplitudeMv: 5, sensitivity: 4 }, () => 0.5);
    const b = pacedSimulation({ rWaveAmplitudeMv: 3, sensitivity: 4 }, () => 0.5);
    assert.equal(eventsOf(a.advanceTo(0.4), 'sense').length, 1);
    assert.equal(eventsOf(b.advanceTo(0.4), 'sense').length, 0);
    for (let time = 0; time < 0.4; time += 0.005) close(a.sampleAt(time), b.sampleAt(time));
    assert.ok(getSensitivityGuideAmplitude(4, 3) > nominal);
});
