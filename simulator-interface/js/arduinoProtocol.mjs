const ASYNC_SENSITIVITY_THRESHOLD = 20;

const EDUPACE_VENDOR_IDS = new Set([0x2341, 0x2a03, 0x1a86, 0x10c4, 0x0403, 0x067b]);
const EDUPACE_PORT_FILTERS = Array.from(EDUPACE_VENDOR_IDS, (usbVendorId) => ({ usbVendorId }));

function isAsyncMode({ power, sensitivity, mode, asynchronous }) {
    if (power === false) return false;
    if (typeof mode === 'string' && mode.trim().toUpperCase() === 'ASYNC') return true;
    if (typeof asynchronous === 'boolean') return asynchronous;
    return typeof sensitivity === 'number' && sensitivity > ASYNC_SENSITIVITY_THRESHOLD;
}

function parsePayload(line) {
    const trimmed = line.trim().toUpperCase();
    if (trimmed === 'POWER_ON') return { power: 'ON' };
    if (trimmed === 'POWER_OFF') return { power: 'OFF' };
    if (trimmed === 'LOCK_ON') return { lock: true };
    if (trimmed === 'LOCK_OFF') return { lock: false };
    if (trimmed === 'PACE_LED') return { paceLed: true };
    if (trimmed === 'SENSE_LED') return { senseLed: true };

    const payload = {};
    const parseFiniteNumber = (value) => {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : undefined;
    };

    line.split(/[;,]/).forEach((segment) => {
        const [rawKey, rawValue] = segment.split(/[:=]/);
        if (!rawKey || rawValue === undefined) return;

        const key = rawKey.trim().toLowerCase();
        const value = rawValue.trim();

        switch (key) {
            case 'pace':
            case 'rate':
                payload.rate = parseFiniteNumber(value);
                break;
            case 'output':
                payload.output = parseFiniteNumber(value);
                break;
            case 'sense':
            case 'sensitivity':
                if (value.toLowerCase() === 'nan' || value.toUpperCase() === 'ASYNC') {
                    payload.sensitivity = null;
                    payload.asynchronous = true;
                } else {
                    const sensitivity = parseFiniteNumber(value);
                    if (sensitivity !== undefined) {
                        payload.sensitivity = sensitivity;
                        payload.asynchronous = sensitivity > ASYNC_SENSITIVITY_THRESHOLD;
                    }
                }
                break;
            case 'power':
                payload.power = value.toUpperCase();
                break;
            case 'lock':
                payload.lock = value === '1' || value.toLowerCase() === 'true';
                break;
            case 'mode':
                payload.mode = value.toUpperCase();
                break;
            case 'paceled':
                payload.paceLed = value === '1' || value.toLowerCase() === 'true';
                break;
            case 'senseled':
                payload.senseLed = value === '1' || value.toLowerCase() === 'true';
                break;
            default:
                break;
        }
    });

    return payload;
}

export { EDUPACE_PORT_FILTERS, EDUPACE_VENDOR_IDS, isAsyncMode, parsePayload };
