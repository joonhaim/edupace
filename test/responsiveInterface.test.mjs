import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../simulator-interface/', import.meta.url);

test('mobile shell exposes navigation and responsive styling', async () => {
    const [html, mainCss, responsiveCss] = await Promise.all([
        readFile(new URL('index.html', root), 'utf8'),
        readFile(new URL('styles/main.css', root), 'utf8'),
        readFile(new URL('styles/responsive.css', root), 'utf8')
    ]);

    assert.match(mainCss, /responsive\.css/);
    assert.match(html, /class="mobile-nav"/);
    assert.equal((html.match(/class="mobile-nav-item/g) ?? []).length, 4);
    assert.match(responsiveCss, /@media \(max-width: 1099px\)/);
    assert.match(responsiveCss, /body:not\(\.ecg-fullscreen-active\) \.view-stack[\s\S]*overflow: visible/);
    assert.match(responsiveCss, /\.mobile-nav[\s\S]*position: fixed/);
    assert.match(responsiveCss, /grid-template-areas:[\s\S]*"start"[\s\S]*"resources"/);
    assert.match(responsiveCss, /\.overlay-action\s*\{[\s\S]*pointer-events: auto/);
    assert.match(responsiveCss, /Keep the phone training flow focused/);
    assert.match(responsiveCss, /\.control-column\s*\{\s*order: initial/);
    assert.match(responsiveCss, /\.control-column \.control-stack,[\s\S]*\.graph-column \.calibration-performance[\s\S]*display: none/);
});

test('touch-sized layouts prefer virtual input mode', async () => {
    const deviceInit = await readFile(new URL('js/deviceInit.js', root), 'utf8');

    assert.match(deviceInit, /pointer: coarse/);
    assert.match(deviceInit, /value="virtual"/);
    assert.match(deviceInit, /dispatchEvent\(new Event\('change'/);
});
