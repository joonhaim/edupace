import { getCurrentLanguage, translateKey } from './languageToggle.js';
import { localizeScenarioList } from './scenarioLocalization.js';

const scenarioLists = {
    module: document.querySelector('[data-scenario-list="module"]'),
    clinical: document.querySelector('[data-scenario-list="clinical"]')
};

let scenarioCategoryToggles = [];

let baseScenarios = [];
let localizedScenarios = [];
let searchTerm = '';
let activeCategory = 'clinical';

function hasTargets() {
    return Object.values(scenarioLists).some(Boolean);
}

function setScenarioCategory(category = 'clinical') {
    activeCategory = category;
    Object.entries(scenarioLists).forEach(([key, target]) => {
        if (!target) return;
        const isActive = key === category;
        target.hidden = !isActive;
    });

    scenarioCategoryToggles.forEach((button) => {
        const isActive = button.dataset.scenarioCategory === category;
        button.classList.toggle('active', isActive);
        button.setAttribute('aria-selected', String(isActive));
    });
}

function bindScenarioToggles() {
    scenarioCategoryToggles = Array.from(document.querySelectorAll('[data-scenario-category]'));
    scenarioCategoryToggles.forEach((toggle) => {
        toggle.addEventListener('click', () => {
            setScenarioCategory(toggle.dataset.scenarioCategory);
            applyScenarioFilters();
        });
    });
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

function renderScenarioLists(scenarios, { categoryFilter = null } = {}) {
    const totalItems = scenarios.length;
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

        const isFilteredOut = categoryFilter && category !== categoryFilter;
        target.hidden = Boolean(isFilteredOut);
        if (isFilteredOut) {
            target.innerHTML = '';
            return;
        }

        const items = grouped[category] ?? [];
        target.innerHTML = '';

        const shouldShowEmptyState = !items.length && (!searchTerm.trim() || totalItems === 0);

        if (shouldShowEmptyState) {
            createEmptyState(target);
            return;
        }

        items.forEach((scenario) => {
            const link = createScenarioLink(scenario);
            target.appendChild(link);
        });
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

function updateCategoryVisibility() {
    const isSearching = Boolean(searchTerm.trim());

    scenarioCategoryToggles.forEach((toggle) => {
        toggle.disabled = isSearching;
        toggle.setAttribute('aria-disabled', String(isSearching));
        toggle.classList.toggle('is-disabled', isSearching);
    });

    if (isSearching) {
        Object.values(scenarioLists).forEach((target) => {
            if (!target) return;
            target.hidden = false;
        });
        return;
    }

    setScenarioCategory(activeCategory);
}

function applyScenarioFilters() {
    const filtered = filterScenarios(searchTerm, localizedScenarios);
    const categoryFilter = searchTerm.trim() ? null : activeCategory;
    renderScenarioLists(filtered, { categoryFilter });
    updateCategoryVisibility();
}

async function initHomeScenarios() {
    if (!hasTargets()) return;

    bindScenarioToggles();
    bindScenarioSearch();
    setScenarioCategory('clinical');

    try {
        const response = await fetch('data/scenarios.json', { cache: 'no-store' });
        if (!response.ok) throw new Error(`Failed to load scenarios (${response.status})`);
        const payload = await response.json();
        baseScenarios = Array.isArray(payload) ? payload : payload.scenarios;
        localizedScenarios = localizeScenarioList(Array.isArray(baseScenarios) ? baseScenarios : [], getCurrentLanguage());
        applyScenarioFilters();
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
        applyScenarioFilters();
    });
}

initHomeScenarios();
