import { getCurrentLanguage, translateKey } from './languageToggle.js';
import { localizeScenarioList } from './scenarioLocalization.js';

const ALARM_LEVELS = ['normal', 'warning', 'critical'];

const scenarioElements = {
    scenarioName: document.getElementById('scenarioPickerLabel'),
    scenarioText: document.getElementById('scenarioText'),
    scenarioPicker: document.getElementById('scenarioPicker'),
    scenarioPickerArea: document.querySelector('[data-scenario-picker-area]'),
    scenarioNext: document.getElementById('scenarioNextBtn'),
    scenarioMenu: document.getElementById('scenarioMenu'),
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
    baseScenarios: [],
    scenarios: [],
    activeScenario: null,
    activeIndex: null,
    locked: false
};

const feedbackState = {
    bpm: null,
    lastPeakAgeSeconds: null,
    lastPaceAt: null,
    params: {
        rate: null,
        output: null,
        power: null
    },
    settings: {
        intrinsicRate: 60,
        scenarioIntrinsicRates: {}
    },
    ruleFeedbackOverride: null,
    lastFeedbackText: ''
};

const CATEGORY_ORDER = ['clinical'];

function normalizeCategory(scenario) {
    const category = typeof scenario?.category === 'string' ? scenario.category.toLowerCase() : 'clinical';
    return category || 'clinical';
}

function findScenarioIndex(identifier) {
    if (!identifier) return -1;
    const normalizedId = identifier.trim().toLowerCase();
    return scenarioState.scenarios.findIndex((scenario) => {
        if (scenario.comingSoon) return false;
        const idMatch = scenario.id?.toLowerCase() === normalizedId;
        const codeMatch = scenario.code?.toLowerCase() === normalizedId;
        return idMatch || codeMatch;
    });
}

function getCategoryLabel(category) {
    if (category === 'clinical') return translateKey('training.menu.clinical');
    return translateKey('training.menu.trainingModes');
}

function getCategoryClasses(category) {
    const base = 'scenario-menu-section';
    return `${base} ${base}-${category}`.trim();
}


function isScenarioLocked() {
    return scenarioState.locked;
}

function setScenarioLock(locked = false) {
    scenarioState.locked = Boolean(locked);
    const picker = scenarioElements.scenarioPicker;
    const nextBtn = scenarioElements.scenarioNext;

    if (picker) {
        picker.disabled = scenarioState.locked;
        picker.setAttribute('aria-disabled', String(scenarioState.locked));
        picker.classList.toggle('is-locked', scenarioState.locked);
    }

    if (nextBtn) {
        nextBtn.disabled = scenarioState.locked;
        nextBtn.setAttribute('aria-disabled', String(scenarioState.locked));
    }

    if (scenarioState.locked) {
        if (scenarioElements.scenarioMenu) {
            scenarioElements.scenarioMenu.classList.remove('open');
        }
        if (scenarioElements.scenarioPicker) {
            scenarioElements.scenarioPicker.classList.remove('is-open');
            scenarioElements.scenarioPicker.setAttribute('aria-expanded', 'false');
        }
    }
}

function toggleMenu(open = null) {
    const menu = scenarioElements.scenarioMenu;
    const trigger = scenarioElements.scenarioPicker;
    if (!menu || !trigger) return;

    if (isScenarioLocked()) return;

    const isOpen = open === null ? !menu.classList.contains('open') : open;
    menu.classList.toggle('open', isOpen);
    trigger.setAttribute('aria-expanded', String(isOpen));
    trigger.classList.toggle('is-open', isOpen);
}

function highlightActiveOption() {
    const menu = scenarioElements.scenarioMenu;
    if (!menu) return;
    const options = menu.querySelectorAll('.scenario-option');
    options.forEach((option) => {
        const selected = option.dataset.index === String(scenarioState.activeIndex);
        option.setAttribute('aria-selected', String(selected));
    });
}



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

function getScenarioIntrinsicRate(scenarioId) {
    const scenarioRates = feedbackState.settings.scenarioIntrinsicRates ?? {};
    const fallbackRate = Number(feedbackState.settings.intrinsicRate ?? 60);
    const scenarioRate = Number(scenarioRates?.[scenarioId]);
    return Number.isFinite(scenarioRate) ? scenarioRate : fallbackRate;
}

