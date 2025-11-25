import { knobPresets } from './knobPresets.js';

const controllerState = {
    rate: getNearestPreset('rate', 80),
    output: getNearestPreset('output', 10),
    sensitivity: getNearestPreset('sensitivity', 2.0)
};

function initVirtualController() {
    const parametersCard = document.querySelector('.parameters-card');
    const title = document.getElementById('pacemakerTitle');

    if (!parametersCard || !title) {
        return;
    }

    const modeRadios = document.querySelectorAll('input[name="inputMode"]');
    const controlGroups = parametersCard.querySelectorAll('[data-virtual-control]');

    const display = {
        rate: document.getElementById('rateValue'),
        output: document.getElementById('outputValue'),
        sensitivity: document.getElementById('sensValue')
    };

    const isVirtualMode = () => Array.from(modeRadios).some((radio) => radio.checked && radio.value === 'virtual');

    const updateTiles = () => {
        if (display.rate) {
            display.rate.textContent = formatValue('rate', controllerState.rate);
        }
        if (display.output) {
            display.output.textContent = formatValue('output', controllerState.output);
        }
        if (display.sensitivity) {
            display.sensitivity.textContent = formatValue('sensitivity', controllerState.sensitivity);
        }
    };

    const broadcastParameters = () => {
        updateTiles();
        window.dispatchEvent(
            new CustomEvent('edupace-parameters', {
                detail: { ...controllerState }
            })
        );
    };

    const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

    const adjustValue = (key, direction, min, max, step) => {
        if (!isVirtualMode()) return;

        const presets = knobPresets[key] ?? [];

        if (presets.length) {
            const currentIndex = getPresetIndex(key, controllerState[key]);
            const offset = direction === 'down' ? -1 : 1;
            const nextIndex = clamp(currentIndex + offset, 0, presets.length - 1);
            const nextValue = presets[nextIndex];

            if (nextValue !== controllerState[key]) {
                controllerState[key] = nextValue;
                broadcastParameters();
            }
            return;
        }

        const decimals = `${step}`.split('.')[1]?.length ?? 0;
        const delta = direction === 'down' ? -step : step;
        const next = clamp(controllerState[key] + delta, min, max);
        const rounded = Number(next.toFixed(decimals));
        if (rounded !== controllerState[key]) {
            controllerState[key] = rounded;
            broadcastParameters();
        }
    };

    controlGroups.forEach((group) => {
        const key = group.dataset.virtualControl;
        if (!key || !(key in controllerState)) return;

        const min = Number(group.dataset.min ?? 0);
        const max = Number(group.dataset.max ?? 100);
        const step = Number(group.dataset.step ?? 1);

        const decrement = group.querySelector('[data-direction="down"]');
        const increment = group.querySelector('[data-direction="up"]');

        const handleAdjust = (direction) => adjustValue(key, direction, min, max, step);

        decrement?.addEventListener('click', () => handleAdjust('down'));
        increment?.addEventListener('click', () => handleAdjust('up'));
    });

    const applyModeState = () => {
        const virtualMode = isVirtualMode();
        parametersCard.classList.toggle('is-virtual', virtualMode);
        controlGroups.forEach((group) => group.setAttribute('aria-hidden', String(!virtualMode)));
        title.textContent = virtualMode ? 'Virtual Pacemaker Controller' : 'Pacemaker parameters';

        if (virtualMode) {
            broadcastParameters();
        }
    };

    modeRadios.forEach((radio) => {
        radio.addEventListener('change', applyModeState);
    });

    applyModeState();
}

function getPresetIndex(parameter, value) {
    const presets = knobPresets[parameter] ?? [];
    if (!presets.length) {
        return value;
    }

    const exactIndex = presets.findIndex((preset) => preset === value);
    if (exactIndex !== -1) {
        return exactIndex;
    }

    return presets.reduce((closestIndex, preset, index) => {
        const currentDiff = Math.abs(preset - value);
        const bestDiff = Math.abs(presets[closestIndex] - value);
        return currentDiff < bestDiff ? index : closestIndex;
    }, 0);
}

function getNearestPreset(parameter, value) {
    const presets = knobPresets[parameter] ?? [];
    if (!presets.length) {
        return value;
    }

    const exactMatch = presets.find((preset) => preset === value);
    if (exactMatch !== undefined) {
        return exactMatch;
    }

    return presets.reduce((closest, preset) => {
        const currentDiff = Math.abs(preset - value);
        const bestDiff = Math.abs(closest - value);
        return currentDiff < bestDiff ? preset : closest;
    }, presets[0]);
}

function formatValue(parameter, value) {
    if (parameter === 'rate') {
        return `${Math.round(value)}`;
    }
    return `${value.toFixed(1)}`;
}

export { initVirtualController };
