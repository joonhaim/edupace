let currentScenario = 0;

const scenarios = [
    {
        title: 'UC-01: Initial Setup for Bradycardia',
        description: 'Stabilize a 35 bpm junctional rhythm by dialing in VVI pacing at 70 bpm with safe output.',
    },
    {
        title: 'UC-02: Capture Threshold',
        description: 'Lower output stepwise until capture is lost, then add a 2 mA safety margin.',
    },
    {
        title: 'UC-03: Sensing Threshold & Undersensing',
        description: 'Adjust sensitivity to properly detect intrinsic beats and avoid asynchronous pacing.',
    },
    {
        title: 'UC-04: Oversensing',
        description: 'Introduce electrical noise and recover pacing by reducing sensitivity.',
    },
    {
        title: 'UC-05: Loss of Capture / Threshold Drift',
        description: 'Respond to gradual threshold drift by re-evaluating capture and documenting the new baseline.',
    },
];

export function initScenarios() {
    const select = document.getElementById('scenarioSelect');

    if (select) {
        populateScenarioSelect(select);

        select.addEventListener('change', (event) => {
            if (event.target.value === '') return;
            const value = Number(event.target.value);
            if (Number.isNaN(value)) return;
            currentScenario = value;
            applyScenarioText(currentScenario);
            startScenario(currentScenario);
        });
    }
}