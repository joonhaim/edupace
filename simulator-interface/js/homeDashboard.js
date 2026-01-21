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
const progressOperatorSelect = document.querySelector('[data-progress-operator]');

const suggestedCard = document.querySelector('[data-suggested-card]');
const suggestRefreshBtn = document.querySelector('[data-suggest-refresh]');

let baseScenarios = [];
let localizedScenarios = [];
let clinicalScenarios = [];
let leaderboardRotationTimer = null;
let leaderboardPanels = [];
let leaderboardIndex = 0;
let selectedOperatorKey = null;
const stabilizationScenarioIds = ['Mobitz2', 'AV3', 'SlowConduction'];

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

function normalizeOperator(name) {
    return name?.trim() ?? '';
}

function getOperatorDisplayName(rawName, fallbackKey = 'home.leaderboard.anonymous') {
    return rawName || translateKey(fallbackKey);
}

function getOperatorEntries(logs) {
    const map = new Map();
    logs.forEach((log) => {
        const name = getOperatorDisplayName(normalizeOperator(log.metadata?.operator), 'home.progress.anonymous');
        const key = name.toLowerCase();
        if (!map.has(key)) {
            map.set(key, { key, name });
        }
    });
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
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

function buildPodiumPanel(entries) {
    const panel = document.createElement('div');
    panel.className = 'leaderboard-panel';

    const heading = document.createElement('div');
    heading.className = 'leaderboard-panel-heading';
    heading.textContent = translateKey('home.leaderboard.podiumTitle');

    const podium = document.createElement('div');
    podium.className = 'leaderboard-podium';

    const positions = [
        { rank: 2, className: 'podium-place podium-place--second', entry: entries[1] },
        { rank: 1, className: 'podium-place podium-place--first', entry: entries[0] },
        { rank: 3, className: 'podium-place podium-place--third', entry: entries[2] }
    ];

    positions.forEach(({ rank, className, entry }) => {
        const place = document.createElement('div');
        place.className = className;

        const rankBadge = document.createElement('div');
        rankBadge.className = 'podium-rank';
        rankBadge.textContent = String(rank);

        const name = document.createElement('div');
        name.className = 'podium-name';
        name.textContent = entry?.name ?? '—';

        const sessions = document.createElement('div');
        sessions.className = 'podium-sessions';
        sessions.textContent = entry
            ? translateTemplate('home.leaderboard.sessions', { count: entry.count })
            : translateKey('home.leaderboard.noEntries');

        if (!entry) {
            place.classList.add('is-empty');
        }

        place.append(rankBadge, name, sessions);
        podium.appendChild(place);
    });

    panel.append(heading, podium);
    return panel;
}

function buildScenarioStabilizationPanel(logs, scenarioId) {
    const panel = document.createElement('div');
    panel.className = 'leaderboard-panel';

    const heading = document.createElement('div');
    heading.className = 'leaderboard-panel-heading';
    const scenario = localizedScenarios.find((entry) => (entry.id || entry.code) === scenarioId);
    const scenarioTitle = scenario?.title || scenarioId;
    heading.textContent = `${translateKey('home.leaderboard.stabilizationTitle')}: ${scenarioTitle}`;

    const list = document.createElement('div');
    list.className = 'leaderboard-list';

    const operatorMap = new Map();
    logs.forEach((log) => {
        if (log.status !== 'ended') return;
        if (log.stabilized !== true) return;
        if ((log.scenarioId || log.scenarioCode) !== scenarioId) return;
        if (!Number.isFinite(log.stabilizationSeconds)) return;

        const rawName = normalizeOperator(log.metadata?.operator);
        if (!rawName) return;
        const key = rawName.toLowerCase();
        if (!operatorMap.has(key)) {
            operatorMap.set(key, { name: rawName, bestTime: log.stabilizationSeconds });
            return;
        }
        const entry = operatorMap.get(key);
        entry.bestTime = Math.min(entry.bestTime, log.stabilizationSeconds);
    });

    const entries = Array.from(operatorMap.values())
        .sort((a, b) => a.bestTime - b.bestTime)
        .slice(0, 3);

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
            name.appendChild(nameText);

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

    const operatorMap = new Map();
    logs.forEach((log) => {
        const rawName = normalizeOperator(log.metadata?.operator);
        if (!rawName) return;
        const name = rawName;
        const key = name.toLowerCase();
        if (!operatorMap.has(key)) {
            operatorMap.set(key, {
                name,
                count: 0
            });
        }
        const entry = operatorMap.get(key);
        entry.count += 1;
    });

    const topOperators = Array.from(operatorMap.values())
        .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
        .slice(0, 3);

    const podiumPanel = buildPodiumPanel(topOperators);
    leaderboardPanels.push(podiumPanel);
    leaderboardCarousel.appendChild(podiumPanel);

    stabilizationScenarioIds.forEach((scenarioId) => {
        const stabilizationPanel = buildScenarioStabilizationPanel(logs, scenarioId);
        leaderboardPanels.push(stabilizationPanel);
        leaderboardCarousel.appendChild(stabilizationPanel);
    });

    if (leaderboardPanels.length) {
        showLeaderboardPanel(0);
        startLeaderboardRotation();
    }
}

function pickSuggestedScenarios(count = 2) {
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
    if (!pool.length) return [];

    const shuffled = [...pool].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, count);
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
    const completedIds = new Set();
    const logs = getSessionLogs().filter((log) => log.status === 'ended' && log.stabilized === true);

    logs.forEach((log) => {
        const operatorName = getOperatorDisplayName(normalizeOperator(log.metadata?.operator), 'home.progress.anonymous');
        const operatorKey = operatorName.toLowerCase();
        if (selectedOperatorKey && operatorKey !== selectedOperatorKey) return;
        const scenarioKey = log.scenarioId || log.scenarioCode;
        if (scenarioKey) {
            completedIds.add(scenarioKey);
        }
    });

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

function renderProgressOperatorSelect() {
    if (!progressOperatorSelect) return;

    const logs = getSessionLogs().filter((log) => log.status === 'ended');
    const operators = getOperatorEntries(logs);

    progressOperatorSelect.innerHTML = '';

    if (!operators.length) {
        const option = document.createElement('option');
        option.textContent = translateKey('home.progress.noOperators');
        option.value = '';
        progressOperatorSelect.appendChild(option);
        progressOperatorSelect.disabled = true;
        selectedOperatorKey = null;
        return;
    }

    progressOperatorSelect.disabled = false;

    operators.forEach((operator) => {
        const option = document.createElement('option');
        option.value = operator.key;
        option.textContent = operator.name;
        progressOperatorSelect.appendChild(option);
    });

    if (!selectedOperatorKey || !operators.some((operator) => operator.key === selectedOperatorKey)) {
        const randomIndex = Math.floor(Math.random() * operators.length);
        selectedOperatorKey = operators[randomIndex]?.key ?? operators[0].key;
    }

    progressOperatorSelect.value = selectedOperatorKey;
}

function renderSuggestedCard() {
    if (!suggestedCard) return;
    suggestedCard.innerHTML = '';

    const scenarios = pickSuggestedScenarios(2);
    if (!scenarios.length) {
        const empty = document.createElement('div');
        empty.className = 'muted';
        empty.textContent = translateKey('home.suggested.empty');
        suggestedCard.appendChild(empty);
        return;
    }

    scenarios.forEach((scenario) => {
        const entry = document.createElement('div');
        entry.className = 'suggested-entry';

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
        startLink.className = 'btn btn-primary btn-small';
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

        actions.append(startLink);
        entry.append(title, summary, actions);
        suggestedCard.appendChild(entry);
    });

    const learnMore = document.createElement('button');
    learnMore.type = 'button';
    learnMore.className = 'btn btn-ghost btn-small';
    learnMore.textContent = translateKey('home.suggested.shuffle');
    learnMore.addEventListener('click', renderSuggestedCard);
    suggestedCard.appendChild(learnMore);
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
        renderProgressOperatorSelect();
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
    renderProgressOperatorSelect();
    summarizeCompletion();
    renderSuggestedCard();
    renderLeaderboard();

    window.addEventListener('edupace:session-logs-changed', () => {
        renderRecentSessions();
        renderProgressOperatorSelect();
        summarizeCompletion();
        renderSuggestedCard();
        renderLeaderboard();
    });

    document.addEventListener('edupace:language-changed', (event) => {
        const language = event.detail?.language || getCurrentLanguage();
        loadScenarios(language);
    });

    suggestRefreshBtn?.addEventListener('click', renderSuggestedCard);
    progressOperatorSelect?.addEventListener('change', (event) => {
        selectedOperatorKey = event.target.value;
        summarizeCompletion();
    });
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initHomeDashboard);
} else {
    initHomeDashboard();
}
