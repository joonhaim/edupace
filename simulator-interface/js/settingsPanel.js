const defaultSettings = {
    gridlines: false,
    gridDensity: '2mm',
    gridIntensity: 55,
    sweepSpeed: 25,
    sweepWindow: 6,
    amplitudeScaling: 10,
    ecgBackground: 'monitor',
    traceColor: 'green',
    traceThickness: 'normal',
    hrDisplay: true,
    hrColor: 'white',
    leadLabel: true,
    leadLabelColor: 'green',
    labelSize: 'large',
    sensitivityGuide: false,
    pacingSpikeLabel: false,
    paceColor: 'amber',
    intrinsicBeatLabels: false,
    senseColor: 'amber',
    intervalRulers: true,
    alarmSound: true,
    buttonBeeps: true,
    soundVolume: 70,
    qrsBeep: 'classic',
    autoLockKnobs: '60',
    intrinsicRate: 60,
    intrinsicRegularity: 'regular',
    captureDrift: 'off',
    actionLog: true,
    postScenarioReview: 'auto'
};

let currentSettings = { ...defaultSettings };
const sliderFormatters = {
    gridIntensity: (value) => `${value}%`,
    soundVolume: (value) => `${value}%`,
    intrinsicRate: (value) => `${value} bpm`
};

function initSettingsPanel() {
    const settingsCard = document.querySelector('[data-settings-panel]');
    const settingsLayer = document.querySelector('[data-settings-layer]');
    const tabButtons = Array.from(document.querySelectorAll('[data-settings-tab]'));
    const tabPanels = Array.from(document.querySelectorAll('[data-settings-panel-target]'));
    const settingsTitle = document.getElementById('settingsTitle');

    if (!settingsCard) return;

    const getToggles = () => Array.from(document.querySelectorAll('[data-settings-toggle]'));
    const syncToggleState = (isVisible = settingsLayer?.classList.contains('is-open')) => {
        getToggles().forEach((toggle) => toggle.setAttribute('aria-expanded', String(isVisible)));
    };

    settingsCard.setAttribute('tabindex', '-1');

    const setVisibility = (isVisible) => {
        const isOpen = Boolean(isVisible);
        settingsCard.classList.toggle('is-visible', isOpen);
        settingsCard.setAttribute('aria-hidden', String(!isOpen));
        if (settingsLayer) {
            settingsLayer.classList.toggle('is-open', isOpen);
            settingsLayer.setAttribute('aria-hidden', String(!isOpen));
        }
        syncToggleState(isVisible);

        if (isOpen) {
            settingsCard.focus({ preventScroll: true });
        }
    };

    const observer = new MutationObserver(() => syncToggleState());
    observer.observe(document.body, { childList: true, subtree: true });

    document.addEventListener('click', (event) => {
        const toggle = event.target.closest('[data-settings-toggle]');
        if (!toggle) return;

        const willShow = settingsLayer ? !settingsLayer.classList.contains('is-open') : true;
        setVisibility(willShow);
    });

    if (tabButtons.length && tabPanels.length) {
        const updateTitle = (tabId) => {
            if (!settingsTitle) return;

            const activeButton = tabButtons.find((button) => button.dataset.settingsTab === tabId);
            const label = activeButton?.textContent.trim();
            if (label) {
                settingsTitle.textContent = `${label} settings`;
            }
        };

        const activateTab = (tabId) => {
            tabButtons.forEach((button) => {
                const isActive = button.dataset.settingsTab === tabId;
                button.classList.toggle('is-active', isActive);
                button.setAttribute('aria-selected', String(isActive));
            });

            tabPanels.forEach((panel) => {
                panel.classList.toggle('is-hidden', panel.dataset.settingsPanelTarget !== tabId);
            });

            updateTitle(tabId);
        };

        tabButtons.forEach((button) => {
            button.addEventListener('click', () => activateTab(button.dataset.settingsTab));
        });

        const initiallyActive = tabButtons.find((button) => button.classList.contains('is-active'));
        activateTab(initiallyActive?.dataset.settingsTab || tabButtons[0].dataset.settingsTab);
    }

    if (settingsLayer) {
        settingsLayer.addEventListener('click', (event) => {
            if (event.target === settingsLayer) {
                setVisibility(false);
            }
        });
    }

    window.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
            setVisibility(false);
        }
    });

    const updateGridDependencies = (isEnabled) => {
        const densityRow = settingsCard.querySelector('[data-setting-row="gridDensity"]');
        const intensityRow = settingsCard.querySelector('[data-setting-row="gridIntensity"]');
        const densityInputs = settingsCard.querySelectorAll('input[name="gridDensity"]');
        const intensityInput = settingsCard.querySelector('#gridIntensity');
        const intensityValue = settingsCard.querySelector('[data-slider-value="gridIntensity"]');

        densityInputs.forEach((input) => {
            input.disabled = !isEnabled;
        });

        if (intensityInput) {
            intensityInput.disabled = !isEnabled;
        }

        if (intensityValue) {
            intensityValue.setAttribute('aria-disabled', String(!isEnabled));
        }

        if (densityRow) densityRow.classList.toggle('is-disabled', !isEnabled);
        if (intensityRow) intensityRow.classList.toggle('is-disabled', !isEnabled);
    };

    bindToggle(settingsCard, 'gridlinesToggle', 'gridlines', updateGridDependencies);
    bindRadios(settingsCard, 'gridDensity', 'gridDensity');
    bindSlider(settingsCard, 'gridIntensity', 'gridIntensity');
    bindRadios(settingsCard, 'sweepSpeed', 'sweepSpeed', Number);
    bindRadios(settingsCard, 'sweepWindow', 'sweepWindow', Number);
    bindRadios(settingsCard, 'amplitudeScaling', 'amplitudeScaling', Number);
    bindRadios(settingsCard, 'ecgBackground', 'ecgBackground', (value) => value, (value) => {
        if (value === 'paper' && currentSettings.traceColor !== 'black') {
            currentSettings.traceColor = 'black';
            syncInputs(settingsCard);
            emitSettings();
        }
    });
    bindRadios(settingsCard, 'traceColor', 'traceColor');
    bindRadios(settingsCard, 'traceThickness', 'traceThickness');

    bindToggle(settingsCard, 'hrDisplayToggle', 'hrDisplay');
    bindRadios(settingsCard, 'hrColor', 'hrColor');
    bindToggle(settingsCard, 'leadLabelToggle', 'leadLabel');
    bindRadios(settingsCard, 'leadLabelColor', 'leadLabelColor');
    bindRadios(settingsCard, 'labelSize', 'labelSize');
    bindToggle(settingsCard, 'sensitivityGuideToggle', 'sensitivityGuide');
    bindToggle(settingsCard, 'pacingLabelToggle', 'pacingSpikeLabel');
    bindRadios(settingsCard, 'paceColor', 'paceColor');
    bindToggle(settingsCard, 'intrinsicLabelToggle', 'intrinsicBeatLabels');
    bindRadios(settingsCard, 'senseColor', 'senseColor');
    bindToggle(settingsCard, 'intervalRulersToggle', 'intervalRulers');

    bindToggle(settingsCard, 'alarmSoundToggle', 'alarmSound');
    bindToggle(settingsCard, 'buttonBeepsToggle', 'buttonBeeps');
    bindRadios(settingsCard, 'qrsBeep', 'qrsBeep');
    bindSlider(settingsCard, 'soundVolume', 'soundVolume');

    bindRadios(settingsCard, 'autoLockKnobs', 'autoLockKnobs');
    bindSlider(settingsCard, 'intrinsicRate', 'intrinsicRate');
    bindRadios(settingsCard, 'intrinsicRegularity', 'intrinsicRegularity');
    bindRadios(settingsCard, 'captureDrift', 'captureDrift');
    bindToggle(settingsCard, 'actionLogToggle', 'actionLog');
    bindRadios(settingsCard, 'postScenarioReview', 'postScenarioReview');

    const resetBtn = settingsCard.querySelector('[data-settings-reset]');
    if (resetBtn) {
        resetBtn.addEventListener('click', () => {
            currentSettings = { ...defaultSettings };
            syncInputs(settingsCard);
            updateGridDependencies(currentSettings.gridlines);
            emitSettings();
        });
    }

    syncInputs(settingsCard);
    updateGridDependencies(currentSettings.gridlines);
    emitSettings();
    setVisibility(false);
}

