import { addSessionLog } from './sessionStore.js';

const sessionElements = {
    startBtn: document.getElementById('startSessionBtn'),
    endBtn: document.getElementById('endSessionBtn'),
    statusText: document.getElementById('sessionStatusText'),
    statusLabel: document.getElementById('sessionStatusLabel'),
    timerDisplay: document.getElementById('sessionTimerDisplay'),
    startLabel: document.querySelector('#startSessionBtn .btn-label'),
    startIcon: document.querySelector('#startSessionBtn .btn-icon'),
    controlModeRadios: document.querySelectorAll('input[name="inputMode"]')
};

const sessionState = {
    selectedScenario: null,
    currentSession: null,
    timing: {
        startedAtMs: null,
        pausedMs: 0,
        pausedSince: null,
        timerInterval: null
    }
};

const telemetryContext = {
    waveformId: null,
    paceLed: false,
    senseLed: false,
    rate: null,
    output: null,
    sensitivity: null,
    power: null,
    locked: null,
    alarm: { level: 'normal', text: null },
    controlMode: 'hardware',
    connection: 'disconnected',
    hardwareConnected: false,
    lastLed: null
};

function setStatusText(text) {
    if (sessionElements.statusLabel) {
        sessionElements.statusLabel.textContent = text;
    } else if (sessionElements.statusText) {
        sessionElements.statusText.textContent = text;
    }
}

function getContextSnapshot() {
    return {
        ...telemetryContext,
        alarm: { ...telemetryContext.alarm },
        lastLed: telemetryContext.lastLed ? { ...telemetryContext.lastLed } : null
    };
}

function logEvent(type, details = {}) {
    if (!sessionState.currentSession) return;

    const event = {
        timestamp: new Date().toISOString(),
        type,
        details,
        context: getContextSnapshot()
    };

    sessionState.currentSession.events.push(event);
    sessionState.currentSession.lastContext = event.context;
    window.dispatchEvent(
        new CustomEvent('edupace-session-event', {
            detail: { event, session: sessionState.currentSession }
        })
    );
}

function updateControls() {
    const { startBtn, endBtn } = sessionElements;
    const status = sessionState.currentSession?.status ?? 'idle';
    const hasScenario = Boolean(sessionState.selectedScenario);

    if (startBtn) {
        const label = sessionElements.startLabel;
        const icon = sessionElements.startIcon;
        const isRunning = status === 'running';
        const isPaused = status === 'paused';

        startBtn.disabled = !hasScenario;

        if (label) {
            if (isRunning) label.textContent = 'Pause';
            else if (isPaused) label.textContent = 'Resume';
            else label.textContent = 'Start';
        }

        if (icon) {
            if (isRunning) icon.textContent = '⏸';
            else icon.textContent = '▶';
        }
    }

    if (endBtn) {
        endBtn.disabled = !(status === 'running' || status === 'paused');
    }
}

function getControlMode() {
    const checked = Array.from(sessionElements.controlModeRadios ?? []).find((radio) => radio.checked);
    return checked?.value ?? 'hardware';
}

function updateTelemetryContext(patch = {}) {
    const { alarm, lastLed, ...rest } = patch;
    if (alarm) {
        telemetryContext.alarm = { ...telemetryContext.alarm, ...alarm };
    }
    if (lastLed) {
        telemetryContext.lastLed = { ...lastLed };
    }

    Object.assign(telemetryContext, rest);
}

