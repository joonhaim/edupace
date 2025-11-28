import { getSessionLogs, serializeSessionToCsv, updateSessionLogMetadata } from './sessionStore.js';

const filterState = {
    search: '',
    sort: 'newest',
    from: null,
    to: null
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
    const text = [
        log.scenarioTitle,
        log.id,
        log.metadata?.operator,
        log.metadata?.notes,
        log.metadata?.label,
        log.metadata?.controlMode
    ]
        .map(normalizeText)
        .join(' ');

    if (filterState.search && !text.includes(filterState.search.toLowerCase())) {
        return false;
    }

    const startTime = log.startedAt ? new Date(log.startedAt).getTime() : null;
    if (filterState.from) {
        const fromMs = new Date(filterState.from).getTime();
        if (startTime && startTime < fromMs) return false;
    }
    if (filterState.to) {
        const toMs = new Date(filterState.to).getTime();
        if (startTime && startTime > toMs + 24 * 60 * 60 * 1000) return false;
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

function renderLogCard(log) {
    const card = document.createElement('div');
    card.className = 'log-card';

    const meta = document.createElement('div');
    meta.className = 'log-meta';

    const title = document.createElement('h3');
    title.textContent = log.scenarioTitle || 'Unknown scenario';

    const subtitle = document.createElement('p');
    subtitle.className = 'log-subtitle';
    subtitle.textContent = `Started ${formatDate(log.startedAt)}`;

    const badges = document.createElement('div');
    badges.className = 'log-badges';

    const duration = document.createElement('span');
    duration.className = 'log-badge';
    duration.textContent = `Duration: ${formatDuration(log.durationSeconds)}`;

    const events = document.createElement('span');
    events.className = 'log-badge';
    events.textContent = `${log.events?.length ?? 0} events`;

    badges.append(duration, events);
    meta.append(title, subtitle, badges);

    const actions = document.createElement('div');
    actions.className = 'log-actions';

    const jsonBtn = document.createElement('button');
    jsonBtn.type = 'button';
    jsonBtn.className = 'btn btn-ghost btn-small';
    jsonBtn.textContent = 'Download JSON';
    jsonBtn.addEventListener('click', () => downloadLog(log, 'json'));

    const csvBtn = document.createElement('button');
    csvBtn.type = 'button';
    csvBtn.className = 'btn btn-ghost btn-small';
    csvBtn.textContent = 'Download CSV';
    csvBtn.addEventListener('click', () => downloadLog(log, 'csv'));

    actions.append(jsonBtn, csvBtn);

    const metaRow = document.createElement('div');
    metaRow.className = 'log-meta-row';

    const operatorPill = document.createElement('span');
    operatorPill.className = 'meta-pill';
    operatorPill.textContent = log.metadata?.operator ? `Operator: ${log.metadata.operator}` : 'Operator: Unassigned';

    const modePill = document.createElement('span');
    modePill.className = 'meta-pill';
    modePill.textContent = `Control: ${log.metadata?.controlMode ?? 'unknown'}`;

    const labelPill = document.createElement('span');
    labelPill.className = 'meta-pill';
    labelPill.textContent = log.metadata?.label ? `Label: ${log.metadata.label}` : 'Label: —';

    metaRow.append(operatorPill, modePill, labelPill);

    const form = document.createElement('div');
    form.className = 'log-form';

    const labelField = document.createElement('div');
    labelField.className = 'form-field';
    const labelLabel = document.createElement('label');
    labelLabel.textContent = 'Run label';
    const labelInput = document.createElement('input');
    labelInput.type = 'text';
    labelInput.value = log.metadata?.label ?? '';
    labelInput.placeholder = 'e.g., Morning check';
    labelField.append(labelLabel, labelInput);

    const operatorField = document.createElement('div');
    operatorField.className = 'form-field';
    const operatorLabel = document.createElement('label');
    operatorLabel.textContent = 'Operator name';
    const operatorInput = document.createElement('input');
    operatorInput.type = 'text';
    operatorInput.value = log.metadata?.operator ?? '';
    operatorInput.placeholder = 'Who ran this session?';
    operatorField.append(operatorLabel, operatorInput);

    const notesField = document.createElement('div');
    notesField.className = 'form-field';
    const notesLabel = document.createElement('label');
    notesLabel.textContent = 'Notes / annotations';
    const notesInput = document.createElement('textarea');
    notesInput.value = log.metadata?.notes ?? '';
    notesInput.placeholder = 'Observations, alarms, adjustments, etc.';
    notesField.append(notesLabel, notesInput);

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

    form.append(labelField, operatorField, notesField);

    card.append(meta, actions, metaRow, form);
    return card;
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
        return;
    }

    emptyState.style.display = 'none';
    logs.forEach((log) => list.appendChild(renderLogCard(log)));
}

function bindFilters() {
    const searchInput = document.getElementById('logSearch');
    const sortSelect = document.getElementById('logSort');
    const fromInput = document.getElementById('logDateFrom');
    const toInput = document.getElementById('logDateTo');

    searchInput?.addEventListener('input', (event) => {
        filterState.search = event.target.value.trim();
        renderLogs();
    });

    sortSelect?.addEventListener('change', (event) => {
        filterState.sort = event.target.value;
        renderLogs();
    });

    fromInput?.addEventListener('change', (event) => {
        filterState.from = event.target.value || null;
        renderLogs();
    });

    toInput?.addEventListener('change', (event) => {
        filterState.to = event.target.value || null;
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
