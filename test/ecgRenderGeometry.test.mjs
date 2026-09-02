import assert from 'node:assert/strict';
import test from 'node:test';

import {
    TRACE_JOIN_OVERLAP_PX,
    getTimelineSliceGeometry
} from '../simulator-interface/ecg/ecgRenderGeometry.js';

test('adjacent timeline slices redraw a two-pixel temporal overlap', () => {
    const geometry = getTimelineSliceGeometry({
        x0: 100,
        x1: 104,
        startTime: 10,
        endTime: 10.02,
        width: 800,
        joinFromPrevious: true
    });

    assert.equal(TRACE_JOIN_OVERLAP_PX, 2);
    assert.equal(geometry.paintX0, 98);
    assert.equal(geometry.startCol, 98);
    assert.equal(geometry.paintStartTime, 9.99);
    assert.equal(geometry.anchorCol, 97);
});

test('the sweep wrap starts cleanly without bridging to the prior cycle', () => {
    const geometry = getTimelineSliceGeometry({
        x0: 0,
        x1: 4,
        startTime: 6,
        endTime: 6.02,
        width: 800,
        joinFromPrevious: true
    });

    assert.equal(geometry.paintX0, 0);
    assert.equal(geometry.paintStartTime, 6);
    assert.equal(geometry.startCol, 0);
    assert.equal(geometry.anchorCol, null);
});

test('full redraw slices preserve their original bounds', () => {
    const geometry = getTimelineSliceGeometry({
        x0: 240,
        x1: 800,
        startTime: 8,
        endTime: 12,
        width: 800
    });

    assert.equal(geometry.paintX0, 240);
    assert.equal(geometry.paintStartTime, 8);
    assert.equal(geometry.anchorCol, null);
});
