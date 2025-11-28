const STORAGE_KEY = 'edupace-session-logs';

function readLogs() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        return raw ? JSON.parse(raw) : [];
    } catch (error) {
        console.error('Unable to read session logs', error);
        return [];
    }
}

function saveLogs(logs) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(logs));
    } catch (error) {
        console.error('Unable to save session logs', error);
    }
}

function addSessionLog(log) {
    if (!log?.id) return;

    const logs = readLogs();
    const existingIndex = logs.findIndex((entry) => entry.id === log.id);

    if (existingIndex >= 0) {
        logs[existingIndex] = log;
    } else {
        logs.unshift(log);
    }

    saveLogs(logs);
}

function getSessionLogs() {
    return readLogs();
}

function getSessionLogById(id) {
    return readLogs().find((entry) => entry.id === id) ?? null;
}

function escapeCsvValue(value) {
    const stringValue = `${value ?? ''}`;
    if (/[",\n]/.test(stringValue)) {
        return `"${stringValue.replace(/"/g, '""')}"`;
    }
    return stringValue;
}

function serializeSessionToCsv(session) {
    if (!session) return '';

    const headers = [
        'id',
        'scenarioTitle',
        'status',
        'startedAt',
        'endedAt',
        'durationSeconds',
        'eventCount',
        'events'
    ];

    const events = session.events
        ?.map((event) => `${event.timestamp} | ${event.type} | ${JSON.stringify(event.details)}`)
        .join(' ; ');

    const row = [
        session.id,
        session.scenarioTitle,
        session.status,
        session.startedAt,
        session.endedAt,
        session.durationSeconds,
        session.events?.length ?? 0,
        events
    ];

    const csv = [headers, row].map((line) => line.map(escapeCsvValue).join(',')).join('\n');
    return csv;
}

export { addSessionLog, getSessionLogById, getSessionLogs, serializeSessionToCsv };