function getTargetHeartRate(scenarioId, pacingExpected) {
    if (pacingExpected && Number.isFinite(feedbackState.params.rate)) {
        return feedbackState.params.rate;
    }
    return getScenarioIntrinsicRate(scenarioId);
}

function getRecentPaceAgeSeconds() {
    if (!Number.isFinite(feedbackState.lastPaceAt)) return null;
    return Math.max(0, (Date.now() - feedbackState.lastPaceAt) / 1000);
}

function getFeedbackStatus(scenario) {
    if (!scenario) return 'stable';

    const pacingExpected =
        feedbackState.params.power !== false &&
        Number.isFinite(feedbackState.params.rate) &&
        feedbackState.params.rate > 0;

    const targetHeartRate = getTargetHeartRate(scenario.id, pacingExpected);
    const bpm = feedbackState.bpm;
    const hrOk = Number.isFinite(bpm) && Number.isFinite(targetHeartRate) && bpm >= targetHeartRate;

    const targetInterval = targetHeartRate > 0 ? 60 / targetHeartRate : 1;
    const pauseThreshold = Math.max(2.5, targetInterval * 1.5);
    const longPauseThreshold = Math.max(4, targetInterval * 2.5);
    const lastPeakAge = feedbackState.lastPeakAgeSeconds;
    const pausePresent = Number.isFinite(lastPeakAge) && lastPeakAge > pauseThreshold;
    const longPause = Number.isFinite(lastPeakAge) && lastPeakAge > longPauseThreshold;

    const paceAgeSeconds = getRecentPaceAgeSeconds();
    const paceWindow = Math.max(4, targetInterval * 2);
    const recentPace = Number.isFinite(paceAgeSeconds) && paceAgeSeconds <= paceWindow;

    if (scenario.id === 'NSR') {
        if (!hrOk || longPause) return 'unstable';
        if (recentPace) return 'partial';
        return 'stable';
    }

    if (!pacingExpected) {
        if (!hrOk || longPause) return 'unstable';
        return 'partial';
    }

    if (!hrOk || longPause) return 'unstable';
    if (pausePresent || (pacingExpected && !recentPace)) return 'partial';
    return 'stable';
}

function getScenarioFeedbackText(scenario, status) {
    if (scenario?.feedbackStatus?.[status]) {
        return scenario.feedbackStatus[status];
    }
    return scenario?.feedback ?? null;
}

function refreshFeedbackText() {
    if (!scenarioState.activeScenario) return;

    if (feedbackState.ruleFeedbackOverride) {
        updateText('feedbackText', feedbackState.ruleFeedbackOverride);
        feedbackState.lastFeedbackText = feedbackState.ruleFeedbackOverride ?? '';
        return;
    }

    const status = getFeedbackStatus(scenarioState.activeScenario);
    const nextText = getScenarioFeedbackText(scenarioState.activeScenario, status);
    if (nextText === feedbackState.lastFeedbackText) return;
    feedbackState.lastFeedbackText = nextText ?? '';
    updateText('feedbackText', nextText ?? null);
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
        scenarioState.baseScenarios = Array.isArray(scenarios) ? scenarios : [];
        scenarioState.scenarios = localizeScenarioList(scenarioState.baseScenarios, getCurrentLanguage());
    } catch (error) {
        console.error(error);
        scenarioState.baseScenarios = [];
        scenarioState.scenarios = [];
    }

    return scenarioState.scenarios;
}

