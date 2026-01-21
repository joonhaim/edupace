import {
    chooseLogStoragePath,
    deleteSessionLog,
    getLogStoragePath,
    getSessionLogs,
    initSessionStore,
    openLogStoragePath,
    serializeSessionToCsv,
    syncFromDisk,
    updateSessionLogMetadata
} from './sessionStore.js';
import { translateKey } from './languageToggle.js';
import { openSessionReview } from './sessionReview.js';

const filterState = {
    search: '',
    sort: 'newest',
    selectedId: null
};

const detailState = {
    mode: 'view',
    editingId: null,
    draft: null,
    focusField: null
};

let selectionManuallyCleared = false;

const defaultLogSettings = {
    dateFormat: 'DMY',
    timeFormat: '24h'
};

const LOG_SETTINGS_KEY = 'edupace-log-settings';

let logDisplaySettings = { ...defaultLogSettings };
let logLocationElements = { display: null, openBtn: null, hint: null, refreshBtn: null };
const leaderboardElements = {
    scenarioLabel: document.getElementById('logsLeaderboardScenario'),
    table: document.getElementById('logsLeaderboardTable')
};

function translateTemplate(key, replacements = {}) {
    let text = translateKey(key) || key;
    Object.entries(replacements).forEach(([token, value]) => {
        text = text.replaceAll(`{${token}}`, value);
    });
    return text;
}

function loadLogSettings() {
    try {
        const saved = JSON.parse(localStorage.getItem(LOG_SETTINGS_KEY));
        if (saved && typeof saved === 'object') {
            logDisplaySettings = { ...defaultLogSettings, ...saved };
        }
    } catch (error) {
        console.warn('Unable to load log settings', error);
        logDisplaySettings = { ...defaultLogSettings };
    }
}

function persistLogSettings() {
    try {
        localStorage.setItem(LOG_SETTINGS_KEY, JSON.stringify(logDisplaySettings));
    } catch (error) {
        console.warn('Unable to save log settings', error);
    }
}

function applyLogSettings(patch = {}) {
    logDisplaySettings = { ...logDisplaySettings, ...patch };
    persistLogSettings();
    renderLogs();
}

function describeLogLocation(path) {
    if (path) return path;
    return translateKey('logs.location.browserOnly');
}

function updateLogLocationUi(path = getLogStoragePath()) {
    const { display, openBtn, hint, refreshBtn } = logLocationElements;
    const hasNativeAccess = Boolean(window.edupace?.logs);
    if (display) display.textContent = describeLogLocation(path);
    if (openBtn) openBtn.disabled = !hasNativeAccess || !path;
    if (refreshBtn) refreshBtn.disabled = !hasNativeAccess;
    if (hint) {
        hint.textContent = hasNativeAccess
            ? translateKey('logs.location.nativeHint')
            : translateKey('logs.location.browserHint');
    }
}

function resetDetailState(mode = 'view') {
    detailState.mode = mode;
    detailState.editingId = null;
    detailState.draft = null;
    detailState.focusField = null;
}

function initLogSettingsPanel() {
    const panel = document.querySelector('[data-settings-panel-target="logs"]');
    if (!panel) return;

    const dateSelect = panel.querySelector('[data-log-date-format]');
    const timeSelect = panel.querySelector('[data-log-time-format]');

    if (dateSelect) {
        dateSelect.value = logDisplaySettings.dateFormat;
        dateSelect.addEventListener('change', () => applyLogSettings({ dateFormat: dateSelect.value }));
    }

    if (timeSelect) {
        timeSelect.value = logDisplaySettings.timeFormat;
        timeSelect.addEventListener('change', () => applyLogSettings({ timeFormat: timeSelect.value }));
    }

    logLocationElements = {
        display: panel.querySelector('[data-log-path-display]'),
        openBtn: panel.querySelector('[data-log-open-path]'),
        hint: panel.querySelector('[data-log-path-hint]'),
        refreshBtn: panel.querySelector('[data-log-refresh-path]')
    };

    const changePathBtn = panel.querySelector('[data-log-change-path]');

    changePathBtn?.addEventListener('click', async () => {
        await chooseLogStoragePath();
        await syncFromDisk();
        updateLogLocationUi();
        renderLogs();
    });

    logLocationElements.openBtn?.addEventListener('click', () => openLogStoragePath());
    logLocationElements.refreshBtn?.addEventListener('click', async () => {
        await syncFromDisk();
        updateLogLocationUi();
        renderLogs();
    });

    updateLogLocationUi();
}

