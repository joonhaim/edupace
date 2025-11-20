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

    const inputs = {
        rate: card.querySelector('[data-control="rate"]'),
        output: card.querySelector('[data-control="output"]'),
        sensitivity: card.querySelector('[data-control="sensitivity"]')
    };

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

    Object.entries(inputs).forEach(([key, input]) => {
        if (!input) return;
        input.value = controllerState[key];
        input.addEventListener('input', () => {
            controllerState[key] = Number(input.value);
            updateLabels();
            broadcastParameters();
        });
    });

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

    const toggleCardVisibility = () => {
        const isVirtual = Array.from(modeRadios).some((radio) => radio.checked && radio.value === 'virtual');
        card.hidden = !isVirtual;
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