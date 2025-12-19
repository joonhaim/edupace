import { getCurrentLanguage } from './languageToggle.js';
import { localizeScenarioList } from './scenarioLocalization.js';
import { getSessionLogs, initSessionStore } from './sessionStore.js';

const recentList = document.querySelector('[data-recent-list]');
const recentEmpty = document.querySelector('[data-recent-empty]');
const recentCount = document.querySelector('[data-recent-count]');

const progressFill = document.querySelector('[data-progress-fill]');
const progressCount = document.querySelector('[data-progress-count]');
const progressHint = document.querySelector('[data-progress-hint]');

const suggestedCard = document.querySelector('[data-suggested-card]');
const suggestRefreshBtn = document.querySelector('[data-suggest-refresh]');

let baseScenarios = [];
let localizedScenarios = [];
let clinicalScenarios = [];

function formatDate(timestamp) {
    if (!timestamp) return 'Unknown time';
    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) return 'Unknown time';
    const formatter = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' });
    return formatter.format(date);
}

function formatDuration(seconds) {
    if (!seconds && seconds !== 0) return '';
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const remaining = seconds % 60;
    return remaining ? `${minutes}m ${remaining}s` : `${minutes}m`;
}

function renderRecentSessions() {
    if (!recentList || !recentEmpty) return;

    recentList.querySelectorAll('.recent-entry').forEach((node) => node.remove());

    const logs = getSessionLogs().filter((log) => log.status === 'ended');
    const latest = logs.slice(0, 2);

    recentEmpty.hidden = latest.length > 0;
    if (recentCount) {
        recentCount.textContent = logs.length ? `${Math.min(latest.length, 2)} of ${logs.length}` : '';
        recentCount.hidden = !logs.length;
    }

    latest.forEach((log) => {
        const entry = document.createElement('div');
        entry.className = 'recent-entry';

        const meta = document.createElement('div');
        meta.className = 'recent-entry__meta';

        const title = document.createElement('p');
        title.className = 'recent-entry__title';
        title.textContent = log.scenarioTitle ?? 'Training session';

        const sub = document.createElement('p');
        sub.className = 'recent-entry__sub';
        const endedAt = log.endedAt || log.startedAt;
        const durationText = formatDuration(log.durationSeconds ?? 0);
        sub.textContent = `${formatDate(endedAt)} • ${durationText || 'Session'}`;

        meta.append(title, sub);

        const indicator = document.createElement('div');
        indicator.className = 'chip chip-muted';
        indicator.textContent = log.metadata?.label || 'Completed';

        entry.append(meta, indicator);
        recentList.appendChild(entry);
    });
}

function summarizeCompletion() {
    const totalScenarios = localizedScenarios.filter((scenario) => !scenario.comingSoon).length;
    const completedIds = new Set(
        getSessionLogs()
            .filter((log) => log.status === 'ended' && (log.scenarioId || log.scenarioCode))
            .map((log) => log.scenarioId || log.scenarioCode)
    );

    const completed = localizedScenarios.filter((scenario) => {
        const code = scenario.id || scenario.code;
        return code && completedIds.has(code);
    }).length;

    const percent = totalScenarios ? Math.round((completed / totalScenarios) * 100) : 0;

    if (progressFill) {
        progressFill.style.width = `${percent}%`;
        progressFill.setAttribute('aria-valuemin', '0');
        progressFill.setAttribute('aria-valuemax', '100');
        progressFill.setAttribute('aria-valuenow', String(percent));
    }

    if (progressCount) {
        const safeTotal = totalScenarios || '—';
        progressCount.textContent = `${completed} / ${safeTotal} scenarios complete`;
    }

    if (progressHint) {
        if (!totalScenarios) {
            progressHint.textContent = 'Loading scenarios…';
        } else if (!completed) {
            progressHint.textContent = 'Start any scenario to see your progress fill up.';
        } else {
            const remaining = Math.max(totalScenarios - completed, 0);
            progressHint.textContent = `${remaining} to go for full coverage.`;
        }
    }
}

function pickRandomScenario() {
    const completedIds = new Set(
        getSessionLogs()
            .filter((log) => log.status === 'ended' && (log.scenarioId || log.scenarioCode))
            .map((log) => log.scenarioId || log.scenarioCode)
    );

    const unplayed = clinicalScenarios.filter((scenario) => {
        const code = scenario.id || scenario.code;
        return code && !completedIds.has(code);
    });

    const pool = unplayed.length ? unplayed : clinicalScenarios;
    if (!pool.length) return null;

    const randomIndex = Math.floor(Math.random() * pool.length);
    return pool[randomIndex];
}

function renderSuggestedCard() {
    if (!suggestedCard) return;
    suggestedCard.innerHTML = '';

    const scenario = pickRandomScenario();
    if (!scenario) {
        const empty = document.createElement('div');
        empty.className = 'muted';
        empty.textContent = 'Add clinical scenarios to see suggestions here.';
        suggestedCard.appendChild(empty);
        return;
    }

    const title = document.createElement('h3');
    title.className = 'suggested-title';
    title.textContent = scenario.title;

    const summary = document.createElement('p');
    summary.className = 'suggested-summary';
    summary.textContent = scenario.summaryLabel || scenario.description || 'Practice this case next.';

    const actions = document.createElement('div');
    actions.className = 'suggested-actions';

    const startLink = document.createElement('a');
    startLink.className = 'btn btn-primary';
    startLink.href = '#training';
    startLink.dataset.viewTarget = 'training';
    startLink.textContent = 'Start in training';
    startLink.addEventListener('click', () => {
        const scenarioId = scenario.id || scenario.code;
        document.dispatchEvent(
            new CustomEvent('edupace:start-scenario', {
                detail: { scenarioId }
            })
        );
    });

    const learnMore = document.createElement('button');
    learnMore.type = 'button';
    learnMore.className = 'btn btn-ghost';
    learnMore.textContent = 'Shuffle';
    learnMore.addEventListener('click', renderSuggestedCard);

    actions.append(startLink, learnMore);
    suggestedCard.append(title, summary, actions);
}

async function loadScenarios(language = getCurrentLanguage()) {
    try {
        if (!baseScenarios.length) {
            const response = await fetch('data/scenarios.json', { cache: 'no-store' });
            if (!response.ok) throw new Error('Failed to load scenarios');
            const payload = await response.json();
            baseScenarios = Array.isArray(payload) ? payload : payload.scenarios;
        }

        localizedScenarios = localizeScenarioList(baseScenarios, language);
        clinicalScenarios = localizedScenarios.filter(
            (scenario) => (scenario.category ?? 'module').toLowerCase() === 'clinical' && !scenario.comingSoon
        );

        renderRecentSessions();
        summarizeCompletion();
        renderSuggestedCard();
    } catch (error) {
        console.warn('Unable to load dashboard scenarios', error);
    }
}

async function initHomeDashboard() {
    await initSessionStore();
    await loadScenarios();
    renderRecentSessions();
    summarizeCompletion();
    renderSuggestedCard();

    window.addEventListener('edupace:session-logs-changed', () => {
        renderRecentSessions();
        summarizeCompletion();
        renderSuggestedCard();
    });

    document.addEventListener('edupace:language-changed', (event) => {
        const language = event.detail?.language || getCurrentLanguage();
        loadScenarios(language);
    });

    suggestRefreshBtn?.addEventListener('click', renderSuggestedCard);
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initHomeDashboard);
} else {
    initHomeDashboard();
}
