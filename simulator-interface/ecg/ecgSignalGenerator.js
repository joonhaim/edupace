// ecg/ecgSignalGenerator.js
//
// Normal sinus + VVI ventricular pacing (start simple).
// Designed to match the interface expected by ecgEngine.js:
//
// signalGenerator.updateParameters(detail)
// signalGenerator.updateScenario(detail)
// signalGenerator.updateRuleEffects(detail)
// signalGenerator.updateWaveformId(id)
// signalGenerator.regenerate(secondsVisible)
// signalGenerator.sample(timeSeconds)
// signalGenerator.getMeta()
// signalGenerator.getState()

import { compileWaveform, templatePeakAbsY } from './ecgWaveforms.js';
import { clamp, beatDurationSecForHR } from './ecgMath.js';

export function createEcgSignalGenerator() {
  // ----------------------------
  // Internal "device + patient" state
  // ----------------------------
  const state = {
    // pacer knobs
    poweredOn: true,
    rate: 70,         // ppm
    output: 5.0,      // mA
    sensitivity: 2.0, // mV (higher = less sensitive)
    asynchronous: false, // VOO-ish if true (always pace at fixed rate)

    // patient / scenario
    intrinsicHr: 75,        // bpm (normal sinus)
    regularity: 'Regular',  // keep simple; can flip to 'Irregular' later

    // capture + refractory (simple)
    captureThreshold: 1.5,  // mA (simple constant for now)
    refractorySec: 0.25     // functional non-capture window (simple)
  };

  // ----------------------------
  // Generated strip (repeating)
  // ----------------------------
  let waveformDuration = 6; // seconds (we may set longer than visible window)
  let beats = [];           // [{ start, end, kind, tArr, yArr, senseTime?, paceTime? }]
  let events = [];          // [{ time, type: 'sense'|'pace' }]
  let maxWaveAmplitude = 1; // abs peak across the strip

  // Cache compiled templates
  const templates = {
    Normal: compileWaveform('Normal'),
    Vpaced: compileWaveform('Ventricular pacing')
  };

  // Target intrinsic/pace amplitudes in mV (so sensitivity guide makes sense)
  // If you want “bigger” ECG, increase these.
  const TARGET_PEAK_MV_NORMAL = 2.5;
  const TARGET_PEAK_MV_VPACED = 2.5;

  function getTemplateScaled(signalType, beatDurationSec, jitter = 0) {
    const tpl = signalType === 'Ventricular pacing' ? templates.Vpaced : templates.Normal;

    const x = tpl.x;
    const y = tpl.y;
    const xMin = x[0];
    const xMax = x[x.length - 1];
    const span = Math.max(1e-6, xMax - xMin);

    // duration scaling
    const dur = Math.max(0.18, beatDurationSec);
    const scaleX = dur / span;

    // amplitude scaling (convert template units -> mV-ish)
    const peakAbs = templatePeakAbsY(signalType);
    const targetPeak = signalType === 'Ventricular pacing'
      ? TARGET_PEAK_MV_VPACED
      : TARGET_PEAK_MV_NORMAL;

    const scaleY = targetPeak / Math.max(1e-6, peakAbs);

    // optional small beat-to-beat jitter (0..)
    const jitterX = 1 + jitter;
    const jitterY = 1 + jitter * 0.6;

    const tArr = new Array(x.length);
    const yArr = new Array(y.length);

    for (let i = 0; i < x.length; i++) {
      tArr[i] = (x[i] - xMin) * scaleX * jitterX; // seconds, relative to beat start
      yArr[i] = y[i] * scaleY * jitterY;          // mV
    }

    return { tArr, yArr };
  }

  function interpFromArrays(tArr, yArr, t) {
    // t within [0, tArr[last]]
    const n = tArr.length;
    if (n === 0) return 0;
    if (t <= tArr[0]) return yArr[0];
    if (t >= tArr[n - 1]) return yArr[n - 1];

    // binary search
    let lo = 0;
    let hi = n - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (tArr[mid] <= t) lo = mid;
      else hi = mid;
    }

    const t0 = tArr[lo], t1 = tArr[hi];
    const y0 = yArr[lo], y1 = yArr[hi];
    const alpha = (t - t0) / Math.max(1e-9, (t1 - t0));
    return y0 + (y1 - y0) * alpha;
  }

  function makeSpikeOnlyBeat() {
    // A tiny pacing spike without capture (simple triangular spike)
    // Keep it narrow so it looks like a stimulus artifact.
    const tArr = [0, 0.004, 0.008, 0.020];
    const yArr = [0, 3.0, 0, 0]; // mV-ish
    return { tArr, yArr, duration: tArr[tArr.length - 1] };
  }

  function computeEventOffset(tArr, yArr, wantMax = true) {
    // Used to locate sense/pace event within the template.
    // Intrinsic: event at max (R peak)
    // Pace: event at max (stim spike) in the paced template
    if (!tArr.length) return 0;
    let idx = 0;
    let best = wantMax ? -Infinity : Infinity;
    for (let i = 0; i < yArr.length; i++) {
      const v = yArr[i];
      if (wantMax) {
        if (v > best) { best = v; idx = i; }
      } else {
        if (v < best) { best = v; idx = i; }
      }
    }
    return tArr[idx] ?? 0;
  }

  function regenerate(secondsVisible = 6) {
    // Build a repeating strip long enough to contain at least a couple cycles
    const intrinsicInterval = 60 / Math.max(1e-6, state.intrinsicHr);
    const escapeInterval = 60 / Math.max(1e-6, state.rate);

    waveformDuration = Math.max(
      secondsVisible,
      2 * Math.max(intrinsicInterval, escapeInterval) + 0.5
    );

    beats = [];
    events = [];
    maxWaveAmplitude = 1;

    // Start simulation at t=0 for the strip
    let t = 0;

    // Next intrinsic depolarization (sinus)
    let nextIntrinsic = 0;

    // VVI timing reference: last sensed or paced OUTPUT time
    let lastSenseOrPace = 0;

    // For simple refractory/capture logic
    let lastDepolarization = -Infinity; // last ventricular depolarization time (intrinsic or captured pace)

    // schedule until we fill strip duration
    while (t < waveformDuration + 1e-6) {
      const escapeDue = lastSenseOrPace + escapeInterval;

      // Decide next "thing" in time (intrinsic vs pace)
      let nextTime;
      let kind;

      if (state.asynchronous) {
        nextTime = escapeDue;
        kind = 'pace';
      } else {
        // synchronous VVI: intrinsic can occur before escape
        if (nextIntrinsic <= escapeDue) {
          nextTime = nextIntrinsic;
          kind = 'intrinsic';
        } else {
          nextTime = escapeDue;
          kind = 'pace';
        }
      }

      // Move timeline
      t = nextTime;

      if (t > waveformDuration) break;

      // Beat duration based on HR (simple)
      const beatDur = beatDurationSecForHR(
        kind === 'intrinsic' ? state.intrinsicHr : state.rate
      );

      // Optional tiny variability later; keep 0 for now
      const jitter = (state.regularity === 'Irregular')
        ? (Math.random() * 0.06 - 0.03)
        : 0;

      if (kind === 'intrinsic') {
        // Create intrinsic sinus beat (Normal waveform)
        const { tArr, yArr } = getTemplateScaled('Normal', beatDur, jitter);

        // Determine if the pacer "senses" it: peak >= sensitivity threshold
        let peak = 0;
        for (let i = 0; i < yArr.length; i++) peak = Math.max(peak, yArr[i]);
        const isSensed = peak >= state.sensitivity;

        const start = t;
        const end = start + tArr[tArr.length - 1];

        beats.push({ start, end, kind: 'intrinsic', tArr, yArr });

        // SENSE event at R peak (max)
        if (isSensed && state.poweredOn) {
          const senseOffset = computeEventOffset(tArr, yArr, true);
          events.push({ time: start + senseOffset, type: 'sense' });
          lastSenseOrPace = start + senseOffset;
        }

        // ECG always shows intrinsic depolarization regardless of sensing
        lastDepolarization = start + computeEventOffset(tArr, yArr, true);

        // Schedule next intrinsic beat
        nextIntrinsic = t + intrinsicInterval;

        // Track amplitude
        for (let i = 0; i < yArr.length; i++) {
          maxWaveAmplitude = Math.max(maxWaveAmplitude, Math.abs(yArr[i]));
        }

      } else {
        // PACER output at time t
        const start = t;

        // Functional non-capture if too close to last depolarization (simple refractory)
        const inRefractory = (start - lastDepolarization) < state.refractorySec;

        const hasEnergy = state.output >= state.captureThreshold;
        const willCapture = state.poweredOn && (state.asynchronous || !inRefractory) && hasEnergy;

        if (willCapture) {
          const { tArr, yArr } = getTemplateScaled('Ventricular pacing', beatDur, jitter);
          const end = start + tArr[tArr.length - 1];
          beats.push({ start, end, kind: 'paced', tArr, yArr });

          // PACE event at stimulus spike (max in paced template)
          const paceOffset = computeEventOffset(tArr, yArr, true);
          events.push({ time: start + paceOffset, type: 'pace' });

          lastSenseOrPace = start + paceOffset;

          // Captured depolarization (use min for wide paced QRS; but for refractory timing we just mark it)
          lastDepolarization = start + computeEventOffset(tArr, yArr, false);

          // When capture happens, assume intrinsic timing resets (simple)
          nextIntrinsic = start + intrinsicInterval;

          for (let i = 0; i < yArr.length; i++) {
            maxWaveAmplitude = Math.max(maxWaveAmplitude, Math.abs(yArr[i]));
          }

        } else {
          // No capture: show stimulus spike only
          const spike = makeSpikeOnlyBeat();
          const tArr = spike.tArr;
          const yArr = spike.yArr;
          const end = start + spike.duration;

          beats.push({ start, end, kind: 'spike', tArr, yArr });

          // Still a PACE output event (device fired)
          events.push({ time: start + tArr[1], type: 'pace' });
          lastSenseOrPace = start + tArr[1];

          for (let i = 0; i < yArr.length; i++) {
            maxWaveAmplitude = Math.max(maxWaveAmplitude, Math.abs(yArr[i]));
          }

          // Intrinsic schedule continues if no capture
          // (do nothing)
        }
      }
    }

    // Safety: ensure meta values are sane
    if (!Number.isFinite(maxWaveAmplitude) || maxWaveAmplitude <= 0) maxWaveAmplitude = 1;
  }

  function sample(timeSeconds) {
    if (!Number.isFinite(timeSeconds) || waveformDuration <= 0) return 0;

    // repeating strip
    let t = timeSeconds % waveformDuration;
    if (t < 0) t += waveformDuration;

    // find beat covering t (linear scan is OK for small #beats; can optimize later)
    // beats are sorted by start time
    for (let i = 0; i < beats.length; i++) {
      const b = beats[i];
      if (t < b.start) break;
      if (t >= b.start && t <= b.end) {
        const rel = t - b.start;
        return interpFromArrays(b.tArr, b.yArr, rel);
      }
    }
    return 0;
  }

  // ----------------------------
  // External API expected by ecgEngine.js
  // ----------------------------
  function updateParameters(detail = {}) {
    // Be permissive about key names coming from UI
    if (typeof detail.poweredOn === 'boolean') state.poweredOn = detail.poweredOn;
    if (typeof detail.asynchronous === 'boolean') state.asynchronous = detail.asynchronous;

    if (Number.isFinite(detail.rate)) state.rate = clamp(detail.rate, 30, 200);
    if (Number.isFinite(detail.ppm)) state.rate = clamp(detail.ppm, 30, 200);

    if (Number.isFinite(detail.output)) state.output = clamp(detail.output, 0.1, 25);
    if (Number.isFinite(detail.outputmA)) state.output = clamp(detail.outputmA, 0.1, 25);

    if (Number.isFinite(detail.sensitivity)) state.sensitivity = clamp(detail.sensitivity, 0.4, 20);
    if (Number.isFinite(detail.sense)) state.sensitivity = clamp(detail.sense, 0.4, 20);
  }

  function updateScenario(detail = {}) {
    // Expecting scenario.vitals.hr and scenario.pacing.poweredOn etc.
    const vitalsHr = detail?.vitals?.hr;
    if (Number.isFinite(vitalsHr) && vitalsHr > 0) {
      state.intrinsicHr = clamp(vitalsHr, 30, 200);
    }

    const pacing = detail?.pacing;
    if (pacing && typeof pacing === 'object') {
      if (typeof pacing.poweredOn === 'boolean') state.poweredOn = pacing.poweredOn;

      // interpret VOO/AOO etc as asynchronous
      const mode = String(pacing.mode || '').toUpperCase();
      if (mode.includes('VOO') || mode.includes('AOO') || mode.includes('OOO')) {
        state.asynchronous = true;
      }
      if (mode.includes('VVI') || mode.includes('AAI')) {
        // default demand mode
        if (typeof pacing.asynchronous !== 'boolean') state.asynchronous = false;
      }
      if (typeof pacing.asynchronous === 'boolean') state.asynchronous = pacing.asynchronous;
    }
  }

  function updateRuleEffects(detail = {}) {
    // placeholder for later: threshold drift, noise, etc.
    // For now: allow rules to override capture threshold if provided.
    if (Number.isFinite(detail.captureThreshold)) {
      state.captureThreshold = Math.max(0.1, detail.captureThreshold);
    }
    if (Number.isFinite(detail.refractorySec)) {
      state.refractorySec = clamp(detail.refractorySec, 0.05, 0.5);
    }
  }

  function updateWaveformId(_id) {
    // Start simple: always normal sinus base.
    // Later you’ll switch waveform families here.
  }

  function getMeta() {
    return {
      waveformDuration,
      waveformEvents: events,
      maxWaveAmplitude
    };
  }

  function getState() {
    return { ...state };
  }

  return {
    updateParameters,
    updateScenario,
    updateRuleEffects,
    updateWaveformId,
    regenerate,
    sample,
    getMeta,
    getState
  };
}
