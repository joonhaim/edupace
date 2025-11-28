const ALARM_LEVELS = ['normal', 'warning', 'critical'];

const scenarioElements = {
    scenarioName: document.getElementById('scenarioName'),
    scenarioText: document.getElementById('scenarioText'),
    paceMode: document.getElementById('paceMode'),
    alarmBanner: document.getElementById('alarmBanner'),
    alarmText: document.getElementById('alarmText'),
    objectiveText: [
        document.getElementById('objectiveText'),
        document.getElementById('objectiveTextSecondary')
    ].filter(Boolean),
    feedbackText: [
        document.getElementById('feedbackText'),
        document.getElementById('feedbackTextSecondary')
    ].filter(Boolean)
};

const textKeys = [
    'scenarioName',
    'scenarioText',
    'paceMode',
    'alarmText',
    'objectiveText',
    'feedbackText'
];

const defaultTexts = textKeys.reduce((acc, key) => {
    const target = scenarioElements[key];
    const element = Array.isArray(target) ? target[0] : target;
    acc[key] = element?.textContent ?? '';
    return acc;
}, {});

const scenarioState = {
    scenarios: [],
    activeScenario: null
};



function updateText(key, value) {
    const targets = scenarioElements[key];
    if (!targets) return;

    const elements = Array.isArray(targets) ? targets : [targets];
    if (!elements.length) return;

    elements.forEach((element) => {
        if (key === 'paceMode') {
            const baseValue = value === undefined || value === null || value === ''
                ? defaultTexts[key]
                : String(value);
            element.dataset.baseMode = baseValue;
        }

        if (value === undefined || value === null || value === '') {
            element.textContent = defaultTexts[key];
        } else {
            element.textContent = String(value);
        }
    });
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
    window.dispatchEvent(
        new CustomEvent('edupace-alarm', {
            detail: {
                level: alarm?.level ?? 'normal',
                text: alarm?.text ?? null
            }
        })
    );
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
    updateText('paceMode', scenario.pacing?.mode ?? null);
    updateAlarm(scenario.alarm);
    updateText('objectiveText', scenario.objective ?? null);
    updateText('feedbackText', scenario.feedback ?? null);
}

function applyVitalsOverride(baseScenario, overrides) {
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