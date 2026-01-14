
// -----------------------------------------------------------------------------
// Tunable constants
// -----------------------------------------------------------------------------

// How many seconds of peaks to keep in the window for HR calculation
const HR_MEASUREMENT_WINDOW_SECONDS = 8;

// Minimum allowed time between detected peaks (seconds) to avoid double-counting
// ~0.3 s => max ~200 bpm
const MIN_PEAK_INTERVAL_SECONDS = 0.3;

// Path to the R-wave beep audio asset
const RWAVE_BEEP_SRC = 'assets/audio/r-wave-beep.wav';

// Peak detection threshold relative to max amplitude
const MIN_PEAK_FRACTION = 0.25;

// Absolute minimum peak amplitude (in normalized units) to be considered real
const MIN_PEAK_ABSOLUTE = 0.4;

// Physiologic range for output BPM (clamped)
const MIN_VALID_BPM = 20;
const MAX_VALID_BPM = 220;

// -----------------------------------------------------------------------------
// Heart rate engine
// -----------------------------------------------------------------------------

function createHeartRateEngine(displayElement) {
    const state = {
        peaks: [],              // array of times (seconds) of detected peaks
        lastPeakTime: -Infinity,
        previousMagnitude: null,
        previousSlope: null,
        previousSampleTime: null,
        lastSampleTime: null,

        bpm: null,             // current computed BPM (this window)
        lastValidBpm: null      // last non-null, in-range BPM
    };

    const audioState = {
        muted: false,
        mode: 'on',
        volume: 0.7,
        audioElement: null,
        suspended: false,
        audioContext: null,
        audioBuffer: null,
        loadingPromise: null
    };

    let maxWaveAmplitude = 1;

    // -----------------------------
    // Internal helpers
    // -----------------------------

    function setMaxWaveAmplitude(value) {
        maxWaveAmplitude = Math.max(1, Math.abs(value) || 1);
    }

    function getPeakThreshold() {
        return Math.max(MIN_PEAK_ABSOLUTE, maxWaveAmplitude * MIN_PEAK_FRACTION);
    }

    function clamp(value, min, max) {
        return Math.min(Math.max(value, min), max);
    }

    function getBeepVolume() {
        if (audioState.muted || audioState.mode === 'off' || audioState.suspended) return 0;
        return clamp(audioState.volume, 0, 1);
    }

    function ensureAudioElement() {
        if (audioState.audioElement) return audioState.audioElement;

        const audio = new Audio(RWAVE_BEEP_SRC);
        audio.preload = 'auto';
        audioState.audioElement = audio;
        return audio;
    }

    function ensureAudioContext() {
        if (audioState.audioContext) return audioState.audioContext;

        const Ctor = window.AudioContext || window.webkitAudioContext;
        if (!Ctor) return null;

        audioState.audioContext = new Ctor();
        return audioState.audioContext;
    }

    async function ensureBeepBuffer() {
        if (audioState.audioBuffer) return audioState.audioBuffer;

        if (!audioState.loadingPromise) {
            audioState.loadingPromise = (async () => {
                const context = ensureAudioContext();
                if (!context) return null;

                const response = await fetch(RWAVE_BEEP_SRC);
                const buffer = await response.arrayBuffer();
                return await context.decodeAudioData(buffer);
            })().catch(() => null);
        }

        audioState.audioBuffer = await audioState.loadingPromise;
        return audioState.audioBuffer;
    }

    async function playBeep() {
        const baseVolume = getBeepVolume();
        if (baseVolume <= 0) return;

        const buffer = await ensureBeepBuffer();
        const context = buffer ? ensureAudioContext() : null;

        if (buffer && context) {
            const gainNode = context.createGain();
            gainNode.gain.value = baseVolume;

            const source = context.createBufferSource();
            source.buffer = buffer;
            source.connect(gainNode).connect(context.destination);

            if (context.state === 'suspended') {
                context.resume().catch(() => {});
            }

            source.start();
            return;
        }

        const baseAudio = ensureAudioElement();
        if (!baseAudio) return;

        const player = baseAudio.cloneNode(true);
        player.volume = baseVolume;
        player.play().catch(() => {});
    }

    function updateDisplay() {
        if (!displayElement) return;

        const valueToShow = Number.isFinite(state.bpm)
            ? state.bpm
            : Number.isFinite(state.lastValidBpm)
                ? state.lastValidBpm
                : null;

        displayElement.textContent = Number.isFinite(valueToShow)
            ? valueToShow.toString()
            : '--';
    }

    function reset() {
        // Soft reset: clear recent dynamic state, keep lastValidBpm for continuity
        state.peaks = [];
        state.lastPeakTime = -Infinity;
        state.previousMagnitude = null;
        state.previousSlope = null;
        state.previousSampleTime = null;
        state.lastSampleTime = null;
        state.bpm = null;
        updateDisplay();
    }

    function setBeepMode(mode) {
        if (typeof mode !== 'string') return;

        const normalized = mode === 'off' ? 'off' : 'on';
        audioState.mode = normalized;
    }

    function setBeepMuted(muted) {
        audioState.muted = Boolean(muted);
    }

    function setBeepVolume(volumePercent) {
        const volume = Number(volumePercent);
        if (!Number.isFinite(volume)) return;
        audioState.volume = clamp(volume / 100, 0, 1);
    }

    function setSuspended(suspended) {
        audioState.suspended = Boolean(suspended);
    }

    function purgeOldPeaks(currentTime) {
        const cutoff = currentTime - HR_MEASUREMENT_WINDOW_SECONDS;
        state.peaks = state.peaks.filter((t) => t >= cutoff);

        // If we have truly no peaks within a long time, clear current bpm (but keep lastValidBpm)
        if (state.peaks.length === 0) {
            state.bpm = null;
            updateDisplay();
        }
    }

    function updateFromPeaks() {
        if (state.peaks.length < 2) {
            // Not enough information to compute a new BPM; keep lastValidBpm
            state.bpm = null;
            updateDisplay();
            return;
        }

        // Compute RR intervals
        const intervals = [];
        for (let i = 1; i < state.peaks.length; i++) {
            const delta = state.peaks[i] - state.peaks[i - 1];
            if (delta > 0) {
                intervals.push(delta);
            }
        }

        if (!intervals.length) {
            state.bpm = null;
            updateDisplay();
            return;
        }

        // Basic outlier rejection: keep intervals corresponding roughly to 20–220 bpm
        const filtered = intervals.filter((rr) => {
            const bpm = 60 / rr;
            return bpm >= MIN_VALID_BPM && bpm <= MAX_VALID_BPM;
        });

        const rrList = filtered.length ? filtered : intervals;
        if (!rrList.length) {
            state.bpm = null;
            updateDisplay();
            return;
        }

        // Use median RR for stability
        const sorted = rrList.slice().sort((a, b) => a - b);
        const mid = Math.floor(sorted.length / 2);
        const medianRR =
            sorted.length % 2 === 0
                ? 0.5 * (sorted[mid - 1] + sorted[mid])
                : sorted[mid];

        if (medianRR <= 0) {
            state.bpm = null;
            updateDisplay();
            return;
        }

        let bpm = 60 / medianRR;
        bpm = Math.round(Math.min(Math.max(bpm, MIN_VALID_BPM), MAX_VALID_BPM));

        state.bpm = bpm;
        state.lastValidBpm = bpm;

        updateDisplay();
    }

    function recordPeak(timeSeconds) {
        state.lastPeakTime = timeSeconds;
        state.peaks.push(timeSeconds);
        purgeOldPeaks(timeSeconds);
        playBeep();
        updateFromPeaks();
    }

    // -----------------------------
    // Public-facing sample processing
    // -----------------------------

    function processSample(timeSeconds, value) {
        if (!Number.isFinite(timeSeconds)) return;

        const magnitude = Math.abs(value);
        state.lastSampleTime = timeSeconds;

        if (state.previousMagnitude !== null) {
            const slope = magnitude - state.previousMagnitude;
            const previousSlope = state.previousSlope;

            // Detect a local maximum in |value| that crosses the peak threshold
            if (
                previousSlope !== null &&
                previousSlope > 0 &&
                slope <= 0 &&
                state.previousMagnitude >= getPeakThreshold()
            ) {
                const separated =
                    (timeSeconds - state.lastPeakTime) >= MIN_PEAK_INTERVAL_SECONDS;

                if (separated) {
                    const peakTime = state.previousSampleTime ?? timeSeconds;
                    recordPeak(peakTime);
                }
            }

            state.previousSlope = slope;
        }

        state.previousMagnitude = magnitude;
        state.previousSampleTime = timeSeconds;

        // Periodically clean old peaks
        purgeOldPeaks(timeSeconds);
    }

    // Initial display state
    updateDisplay();

    return {
        processSample,
        reset,
        setMaxWaveAmplitude,
        setBeepMode,
        setBeepMuted,
        setBeepVolume,
        setSuspended
    };
}

export { createHeartRateEngine };