function renderScenarioMenu(menu, scenarios) {
    if (!menu) return;

    menu.innerHTML = '';

    const list = document.createElement('div');
    list.className = 'scenario-menu-list scenario-menu-grid';

    if (!scenarios.length) {
        const empty = document.createElement('div');
        empty.className = 'scenario-option scenario-option-empty';
        empty.textContent = translateKey('training.menu.empty');
        empty.setAttribute('aria-disabled', 'true');
        empty.tabIndex = -1;
        list.appendChild(empty);
        menu.appendChild(list);
        return;
    }

    const grouped = new Map();

    scenarios.forEach((scenario, index) => {
        const category = normalizeCategory(scenario);
        if (!grouped.has(category)) {
            grouped.set(category, []);
        }
        grouped.get(category).push({ scenario, index });
    });

    const orderedCategories = [
        ...CATEGORY_ORDER,
        ...Array.from(grouped.keys()).filter((category) => !CATEGORY_ORDER.includes(category))
    ];

    orderedCategories.forEach((category) => {
        const items = grouped.get(category) ?? [];
        const section = document.createElement('div');
        section.className = getCategoryClasses(category);

        const heading = document.createElement('div');
        heading.className = 'scenario-menu-heading';
        heading.textContent = getCategoryLabel(category);
        section.appendChild(heading);

        if (!items.length) {
            const empty = document.createElement('div');
            empty.className = 'scenario-option scenario-option-empty';
            empty.textContent = translateKey('training.menu.empty');
            empty.setAttribute('aria-disabled', 'true');
            empty.tabIndex = -1;
            section.appendChild(empty);
        }

        items.forEach(({ scenario, index }) => {
            const option = document.createElement('button');
            option.type = 'button';
            option.className = 'scenario-option';
            option.dataset.index = String(index);
            option.role = 'option';
            option.textContent = scenario.title;
            if (scenario.comingSoon) {
                option.disabled = true;
                option.title = translateKey('training.menu.comingSoon');
            }

            option.addEventListener('click', () => {
                startScenario(index);
                toggleMenu(false);
            });

            section.appendChild(option);
        });

        list.appendChild(section);
    });

    menu.appendChild(list);
}

function applyScenarioText(scenario) {
    updateText('scenarioName', scenario.title);
    updateText('scenarioText', scenario.description);
    updateAlarm(scenario.alarm);
    updateText('objectiveText', scenario.objective ?? null);
    feedbackState.ruleFeedbackOverride = null;
    feedbackState.lastFeedbackText = '';
    refreshFeedbackText();
}

function applyVitalsOverride(baseScenario, overrides) {
}

function handleHeartRateUpdate(event) {
    const bpm = event.detail?.bpm;
    const lastPeakAgeSeconds = event.detail?.lastPeakAgeSeconds;
    feedbackState.bpm = Number.isFinite(bpm) ? bpm : null;
    feedbackState.lastPeakAgeSeconds = Number.isFinite(lastPeakAgeSeconds) ? lastPeakAgeSeconds : null;
    refreshFeedbackText();
}

function handleParametersUpdate(event) {
    const detail = event.detail ?? {};
    if (Number.isFinite(detail.rate)) feedbackState.params.rate = detail.rate;
    if (Number.isFinite(detail.output)) feedbackState.params.output = detail.output;
    if (typeof detail.power === 'boolean') feedbackState.params.power = detail.power;
    refreshFeedbackText();
}

function handleEcgSettingsUpdate(event) {
    const detail = event.detail ?? {};
    if (Number.isFinite(detail.intrinsicRate)) {
        feedbackState.settings.intrinsicRate = detail.intrinsicRate;
    }
    if (detail.scenarioIntrinsicRates) {
        feedbackState.settings.scenarioIntrinsicRates = {
            ...(feedbackState.settings.scenarioIntrinsicRates ?? {}),
            ...detail.scenarioIntrinsicRates
        };
    }
    refreshFeedbackText();
}

function handleLedFlash(event) {
    const detail = event.detail ?? {};
    if (detail.kind !== 'pace') return;
    const timestamp = detail.at ? new Date(detail.at).getTime() : Date.now();
    feedbackState.lastPaceAt = Number.isFinite(timestamp) ? timestamp : Date.now();
    refreshFeedbackText();
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
    feedbackState.ruleFeedbackOverride = effects?.feedback ?? null;
    feedbackState.lastFeedbackText = '';
    refreshFeedbackText();

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
    if (isScenarioLocked()) {
        return;
    }

    const scenario = scenarioState.scenarios[index];
    if (!scenario || scenario.comingSoon) {
        return;
    }

    scenarioState.activeScenario = scenario;
    scenarioState.activeIndex = index;
    applyScenarioText(scenario);
    highlightActiveOption();

    window.dispatchEvent(
        new CustomEvent('edupace-scenario-change', {
            detail: scenario
        })
    );

    const params = new URLSearchParams(window.location.search);
    const scenarioId = scenario.id || scenario.code;
    if (scenarioId) {
        params.set('scenario', scenarioId);
    } else {
        params.delete('scenario');
    }

    const queryString = params.toString();
    const newUrl = `${window.location.pathname}${queryString ? `?${queryString}` : ''}${window.location.hash}`;
    history.replaceState(null, '', newUrl);
}

