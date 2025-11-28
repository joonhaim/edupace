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

function deleteSessionLog(id) {
    const logs = readLogs();
    const nextLogs = logs.filter((entry) => entry.id !== id);
    saveLogs(nextLogs);
    return nextLogs;
}

function updateSessionLogMetadata(id, metadata = {}) {
    const logs = readLogs();
    const index = logs.findIndex((entry) => entry.id === id);
    if (index === -1) return null;

    const existingMeta = logs[index].metadata ?? {};
    logs[index].metadata = { ...existingMeta, ...metadata };
    saveLogs(logs);
    return logs[index];
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
        'eventIndex',
        'timestamp',
        'type',
        'details',
        'waveformId',
        'paceLed',
        'senseLed',
        'rate',
        'output',
        'sensitivity',
        'power',
        'locked',
        'alarmLevel',
        'alarmText',
        'controlMode',
        'connection',
        'hardwareConnected',
        'scenarioTitle',
        'sessionId',
        'operator',
        'label',
        'notes',
        'status',
        'startedAt',
        'endedAt',
        'durationSeconds'
    ];

    const rows = (session.events ?? []).map((event, index) => {
        const context = event.context ?? {};
        const alarm = context.alarm ?? {};
        return [
            index + 1,
            event.timestamp,
            event.type,
            JSON.stringify(event.details ?? {}),
            context.waveformId ?? '',
            context.paceLed ?? '',
            context.senseLed ?? '',
            context.rate ?? '',
            context.output ?? '',
            context.sensitivity ?? '',
            context.power ?? '',
            context.locked ?? '',
            alarm.level ?? '',
            alarm.text ?? '',
            context.controlMode ?? session.metadata?.controlMode ?? '',
            context.connection ?? '',
            context.hardwareConnected ?? '',
            session.scenarioTitle,
            session.id,
            session.metadata?.operator ?? '',
            session.metadata?.label ?? '',
            session.metadata?.notes ?? '',
            session.status,
            session.startedAt,
            session.endedAt,
            session.durationSeconds
        ];
    });

    if (!rows.length) {
        rows.push(new Array(headers.length).fill(''));
        rows[0][17] = session.scenarioTitle;
        rows[0][18] = session.id;
        rows[0][19] = session.metadata?.operator ?? '';
        rows[0][20] = session.metadata?.label ?? '';
        rows[0][21] = session.metadata?.notes ?? '';
        rows[0][22] = session.status;
        rows[0][23] = session.startedAt;
        rows[0][24] = session.endedAt;
        rows[0][25] = session.durationSeconds;
    }

    const csv = [headers, ...rows].map((line) => line.map(escapeCsvValue).join(',')).join('\n');
    return csv;
}

export {
    addSessionLog,
    deleteSessionLog,
    getSessionLogById,
    getSessionLogs,
    serializeSessionToCsv,
    updateSessionLogMetadata
};
