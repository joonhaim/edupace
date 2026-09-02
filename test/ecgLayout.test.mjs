import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const engineSource = readFileSync(
    new URL('../simulator-interface/ecg/ecgEngine.js', import.meta.url),
    'utf8'
);
const trainingCss = readFileSync(
    new URL('../simulator-interface/styles/training.css', import.meta.url),
    'utf8'
);

test('the rendered canvas does not feed an inline size back into its parent', () => {
    assert.doesNotMatch(engineSource, /canvas\.style\.(?:width|height)\s*=/);
});

test('the ECG canvas is removed from normal layout sizing', () => {
    const canvasRule = trainingCss.match(/\.ecg-frame canvas\s*\{([^}]+)\}/);
    assert.ok(canvasRule, 'Expected an ECG canvas style rule');
    assert.match(canvasRule[1], /position:\s*absolute/);
    assert.match(canvasRule[1], /inset:\s*0/);
    assert.match(canvasRule[1], /width:\s*100%/);
    assert.match(canvasRule[1], /height:\s*100%/);
});