function formatTimer(ms) {
    const totalSeconds = Math.max(0, Math.floor(ms / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    const hours = Math.floor(minutes / 60);
    const mm = String(minutes % 60).padStart(2, '0');
    const ss = String(seconds).padStart(2, '0');
    return hours ? `${String(hours).padStart(2, '0')}:${mm}:${ss}` : `${mm}:${ss}`;
}

function getElapsedMs() {
    const { startedAtMs, pausedMs, pausedSince } = sessionState.timing;
    if (!startedAtMs) return 0;

    if (sessionState.currentSession?.status === 'ended' && Number.isFinite(sessionState.currentSession.durationSeconds)) {
        return sessionState.currentSession.durationSeconds * 1000;
    }

    const now = Date.now();
    const pausedTotal = pausedMs + (pausedSince ? Math.max(0, now - pausedSince) : 0);
    return Math.max(0, now - startedAtMs - pausedTotal);
}

function updateTimerDisplay() {
    if (!sessionElements.timerDisplay) return;
    const elapsed = getElapsedMs();
    const hasSession = Boolean(sessionState.currentSession);
    sessionElements.timerDisplay.textContent = hasSession ? formatTimer(elapsed) : '';
    sessionElements.timerDisplay.classList.toggle('is-active', hasSession);
    sessionElements.timerDisplay.toggleAttribute('hidden', !hasSession);
}

function startTimer() {
    stopTimer();
    sessionState.timing.timerInterval = window.setInterval(updateTimerDisplay, 1000);
    updateTimerDisplay();
}

function stopTimer() {
    if (sessionState.timing.timerInterval) {
        clearInterval(sessionState.timing.timerInterval);
        sessionState.timing.timerInterval = null;
    }
}

function setSelectedScenario(scenario) {
    sessionState.selectedScenario = scenario;
    if (scenario?.waveformId) {
        updateTelemetryContext({ waveformId: scenario.waveformId });
    }
    if (typeof scenario?.pacing?.poweredOn === 'boolean') {
        updateTelemetryContext({ power: scenario.pacing.poweredOn });
    }

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

function handleParametersEvent(event) {
    const detail = event.detail ?? {};
    const changes = {};
    const mappings = {
        lock: 'locked'
    };

    ['rate', 'output', 'sensitivity', 'power', 'locked', 'lock'].forEach((key) => {
        if (detail[key] === undefined || detail[key] === null) return;
        const targetKey = mappings[key] ?? key;
        if (telemetryContext[targetKey] !== detail[key]) {
            changes[targetKey] = detail[key];
        }
    });

    if (Object.keys(changes).length) {
        updateTelemetryContext(changes);
        if (sessionState.currentSession) {
            logEvent('parameters-updated', {
                changes,
                controlMode: telemetryContext.controlMode
            });
        }
    }
}

function handleWaveformEvent(event) {
    const waveformId = event.detail?.waveformId ?? null;
    if (!waveformId || telemetryContext.waveformId === waveformId) return;

    updateTelemetryContext({ waveformId });
    if (sessionState.currentSession) {
        logEvent('waveform-changed', { waveformId });
    }
}

function handleAlarmUpdate(event) {
    const alarm = event.detail ?? {};
    updateTelemetryContext({ alarm });
    if (sessionState.currentSession) {
        logEvent('alarm-update', alarm);
    }
}

function handleConnectionChange(event) {
    const { status, connected, unsupported } = event.detail ?? {};
    const hardwareOnline = Boolean(connected) && status !== 'VIRTUAL' && !unsupported;
    updateTelemetryContext({
        connection: status ?? telemetryContext.connection,
        hardwareConnected: hardwareOnline
    });

    if (sessionState.currentSession) {
        logEvent('connection-update', { status, connected, unsupported });
    }
}

function handleControlModeChange(mode) {
    const controlMode = mode || getControlMode();
    if (telemetryContext.controlMode === controlMode) return;
    updateTelemetryContext({ controlMode });
    if (sessionState.currentSession?.metadata) {
        sessionState.currentSession.metadata.controlMode = controlMode;
    }
    if (sessionState.currentSession) {
        logEvent('control-mode-changed', { mode: controlMode });
    }
}

function handleLedFlash(event) {
    const { kind, source, at } = event.detail ?? {};
    if (!kind) return;
    updateTelemetryContext({
        lastLed: { kind, source, at },
        paceLed: kind === 'pace' || telemetryContext.paceLed,
        senseLed: kind === 'sense' || telemetryContext.senseLed
    });
    if (sessionState.currentSession) {
        logEvent('led-activity', { kind, source, at });
    }
}

function handleTelemetryPause(event) {
    const paused = Boolean(event.detail?.paused);
    if (!sessionState.currentSession) return;

    const status = sessionState.currentSession.status;
    if (paused && status === 'running') {
        pauseSession();
    } else if (!paused && status === 'paused') {
        pauseSession();
    }
}

function buildLogPayload() {
    const session = sessionState.currentSession;
    if (!session) return null;

    const elapsedMs =
        session.status === 'ended' && Number.isFinite(session.durationSeconds)
            ? session.durationSeconds * 1000
            : getElapsedMs();
    const durationSeconds = Math.max(0, Math.round(elapsedMs / 1000));

    return {
        ...session,
        durationSeconds,
        lastContext: session.lastContext ?? getContextSnapshot()
    };
}

function createSession() {
    const now = new Date();
    const scenario = sessionState.selectedScenario;

    sessionState.timing.startedAtMs = now.getTime();
    sessionState.timing.pausedMs = 0;
    sessionState.timing.pausedSince = null;
    updateTelemetryContext({ controlMode: getControlMode() });

    sessionState.currentSession = {
        id: `session-${Date.now()}`,
        scenarioId: scenario?.id ?? null,
        scenarioTitle: scenario?.title ?? 'Unknown scenario',
        status: 'running',
        startedAt: now.toISOString(),
        endedAt: null,
        events: [],
        metadata: {
            operator: '',
            notes: '',
            label: '',
            controlMode: telemetryContext.controlMode
        },
        lastContext: getContextSnapshot()
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

    createSession();
    startTimer();
    setStatusText('Session running.');
    updateControls();
}

function pauseSession() {
    if (!sessionState.currentSession || !['running', 'paused'].includes(sessionState.currentSession.status)) {
        return;
    }

    const isPaused = sessionState.currentSession.status === 'paused';
    sessionState.currentSession.status = isPaused ? 'running' : 'paused';
    if (!isPaused) {
        sessionState.timing.pausedSince = Date.now();
        stopTimer();
    } else {
        if (sessionState.timing.pausedSince) {
            sessionState.timing.pausedMs += Math.max(0, Date.now() - sessionState.timing.pausedSince);
            sessionState.timing.pausedSince = null;
        }
        startTimer();
    }
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

    if (sessionState.currentSession.status === 'paused' && sessionState.timing.pausedSince) {
        sessionState.timing.pausedMs += Math.max(0, Date.now() - sessionState.timing.pausedSince);
        sessionState.timing.pausedSince = null;
    }

    sessionState.currentSession.status = 'ended';
    sessionState.currentSession.endedAt = new Date().toISOString();
    sessionState.currentSession.lastContext = getContextSnapshot();
    stopTimer();
    updateTimerDisplay();
    sessionState.currentSession.durationSeconds = Math.max(0, Math.round(getElapsedMs() / 1000));
    logEvent('session-ended', {
        scenarioId: sessionState.currentSession.scenarioId
    });

    const payload = buildLogPayload();
    addSessionLog(payload);

    setStatusText('Session ended. View the log in the Logs tab.');
    updateControls();
}

function wireControls() {
    sessionElements.startBtn?.addEventListener('click', () => {
        const status = sessionState.currentSession?.status;
        if (!status || status === 'ended') {
            startSession();
        } else {
            pauseSession();
        }
    });
    sessionElements.endBtn?.addEventListener('click', endSession);
}

function initSessionManager() {
    if (!sessionElements.startBtn || !sessionElements.endBtn) {
        return;
    }

    wireControls();
    updateControls();
    updateTelemetryContext({ controlMode: getControlMode() });
    updateTimerDisplay();

    window.addEventListener('edupace-scenario-change', (event) => {
        setSelectedScenario(event.detail ?? null);
    });

    window.addEventListener('edupace-parameters', handleParametersEvent);
    window.addEventListener('edupace-waveform-change', handleWaveformEvent);
    window.addEventListener('edupace-alarm', handleAlarmUpdate);
    window.addEventListener('edupace-connection', handleConnectionChange);
    window.addEventListener('edupace-led-flash', handleLedFlash);
    window.addEventListener('edupace-telemetry-pause', handleTelemetryPause);

    Array.from(sessionElements.controlModeRadios ?? []).forEach((radio) => {
        radio.addEventListener('change', () => handleControlModeChange(radio.value));
    });
}

export { initSessionManager };