function createDownload(url, filename) {
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
}

function downloadLog(log, format) {
    if (!log) return;

    const isCsv = format === 'csv';
    const data = isCsv ? serializeSessionToCsv(log) : JSON.stringify(log, null, 2);
    const blob = new Blob([data], { type: isCsv ? 'text/csv' : 'application/json' });
    const url = URL.createObjectURL(blob);
    createDownload(url, `${log.id}.${isCsv ? 'csv' : 'json'}`);
    URL.revokeObjectURL(url);
}

function normalizeText(value) {
    return (value ?? '').toString().toLowerCase();
}

function matchesFilters(log) {
    const text = [log.scenarioTitle, log.id, log.metadata?.operator, log.metadata?.notes, log.metadata?.label]
        .map(normalizeText)
        .join(' ');

    if (filterState.search && !text.includes(filterState.search.toLowerCase())) {
        return false;
    }

    return true;
}

function sortLogs(logs) {
    const sorted = [...logs];
    switch (filterState.sort) {
        case 'oldest':
            sorted.sort((a, b) => new Date(a.startedAt) - new Date(b.startedAt));
            break;
        case 'duration':
            sorted.sort((a, b) => (b.durationSeconds ?? 0) - (a.durationSeconds ?? 0));
            break;
        case 'events':
            sorted.sort((a, b) => (b.events?.length ?? 0) - (a.events?.length ?? 0));
            break;
        case 'newest':
        default:
            sorted.sort((a, b) => new Date(b.startedAt) - new Date(a.startedAt));
            break;
    }
    return sorted;
}

function applyFilters(logs) {
    const filtered = logs.filter(matchesFilters);
    return sortLogs(filtered);
}

