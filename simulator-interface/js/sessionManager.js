import { addSessionLog } from './sessionStore.js';

const sessionElements = {
    startBtn: document.getElementById('startSessionBtn'),
    pauseBtn: document.getElementById('pauseSessionBtn'),
    endBtn: document.getElementById('endSessionBtn'),
    downloadBtn: document.getElementById('downloadLogBtn'),
    statusText: document.getElementById('sessionStatusText')
};

const sessionState = {
    selectedScenario: null,
    currentSession: null,
    activeLogUrl: null
};

function setStatusText(text) {
    if (!sessionElements.statusText) return;
    sessionElements.statusText.textContent = text;
}

function resetDownloadLink() {
    if (!sessionElements.downloadBtn) return;
    sessionElements.downloadBtn.classList.add('is-hidden');
    sessionElements.downloadBtn.removeAttribute('href');
    sessionElements.downloadBtn.removeAttribute('download');

    if (sessionState.activeLogUrl) {
        URL.revokeObjectURL(sessionState.activeLogUrl);
        sessionState.activeLogUrl = null;
    }
}

function logEvent(type, details = {}) {
    if (!sessionState.currentSession) return;

    const event = {
        timestamp: new Date().toISOString(),
        type,
        details
    };

    sessionState.currentSession.events.push(event);
    window.dispatchEvent(
        new CustomEvent('edupace-session-event', {
            detail: { event, session: sessionState.currentSession }
        })
    );
}

function updateControls() {
    const { startBtn, pauseBtn, endBtn, downloadBtn } = sessionElements;
    const status = sessionState.currentSession?.status ?? 'idle';
    const hasScenario = Boolean(sessionState.selectedScenario);

    if (startBtn) {
        startBtn.disabled = !hasScenario || status === 'running' || status === 'paused';
    }

    if (pauseBtn) {
        pauseBtn.disabled = !(status === 'running' || status === 'paused');
        pauseBtn.textContent = status === 'paused' ? 'Resume' : 'Pause';
    }

    if (endBtn) {
        endBtn.disabled = !(status === 'running' || status === 'paused');
    }

    if (downloadBtn) {
        downloadBtn.classList.toggle('is-hidden', status !== 'ended');
    }
}

function setSelectedScenario(scenario) {
    sessionState.selectedScenario = scenario;

    if (sessionState.currentSession && sessionState.currentSession.status === 'running') {
        logEvent('scenario-updated', {
            scenarioId: scenario?.id,
            scenarioTitle: scenario?.title
        });
    }

    if (!sessionState.currentSession || sessionState.currentSession.status === 'ended') {
        setStatusText(scenario ? 'Ready to start session.' : 'Select a scenario to begin.');
    }

    updateControls();
}

function buildLogPayload() {
    const session = sessionState.currentSession;
    if (!session) return null;

    const startedAt = new Date(session.startedAt).getTime();
    const endedAt = session.endedAt ? new Date(session.endedAt).getTime() : Date.now();
    const durationSeconds = Math.max(0, Math.round((endedAt - startedAt) / 1000));

    return {
        ...session,
        durationSeconds
    };
}

function prepareDownload(payload = null) {
    const payloadToUse = payload ?? buildLogPayload();
    if (!payloadToUse || !sessionElements.downloadBtn) return;

    const blob = new Blob([JSON.stringify(payloadToUse, null, 2)], { type: 'application/json' });
    resetDownloadLink();

    const url = URL.createObjectURL(blob);
    sessionState.activeLogUrl = url;
    sessionElements.downloadBtn.href = url;
    sessionElements.downloadBtn.download = `${payloadToUse.id}-log.json`;
    sessionElements.downloadBtn.classList.remove('is-hidden');
}

function createSession() {
    const now = new Date().toISOString();
    const scenario = sessionState.selectedScenario;

    sessionState.currentSession = {
        id: `session-${Date.now()}`,
        scenarioId: scenario?.id ?? null,
        scenarioTitle: scenario?.title ?? 'Unknown scenario',
        status: 'running',
        startedAt: now,
        endedAt: null,
        events: []
    };

    logEvent('session-started', {
        scenarioId: sessionState.currentSession.scenarioId,
        scenarioTitle: sessionState.currentSession.scenarioTitle
    });
}

function startSession() {
    if (!sessionElements.startBtn || !sessionState.selectedScenario) return;
    if (sessionState.currentSession && ['running', 'paused'].includes(sessionState.currentSession.status)) {
        return;
    }

    resetDownloadLink();
    createSession();
    setStatusText('Session running.');
    updateControls();
}

function pauseSession() {
    if (!sessionState.currentSession || !['running', 'paused'].includes(sessionState.currentSession.status)) {
        return;
    }

    const isPaused = sessionState.currentSession.status === 'paused';
    sessionState.currentSession.status = isPaused ? 'running' : 'paused';
    logEvent(isPaused ? 'session-resumed' : 'session-paused', {
        scenarioId: sessionState.currentSession.scenarioId
    });

    setStatusText(isPaused ? 'Session running.' : 'Session paused.');
    updateControls();
}

function endSession() {
    if (!sessionState.currentSession || !['running', 'paused'].includes(sessionState.currentSession.status)) {
        return;
    }

    sessionState.currentSession.status = 'ended';
    sessionState.currentSession.endedAt = new Date().toISOString();
    logEvent('session-ended', {
        scenarioId: sessionState.currentSession.scenarioId
    });

    const payload = buildLogPayload();
    addSessionLog(payload);

    setStatusText('Session ended. Download log available.');
    prepareDownload(payload);
    updateControls();
}

function wireControls() {
    sessionElements.startBtn?.addEventListener('click', startSession);
    sessionElements.pauseBtn?.addEventListener('click', pauseSession);
    sessionElements.endBtn?.addEventListener('click', endSession);
}

function initSessionManager() {
    if (!sessionElements.startBtn || !sessionElements.pauseBtn || !sessionElements.endBtn) {
        return;
    }

    wireControls();
    updateControls();

    window.addEventListener('edupace-scenario-change', (event) => {
        setSelectedScenario(event.detail ?? null);
    });
}

export { initSessionManager };
