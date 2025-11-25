const HR_MEASUREMENT_WINDOW_SECONDS = 8;
const MIN_PEAK_INTERVAL_SECONDS = 0.3;
const MIN_PEAK_FRACTION = 0.45;
const MIN_PEAK_ABSOLUTE = 0.5;

function createHeartRateEngine(displayElement) {
    const heartRateState = {
        peaks: [],
        lastPeakTime: -Infinity,
        previousMagnitude: null,
        previousSlope: null,
        previousSampleTime: null,
        bpm: null
    };

    let maxWaveAmplitude = 1;

    function reset() {
        heartRateState.peaks = [];
        heartRateState.lastPeakTime = -Infinity;
        heartRateState.previousMagnitude = null;
        heartRateState.previousSlope = null;
        heartRateState.previousSampleTime = null;
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
    }

    function processSample(timeSeconds, value) {
        const magnitude = Math.abs(value);

        if (heartRateState.previousMagnitude !== null) {
            const slope = magnitude - heartRateState.previousMagnitude;
            const previousSlope = heartRateState.previousSlope;

            if (previousSlope !== null && previousSlope > 0 && slope <= 0 && heartRateState.previousMagnitude >= getPeakThreshold()) {
                const isSeparated =
                    (timeSeconds - heartRateState.lastPeakTime) >= MIN_PEAK_INTERVAL_SECONDS;

                if (isSeparated) {
                    recordPeak(heartRateState.previousSampleTime ?? timeSeconds);
                }
            }

            heartRateState.previousSlope = slope;
        }

        heartRateState.previousMagnitude = magnitude;
        heartRateState.previousSampleTime = timeSeconds;
        purgeOldPeaks(timeSeconds);
    }

    updateDisplay();

    return {
        processSample,
        reset,
        setMaxWaveAmplitude
    };
}

export { createHeartRateEngine };