function formatDuration(seconds) {
    if (!seconds || Number.isNaN(seconds)) return '0s';
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

function renderLeaderboard(activeLog) {
    if (!leaderboardElements.table || !leaderboardElements.scenarioLabel) return;

    const scenarioKey = getScenarioKey(activeLog);
    const scenarioTitle = activeLog?.scenarioTitle ?? translateKey('logs.unknownScenario');
    leaderboardElements.scenarioLabel.textContent = scenarioKey
        ? translateTemplate('logs.leaderboard.scenario', { scenario: scenarioTitle })
        : translateKey('logs.leaderboard.noScenario');

    leaderboardElements.table.innerHTML = '';

    if (!scenarioKey) {
        const empty = document.createElement('div');
        empty.className = 'leaderboard-empty';
        empty.textContent = translateKey('logs.leaderboard.empty');
        leaderboardElements.table.appendChild(empty);
        return;
    }

    const logs = getSessionLogs()
        .filter((log) => log.status === 'ended' && getScenarioKey(log) === scenarioKey);

    if (!logs.length) {
        const empty = document.createElement('div');
        empty.className = 'leaderboard-empty';
        empty.textContent = translateKey('logs.leaderboard.empty');
        leaderboardElements.table.appendChild(empty);
        return;
    }

    const grouped = new Map();
    logs.forEach((log) => {
        const operatorName = normalizeOperator(log.metadata?.operator);
        if (!operatorName) return;
        const key = operatorName.toLowerCase();
        if (!grouped.has(key)) {
            grouped.set(key, {
                name: operatorName,
                count: 0,
                bestTime: null
            });
        }
        const entry = grouped.get(key);
        entry.count += 1;
        if (log.stabilized === true && Number.isFinite(log.stabilizationSeconds)) {
            const currentBest = entry.bestTime ?? Number.POSITIVE_INFINITY;
            entry.bestTime = Math.min(currentBest, log.stabilizationSeconds);
        }
    });

    const rows = Array.from(grouped.values()).sort((a, b) => {
        const aTime = a.bestTime ?? Number.POSITIVE_INFINITY;
        const bTime = b.bestTime ?? Number.POSITIVE_INFINITY;
        if (aTime !== bTime) return aTime - bTime;
        if (a.count !== b.count) return b.count - a.count;
        return a.name.localeCompare(b.name);
    });

    if (!rows.length) {
        const empty = document.createElement('div');
        empty.className = 'leaderboard-empty';
        empty.textContent = translateKey('logs.leaderboard.empty');
        leaderboardElements.table.appendChild(empty);
        return;
    }

    const head = document.createElement('div');
    head.className = 'leaderboard-row leaderboard-head';
    head.innerHTML = `
        <span>${translateKey('logs.leaderboard.rank')}</span>
        <span>${translateKey('logs.leaderboard.name')}</span>
        <span>${translateKey('logs.leaderboard.bestTime')}</span>
        <span>${translateKey('logs.leaderboard.sessionCount')}</span>
    `;
    leaderboardElements.table.appendChild(head);

    rows.forEach((entry, index) => {
        const row = document.createElement('div');
        row.className = 'leaderboard-row';

        const rank = document.createElement('span');
        rank.className = 'leaderboard-rank';
        rank.textContent = String(index + 1);

        const name = document.createElement('span');
        name.className = 'leaderboard-name';
        name.textContent = entry.name;

        const time = document.createElement('span');
        time.className = 'leaderboard-stat';
        time.textContent = entry.bestTime === null
            ? translateKey('logs.leaderboard.noTime')
            : formatDuration(entry.bestTime);

        const count = document.createElement('span');
        count.className = 'leaderboard-stat';
        count.textContent = translateTemplate('logs.leaderboard.sessions', { count: entry.count });

        row.append(rank, name, time, count);
        leaderboardElements.table.appendChild(row);
    });
}

function formatDate(timestamp) {
    if (!timestamp) return translateKey('logs.time.unknown');
    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) return translateKey('logs.time.unknown');

    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();

    let datePart = `${day}/${month}/${year}`;
    switch (logDisplaySettings.dateFormat) {
        case 'MDY':
            datePart = `${month}/${day}/${year}`;
            break;
        case 'YMD':
            datePart = `${year}-${month}-${day}`;
            break;
        case 'DMY':
        default:
            datePart = `${day}/${month}/${year}`;
            break;
    }

    let hours = date.getHours();
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    let suffix = '';

    if (logDisplaySettings.timeFormat === '12h') {
        suffix = hours >= 12 ? 'pm' : 'am';
        hours = hours % 12 || 12;
        const displayHours = String(hours).padStart(2, '0');
        return `${datePart} ${displayHours}:${minutes}:${seconds} ${suffix}`;
    }

    return `${datePart} ${String(hours).padStart(2, '0')}:${minutes}:${seconds}`;
}

function setSelectedLog(id) {
    selectionManuallyCleared = false;
    filterState.selectedId = id;
    resetDetailState();
    renderLogs();
}

function clearSelectedLog() {
    selectionManuallyCleared = true;
    filterState.selectedId = null;
    resetDetailState();
    renderDetail(null);
    document.querySelectorAll('.log-card.is-active').forEach((card) => card.classList.remove('is-active'));
}

function buildMetaRow(label, value, options = {}) {
    const row = document.createElement('div');
    row.className = 'meta-row';

    const labelEl = document.createElement('span');
    labelEl.className = 'meta-label';
    labelEl.textContent = label;

    const valueEl = document.createElement('p');
    valueEl.className = 'meta-value';
    valueEl.textContent = value || translateKey('logs.meta.notProvided');

    if (!value) {
        valueEl.classList.add('is-placeholder');
    }

    if (options.muted) {
        valueEl.classList.add('is-muted');
    }

    if (options.field) {
        row.dataset.field = options.field;
    }

    if (typeof options.onActivate === 'function') {
        row.classList.add('is-activatable');
        row.addEventListener('dblclick', options.onActivate);
        row.setAttribute('title', translateKey('logs.meta.editHint'));
    }

    row.append(labelEl, valueEl);
    return row;
}

function getDraftForLog(log) {
    if (detailState.editingId === log.id && detailState.draft) {
        return detailState.draft;
    }

    return {
        label: log.metadata?.label ?? '',
        operator: log.metadata?.operator ?? '',
        notes: log.metadata?.notes ?? ''
    };
}

