import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { EventEmitter } from 'node:events';
import { installSerialAccess } from '../electron/serial.js';
import { EDUPACE_VENDOR_IDS, parsePayload, isAsyncMode } from '../simulator-interface/js/arduinoProtocol.mjs';

const adapterSource = readFileSync(new URL('../simulator-interface/js/arduinoSerialAdapter.js', import.meta.url), 'utf8');
function adapter(source = adapterSource) {
    // Windows checkouts can use CRLF. Normalize before stripping module syntax
    // for the isolated VM, which deliberately runs the adapter as a script.
    source = source.replace(/\r\n/g, '\n')
        .replace(/^import [\s\S]*?from .*?;\n/, '').replace(/export \{[^}]+\};/, '');
    const elements = new Map();
    const element = id => {
        if (!elements.has(id)) elements.set(id, {
            textContent: '', hidden: true, disabled: false, dataset: {},
            classList: { toggle() {}, contains() { return false; } },
            toggleAttribute() {}, removeAttribute() {}, setAttribute() {}
        });
        return elements.get(id);
    };
    const saved = new Map();
    const events = [];
    const context = vm.createContext({
        TextEncoder, TextDecoder, EDUPACE_VENDOR_IDS, parsePayload, isAsyncMode,
        console: { error() {}, warn() {} },
        navigator: { serial: { getPorts: async () => [] } },
        document: { getElementById: element, querySelector: () => null },
        window: { dispatchEvent: event => events.push(event), setTimeout },
        CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail; } },
        localStorage: { setItem: (k,v) => saved.set(k,v), getItem: k => saved.get(k), removeItem: k => saved.delete(k) }
    });
    vm.runInContext(source + '\nui.connectBtn = document.getElementById("connectBtn"); ui.connectionStatus = document.getElementById("connectionStatus");', context);
    return { context, element, saved, events, run: code => vm.runInContext(code, context) };
}
function port(info = { usbVendorId: 0x2341, usbProductId: 0x0366 }) {
    const calls = [];
    let resolveRead;
    const reader = {
        read: () => new Promise(resolve => { resolveRead = resolve; }),
        cancel: async () => resolveRead?.({ done: true }), releaseLock() { calls.push('reader released'); }
    };
    return {
        calls, reader, getInfo: () => info,
        open: async options => calls.push(['open', options.baudRate, options.flowControl]),
        setSignals: async signals => calls.push(['DTR', signals.dataTerminalReady]),
        close: async () => calls.push('close'),
        readable: { getReader: () => reader },
        writable: { getWriter: () => ({ releaseLock() { calls.push('writer released'); } }) },
        addEventListener() {}, removeEventListener() {}
    };
}

for (const [format, newline] of [['LF', '\n'], ['CRLF', '\r\n']]) {
    test(`serial adapter connects with ${format} source line endings`, async () => {
        const source = adapterSource.replace(/\r\n/g, '\n').replace(/\n/g, newline);
        const h = adapter(source);
        h.context.device = port();
        await h.run('connectToHardware(device)');
        assert.equal(h.run('serialState.port'), h.context.device);
        assert.equal(h.element('connectBtn').textContent, 'DISCONNECT');
        await h.run('disconnectFromHardware()');
    });
}

test('unfiltered selection connects an unknown USB bridge and asserts DTR at firmware baud rate', async () => {
    const h = adapter();
    const device = port({ usbVendorId: 0x9999 });
    h.context.navigator.serial.requestPort = async (...args) => { assert.equal(args.length, 0); return device; };
    await h.run('connectToHardware()');
    assert.deepEqual(device.calls.slice(0, 2), [['open', 115200, 'none'], ['DTR', true]]);
    assert.equal(h.element('connectBtn').textContent, 'DISCONNECT');
    await h.run('disconnectFromHardware()');
    assert.ok(device.calls.includes('close'));
});

test('busy port errors are visible and release the connecting state for retry', async () => {
    const h = adapter();
    const device = port();
    device.open = async () => { throw new Error('Port in use'); };
    h.context.device = device;
    await h.run('connectToHardware(device)');
    assert.equal(h.element('connectionError').hidden, false);
    assert.match(h.element('connectionError').textContent, /Serial Monitor/);
    assert.equal(h.run('serialState.connecting'), false);
    assert.equal(h.element('connectBtn').disabled, false);
});

test('cancelling the picker is not reported as a connection error', async () => {
    const h = adapter();
    h.context.navigator.serial.requestPort = async () => { throw Object.assign(new Error(), { name: 'NotFoundError' }); };
    await h.run('connectToHardware()');
    assert.equal(h.element('connectionError').hidden, true);
    assert.equal(h.run('serialState.port'), null);
});

