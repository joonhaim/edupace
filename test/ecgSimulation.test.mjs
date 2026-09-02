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
