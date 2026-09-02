import assert from 'node:assert/strict';
import test from 'node:test';

import {
    EDUPACE_PORT_FILTERS,
    isAsyncMode,
    parsePayload
} from '../simulator-interface/js/arduinoProtocol.mjs';

test('Web Serial filters use the usbVendorId field required by the API', () => {
    assert.ok(EDUPACE_PORT_FILTERS.length > 0);
    EDUPACE_PORT_FILTERS.forEach((filter) => {
        assert.equal(typeof filter.usbVendorId, 'number');
        assert.equal('vendorId' in filter, false);
    });
});

test('parses the Arduino parameter message', () => {
    assert.deepEqual(parsePayload('PACE=80,OUTPUT=10.00,SENSE=2.00'), {
        rate: 80,
        output: 10,
        sensitivity: 2,
        asynchronous: false
    });
});

test('maps the firmware nan sensitivity sentinel to asynchronous mode', () => {
    const payload = parsePayload('PACE=80,OUTPUT=10.00,SENSE=nan');
    assert.deepEqual(payload, {
        rate: 80,
        output: 10,
        sensitivity: null,
        asynchronous: true
    });
    assert.equal(isAsyncMode({ power: true, ...payload }), true);
});

test('an explicit ASYNC mode is not masked by an older false flag', () => {
    assert.equal(isAsyncMode({ power: true, mode: 'ASYNC', asynchronous: false }), true);
});

test('does not let malformed numeric input poison parameter state', () => {
    assert.deepEqual(parsePayload('PACE=oops,OUTPUT=5x,SENSE=2.5'), {
        rate: undefined,
        output: undefined,
        sensitivity: 2.5,
        asynchronous: false
    });
});

test('parses discrete power, lock, and LED messages', () => {
    assert.deepEqual(parsePayload('POWER_ON'), { power: 'ON' });
    assert.deepEqual(parsePayload('POWER_OFF'), { power: 'OFF' });
    assert.deepEqual(parsePayload('LOCK_ON'), { lock: true });
    assert.deepEqual(parsePayload('PACE_LED'), { paceLed: true });
});
