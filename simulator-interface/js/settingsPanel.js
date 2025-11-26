const defaultSettings = {
    gridlines: false,
    gridDensity: '2mm',
    gridIntensity: 55,
    sweepSpeed: 25,
    amplitudeScaling: 10,
    traceColor: 'green',
    traceThickness: 'normal',
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
    const toggles = Array.from(document.querySelectorAll('[data-settings-toggle]'));

    if (!settingsCard || !toggles.length) return;

    const setVisibility = (isVisible) => {
        settingsCard.classList.toggle('is-hidden', !isVisible);
        toggles.forEach((toggle) => toggle.setAttribute('aria-expanded', String(isVisible)));
    };

    toggles.forEach((toggle) => {
        toggle.addEventListener('click', () => {
            const willShow = settingsCard.classList.contains('is-hidden');
            setVisibility(willShow);
        });
    });

    bindToggle(settingsCard, 'gridlinesToggle', 'gridlines');
    bindRadios(settingsCard, 'gridDensity', 'gridDensity');
    bindSlider(settingsCard, 'gridIntensity', 'gridIntensity');
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

    const resetBtn = settingsCard.querySelector('[data-settings-reset]');
    if (resetBtn) {
        resetBtn.addEventListener('click', () => {
            currentSettings = { ...defaultSettings };
            syncInputs(settingsCard);
            emitSettings();
        });
    }

    syncInputs(settingsCard);
    emitSettings();
    setVisibility(false);
}

function bindToggle(root, inputId, key) {
    const input = root.querySelector(`#${inputId}`);
    if (!input) return;
    input.checked = Boolean(currentSettings[key]);
    input.addEventListener('change', () => {
        currentSettings[key] = input.checked;
        emitSettings();
    });
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
