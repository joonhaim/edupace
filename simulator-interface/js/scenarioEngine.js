const ALARM_LEVELS = ['normal', 'warning', 'critical'];

let currentScenario = null;

const scenarios = [
    {
        id: 'UC-00',
        title: 'UC-00: Normal Sinus Rhythm',
        description:
            'Maintain VVI standby pacing while observing intrinsic beats.',
        summaryLabel: 'Normal sinus rhythm monitoring',
        primaryRhythm: 'Normal sinus rhythm',
        vitals: {
            hr: 78,
            bp: '118/64',
            spo2: 99,
            temp: 36.8
        },
        pacing: {
            mode: 'VVI (standby)'
        },
        alarm: {
            level: 'normal',
            text: 'No active alarms'
        },
        objective: 'Confirm the pacemaker remains inhibited while the patient maintains an intrinsic sinus rate.',
        feedback:
            'No pacing spikes should be visible. If pacing occurs, lower the rate below the intrinsic rhythm or verify sensing leads.',
        comingSoon: false
    },
    {
        id: 'UC-01',
        title: 'UC-01: Initial Setup for Bradycardia',
        description: 'Stabilize a 35 bpm junctional rhythm by dialing in VVI pacing at 70 bpm with safe output.',
        comingSoon: true
    },
    {
        id: 'UC-02',
        title: 'UC-02: Capture Threshold',
        description: 'Lower output stepwise until capture is lost, then add a 2 mA safety margin.',
        comingSoon: true
    },
    {
        id: 'UC-03',
        title: 'UC-03: Sensing Threshold & Undersensing',
        description: 'Adjust sensitivity to properly detect intrinsic beats and avoid asynchronous pacing.',
        comingSoon: true
    },
    {
        id: 'UC-04',
        title: 'UC-04: Oversensing',
        description: 'Introduce electrical noise and recover pacing by reducing sensitivity.',
        comingSoon: true
    },

    {
        id: 'UC-05',
        title: 'UC-05: Loss of Capture / Threshold Drift',
        description: 'Respond to gradual threshold drift by re-evaluating capture and documenting the new baseline.',

         comingSoon: true
    }
];


const scenarioElements = {
    scenarioName: document.getElementById('scenarioName'),
    scenarioText: document.getElementById('scenarioText'),
    summaryScenario: document.getElementById('summaryScenario'),
    rhythmLabel: document.getElementById('rhythmLabel'),
    hrValue: document.getElementById('hrValue'),
    paceMode: document.getElementById('paceMode'),
    bpValue: document.getElementById('bpValue'),
    spo2Value: document.getElementById('spo2Value'),
    tempValue: document.getElementById('tempValue'),
    alarmBanner: document.getElementById('alarmBanner'),
    alarmText: document.getElementById('alarmText'),
    objectiveText: document.getElementById('objectiveText'),
    feedbackText: document.getElementById('feedbackText')
};

const textKeys = [
    'scenarioName',
    'scenarioText',
    'summaryScenario',
    'rhythmLabel',
    'hrValue',
    'paceMode',
    'bpValue',
    'spo2Value',
    'tempValue',
    'alarmText',
    'objectiveText',
    'feedbackText'
];

const defaultTexts = textKeys.reduce((acc, key) => {
    acc[key] = scenarioElements[key]?.textContent ?? '';
    return acc;
}, {});

function updateText(key, value) {
    const element = scenarioElements[key];
    if (!element) return;

    if (value === undefined || value === null || value === '') {
        element.textContent = defaultTexts[key];
    } else {
        element.textContent = String(value);
    }
}

function setAlarmLevel(level) {
    const banner = scenarioElements.alarmBanner;
    if (!banner) return;

    const normalized = ALARM_LEVELS.includes(level) ? level : 'normal';
    ALARM_LEVELS.forEach((alarmLevel) => {
        banner.classList.remove(`alarm-${alarmLevel}`);
    });
    banner.classList.add(`alarm-${normalized}`);
}

function updateAlarm(alarm = null) {
    updateText('alarmText', alarm?.text ?? null);
    setAlarmLevel(alarm?.level ?? 'normal');
}

function populateScenarioSelect(select) {
    select.innerHTML = '';

    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = 'Select a scenario';
    placeholder.disabled = true;
    placeholder.selected = true;
    select.appendChild(placeholder);

    scenarios.forEach((scenario, index) => {
        const option = document.createElement('option');
        option.value = String(index);
        option.textContent = scenario.comingSoon
            ? `${scenario.title} (coming soon)`
            : scenario.title;
        option.disabled = Boolean(scenario.comingSoon);
        select.appendChild(option);
    });
}

function applyScenarioText(index) {
    const scenario = scenarios[index];
    if (!scenario) {
        return;
    }

    updateText('scenarioName', scenario.title);
    updateText('scenarioText', scenario.description);
    updateText('summaryScenario', scenario.summaryLabel ?? scenario.title);
    updateText('rhythmLabel', scenario.primaryRhythm ?? null);
    updateText('hrValue', scenario.vitals?.hr ?? null);
    updateText('paceMode', scenario.pacing?.mode ?? null);
    updateText('bpValue', scenario.vitals?.bp ?? null);
    updateText('spo2Value', scenario.vitals?.spo2 ?? null);
    updateText('tempValue', scenario.vitals?.temp ?? null);
    updateAlarm(scenario.alarm);
}

function startScenario(index) {
    const scenario = scenarios[index];
    if (!scenario) {
        return;
    }

    currentScenario = index;
    updateText('objectiveText', scenario.objective ?? null);
    updateText('feedbackText', scenario.feedback ?? null);
}

function initScenarios() {
    const select = document.getElementById('scenarioSelect');

   if (!select) {
        return;
    }
    populateScenarioSelect(select);

    select.addEventListener('change', (event) => {
        const value = Number(event.target.value);
        if (Number.isNaN(value)) {
            return;
        }

        applyScenarioText(value);
        startScenario(value);
    });

    const firstAvailableIndex = scenarios.findIndex((scenario) => !scenario.comingSoon);
    if (firstAvailableIndex >= 0) {
        select.value = String(firstAvailableIndex);
        applyScenarioText(firstAvailableIndex);
        startScenario(firstAvailableIndex);
    }
}

export { initScenarios };