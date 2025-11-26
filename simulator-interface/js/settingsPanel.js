const defaultSettings = {
    gridlines: false,
    gridDensity: '2mm',
    gridIntensity: 55,
    sweepSpeed: 25,
    amplitudeScaling: 10,
    traceColor: 'green',
    traceThickness: 'normal',
    alarmSound: true,
    buttonBeeps: true,
    soundVolume: 70,
    leadLabel: true,
    calibrationMarkers: true,
    rWaveMarkers: false,
    pacingSpikeLabel: true,
    intrinsicBeatLabels: false,
    colorCodeBeats: true
};

let currentSettings = { ...defaultSettings };

function initSettingsPanel() {
    const settingsCard = document.querySelector('[data-settings-panel]');
    const settingsLayer = document.querySelector('[data-settings-layer]');
    const tabButtons = Array.from(document.querySelectorAll('[data-settings-tab]'));
    const tabPanels = Array.from(document.querySelectorAll('[data-settings-panel-target]'));

    if (!settingsCard) return;

    const getToggles = () => Array.from(document.querySelectorAll('[data-settings-toggle]'));
    const syncToggleState = (isVisible = !settingsCard.classList.contains('is-hidden')) => {
        getToggles().forEach((toggle) => toggle.setAttribute('aria-expanded', String(isVisible)));
    };

    settingsCard.setAttribute('tabindex', '-1');

    const setVisibility = (isVisible) => {
        settingsCard.classList.toggle('is-hidden', !isVisible);
        if (settingsLayer) settingsLayer.classList.toggle('is-hidden', !isVisible);
        syncToggleState(isVisible);

        if (isVisible) {
            settingsCard.focus({ preventScroll: true });
        }
    };

    const observer = new MutationObserver(() => syncToggleState());
    observer.observe(document.body, { childList: true, subtree: true });

    document.addEventListener('click', (event) => {
        const toggle = event.target.closest('[data-settings-toggle]');
        if (!toggle) return;

        const willShow = settingsCard.classList.contains('is-hidden');
        setVisibility(willShow);
    });

    if (tabButtons.length && tabPanels.length) {
        const activateTab = (tabId) => {
            tabButtons.forEach((button) => {
                const isActive = button.dataset.settingsTab === tabId;
                button.classList.toggle('is-active', isActive);
                button.setAttribute('aria-selected', String(isActive));
            });

            tabPanels.forEach((panel) => {
                panel.classList.toggle('is-hidden', panel.dataset.settingsPanelTarget !== tabId);
            });
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
    bindSlider(settingsCard, 'soundVolume', 'soundVolume');
    bindRadios(settingsCard, 'sweepSpeed', 'sweepSpeed', Number);
    bindRadios(settingsCard, 'amplitudeScaling', 'amplitudeScaling', Number);
    bindRadios(settingsCard, 'traceColor', 'traceColor');
    bindRadios(settingsCard, 'traceThickness', 'traceThickness');

    bindToggle(settingsCard, 'leadLabelToggle', 'leadLabel');
    bindToggle(settingsCard, 'calibrationToggle', 'calibrationMarkers');
    bindToggle(settingsCard, 'rWaveToggle', 'rWaveMarkers');
    bindToggle(settingsCard, 'pacingLabelToggle', 'pacingSpikeLabel');
    bindToggle(settingsCard, 'intrinsicLabelToggle', 'intrinsicBeatLabels');
    bindToggle(settingsCard, 'colorCodeToggle', 'colorCodeBeats');
    bindToggle(settingsCard, 'alarmSoundToggle', 'alarmSound');
    bindToggle(settingsCard, 'buttonBeepsToggle', 'buttonBeeps');

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

function bindRadios(root, name, key, parser = (value) => value) {
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
            }
        });
    });
}

function bindSlider(root, inputId, key) {
    const input = root.querySelector(`#${inputId}`);
    const valueLabel = root.querySelector(`[data-slider-value="${inputId}"]`);
    if (!input) return;

    const updateValue = () => {
        currentSettings[key] = Number(input.value);
        if (valueLabel) {
            valueLabel.textContent = `${currentSettings[key]}%`;
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
            if (label) label.textContent = `${value}%`;
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
