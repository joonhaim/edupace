import { getCurrentLanguage, translateKey } from './languageToggle.js';
import { localizeScenarioList } from './scenarioLocalization.js';
import { getSessionLogs, initSessionStore } from './sessionStore.js';

const recentList = document.querySelector('[data-recent-list]');
const recentEmpty = document.querySelector('[data-recent-empty]');
const leaderboardCarousel = document.querySelector('[data-leaderboard-carousel]');
const leaderboardEmpty = document.querySelector('[data-leaderboard-empty]');

const progressFill = document.querySelector('[data-progress-fill]');
const progressCount = document.querySelector('[data-progress-count]');
const progressHint = document.querySelector('[data-progress-hint]');

const suggestedCard = document.querySelector('[data-suggested-card]');
const suggestRefreshBtn = document.querySelector('[data-suggest-refresh]');

let baseScenarios = [];
let localizedScenarios = [];
let clinicalScenarios = [];
let leaderboardRotationTimer = null;
let leaderboardPanels = [];
let leaderboardIndex = 0;

function translateTemplate(key, replacements = {}) {
    let text = translateKey(key) || key;
    Object.entries(replacements).forEach(([token, value]) => {
        text = text.replaceAll(`{${token}}`, value);
    });
    return text;
}

function formatDate(timestamp) {
    if (!timestamp) return translateKey('home.recent.unknownTime');
    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) return translateKey('home.recent.unknownTime');
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

function getScenarioKey(log) {
    return log?.scenarioId || log?.scenarioCode || log?.scenarioTitle || '';
}

function normalizeOperator(name) {
    return name?.trim() ?? '';
}

function stopLeaderboardRotation() {
    if (leaderboardRotationTimer) {
        window.clearInterval(leaderboardRotationTimer);
        leaderboardRotationTimer = null;
    }
}

function showLeaderboardPanel(index) {
    leaderboardPanels.forEach((panel, panelIndex) => {
        panel.classList.toggle('is-active', panelIndex === index);
    });
    leaderboardIndex = index;
}

function startLeaderboardRotation() {
    stopLeaderboardRotation();
    if (leaderboardPanels.length <= 1) return;
    leaderboardRotationTimer = window.setInterval(() => {
        const nextIndex = (leaderboardIndex + 1) % leaderboardPanels.length;
        showLeaderboardPanel(nextIndex);
    }, 6000);
}

function buildTotalSessionsPanel(totalCount) {
    const panel = document.createElement('div');
    panel.className = 'leaderboard-panel';

    const total = document.createElement('div');
    total.className = 'leaderboard-total';

    const value = document.createElement('div');
    value.className = 'leaderboard-total__value';
    value.textContent = String(totalCount);

    const label = document.createElement('div');
    label.className = 'leaderboard-total__label';
    label.textContent = translateKey('home.leaderboard.totalLabel');

    total.append(value, label);
    panel.appendChild(total);
    return panel;
}

function buildScenarioPanel(scenarioTitle, entries) {
    const panel = document.createElement('div');
    panel.className = 'leaderboard-panel';

    const heading = document.createElement('div');
    heading.className = 'leaderboard-panel-heading';
    heading.textContent = translateTemplate('home.leaderboard.scenarioTitle', { scenario: scenarioTitle });

    const list = document.createElement('div');
    list.className = 'leaderboard-list';

    if (!entries.length) {
        const empty = document.createElement('div');
        empty.className = 'leaderboard-empty';
        empty.textContent = translateKey('home.leaderboard.noTime');
        list.appendChild(empty);
    } else {
        entries.forEach((entry, index) => {
            const row = document.createElement('div');
            row.className = 'home-leaderboard-row';

            const rank = document.createElement('div');
            rank.className = 'home-leaderboard-rank';
            rank.textContent = String(index + 1);

            const name = document.createElement('div');
            name.className = 'home-leaderboard-name';
            const nameText = document.createElement('span');
            nameText.textContent = entry.name;
            const nameMeta = document.createElement('small');
            nameMeta.textContent = translateTemplate('home.leaderboard.sessions', { count: entry.count });
            name.append(nameText, nameMeta);

            const time = document.createElement('div');
            time.className = 'home-leaderboard-time';
            time.textContent = formatDuration(entry.bestTime);

            row.append(rank, name, time);
            list.appendChild(row);
        });
    }

    panel.append(heading, list);
    return panel;
}

