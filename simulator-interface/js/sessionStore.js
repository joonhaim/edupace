const STORAGE_KEY = 'edupace-session-logs';
const LOG_PATH_KEY = 'edupace-log-path';

let logCache = [];
let storagePath = null;
let initPromise = null;

function dispatchLogChange() {
    window.dispatchEvent(
        new CustomEvent('edupace:session-logs-changed', {
            detail: { logs: [...logCache], path: storagePath }
        })
    );
}

function readLocalBackup() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        return raw ? JSON.parse(raw) : [];
    } catch (error) {
        console.error('Unable to read session logs', error);
        return [];
    }
}

function saveLocalBackup(logs) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(logs));
    } catch (error) {
        console.error('Unable to save session logs', error);
    }
}

function loadStoredPath() {
    try {
        return localStorage.getItem(LOG_PATH_KEY);
    } catch (error) {
        console.warn('Unable to read log path', error);
        return null;
    }
}

function persistPath(path) {
    try {
        if (path) {
            localStorage.setItem(LOG_PATH_KEY, path);
        }
    } catch (error) {
        console.warn('Unable to persist log path', error);
    }
}

async function resolveLogDirectory(preferredPath) {
    if (window.edupace?.logs?.getDefaultPath) {
        try {
            const path = await window.edupace.logs.getDefaultPath(preferredPath ?? storagePath ?? loadStoredPath());
            storagePath = path;
            persistPath(path);
            return path;
        } catch (error) {
            console.warn('Unable to resolve log directory', error);
        }
    }
    return preferredPath ?? storagePath ?? loadStoredPath();
}

async function readFromDisk(preferredPath) {
    if (!window.edupace?.logs?.readFromDisk) return null;
    try {
        const data = await window.edupace.logs.readFromDisk(preferredPath ?? storagePath);
        storagePath = data?.path ?? storagePath;
        if (data?.path) persistPath(data.path);
        return Array.isArray(data?.logs) ? data.logs : [];
    } catch (error) {
        console.warn('Unable to read logs from disk', error);
        return null;
    }
}

async function writeToDisk(logs = logCache, preferredPath = storagePath) {
    if (!window.edupace?.logs?.writeToDisk) return null;
    try {
        const result = await window.edupace.logs.writeToDisk(logs, preferredPath);
        if (result?.path) {
            storagePath = result.path;
            persistPath(result.path);
        }
        return result?.path ?? preferredPath;
    } catch (error) {
        console.warn('Unable to write logs to disk', error);
        return null;
    }
}

async function syncFromDisk() {
    const diskLogs = await readFromDisk();
    if (!diskLogs) return logCache;

    logCache = Array.isArray(diskLogs) ? diskLogs : [];
    saveLocalBackup(logCache);
    dispatchLogChange();
    return logCache;
}

async function initSessionStore() {
    if (initPromise) return initPromise;

    initPromise = (async () => {
        logCache = readLocalBackup();
        storagePath = storagePath ?? loadStoredPath();
        await resolveLogDirectory(storagePath);
        await syncFromDisk();
        await writeToDisk(logCache);
        dispatchLogChange();
    })();

    return initPromise;
}

function getSessionLogs() {
    return [...logCache];
}

function getSessionLogById(id) {
    return logCache.find((entry) => entry.id === id) ?? null;
}

function addSessionLog(log) {
    if (!log?.id) return;

    const existingIndex = logCache.findIndex((entry) => entry.id === log.id);

    if (existingIndex >= 0) {
        logCache[existingIndex] = log;
    } else {
        logCache.unshift(log);
    }

    saveLocalBackup(logCache);
    const persistPromise = writeToDisk(logCache);
    dispatchLogChange();
    return persistPromise;
}

function deleteSessionLog(id) {
    const nextLogs = logCache.filter((entry) => entry.id !== id);
    logCache = nextLogs;
    saveLocalBackup(logCache);
    const persistPromise = writeToDisk(logCache);
    dispatchLogChange();
    return persistPromise ?? nextLogs;
}

function updateSessionLogMetadata(id, metadata = {}) {
    const index = logCache.findIndex((entry) => entry.id === id);
    if (index === -1) return null;

    const existingMeta = logCache[index].metadata ?? {};
    logCache[index].metadata = { ...existingMeta, ...metadata };
    saveLocalBackup(logCache);
    const persistPromise = writeToDisk(logCache);
    dispatchLogChange();
    return persistPromise ?? logCache[index];
}

function getLogStoragePath() {
    return storagePath ?? loadStoredPath() ?? null;
}

async function chooseLogStoragePath() {
    if (!window.edupace?.logs?.pickDirectory) return null;
    try {
        const chosenPath = await window.edupace.logs.pickDirectory();
        if (chosenPath) {
            storagePath = chosenPath;
            persistPath(chosenPath);
            await writeToDisk(logCache, chosenPath);
            dispatchLogChange();
        }
        return chosenPath;
    } catch (error) {
        console.warn('Unable to select log directory', error);
        return null;
    }
}

async function openLogStoragePath() {
    if (!window.edupace?.logs?.openDirectory) return null;
    try {
        const path = await window.edupace.logs.openDirectory(storagePath);
        return path;
    } catch (error) {
        console.warn('Unable to open log directory', error);
        return null;
    }
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
    chooseLogStoragePath,
    deleteSessionLog,
    getSessionLogById,
    getSessionLogs,
    getLogStoragePath,
    initSessionStore,
    openLogStoragePath,
    serializeSessionToCsv,
    syncFromDisk,
    updateSessionLogMetadata
};