function enterEditMode(log, focusField) {
    detailState.mode = 'edit';
    detailState.editingId = log.id;
    detailState.draft = getDraftForLog(log);
    detailState.focusField = focusField ?? null;
    renderDetail(log);
}

function renderLogCard(log) {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'log-card';
    card.dataset.id = log.id;

    const title = document.createElement('div');
    title.className = 'log-title';
    title.textContent = log.scenarioTitle || translateKey('logs.unknownScenario');

    const meta = document.createElement('div');
    meta.className = 'log-meta';
    const eventSummary = translateTemplate('logs.events.count', { count: log.events?.length ?? 0 });
    meta.textContent = translateTemplate('logs.card.meta', {
        date: formatDate(log.startedAt),
        duration: formatDuration(log.durationSeconds),
        events: eventSummary
    });

    const label = document.createElement('div');
    label.className = 'log-label';
    const labelText = log.metadata?.label || log.metadata?.operator;
    label.textContent = labelText ? labelText : translateKey('logs.card.addLabel');

    card.append(title, meta, label);

    card.addEventListener('click', () => setSelectedLog(log.id));
    if (filterState.selectedId === log.id) {
        card.classList.add('is-active');
    }

    return card;
}

function renderDetail(log) {
    const panel = document.getElementById('logDetailPanel');
    if (!panel) return;

    panel.classList.remove('is-hidden');
    panel.innerHTML = '';

    if (!log) {
        const empty = document.createElement('div');
        empty.className = 'detail-empty';
        empty.textContent = translateKey('logs.detail.empty');
        panel.append(empty);
        return;
    }

    const heading = document.createElement('div');
    heading.className = 'detail-heading';
    const headingText = document.createElement('div');
    headingText.className = 'detail-heading-text';
    const title = document.createElement('h2');
    title.textContent = log.scenarioTitle || translateKey('logs.unknownScenario');
    const sub = document.createElement('p');
    sub.className = 'detail-subtitle';
    const detailEventSummary = translateTemplate('logs.events.count', { count: log.events?.length ?? 0 });
    sub.textContent = translateTemplate('logs.card.meta', {
        date: formatDate(log.startedAt),
        duration: formatDuration(log.durationSeconds),
        events: detailEventSummary
    });
    headingText.append(title, sub);

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'detail-close';
    closeBtn.setAttribute('aria-label', translateKey('logs.detail.close'));
    closeBtn.textContent = '×';
    closeBtn.addEventListener('click', clearSelectedLog);

    heading.append(headingText, closeBtn);

    const summary = document.createElement('div');
    summary.className = 'detail-summary';

    const stabilizedValue =
        typeof log.stabilized === 'boolean'
            ? translateKey(log.stabilized ? 'logs.detail.stabilizedYes' : 'logs.detail.stabilizedNo')
            : '—';

    const stabilizationTime =
        log.stabilized === true && Number.isFinite(log.stabilizationSeconds)
            ? formatDuration(log.stabilizationSeconds)
            : '—';

    const summaryItems = [
        { label: translateKey('logs.detail.sessionId'), value: log.id },
        { label: translateKey('logs.detail.started'), value: formatDate(log.startedAt) },
        { label: translateKey('logs.detail.duration'), value: formatDuration(log.durationSeconds) },
        { label: translateKey('logs.detail.stabilized'), value: stabilizedValue },
        { label: translateKey('logs.detail.stabilizationTime'), value: stabilizationTime },
        {
            label: translateKey('logs.detail.events'),
            value: translateTemplate('logs.events.count', { count: log.events?.length ?? 0 })
        }
    ];

    summaryItems.forEach((item) => {
        const block = document.createElement('div');
        block.className = 'detail-summary-item';

        const labelEl = document.createElement('span');
        labelEl.className = 'detail-summary-label';
        labelEl.textContent = item.label;

        const valueEl = document.createElement('span');
        valueEl.className = 'detail-summary-value';
        valueEl.textContent = item.value || '—';

        block.append(labelEl, valueEl);
        summary.append(block);
    });

    const metaList = document.createElement('div');
    metaList.className = 'detail-meta';

    const actions = document.createElement('div');
    actions.className = 'detail-actions';

    const downloadJson = document.createElement('button');
    downloadJson.type = 'button';
    downloadJson.className = 'btn btn-ghost btn-small';
    downloadJson.textContent = translateKey('logs.actions.downloadJson');
    downloadJson.addEventListener('click', () => downloadLog(log, 'json'));

    const downloadCsv = document.createElement('button');
    downloadCsv.type = 'button';
    downloadCsv.className = 'btn btn-ghost btn-small';
    downloadCsv.textContent = translateKey('logs.actions.downloadCsv');
    downloadCsv.addEventListener('click', () => downloadLog(log, 'csv'));

    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'btn btn-ghost btn-small danger';
    deleteBtn.textContent = translateKey('logs.actions.delete');
    deleteBtn.addEventListener('click', async () => {
        await deleteSessionLog(log.id);
        filterState.selectedId = null;
        resetDetailState();
        renderLogs();
    });

    if (detailState.mode === 'edit' && detailState.editingId !== log.id) {
        resetDetailState('edit');
    }

    if (detailState.mode === 'edit') {
        const draft = getDraftForLog(log);
        detailState.editingId = log.id;
        detailState.draft = { ...draft };
        metaList.classList.add('is-edit');

        const labelField = document.createElement('label');
        labelField.textContent = translateKey('logs.form.label');
        const labelInput = document.createElement('input');
        labelInput.type = 'text';
        labelInput.value = draft.label;
        labelInput.placeholder = translateKey('logs.form.labelPlaceholder');
        labelInput.dataset.field = 'label';
        labelInput.addEventListener('input', (event) => {
            detailState.draft = { ...(detailState.draft ?? draft), label: event.target.value };
        });
        labelField.appendChild(labelInput);

        const operatorField = document.createElement('label');
        operatorField.textContent = translateKey('logs.form.operator');
        const operatorInput = document.createElement('input');
        operatorInput.type = 'text';
        operatorInput.value = draft.operator;
        operatorInput.placeholder = translateKey('logs.form.operatorPlaceholder');
        operatorInput.dataset.field = 'operator';
        operatorInput.addEventListener('input', (event) => {
            detailState.draft = { ...(detailState.draft ?? draft), operator: event.target.value };
        });
        operatorField.appendChild(operatorInput);

        const notesField = document.createElement('label');
        notesField.textContent = translateKey('logs.form.notes');
        const notesInput = document.createElement('textarea');
        notesInput.value = draft.notes;
        notesInput.placeholder = translateKey('logs.form.notesPlaceholder');
        notesInput.dataset.field = 'notes';
        notesInput.addEventListener('input', (event) => {
            detailState.draft = { ...(detailState.draft ?? draft), notes: event.target.value };
        });
        notesField.appendChild(notesInput);

        metaList.append(labelField, operatorField, notesField);
        const primaryActions = document.createElement('div');
        primaryActions.className = 'detail-actions-group';
        const exportActions = document.createElement('div');
        exportActions.className = 'detail-actions-group';
        const dangerActions = document.createElement('div');
        dangerActions.className = 'detail-actions-group';

        const saveBtn = document.createElement('button');
        saveBtn.type = 'button';
        saveBtn.className = 'btn btn-primary btn-small';
        saveBtn.textContent = translateKey('logs.actions.save');
        saveBtn.addEventListener('click', async () => {
            await updateSessionLogMetadata(log.id, { ...detailState.draft });
            resetDetailState();
            renderLogs();
        });

        const cancelBtn = document.createElement('button');
        cancelBtn.type = 'button';
        cancelBtn.className = 'btn btn-ghost btn-small';
        cancelBtn.textContent = translateKey('logs.actions.cancel');
        cancelBtn.addEventListener('click', () => {
            resetDetailState();
            renderDetail(log);
        });

        primaryActions.append(saveBtn, cancelBtn);
        exportActions.append(downloadJson, downloadCsv);
        dangerActions.append(deleteBtn);
        actions.append(primaryActions, exportActions, dangerActions);

        const focusTarget = detailState.focusField;
        const focusMap = { label: labelInput, operator: operatorInput, notes: notesInput };
        if (focusTarget && focusMap[focusTarget]) {
            focusMap[focusTarget].focus({ preventScroll: true });
            if (focusMap[focusTarget].select) {
                focusMap[focusTarget].select();
            }
        }
        detailState.focusField = null;
    } else {
        metaList.classList.add('is-view');
        metaList.append(
            buildMetaRow(translateKey('logs.form.label'), log.metadata?.label, {
                field: 'label',
                onActivate: () => enterEditMode(log, 'label')
            }),
            buildMetaRow(translateKey('logs.form.operator'), log.metadata?.operator, {
                field: 'operator',
                onActivate: () => enterEditMode(log, 'operator')
            }),
            buildMetaRow(translateKey('logs.form.notesShort'), log.metadata?.notes, {
                muted: true,
                field: 'notes',
                onActivate: () => enterEditMode(log, 'notes')
            })
        );

        const editBtn = document.createElement('button');
        editBtn.type = 'button';
        editBtn.className = 'btn btn-primary btn-small';
        editBtn.textContent = translateKey('logs.actions.edit');
        editBtn.addEventListener('click', (event) => {
            event.stopPropagation();
            enterEditMode(log);
        });

        const reviewBtn = document.createElement('button');
        reviewBtn.type = 'button';
        reviewBtn.className = 'btn btn-ghost btn-small';
        reviewBtn.textContent = translateKey('logs.actions.review');
        reviewBtn.addEventListener('click', (event) => {
            event.stopPropagation();
            openSessionReview(log);
        });

        const primaryActions = document.createElement('div');
        primaryActions.className = 'detail-actions-group';
        const exportActions = document.createElement('div');
        exportActions.className = 'detail-actions-group';
        const dangerActions = document.createElement('div');
        dangerActions.className = 'detail-actions-group';

        primaryActions.append(editBtn, reviewBtn);
        exportActions.append(downloadJson, downloadCsv);
        dangerActions.append(deleteBtn);
        actions.append(primaryActions, exportActions, dangerActions);
    }

    panel.append(heading, summary, metaList, actions);
}

