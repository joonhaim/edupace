const controllerState = {
    rate: 70,
    output: 5,
    sensitivity: 2.5
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

    const display = {
        rate: document.getElementById('rateValue'),
        output: document.getElementById('outputValue'),
        sensitivity: document.getElementById('sensValue')
    };

    const modeRadios = document.querySelectorAll('input[name="inputMode"]');

    const updateLabels = () => {
        if (labels.rate) {
            labels.rate.textContent = `${controllerState.rate} bpm`;
        }
        if (labels.output) {
            labels.output.textContent = `${controllerState.output.toFixed(1)} mA`;
        }
        if (labels.sensitivity) {
            labels.sensitivity.textContent = `${controllerState.sensitivity.toFixed(1)} mV`;
        }
    };

    const updateTiles = () => {
        if (display.rate) {
            display.rate.textContent = controllerState.rate;
        }
        if (display.output) {
            display.output.textContent = controllerState.output.toFixed(1);
        }
        if (display.sensitivity) {
            display.sensitivity.textContent = controllerState.sensitivity.toFixed(1);
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

    const adjustValue = (key, delta, min, max, step) => {
        const decimals = `${step}`.split('.')[1]?.length ?? 0;
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
            const delta = direction === 'down' ? -step : step;
            adjustValue(key, delta, min, max, step);
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
            broadcastParameters();
        }
    };

    modeRadios.forEach((radio) => {
        radio.addEventListener('change', toggleCardVisibility);
    });

    updateLabels();
    toggleCardVisibility();
}

export { initVirtualController };
