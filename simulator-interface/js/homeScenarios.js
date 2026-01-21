import { getCurrentLanguage, translateKey } from './languageToggle.js';
import { localizeScenarioList } from './scenarioLocalization.js';

const scenarioList = document.querySelector('[data-scenario-list]');

let baseScenarios = [];
let localizedScenarios = [];
let searchTerm = '';
function hasTargets() {
    return Boolean(scenarioList);
}

function bindScenarioSearch() {
    const searchInput = document.getElementById('home-scenario-search');
    if (!searchInput) return;

    searchInput.addEventListener('input', () => {
        searchTerm = searchInput.value;
        applyScenarioFilters();
    });
}

function createScenarioLink(scenario) {
    const link = document.createElement('a');
    link.className = 'scenario-link';
    link.href = '#training';
    link.dataset.viewTarget = 'training';
    link.dataset.scenarioId = scenario.id || scenario.code;
    link.textContent = scenario.title;

    const summary = document.createElement('span');
    summary.className = 'scenario-link-summary';
    summary.textContent = scenario.summaryLabel ?? scenario.description ?? '';
    link.appendChild(summary);

    link.addEventListener('click', () => {
        const scenarioId = link.dataset.scenarioId;
        if (!scenarioId) return;

        document.dispatchEvent(
            new CustomEvent('edupace:start-scenario', {
                detail: { scenarioId }
            })
        );
    });

    return link;
}

function createEmptyState(target) {
    const empty = document.createElement('div');
    empty.className = 'scenario-link-empty';
    empty.textContent = translateKey('home.scenarios.empty');
    target.appendChild(empty);
}

function renderScenarioList(scenarios) {
    if (!scenarioList) return;
    scenarioList.innerHTML = '';
    const shouldShowEmptyState = !scenarios.length && (!searchTerm.trim() || scenarios.length === 0);

    if (shouldShowEmptyState) {
        createEmptyState(scenarioList);
        return;
    }

    scenarios.forEach((scenario) => {
        const link = createScenarioLink(scenario);
        scenarioList.appendChild(link);
    });
}

function filterScenarios(term = '', scenarios = localizedScenarios) {
    const normalized = term.trim().toLowerCase();
    if (!normalized) return scenarios;

    return scenarios.filter((scenario) => {
        const haystack = [scenario.title, scenario.description, scenario.summaryLabel, scenario.code]
            .filter(Boolean)
            .join(' ')
            .toLowerCase();
        return haystack.includes(normalized);
    });
}

function applyScenarioFilters() {
    const filtered = filterScenarios(searchTerm, localizedScenarios);
    renderScenarioList(filtered);
}

async function initHomeScenarios() {
    if (!hasTargets()) return;

    bindScenarioSearch();

    try {
        const response = await fetch('data/scenarios.json', { cache: 'no-store' });
        if (!response.ok) throw new Error(`Failed to load scenarios (${response.status})`);
        const payload = await response.json();
        baseScenarios = Array.isArray(payload) ? payload : payload.scenarios;
        localizedScenarios = localizeScenarioList(Array.isArray(baseScenarios) ? baseScenarios : [], getCurrentLanguage());
        applyScenarioFilters();
    } catch (error) {
        if (scenarioList) {
            scenarioList.innerHTML = '';
            const warning = document.createElement('div');
            warning.className = 'scenario-link-empty';
            warning.textContent = translateKey('home.scenarios.error');
            scenarioList.appendChild(warning);
        }
        // eslint-disable-next-line no-console
        console.error(error);
    }

    document.addEventListener('edupace:language-changed', (event) => {
        const language = event.detail?.language || getCurrentLanguage();
        localizedScenarios = localizeScenarioList(baseScenarios, language);
        applyScenarioFilters();
    });
}

initHomeScenarios();
