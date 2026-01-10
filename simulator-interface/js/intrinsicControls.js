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

    const setOpen = (open) => {
        card.classList.toggle('is-open', open);
        if (body) {
            body.hidden = !open;
        }
        toggle?.setAttribute('aria-expanded', String(open));
    };

    setOpen(false);

    if (rateInput) {
        rateInput.value = defaultSettings.intrinsicRate;
        rateInput.addEventListener('input', () => {
            const nextValue = clamp(Number(rateInput.value), INTRINSIC_RATE_MIN, INTRINSIC_RATE_MAX);
            rateInput.value = nextValue;
            applySettingsPatch({ intrinsicRate: nextValue });
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

    window.addEventListener('edupace-ecg-settings', (event) => {
        const { intrinsicRate, intrinsicRegularity } = event.detail ?? {};
        if (rateInput && Number.isFinite(intrinsicRate)) {
            rateInput.value = intrinsicRate;
        }
        if (intrinsicRegularity) {
            regularityInputs.forEach((input) => {
                input.checked = input.value === intrinsicRegularity;
            });
        }
    });
}

export { initIntrinsicControls };