function renderLogs() {
    const list = document.getElementById('logsList');
    const emptyState = document.getElementById('logsEmpty');
    if (!list || !emptyState) return;

    list.innerHTML = '';
    const logs = applyFilters(getSessionLogs());

    if (!logs.length) {
        emptyState.style.display = 'block';
        emptyState.textContent = translateKey('logs.list.empty');
        resetDetailState();
        renderDetail(null);
        renderLeaderboard(null);
        selectionManuallyCleared = false;
        return;
    }

    emptyState.style.display = 'none';
    logs.forEach((log) => list.appendChild(renderLogCard(log)));

    let activeLog = logs.find((log) => log.id === filterState.selectedId) ?? null;
    if (!activeLog && !selectionManuallyCleared) {
        filterState.selectedId = logs[0].id;
        activeLog = logs[0];
    }

    renderDetail(activeLog);
    renderLeaderboard(activeLog);
}

function bindFilters() {
    const searchInput = document.getElementById('logSearch');
    const sortSelect = document.getElementById('logSort');

    searchInput?.addEventListener('input', (event) => {
        filterState.search = event.target.value.trim();
        renderLogs();
    });

    sortSelect?.addEventListener('change', (event) => {
        filterState.sort = event.target.value;
        renderLogs();
    });
}

function bindListDeselect() {
    const list = document.getElementById('logsList');
    if (!list) return;

    list.addEventListener('click', (event) => {
        if (!event.target.closest('.log-card')) {
            clearSelectedLog();
        }
    });
}

function bindBackgroundDeselect() {
    const grid = document.querySelector('.logs-grid');
    if (!grid) return;

    grid.addEventListener('click', (event) => {
        const inListCard = event.target.closest('.log-card');
        const inDetail = event.target.closest('.log-detail');
        if (!inListCard && !inDetail) {
            clearSelectedLog();
        }
    });
}

async function initLogsPage() {
    loadLogSettings();
    await initSessionStore();
    await syncFromDisk();
    initLogSettingsPanel();
    bindFilters();
    bindListDeselect();
    bindBackgroundDeselect();
    renderLogs();

    window.addEventListener('edupace:open-log-detail', (event) => {
        const logId = event.detail?.logId;
        if (!logId) return;
        filterState.selectedId = logId;
        selectionManuallyCleared = false;
        renderLogs();
    });

    window.addEventListener('edupace:session-logs-changed', () => {
        updateLogLocationUi();
        renderLogs();
    });
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initLogsPage);
} else {
    initLogsPage();
}
