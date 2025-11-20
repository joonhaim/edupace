import { knobPresets } from './knobPresets.js';

const controllerState = {
    rate: getNearestPreset('rate', 80),
    output: getNearestPreset('output', 10),
    sensitivity: getNearestPreset('sensitivity', 2.0)
};

function initVirtualController() {
    const card = document.getElementById('virtualControllerCard');
    if (!card) {
        return;
    }

    const labels = {
        rate: card.querySelector('[data-value="rate"]'),
        output: card.querySelector('[data-value="output"]'),
        sensitivity: card.querySelector('[data-value="sensitivity"]')
    };

    const inputs = {
        rate: card.querySelector('[data-control="rate"]'),
        output: card.querySelector('[data-control="output"]'),
        sensitivity: card.querySelector('[data-control="sensitivity"]')
    };

    const display = {
        rate: document.getElementById('rateValue'),
        output: document.getElementById('outputValue'),
        sensitivity: document.getElementById('sensValue')
    };

    const modeRadios = document.querySelectorAll('input[name="inputMode"]');

    Object.entries(inputs).forEach(([key, input]) => {
        if (!input) return;

        const presets = knobPresets[key] ?? [];

        if (presets.length) {
            input.min = 0;
            input.max = presets.length - 1;
            input.step = 1;
            input.value = getPresetIndex(key, controllerState[key]);
        } else {
            input.value = controllerState[key];
        }

        input.addEventListener('input', () => {
            controllerState[key] = getPresetValue(key, Number(input.value));
            updateInputs();
            updateLabels();
            broadcastParameters();
        });
    });

    const updateLabels = () => {
        if (labels.rate) {
            labels.rate.textContent = `${formatValue('rate', controllerState.rate)} bpm`;
        }
        if (labels.output) {
            labels.output.textContent = `${formatValue('output', controllerState.output)} mA`;
        }
        if (labels.sensitivity) {
            labels.sensitivity.textContent = `${formatValue('sensitivity', controllerState.sensitivity)} mV`;
        }
    };

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
        const presets = knobPresets[key] ?? [];

        if (presets.length) {
            const currentIndex = getPresetIndex(key, controllerState[key]);
            const offset = direction === 'down' ? -1 : 1;
            const nextIndex = clamp(currentIndex + offset, 0, presets.length - 1);
            const nextValue = presets[nextIndex];

            if (nextValue !== controllerState[key]) {
                controllerState[key] = nextValue;
                updateInputs();
                updateLabels();
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
            updateLabels();
            broadcastParameters();
        }
    };

    const controls = card.querySelectorAll('.virtual-control');

    controls.forEach((control) => {
        const key = control.dataset.control;
        if (!key || !(key in controllerState)) return;

        const min = Number(control.dataset.min ?? 0);
        const max = Number(control.dataset.max ?? 100);
        const step = Number(control.dataset.step ?? 1);

        const decrement = control.querySelector('[data-direction="down"]');
        const increment = control.querySelector('[data-direction="up"]');

        const handleAdjust = (direction) => {
            adjustValue(key, direction, min, max, step);
        };

        decrement?.addEventListener('click', () => handleAdjust('down'));
        increment?.addEventListener('click', () => handleAdjust('up'));

        control.addEventListener('keydown', (event) => {
            if (event.key === 'ArrowLeft') {
                event.preventDefault();
                handleAdjust('down');
            } else if (event.key === 'ArrowRight') {
                event.preventDefault();
                handleAdjust('up');
            }
        });
    });

    const toggleCardVisibility = () => {
        const isVirtual = Array.from(modeRadios).some((radio) => radio.checked && radio.value === 'virtual');
        card.classList.toggle('is-active', isVirtual);
        card.setAttribute('aria-hidden', String(!isVirtual));
        if (isVirtual) {
            updateInputs();
            broadcastParameters();
        }
    };

    modeRadios.forEach((radio) => {
        radio.addEventListener('change', toggleCardVisibility);
    });

    updateInputs();
    updateLabels();
    toggleCardVisibility();
}

function getPresetValue(parameter, index) {
    const presets = knobPresets[parameter] ?? [];
    if (!presets.length) {
        return index;
    }

    const clampedIndex = Math.min(Math.max(Math.round(index), 0), presets.length - 1);
    return presets[clampedIndex];
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

function updateInputs() {
    const card = document.getElementById('virtualControllerCard');
    if (!card) {
        return;
    }

    const inputs = {
        rate: card.querySelector('[data-control="rate"]'),
        output: card.querySelector('[data-control="output"]'),
        sensitivity: card.querySelector('[data-control="sensitivity"]')
    };

    Object.entries(inputs).forEach(([key, input]) => {
        if (!input) return;

        const presets = knobPresets[key] ?? [];
        if (presets.length) {
            input.value = getPresetIndex(key, controllerState[key]);
        } else {
            input.value = controllerState[key];
        }
    });
}

export { initVirtualController };
