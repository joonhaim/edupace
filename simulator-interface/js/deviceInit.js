import { initHardwareIntegration } from './arduinoSerialAdapter.js';

const prefersTouchLayout = window.matchMedia('(max-width: 1099px) and (pointer: coarse)').matches;

if (prefersTouchLayout) {
    const virtualMode = document.querySelector('input[name="inputMode"][value="virtual"]');
    if (virtualMode) {
        virtualMode.checked = true;
    }
}

initHardwareIntegration().then(() => {
    if (!prefersTouchLayout) return;
    document
        .querySelector('input[name="inputMode"][value="virtual"]')
        ?.dispatchEvent(new Event('change', { bubbles: true }));
});