function renderLeaderboard() {
    if (!leaderboardCarousel || !leaderboardEmpty) return;

    leaderboardCarousel.innerHTML = '';
    leaderboardPanels = [];
    leaderboardIndex = 0;
    stopLeaderboardRotation();
    const logs = getSessionLogs().filter((log) => log.status === 'ended');

    if (!logs.length) {
        leaderboardEmpty.hidden = false;
        return;
    }

    leaderboardEmpty.hidden = true;

    const totalPanel = buildTotalSessionsPanel(logs.length);
    leaderboardPanels.push(totalPanel);
    leaderboardCarousel.appendChild(totalPanel);

    const scenarioMap = new Map();
    logs.forEach((log) => {
        const scenarioKey = getScenarioKey(log);
        if (!scenarioKey) return;
        if (!scenarioMap.has(scenarioKey)) {
            scenarioMap.set(scenarioKey, {
                title: log.scenarioTitle || translateKey('logs.unknownScenario'),
                latestAt: log.endedAt || log.startedAt || '',
                entries: new Map()
            });
        }
        const scenario = scenarioMap.get(scenarioKey);
        scenario.latestAt = log.endedAt || log.startedAt || scenario.latestAt;
        const operatorName = normalizeOperator(log.metadata?.operator);
        const operatorKey = operatorName ? operatorName.toLowerCase() : '__anonymous__';
        if (!scenario.entries.has(operatorKey)) {
            scenario.entries.set(operatorKey, {
                name: operatorName || translateKey('home.leaderboard.anonymous'),
                count: 0,
                bestTime: null
            });
        }
        const entry = scenario.entries.get(operatorKey);
        entry.count += 1;
        if (log.stabilized === true && Number.isFinite(log.stabilizationSeconds)) {
            const currentBest = entry.bestTime ?? Number.POSITIVE_INFINITY;
            entry.bestTime = Math.min(currentBest, log.stabilizationSeconds);
        }
    });

    const scenarios = Array.from(scenarioMap.values())
        .sort((a, b) => new Date(b.latestAt) - new Date(a.latestAt))
        .slice(0, 5);

    scenarios.forEach((scenario) => {
        const entries = Array.from(scenario.entries.values())
            .filter((entry) => Number.isFinite(entry.bestTime))
            .sort((a, b) => a.bestTime - b.bestTime)
            .slice(0, 3);

        const panel = buildScenarioPanel(scenario.title, entries);
        leaderboardPanels.push(panel);
        leaderboardCarousel.appendChild(panel);
    });

    if (leaderboardPanels.length) {
        showLeaderboardPanel(0);
        startLeaderboardRotation();
    }
}

function renderRecentSessions() {
    if (!recentList || !recentEmpty) return;

    recentList.querySelectorAll('.recent-entry').forEach((node) => node.remove());

    const logs = getSessionLogs().filter((log) => log.status === 'ended');
    const latest = logs.slice(0, 2);

    recentEmpty.hidden = latest.length > 0;

    latest.forEach((log) => {
        const entry = document.createElement('button');
        entry.type = 'button';
        entry.className = 'recent-entry';
        entry.dataset.viewTarget = 'logs';
        const sessionTitle = log.scenarioTitle ?? 'Training session';
        entry.setAttribute('aria-label', `Open session log for ${sessionTitle}`);
        entry.addEventListener('click', () => {
            if (!log.id) return;
            document.dispatchEvent(
                new CustomEvent('edupace:open-log-detail', {
                    detail: { logId: log.id }
                })
            );
        });

        const meta = document.createElement('div');
        meta.className = 'recent-entry__meta';

        const title = document.createElement('p');
        title.className = 'recent-entry__title';
        title.textContent = sessionTitle;

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
        progressCount.textContent = translateTemplate('home.progress.count', {
            completed,
            total: safeTotal
        });
    }

    if (progressHint) {
        if (!totalScenarios) {
            progressHint.textContent = translateKey('home.progress.loading');
        } else if (!completed) {
            progressHint.textContent = translateKey('home.progress.startHint');
        } else {
            const remaining = Math.max(totalScenarios - completed, 0);
            progressHint.textContent = translateTemplate('home.progress.remaining', { remaining });
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
        empty.textContent = translateKey('home.suggested.empty');
        suggestedCard.appendChild(empty);
        return;
    }

    const title = document.createElement('h3');
    title.className = 'suggested-title';
    title.textContent = scenario.title;

    const summary = document.createElement('p');
    summary.className = 'suggested-summary';
    summary.textContent =
        scenario.summaryLabel ||
        scenario.description ||
        translateKey('home.suggested.fallbackSummary');

    const actions = document.createElement('div');
    actions.className = 'suggested-actions';

    const startLink = document.createElement('a');
    startLink.className = 'btn btn-primary';
    startLink.href = '#training';
    startLink.dataset.viewTarget = 'training';
    startLink.textContent = translateKey('home.suggested.start');
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
    learnMore.textContent = translateKey('home.suggested.shuffle');
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
            (scenario) => (scenario.category ?? 'clinical').toLowerCase() === 'clinical' && !scenario.comingSoon
        );

        renderRecentSessions();
        summarizeCompletion();
        renderSuggestedCard();
        renderLeaderboard();
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
    renderLeaderboard();

    window.addEventListener('edupace:session-logs-changed', () => {
        renderRecentSessions();
        summarizeCompletion();
        renderSuggestedCard();
        renderLeaderboard();
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
