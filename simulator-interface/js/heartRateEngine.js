const HR_MEASUREMENT_WINDOW_SECONDS = 8;
const MIN_PEAK_INTERVAL_SECONDS = 0.3;
const MIN_PEAK_FRACTION = 0.45;
const MIN_PEAK_ABSOLUTE = 0.5;
const MIN_PEAK_WIDTH_SECONDS = 0.02;

function createHeartRateEngine(displayElement) {
    const heartRateState = {
        peaks: [],
        lastPeakTime: -Infinity,
        previousMagnitude: null,
        previousSlope: null,
        previousSampleTime: null,
        aboveThresholdStart: null,
        bpm: null
    };

    const audioState = {
        context: null,
        enabled: true
    };

    let maxWaveAmplitude = 1;

    function reset() {
        heartRateState.peaks = [];
        heartRateState.lastPeakTime = -Infinity;
        heartRateState.previousMagnitude = null;
        heartRateState.previousSlope = null;
        heartRateState.previousSampleTime = null;
        heartRateState.aboveThresholdStart = null;
        heartRateState.bpm = null;
        updateDisplay();
    }

    function setMaxWaveAmplitude(value) {
        maxWaveAmplitude = Math.max(1, Math.abs(value) || 1);
    }

    function updateDisplay() {
        if (!displayElement) return;

        const text = Number.isFinite(heartRateState.bpm)
            ? heartRateState.bpm.toString()
            : '--';
        displayElement.textContent = text;
    }

    function getPeakThreshold() {
        return Math.max(MIN_PEAK_ABSOLUTE, maxWaveAmplitude * MIN_PEAK_FRACTION);
    }

    function purgeOldPeaks(currentTime) {
        const cutoff = currentTime - HR_MEASUREMENT_WINDOW_SECONDS;
        heartRateState.peaks = heartRateState.peaks.filter((peakTime) => peakTime >= cutoff);

        if (heartRateState.peaks.length < 2) {
            heartRateState.bpm = null;
            updateDisplay();
        }
    }

    function updateFromPeaks() {
        if (heartRateState.peaks.length < 2) {
            heartRateState.bpm = null;
            updateDisplay();
            return;
        }

        const intervals = [];
        for (let i = 1; i < heartRateState.peaks.length; i++) {
            const delta = heartRateState.peaks[i] - heartRateState.peaks[i - 1];
            if (delta > 0) intervals.push(delta);
        }

        if (!intervals.length) {
            heartRateState.bpm = null;
            updateDisplay();
            return;
        }

        const total = intervals.reduce((acc, value) => acc + value, 0);
        const averageIntervalSeconds = total / intervals.length;
        heartRateState.bpm = Math.round(60 / averageIntervalSeconds);
        updateDisplay();
    }

    function recordPeak(timeSeconds) {
        heartRateState.lastPeakTime = timeSeconds;
        heartRateState.peaks.push(timeSeconds);
        purgeOldPeaks(timeSeconds);
        updateFromPeaks();
        playBeep();
    }

    function processSample(timeSeconds, value) {
        const magnitude = Math.abs(value);
        const threshold = getPeakThreshold();

        if (magnitude >= threshold && heartRateState.aboveThresholdStart === null) {
            heartRateState.aboveThresholdStart = heartRateState.previousSampleTime ?? timeSeconds;
        } else if (magnitude < threshold && heartRateState.previousMagnitude !== null && heartRateState.previousMagnitude >= threshold) {
            heartRateState.aboveThresholdStart = null;
        } else if (magnitude < threshold && heartRateState.previousMagnitude !== null && heartRateState.previousMagnitude < threshold) {
            heartRateState.aboveThresholdStart = null;
        }

        if (heartRateState.previousMagnitude !== null) {
            const slope = magnitude - heartRateState.previousMagnitude;
            const previousSlope = heartRateState.previousSlope;

            if (previousSlope !== null && previousSlope > 0 && slope <= 0 && heartRateState.previousMagnitude >= threshold) {
                const isSeparated =
                    (timeSeconds - heartRateState.lastPeakTime) >= MIN_PEAK_INTERVAL_SECONDS;

                const peakStart = heartRateState.aboveThresholdStart ?? heartRateState.previousSampleTime ?? timeSeconds;
                const peakWidth = Math.max(0, (heartRateState.previousSampleTime ?? timeSeconds) - peakStart);
                const isWideEnough = peakWidth >= MIN_PEAK_WIDTH_SECONDS;

                if (isSeparated && isWideEnough) {
                    recordPeak(heartRateState.previousSampleTime ?? timeSeconds);
                }
            }

            heartRateState.previousSlope = slope;
        }

        heartRateState.previousMagnitude = magnitude;
        heartRateState.previousSampleTime = timeSeconds;
        purgeOldPeaks(timeSeconds);
    }

    function ensureAudioContext() {
        if (audioState.context) {
            if (audioState.enabled && audioState.context.state === 'suspended') {
                audioState.context.resume();
            }
            return audioState.context;
        }

        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!AudioContext) return null;

        const context = new AudioContext();
        audioState.context = context;
        return context;
    }

    function playBeep() {
        if (!audioState.enabled) return;

        const context = ensureAudioContext();
        if (!context) return;

        const oscillator = context.createOscillator();
        const gainNode = context.createGain();
        const now = context.currentTime;
        const duration = 0.05;

        oscillator.type = 'square';
        oscillator.frequency.value = 1000;

        gainNode.gain.setValueAtTime(0.0001, now);
        gainNode.gain.exponentialRampToValueAtTime(0.25, now + 0.005);
        gainNode.gain.exponentialRampToValueAtTime(0.0001, now + duration);

        oscillator.connect(gainNode);
        gainNode.connect(context.destination);

        oscillator.start(now);
        oscillator.stop(now + duration);
    }

    function setBeepEnabled(enabled) {
        audioState.enabled = Boolean(enabled);

        if (!audioState.enabled && audioState.context?.state !== 'closed') {
            audioState.context.suspend();
        } else if (audioState.enabled) {
            ensureAudioContext();
        }
    }

    function isBeepEnabled() {
        return audioState.enabled;
    }

    updateDisplay();

    return {
        processSample,
        reset,
        setMaxWaveAmplitude,
        setBeepEnabled,
        isBeepEnabled
    };
}

export { createHeartRateEngine };
