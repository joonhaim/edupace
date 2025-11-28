import { getSessionLogs, serializeSessionToCsv } from './sessionStore.js';

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

    card.append(meta, actions);
    return card;
}

function renderLogs() {
    const list = document.getElementById('logsList');
    const emptyState = document.getElementById('logsEmpty');
    if (!list || !emptyState) return;

    list.innerHTML = '';
    const logs = getSessionLogs();

    if (!logs.length) {
        emptyState.style.display = 'block';
        return;
    }

    emptyState.style.display = 'none';
    logs.forEach((log) => list.appendChild(renderLogCard(log)));
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', renderLogs);
} else {
    renderLogs();
}