function bindToggle(root, inputId, key, onChange) {
    const input = root.querySelector(`#${inputId}`);
    if (!input) return;
    input.checked = Boolean(currentSettings[key]);
    input.addEventListener('change', () => {
        currentSettings[key] = input.checked;
        if (typeof onChange === 'function') onChange(input.checked, input);
        emitSettings();
    });

    if (typeof onChange === 'function') onChange(input.checked, input);
}

function bindRadios(root, name, key, parser = (value) => value, onChange) {
    const radios = Array.from(root.querySelectorAll(`input[name="${name}"]`));
    if (!radios.length) return;
    radios.forEach((radio) => {
        if (radio.value === String(currentSettings[key])) {
            radio.checked = true;
        }
        radio.addEventListener('change', () => {
            if (radio.checked) {
                currentSettings[key] = parser(radio.value);
                emitSettings();
                if (typeof onChange === 'function') onChange(currentSettings[key]);
            }
        });
    });

    if (typeof onChange === 'function') onChange(currentSettings[key]);
}

function bindSlider(root, inputId, key) {
    const input = root.querySelector(`#${inputId}`);
    const valueLabel = root.querySelector(`[data-slider-value="${inputId}"]`);
    if (!input) return;
    const formatValue = sliderFormatters[key] ?? ((value) => `${value}%`);

    const updateValue = () => {
        currentSettings[key] = Number(input.value);
        if (valueLabel) {
            valueLabel.textContent = formatValue(currentSettings[key]);
        }
        emitSettings();
    };

    input.addEventListener('input', updateValue);
    updateValue();
}

function syncInputs(root) {
    const entries = Object.entries(currentSettings);
    entries.forEach(([key, value]) => {
        const checkbox = root.querySelector(`input[type="checkbox"]#${key}Toggle`);
        if (checkbox) {
            checkbox.checked = Boolean(value);
        }

        const radios = root.querySelectorAll(`input[type="radio"][name="${key}"]`);
        radios.forEach((radio) => {
            radio.checked = radio.value === String(value);
        });

        const slider = root.querySelector(`input[type="range"]#${key}`);
        if (slider) {
            slider.value = value;
            const label = root.querySelector(`[data-slider-value="${slider.id}"]`);
            if (label) {
                const formatValue = sliderFormatters[slider.id] ?? ((nextValue) => `${nextValue}%`);
                label.textContent = formatValue(value);
            }
        }
    });
}

function emitSettings() {
    window.dispatchEvent(
        new CustomEvent('edupace-ecg-settings', {
            detail: { ...currentSettings }
        })
    );
}

export { initSettingsPanel, defaultSettings };
