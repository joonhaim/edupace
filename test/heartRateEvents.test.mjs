import assert from 'node:assert/strict';
import test from 'node:test';
import { createEcgSimulation } from '../simulator-interface/ecg/ecgSimulation.js';
import { createHeartRateEngine } from '../simulator-interface/js/heartRateEngine.js';

test('HR follows successful ventricular events despite faster noncapturing pacing', (t) => {
    globalThis.document = { getElementById: () => null };
    const updates = [];
    globalThis.window = { dispatchEvent: event => updates.push(event) };
    t.after(() => { delete globalThis.document; delete globalThis.window; });
    const display = { textContent: '' };
    const hr = createHeartRateEngine(display);
    hr.setBeepMuted(true);
    const sim = createEcgSimulation({ power: true, asynchronous: true, intrinsicRate: 30, pacingRate: 120, output: 0 });
    const events = sim.advanceTo(7);
    for (const event of events) {
        if (event.kind === 'ventricular') hr.recordVentricularEvent(event.time);
        hr.advanceTime(event.time);
    }
    assert.equal(display.textContent, '30');
    const recorded = updates.filter(event => event.type === 'edupace-hr-update');
    assert.equal(recorded.at(-1).detail.lastPeakTime, events.filter(event => event.kind === 'ventricular').at(-1).time);
    assert.equal(events.filter(event => event.kind === 'pace').length, 14);
});
