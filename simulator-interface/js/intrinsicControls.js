import { applySettingsPatch, defaultSettings } from './settingsPanel.js';

const INTRINSIC_RATE_MIN = 20;
const INTRINSIC_RATE_MAX = 220;

function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
}

function initIntrinsicControls() {
    const card = document.querySelector('[data-intrinsic-settings]');
    if (!card) return;

    const toggle = card.querySelector('.intrinsic-settings-toggle');
    const body = card.querySelector('.intrinsic-settings-body');
    const rateInput = card.querySelector('#intrinsicRateInput');
    const regularityInputs = Array.from(card.querySelectorAll('input[name="intrinsicRegularityInline"]'));
    let activeScenarioId = 'NSR';
    let latestSettings = { ...defaultSettings };

    const getScenarioRate = (settings) => {
        const rates = settings.intrinsicRates ?? defaultSettings.intrinsicRates ?? {};
        const scenarioRate = rates[activeScenarioId];
        return Number.isFinite(scenarioRate) ? scenarioRate : 60;
    };

    const setOpen = (open) => {
        card.classList.toggle('is-open', open);
        if (body) {
            body.hidden = !open;
        }
        toggle?.setAttribute('aria-expanded', String(open));
    };

    setOpen(false);

    if (rateInput) {
        rateInput.value = getScenarioRate(defaultSettings);
        rateInput.addEventListener('input', () => {
            const nextValue = clamp(Number(rateInput.value), INTRINSIC_RATE_MIN, INTRINSIC_RATE_MAX);
            rateInput.value = nextValue;
            applySettingsPatch({
                intrinsicRates: {
                    ...(latestSettings.intrinsicRates ?? {}),
                    [activeScenarioId]: nextValue
                }
            });
        });
    }

    regularityInputs.forEach((input) => {
        input.addEventListener('change', () => {
            if (input.checked) {
                applySettingsPatch({ intrinsicRegularity: input.value });
            }
        });
    });

    toggle?.addEventListener('click', () => {
        const isOpen = card.classList.contains('is-open');
        setOpen(!isOpen);
    });

    window.addEventListener('edupace-scenario-change', (event) => {
        activeScenarioId = event.detail?.id ?? 'NSR';
        if (rateInput) {
            rateInput.value = getScenarioRate(latestSettings);
        }
    });

    window.addEventListener('edupace-ecg-settings', (event) => {
        const { intrinsicRegularity } = event.detail ?? {};
        latestSettings = { ...latestSettings, ...(event.detail ?? {}) };
        if (rateInput) {
            rateInput.value = getScenarioRate(latestSettings);
        }
        if (intrinsicRegularity) {
            regularityInputs.forEach((input) => {
                input.checked = input.value === intrinsicRegularity;
            });
        }
    });
}

export { initIntrinsicControls };
