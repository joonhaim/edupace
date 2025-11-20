const ALARM_LEVELS = ['normal', 'warning', 'critical'];

const scenarioElements = {
    scenarioName: document.getElementById('scenarioName'),
    scenarioText: document.getElementById('scenarioText'),
    hrValue: document.getElementById('hrValue'),
    paceMode: document.getElementById('paceMode'),
    bpValue: document.getElementById('bpValue'),
    spo2Value: document.getElementById('spo2Value'),
    tempValue: document.getElementById('tempValue'),
    alarmBanner: document.getElementById('alarmBanner'),
    alarmText: document.getElementById('alarmText'),
    objectiveText: document.getElementById('objectiveText'),
    feedbackText: document.getElementById('feedbackText'),
    leadLabel: document.getElementById('leadLabel')
};

const textKeys = [
    'scenarioName',
    'scenarioText',
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

const scenarioState = {
    scenarios: [],
    activeScenario: null
};



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

async function loadScenarios() {
    if (scenarioState.scenarios.length) {
        return scenarioState.scenarios;
    }

    try {
        const response = await fetch('data/scenarios.json', { cache: 'no-store' });
        if (!response.ok) {
            throw new Error(`Unable to load scenarios (${response.status})`);
        }
        const payload = await response.json();
        const scenarios = Array.isArray(payload) ? payload : payload.scenarios;
        scenarioState.scenarios = Array.isArray(scenarios) ? scenarios : [];
    } catch (error) {
        console.error(error);
        scenarioState.scenarios = [];
    }

    return scenarioState.scenarios;
}

function populateScenarioSelect(select, scenarios) {
    
    select.innerHTML = '';

    if (!scenarios.length) {
        const option = document.createElement('option');
        option.value = '';
        option.textContent = 'No scenarios found';
        option.disabled = true;
        select.appendChild(option);
        return;
    }

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

function applyScenarioText(scenario) {
    updateText('scenarioName', scenario.title);
    updateText('scenarioText', scenario.description);
    updateText('hrValue', scenario.vitals?.hr ?? null);
    updateText('paceMode', scenario.pacing?.mode ?? null);
    updateText('bpValue', scenario.vitals?.bp ?? null);
    updateText('spo2Value', scenario.vitals?.spo2 ?? null);
    updateText('tempValue', scenario.vitals?.temp ?? null);
    updateAlarm(scenario.alarm);
    updateText('objectiveText', scenario.objective ?? null);
    updateText('feedbackText', scenario.feedback ?? null);
}

function applyVitalsOverride(baseScenario, overrides) {
    const vitals = {
        hr: overrides?.hr ?? baseScenario.vitals?.hr,
        bp: overrides?.bp ?? baseScenario.vitals?.bp,
        spo2: overrides?.spo2 ?? baseScenario.vitals?.spo2,
        temp: overrides?.temp ?? baseScenario.vitals?.temp
    };

    updateText('hrValue', vitals.hr ?? null);
    updateText('bpValue', vitals.bp ?? null);
    updateText('spo2Value', vitals.spo2 ?? null);
    updateText('tempValue', vitals.temp ?? null);
}

function applyRuleEffects(effects) {
    if (!scenarioState.activeScenario) {
        return;
    }

    const currentScenario = scenarioState.activeScenario;
    applyVitalsOverride(currentScenario, effects?.vitals ?? null);

    if (effects?.alarm) {
        updateAlarm(effects.alarm);
    } else {
        updateAlarm(currentScenario.alarm);
    }

    updateText('objectiveText', effects?.objective ?? currentScenario.objective ?? null);
    updateText('feedbackText', effects?.feedback ?? currentScenario.feedback ?? null);

    if (effects?.waveformId) {
        window.dispatchEvent(
            new CustomEvent('edupace-waveform-change', {
                detail: { waveformId: effects.waveformId }
            })
        );
    } else if (currentScenario.waveformId) {
        window.dispatchEvent(
            new CustomEvent('edupace-waveform-change', {
                detail: { waveformId: currentScenario.waveformId }
            })
        );
    }
}

function startScenario(index) {
    const scenario = scenarioState.scenarios[index];
    if (!scenario || scenario.comingSoon) {
        return;
    }

  scenarioState.activeScenario = scenario;
    applyScenarioText(scenario);

    window.dispatchEvent(
        new CustomEvent('edupace-scenario-change', {
            detail: scenario
        })
    );
}

async function initScenarios() {
    const select = document.getElementById('scenarioSelect');

   if (!select) {
        return;
    }

    const scenarios = await loadScenarios();
    populateScenarioSelect(select, scenarios);

    window.addEventListener('edupace-rule-effects', (event) => {
        applyRuleEffects(event.detail?.effects ?? {});
    });

    select.addEventListener('change', (event) => {
        const value = Number(event.target.value);
        if (Number.isNaN(value)) {
            return;
        }

        startScenario(value);
    });

    const firstAvailableIndex = scenarios.findIndex((scenario) => !scenario.comingSoon);
    if (firstAvailableIndex >= 0) {
        select.value = String(firstAvailableIndex);
        startScenario(firstAvailableIndex);
    }
}

export { initScenarios };