test('concurrent connection requests only open once and unsupported signals do not prevent reads', async () => {
    const h = adapter();
    const device = port();
    device.setSignals = async () => { throw new Error('Unsupported'); };
    h.context.device = device;
    await Promise.all([h.run('connectToHardware(device)'), h.run('connectToHardware(device)')]);
    assert.equal(device.calls.filter(call => call[0] === 'open').length, 1);
    assert.equal(h.run('serialState.port'), device);
    await h.run('disconnectFromHardware()');
});

test('remembered unplugged port is retained and reconnect resets inferred power', async () => {
    const h = adapter();
    h.context.device = port();
    await h.run('connectToHardware(device)');
    await h.run('disconnectFromHardware({forget: false})');
    await h.run('restoreLastPortConnection()');
    assert.equal(h.saved.size, 1);
    h.context.navigator.serial.getPorts = async () => [h.context.device];
    await h.run('restoreLastPortConnection()');
    h.run('handleHardwareMessage("PACE=80,OUTPUT=10,SENSE=2")');
    assert.equal(h.run('parameterState.power'), true);
    await h.run('disconnectFromHardware()');
});

test('serial read loop assembles fragmented firmware lines and cleans up on unplug', async () => {
    const h = adapter();
    const device = port();
    const chunks = ['PACE=80,OUT', 'PUT=10,SENSE=2\r\n'];
    let unplug;
    device.reader.read = async () => chunks.length
        ? { value: new TextEncoder().encode(chunks.shift()), done: false }
        : new Promise((_, reject) => { unplug = reject; });
    h.context.device = device;
    await h.run('connectToHardware(device)');
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(h.run('parameterState.rate'), 80);
    assert.equal(h.run('parameterState.power'), true);
    unplug(new Error('Device removed'));
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(h.run('serialState.port'), null);
    assert.equal(h.element('connectBtn').textContent, 'CONNECT');
    assert.equal(h.saved.size, 1);
    assert.ok(device.calls.includes('close'));
});

test('same-model devices require selection instead of an ambiguous automatic reconnect', async () => {
    const h = adapter();
    h.context.device = port();
    h.run('rememberLastPort(device)');
    h.context.navigator.serial.getPorts = async () => [h.context.device, port()];
    await h.run('restoreLastPortConnection()');
    assert.equal(h.run('serialState.port'), null);
});

function desktop(showMessageBox) {
    const session = new EventEmitter();
    session.setPermissionCheckHandler = fn => { session.check = fn; };
    session.setPermissionRequestHandler = fn => { session.request = fn; };
    const window = new EventEmitter();
    window.webContents = { session, getURL: () => 'file:///app/index.html' };
    installSerialAccess(window, { showMessageBox });
    const select = session.listeners('select-serial-port')[0];
    return { session, window, select: (ports, callback) => select({ preventDefault() {} }, ports, window.webContents, callback) };
}

test('Electron lets the user select COM and macOS ports including missing vendor IDs', async () => {
    for (const name of ['COM3', '/dev/cu.usbmodem123']) {
        const h = desktop(async (_, options) => {
            assert.match(options.buttons[2], new RegExp(name));
            return { response: 2 };
        });
        let selected;
        await h.select([{ portId: 'other', portName: 'other' }, { portId: 'arduino', portName: name }], id => { selected = id; });
        assert.equal(selected, 'arduino');
        assert.equal(h.session.listenerCount('serial-port-removed'), 0);
        assert.equal(h.session.check(h.window.webContents, 'serial', 'file://'), true);
        assert.equal(h.session.check({}, 'serial', 'file://'), false);
        assert.equal(h.session.check(h.window.webContents, 'serial', 'https://example.com'), false);
    }
});

test('Electron cancels empty, cancelled, unplugged and closed-window selections exactly once', async () => {
    for (const action of ['empty', 'cancel', 'unplug', 'close']) {
        let resolveDialog;
        const h = desktop(() => new Promise(resolve => { resolveDialog = resolve; }));
        const responses = [];
        const task = h.select(action === 'empty' ? [] : [{ portId: 'one', portName: 'COM3' }], id => responses.push(id));
        if (action === 'unplug') h.session.emit('serial-port-removed', {}, { portId: 'one' });
        if (action === 'close') h.window.emit('closed');
        resolveDialog({ response: action === 'cancel' || action === 'empty' ? 0 : 1 });
        await task;
        assert.deepEqual(responses, ['']);
        assert.equal(h.session.listenerCount('serial-port-removed'), 0);
    }
});
