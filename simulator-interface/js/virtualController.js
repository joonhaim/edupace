import { knobPresets } from './knobPresets.js';

const ASYNC_SENSITIVITY_THRESHOLD = 20;

const controllerState = {
    rate: getNearestPreset('rate', 80),
    output: getNearestPreset('output', 10),
    sensitivity: getNearestPreset('sensitivity', 2.0),
    power: false,
    locked: false
};

const isAsyncFromSensitivity = (sensitivity) =>
    typeof sensitivity === 'number' && sensitivity > ASYNC_SENSITIVITY_THRESHOLD;

function initVirtualController() {
    const parametersCard = document.querySelector('.parameters-card');
    const title = document.getElementById('pacemakerTitle');

    if (!parametersCard || !title) {
        return;
    }

    const modeRadios = document.querySelectorAll('input[name="inputMode"]');
    const controlGroups = parametersCard.querySelectorAll('[data-virtual-control]');
    const actionsContainer = parametersCard.querySelector('.virtual-actions');
    const actionButtons = {
        power: parametersCard.querySelector('[data-virtual-action="power"]'),
        lock: parametersCard.querySelector('[data-virtual-action="lock"]')
    };

    const display = {
        rate: document.getElementById('rateValue'),
        output: document.getElementById('outputValue'),
        sensitivity: document.getElementById('sensValue')
    };

    const powerHoldHint = document.createElement('div');
    powerHoldHint.className = 'hint-toast power-hold-hint';
    powerHoldHint.setAttribute('role', 'alert');

    const powerHoldText = document.createElement('span');
    powerHoldText.textContent = 'Hold for 2 seconds to turn off the controller';

    const powerHoldClose = document.createElement('button');
    powerHoldClose.type = 'button';
    powerHoldClose.className = 'hint-toast-close';
    powerHoldClose.setAttribute('aria-label', 'Dismiss power button hint');
    powerHoldClose.innerHTML = '&times;';

    powerHoldHint.appendChild(powerHoldText);
    powerHoldHint.appendChild(powerHoldClose);
    parametersCard.appendChild(powerHoldHint);

    const lockWarning = document.createElement('div');
    lockWarning.className = 'hint-toast lock-warning';
    lockWarning.setAttribute('role', 'alert');

    const lockWarningText = document.createElement('span');
    lockWarningText.textContent = 'Unlock the controller to power it off.';

    const lockWarningClose = document.createElement('button');
    lockWarningClose.type = 'button';
    lockWarningClose.className = 'hint-toast-close';
    lockWarningClose.setAttribute('aria-label', 'Dismiss unlock warning');
    lockWarningClose.innerHTML = '&times;';

    lockWarning.appendChild(lockWarningText);
    lockWarning.appendChild(lockWarningClose);

    const lockWarningHost = actionsContainer ?? parametersCard;
    lockWarningHost.appendChild(lockWarning);

    const POWER_OFF_HOLD_MS = 2000;
    const AUTO_LOCK_DELAY_MS = 60000;
    let powerHoldTimer = null;
    let suppressNextClick = false;
    let hintTimer = null;
    let lockWarningTimer = null;
    let powerHintDismissed = false;
    let autoLockTimer = null;
    let lastAdjustmentAt = null;

    const isVirtualMode = () => Array.from(modeRadios).some((radio) => radio.checked && radio.value === 'virtual');

    const updateTiles = () => {
        const showValues = controllerState.power;

        if (display.rate) {
            display.rate.textContent = showValues ? formatValue('rate', controllerState.rate) : '--';
        }
        if (display.output) {
            display.output.textContent = showValues ? formatValue('output', controllerState.output) : '--';
        }
        if (display.sensitivity) {
            display.sensitivity.textContent = showValues
                ? formatValue('sensitivity', controllerState.sensitivity)
                : '--';
        }
    };

    const setActionVisualState = (button, active, label) => {
        if (!button) return;

        button.classList.toggle('is-active', active);
        button.setAttribute('aria-pressed', String(active));
        const stateLabel = button.querySelector('[data-action-state]');
        if (stateLabel) {
            stateLabel.textContent = label;
        }
    };

    const refreshDisplay = () => {
        updateTiles();
        setActionVisualState(actionButtons.power, controllerState.power, controllerState.power ? 'On' : 'Off');
        setActionVisualState(
            actionButtons.lock,
            controllerState.locked,
            controllerState.locked ? 'Locked' : 'Unlocked'
        );

        const virtualMode = isVirtualMode();
        parametersCard.classList.toggle('is-powered-off', virtualMode && !controllerState.power);
        parametersCard.classList.toggle('is-locked', virtualMode && controllerState.locked);

        controlGroups.forEach((group) => {
            group.setAttribute('aria-disabled', String(controllerState.locked && virtualMode));
        });

        const lockDisabled = !controllerState.power;
        if (actionButtons.lock) {
            actionButtons.lock.toggleAttribute('disabled', lockDisabled);
            actionButtons.lock.setAttribute('aria-disabled', String(lockDisabled));
        }
    };

    const broadcastParameters = () => {
        refreshDisplay();
        window.dispatchEvent(
            new CustomEvent('edupace-parameters', {
                detail: { ...controllerState, asynchronous: isAsyncFromSensitivity(controllerState.sensitivity) }
            })
        );
    };

    const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

    const scheduleAutoLock = () => {
        if (autoLockTimer) {
            clearTimeout(autoLockTimer);
            autoLockTimer = null;
        }

        if (!isVirtualMode()) return;

        lastAdjustmentAt = Date.now();
        autoLockTimer = window.setTimeout(() => {
            autoLockTimer = null;
            if (!isVirtualMode() || controllerState.locked || !controllerState.power) return;
            if (Date.now() - lastAdjustmentAt >= AUTO_LOCK_DELAY_MS) {
                controllerState.locked = true;
                broadcastParameters();
            }
        }, AUTO_LOCK_DELAY_MS);
    };

    const adjustValue = (key, direction, min, max, step) => {
        if (!isVirtualMode() || controllerState.locked) return;

        const presets = knobPresets[key] ?? [];

        if (presets.length) {
            const currentIndex = getPresetIndex(key, controllerState[key]);
            const offset = direction === 'down' ? -1 : 1;
            const nextIndex = clamp(currentIndex + offset, 0, presets.length - 1);
            const nextValue = presets[nextIndex];

            if (nextValue !== controllerState[key]) {
                controllerState[key] = nextValue;
                broadcastParameters();
                scheduleAutoLock();
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
            scheduleAutoLock();
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

    const clearPowerHintTimer = () => {
        if (hintTimer) {
            clearTimeout(hintTimer);
            hintTimer = null;
        }
    };

    const setPowerHintVisible = (visible) => {
        clearPowerHintTimer();
        if (!visible) {
            powerHoldHint.classList.remove('is-visible');
            return;
        }

        powerHoldHint.classList.add('is-visible');
        hintTimer = window.setTimeout(() => {
            powerHoldHint.classList.remove('is-visible');
            hintTimer = null;
        }, 2200);
    };

    const clearPowerHint = () => setPowerHintVisible(false);

    const showPowerHint = () => {
        if (powerHintDismissed) return;
        setPowerHintVisible(true);
    };

    const clearPowerHold = () => {
        if (powerHoldTimer) {
            clearTimeout(powerHoldTimer);
            powerHoldTimer = null;
        }
    };

    const clearLockWarning = () => {
        if (lockWarningTimer) {
            clearTimeout(lockWarningTimer);
            lockWarningTimer = null;
        }
        lockWarning.classList.remove('is-visible');
    };

    const showLockWarning = () => {
        clearLockWarning();
        lockWarning.classList.add('is-visible');
        lockWarningTimer = window.setTimeout(() => {
            lockWarning.classList.remove('is-visible');
            lockWarningTimer = null;
        }, 2400);
    };

    const handlePowerPointerDown = () => {
        if (!isVirtualMode()) return;

        if (!controllerState.power) {
            return;
        }

        if (controllerState.locked) {
            showLockWarning();
            return;
        }

        clearPowerHint();
        clearPowerHold();
        powerHoldTimer = window.setTimeout(() => {
            controllerState.power = false;
            suppressNextClick = true;
            broadcastParameters();
            if (autoLockTimer) {
                clearTimeout(autoLockTimer);
                autoLockTimer = null;
            }
            clearPowerHold();
        }, POWER_OFF_HOLD_MS);
    };

    const handlePowerPointerUp = () => {
        if (!isVirtualMode()) {
            clearPowerHold();
            return;
        }

        if (controllerState.power && powerHoldTimer !== null) {
            showPowerHint();
        }

        clearPowerHold();
    };

    const handlePowerClick = (event) => {
        if (!isVirtualMode()) return;

        if (suppressNextClick) {
            suppressNextClick = false;
            return;
        }

        if (!controllerState.power) {
            controllerState.power = true;
            broadcastParameters();
        }

        event.preventDefault();
    };

    const toggleLock = () => {
        if (!isVirtualMode() || !controllerState.power) return;

        controllerState.locked = !controllerState.locked;
        broadcastParameters();
    };

    powerHoldClose.addEventListener('click', () => {
        powerHintDismissed = true;
        setPowerHintVisible(false);
    });

    lockWarningClose.addEventListener('click', clearLockWarning);

    actionButtons.power?.addEventListener('pointerdown', handlePowerPointerDown);
    actionButtons.power?.addEventListener('pointerup', handlePowerPointerUp);
    actionButtons.power?.addEventListener('pointercancel', handlePowerPointerUp);
    actionButtons.power?.addEventListener('pointerleave', handlePowerPointerUp);
    actionButtons.power?.addEventListener('click', handlePowerClick);
    actionButtons.lock?.addEventListener('click', toggleLock);

    const applyScenarioDefaults = (scenario) => {
        controllerState.locked = false;

        if (typeof scenario?.pacing?.poweredOn === 'boolean') {
            controllerState.power = scenario.pacing.poweredOn;
        }

        refreshDisplay();

        if (isVirtualMode()) {
            broadcastParameters();
        }
    };

    window.addEventListener('edupace-scenario-change', (event) => applyScenarioDefaults(event.detail));

    const applyModeState = () => {
        const virtualMode = isVirtualMode();
        parametersCard.classList.toggle('is-virtual', virtualMode);
        controlGroups.forEach((group) => group.setAttribute('aria-hidden', String(!virtualMode)));
        actionsContainer?.setAttribute('aria-hidden', String(!virtualMode));
        title.textContent = virtualMode ? 'Virtual Pacemaker Controller' : 'Pacemaker parameters';

        if (virtualMode) {
            broadcastParameters();
        } else {
            refreshDisplay();
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