function refreshScenarioLanguage(language = getCurrentLanguage()) {
    scenarioState.scenarios = localizeScenarioList(scenarioState.baseScenarios, language);
    renderScenarioMenu(scenarioElements.scenarioMenu, scenarioState.scenarios);
    highlightActiveOption();

    if (Number.isInteger(scenarioState.activeIndex)) {
        const scenario = scenarioState.scenarios[scenarioState.activeIndex];
        if (scenario) {
            scenarioState.activeScenario = scenario;
            applyScenarioText(scenario);
        }
    }
}

async function initScenarios() {
    const menu = scenarioElements.scenarioMenu;
    const picker = scenarioElements.scenarioPicker;
    const nextBtn = scenarioElements.scenarioNext;

    if (!menu || !picker) {
        return;
    }

    await loadScenarios();
    renderScenarioMenu(menu, scenarioState.scenarios);

    picker.addEventListener('click', () => toggleMenu());
    const pickerArea = scenarioElements.scenarioPickerArea;
    pickerArea?.addEventListener('click', (event) => {
        if (event.target.closest('#scenarioPicker') || event.target.closest('#scenarioNextBtn')) return;
        if (event.target.closest('#scenarioMenu')) return;
        toggleMenu();
    });
    nextBtn?.addEventListener('click', () => {
        if (scenarioState.scenarios.length) {
            const total = scenarioState.scenarios.length;
            let nextIndex = (Number.isInteger(scenarioState.activeIndex) ? scenarioState.activeIndex : -1) + 1;

            for (let i = 0; i < total; i += 1) {
                const candidateIndex = (nextIndex + i) % total;
                const candidate = scenarioState.scenarios[candidateIndex];
                if (candidate && !candidate.comingSoon) {
                    startScenario(candidateIndex);
                    break;
                }
            }
        }
    });
    document.addEventListener('click', (event) => {
        const isPickerClick = picker?.contains(event.target);
        const isMenuClick = menu?.contains(event.target);
        if (isPickerClick || isMenuClick) return;
        toggleMenu(false);
    });

    window.addEventListener('edupace-rule-effects', (event) => {
        applyRuleEffects(event.detail?.effects ?? {});
    });

    window.addEventListener('edupace-hr-update', handleHeartRateUpdate);
    window.addEventListener('edupace-parameters', handleParametersUpdate);
    window.addEventListener('edupace-ecg-settings', handleEcgSettingsUpdate);
    window.addEventListener('edupace-led-flash', handleLedFlash);

    window.addEventListener('edupace-session-event', (event) => {
        const status = event.detail?.session?.status;
        const shouldLock = status === 'running' || status === 'paused';
        setScenarioLock(shouldLock);
    });

    const params = new URLSearchParams(window.location.search);
    const scenarioQuery = params.get('scenario');

    let initialIndex = scenarioState.scenarios.findIndex((scenario) => !scenario.comingSoon);

    if (scenarioQuery) {
        const normalizedQuery = scenarioQuery.trim().toLowerCase();
        const matchedIndex = scenarioState.scenarios.findIndex((scenario) => {
            const idMatch = scenario.id?.toLowerCase() === normalizedQuery;
            const codeMatch = scenario.code?.toLowerCase() === normalizedQuery;
            return !scenario.comingSoon && (idMatch || codeMatch);
        });

        if (matchedIndex >= 0) {
            initialIndex = matchedIndex;
        }
    }

    if (initialIndex >= 0) {
        startScenario(initialIndex);
    }

    document.addEventListener('edupace:start-scenario', (event) => {
        const scenarioId = event.detail?.scenarioId || event.detail?.scenarioCode;
        const requestedIndex = findScenarioIndex(scenarioId);
        if (requestedIndex >= 0) {
            startScenario(requestedIndex);
        }
    });

    document.addEventListener('edupace:language-changed', (event) => {
        const language = event.detail?.language || getCurrentLanguage();
        refreshScenarioLanguage(language);
    });
}

export { initScenarios };
