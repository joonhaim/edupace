import {
    deleteSessionLog,
    getSessionLogs,
    serializeSessionToCsv,
    updateSessionLogMetadata
} from './sessionStore.js';

const filterState = {
    search: '',
    sort: 'newest',
    selectedId: null
};

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

function formatDate(timestamp) {
    if (!timestamp) return 'Unknown time';
    const date = new Date(timestamp);
    return date.toLocaleString();
}

function setSelectedLog(id) {
    filterState.selectedId = id;
    renderLogs();
}

function renderLogCard(log) {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'log-card';
    card.dataset.id = log.id;

    const title = document.createElement('div');
    title.className = 'log-title';
    title.textContent = log.scenarioTitle || 'Unknown scenario';

    const meta = document.createElement('div');
    meta.className = 'log-meta';
    meta.textContent = `${formatDate(log.startedAt)} • ${formatDuration(log.durationSeconds)} • ${
        log.events?.length ?? 0
    } events`;

    const label = document.createElement('div');
    label.className = 'log-label';
    const labelText = log.metadata?.label || log.metadata?.operator;
    label.textContent = labelText ? labelText : 'Add label or operator';

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

    if (!log) {
        panel.classList.add('is-hidden');
        panel.innerHTML = '';
        return;
    }

    panel.classList.remove('is-hidden');
    panel.innerHTML = '';

    const heading = document.createElement('div');
    heading.className = 'detail-heading';
    const title = document.createElement('h2');
    title.textContent = log.scenarioTitle || 'Unknown scenario';
    const sub = document.createElement('p');
    sub.className = 'detail-subtitle';
    sub.textContent = `${formatDate(log.startedAt)} • ${formatDuration(log.durationSeconds)} • ${
        log.events?.length ?? 0
    } events`;
    heading.append(title, sub);

    const metaList = document.createElement('div');
    metaList.className = 'detail-meta';

    const labelField = document.createElement('label');
    labelField.textContent = 'Run label';
    const labelInput = document.createElement('input');
    labelInput.type = 'text';
    labelInput.value = log.metadata?.label ?? '';
    labelInput.placeholder = 'e.g., Morning check';
    labelField.appendChild(labelInput);

    const operatorField = document.createElement('label');
    operatorField.textContent = 'Operator';
    const operatorInput = document.createElement('input');
    operatorInput.type = 'text';
    operatorInput.value = log.metadata?.operator ?? '';
    operatorInput.placeholder = 'Name of person running the session';
    operatorField.appendChild(operatorInput);

    const notesField = document.createElement('label');
    notesField.textContent = 'Notes / annotations';
    const notesInput = document.createElement('textarea');
    notesInput.value = log.metadata?.notes ?? '';
    notesInput.placeholder = 'Observations, alarms, adjustments, etc.';
    notesField.appendChild(notesInput);

    const persistMetadata = () => {
        updateSessionLogMetadata(log.id, {
            operator: operatorInput.value,
            notes: notesInput.value,
            label: labelInput.value
        });
        renderLogs();
    };

    labelInput.addEventListener('change', persistMetadata);
    operatorInput.addEventListener('change', persistMetadata);
    notesInput.addEventListener('blur', persistMetadata);

    metaList.append(labelField, operatorField, notesField);

    const actions = document.createElement('div');
    actions.className = 'detail-actions';

    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'btn btn-ghost btn-small danger';
    deleteBtn.textContent = 'Delete entry';
    deleteBtn.addEventListener('click', () => {
        deleteSessionLog(log.id);
        filterState.selectedId = null;
        renderLogs();
    });

    const downloadJson = document.createElement('button');
    downloadJson.type = 'button';
    downloadJson.className = 'btn btn-ghost btn-small';
    downloadJson.textContent = 'Download JSON';
    downloadJson.addEventListener('click', () => downloadLog(log, 'json'));

    const downloadCsv = document.createElement('button');
    downloadCsv.type = 'button';
    downloadCsv.className = 'btn btn-ghost btn-small';
    downloadCsv.textContent = 'Download CSV';
    downloadCsv.addEventListener('click', () => downloadLog(log, 'csv'));

    actions.append(downloadJson, downloadCsv, deleteBtn);

    panel.append(heading, metaList, actions);
}

function renderLogs() {
    const list = document.getElementById('logsList');
    const emptyState = document.getElementById('logsEmpty');
    if (!list || !emptyState) return;

    list.innerHTML = '';
    const logs = applyFilters(getSessionLogs());

    if (!logs.length) {
        emptyState.style.display = 'block';
        emptyState.textContent = 'No sessions match the current filters yet.';
        renderDetail(null);
        return;
    }

    emptyState.style.display = 'none';
    logs.forEach((log) => list.appendChild(renderLogCard(log)));

    if (!filterState.selectedId || !logs.find((log) => log.id === filterState.selectedId)) {
        filterState.selectedId = logs[0].id;
    }

    const activeLog = logs.find((log) => log.id === filterState.selectedId) ?? logs[0];
    renderDetail(activeLog);
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

function initLogsPage() {
    bindFilters();
    renderLogs();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initLogsPage);
} else {
    initLogsPage();
}
