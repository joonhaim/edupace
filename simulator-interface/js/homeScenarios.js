import { getCurrentLanguage, translateKey } from './languageToggle.js';
import { localizeScenarioList } from './scenarioLocalization.js';

const scenarioLists = {
    module: document.querySelector('[data-scenario-list="module"]'),
    clinical: document.querySelector('[data-scenario-list="clinical"]')
};

let baseScenarios = [];
let localizedScenarios = [];

function hasTargets() {
    return Object.values(scenarioLists).some(Boolean);
}

function setScenarioCategory(category = 'clinical') {
    Object.entries(scenarioLists).forEach(([key, target]) => {
        if (!target) return;
        const isActive = key === category;
        target.hidden = !isActive;
    });

    document.querySelectorAll('[data-scenario-category]').forEach((button) => {
        const isActive = button.dataset.scenarioCategory === category;
        button.classList.toggle('active', isActive);
        button.setAttribute('aria-selected', String(isActive));
    });
}

function bindScenarioToggles() {
    const toggles = document.querySelectorAll('[data-scenario-category]');
    toggles.forEach((toggle) => {
        toggle.addEventListener('click', () => setScenarioCategory(toggle.dataset.scenarioCategory));
    });
}

function createScenarioLink(scenario) {
    const link = document.createElement('a');
    link.className = 'scenario-link';
    link.href = '#training';
    link.dataset.viewTarget = 'training';
    link.textContent = scenario.title;

    const summary = document.createElement('span');
    summary.className = 'scenario-link-summary';
    summary.textContent = scenario.summaryLabel ?? scenario.description ?? '';
    link.appendChild(summary);

    return link;
}

function createEmptyState(target) {
    const empty = document.createElement('div');
    empty.className = 'scenario-link-empty';
    empty.textContent = translateKey('home.scenarios.empty');
    target.appendChild(empty);
}

function renderScenarioLists(scenarios) {
    const grouped = scenarios.reduce(
        (acc, scenario) => {
            const category = (scenario.category ?? 'module').toLowerCase();
            if (!acc[category]) acc[category] = [];
            acc[category].push(scenario);
            return acc;
        },
        { module: [], clinical: [] }
    );

    Object.entries(scenarioLists).forEach(([category, target]) => {
        if (!target) return;

        const items = grouped[category] ?? [];
        target.innerHTML = '';

        if (!items.length) {
            createEmptyState(target);
            return;
        }

        items.forEach((scenario) => {
            const link = createScenarioLink(scenario);
            target.appendChild(link);
        });
    });
}

async function initHomeScenarios() {
    if (!hasTargets()) return;

    bindScenarioToggles();
    setScenarioCategory('clinical');

    try {
        const response = await fetch('data/scenarios.json', { cache: 'no-store' });
        if (!response.ok) throw new Error(`Failed to load scenarios (${response.status})`);
        const payload = await response.json();
        baseScenarios = Array.isArray(payload) ? payload : payload.scenarios;
        localizedScenarios = localizeScenarioList(Array.isArray(baseScenarios) ? baseScenarios : [], getCurrentLanguage());
        renderScenarioLists(localizedScenarios);
    } catch (error) {
        Object.values(scenarioLists).forEach((target) => {
            if (!target) return;
            target.innerHTML = '';
            const warning = document.createElement('div');
            warning.className = 'scenario-link-empty';
            warning.textContent = translateKey('home.scenarios.error');
            target.appendChild(warning);
        });
        // eslint-disable-next-line no-console
        console.error(error);
    }

    document.addEventListener('edupace:language-changed', (event) => {
        const language = event.detail?.language || getCurrentLanguage();
        localizedScenarios = localizeScenarioList(baseScenarios, language);
        renderScenarioLists(localizedScenarios);
    });
}

initHomeScenarios();
