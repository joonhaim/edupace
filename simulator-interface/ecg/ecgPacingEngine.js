import { T, bPolynomial, beatDurationSecForHR, clamp, maxArray, minArray } from "./ecgMath.js";
import { compileWaveform, templatePeakAbsY } from "./ecgWaveforms.js";

const DEFAULT_STRIP_DURATION_SEC = 10;
const MAX_BEATS_PER_STRIP = 40;
const AMP_JITTER = 0.05;
const CAPTURE_THRESHOLD = 1.5; // mA

const COMPLETE_AV_POINTS = {
  start: [[1, 0, 0]],
  pWave: [
    [1, 2.45, 0],
    [2, 2.53, 0.02],
    [1, 2.6, 0.12],
    [1, 2.7, 0.44],
    [2, 2.8, 0.65],
    [3, 2.915, 0.74],
    [2, 3.05, 0.63],
    [1, 3.1, 0.52],
    [1, 3.2, 0.16],
    [1, 3.25, 0.05],
    [2, 3.3, 0.01],
    [1, 3.35, 0],
  ],
  rFirst: [
    [1, 4.4, 0],
    [2, 4.45, 0.05],
    [1, 4.5, 0.15],
    [1, 4.55, 0.8],
    [5, 4.625, 1.2],
    [1, 4.68, 0.8],
    [1, 4.7, 0.4],
    [2, 4.72, 0],
  ],
  rSecond: [
    [2, 4.72, 0],
    [1, 4.75, -1.2],
    [1, 4.8, -2.6],
    [1, 4.85, -3.6],
    [5, 4.95, -4.4],
    [2, 5.05, -4],
    [1, 5.1, -3.8],
    [1, 5.15, -3.6],
    [1, 5.2, -3.2],
    [1, 5.3, -3],
    [2, 5.4, -2.6],
    [1, 5.45, -2.2],
    [1, 5.5, -1.2],
    [1, 5.55, -0.6],
    [1, 5.6, -0.2],
    [1, 5.65, -0.1],
    [2, 5.67, -0.05],
    [1, 5.7, 0],
  ],
  rThird: [
    [1, 5.7, 0],
    [1, 5.75, 0.15],
    [1, 5.8, 0.25],
    [1, 5.85, 0.35],
    [1, 5.9, 0.44],
    [1, 6, 0.58],
    [1, 6.1, 0.77],
    [1, 6.2, 0.95],
    [1, 6.3, 1.15],
    [1, 6.4, 1.34],
    [2, 6.5, 1.58],
    [3, 6.63, 1.8],
    [2, 6.7, 1.75],
    [1, 6.8, 1.6],
    [1, 6.9, 1.3],
    [1, 7, 1],
    [1, 7.1, 0.6],
    [1, 7.2, 0.36],
    [1, 7.3, 0.15],
    [1, 7.35, 0.1],
    [2, 7.4, 0.03],
    [1, 7.45, 0],
  ],
};

let cachedCompleteAvTemplates = null;

export function heartRate(patientHR) {
  if (!Number.isFinite(patientHR) || patientHR <= 0) return 0.2;

  const rr = 60 / patientHR;
  const beatDur = beatDurationSecForHR(patientHR);

  // allow negative -> overlap at high HR
  return rr - beatDur;
}

function jitterAmplitude(value) {
  const jitter = (Math.random() * 2 - 1) * AMP_JITTER;
  return value * (1 + jitter);
}

function getCompleteAvTemplates() {
  if (cachedCompleteAvTemplates) return cachedCompleteAvTemplates;

  const start = compileWaveformSegment(COMPLETE_AV_POINTS.start);
  const pWave = compileWaveformSegment(COMPLETE_AV_POINTS.pWave);
  const rFirst = compileWaveformSegment(COMPLETE_AV_POINTS.rFirst);
  const rSecond = compileWaveformSegment(COMPLETE_AV_POINTS.rSecond);
  const rThird = compileWaveformSegment(COMPLETE_AV_POINTS.rThird);

  const rWave = {
    x: [...rFirst.x, ...rSecond.x, ...rThird.x],
    y: [...rFirst.y, ...rSecond.y, ...rThird.y],
  };

  const pPeakIndex = argMax(pWave.y);
  const rPeakIndex = argMax(rWave.y.map((v) => Math.abs(v)));

  cachedCompleteAvTemplates = { start, pWave, rWave, pPeakIndex, rPeakIndex };
  return cachedCompleteAvTemplates;
}

function compileWaveformSegment(points) {
  return bPolynomial(T, points);
}

function scaleAndShiftWaveform(template, xScale, yScale, offset) {
  return {
    x: template.x.map((v) => v * xScale + offset),
    y: template.y.map((v) => jitterAmplitude(v * yScale)),
  };
}

function scaleWaveform(waveformType, durationSec) {
  const { x, y } = compileWaveform(waveformType);
  const spanX = maxArray(x) - minArray(x) || 1;
  const minX = minArray(x);
  const scale = durationSec / spanX;

  return {
    x: x.map((v) => (v - minX) * scale),
    y: y.map((value) => jitterAmplitude(value)),
  };
}

function cloneWaveform(waveformType) {
  const { x, y } = compileWaveform(waveformType);
  return { x: [...x], y: [...y] };
}

function shiftBeat(beat, offset) {
  return {
    x: beat.x.map((v) => v + offset),
    y: [...beat.y],
  };
}

function argMax(arr) {
  let idx = 0;
  let max = arr[0];
  for (let i = 1; i < arr.length; i++) {
    if (arr[i] > max) {
      max = arr[i];
      idx = i;
    }
  }
  return idx;
}

function argMin(arr) {
  let idx = 0;
  let min = arr[0];
  for (let i = 1; i < arr.length; i++) {
    if (arr[i] < min) {
      min = arr[i];
      idx = i;
    }
  }
  return idx;
}

function buildCompleteAvBlockStrip(maxDurationSec, options = {}) {
  const patientHR = Number.isFinite(options.patientHR) && options.patientHR > 0 ? options.patientHR : 32;
  const rrInterval = 60 / patientHR;
  const ppInterval = Math.max(rrInterval - 0.3 + (Math.random() * 0.04 - 0.02), rrInterval * 0.4);
  const prDistance = 0.5 + (Math.random() * 0.04 - 0.02);

  const templates = getCompleteAvTemplates();

  const x = [];
  const y = [];
  const events = [];

  const xScaleP = 0.0449 * 3;
  const xScaleR = 0.0393 * 2;

  let nextP = 0;
  let nextR = prDistance;

  // optional baseline start segment
  x.push(...templates.start.x);
  y.push(...templates.start.y);

  while (true) {
    const nextEvent = Math.min(nextP, nextR);
    if (!Number.isFinite(nextEvent) || nextEvent > maxDurationSec) break;

    if (nextEvent === nextP) {
      const yScaleP = 0.1477 + (Math.random() * 0.06 - 0.03);
      const pWave = scaleAndShiftWaveform(templates.pWave, xScaleP, yScaleP, nextP - 0.2);
      x.push(...pWave.x);
      y.push(...pWave.y);
      nextP += ppInterval;
    } else {
      const yScaleR = 0.295 + (Math.random() * 0.06 - 0.03);
      const rWave = scaleAndShiftWaveform(templates.rWave, xScaleR, yScaleR, nextR - 0.2);
      x.push(...rWave.x);
      y.push(...rWave.y);

      const peakIndex = templates.rPeakIndex;
      const peakTime = rWave.x[Math.min(Math.max(peakIndex, 0), rWave.x.length - 1)];
      if (Number.isFinite(peakTime)) {
        events.push({ time: peakTime, type: "sense", beatType: "Complete AV block" });
      }

      nextR += rrInterval;
    }
  }

  return { x, y, events };
}

function pickIntrinsicWaveform(scenarioId, mobitzProbConduction) {
  switch ((scenarioId || "").toLowerCase()) {
    case "c3-second-degree-av-block":
      return Math.random() <= mobitzProbConduction
        ? "Normal"
        : "Mobitz type II - no conduction";
    case "c5-slow-conduction":
      return "Slow conduction";
    default:
      return "Normal";
  }
}

function intrinsicInterval(baseInterval, regularity, scenarioId) {
  const jitterScale = regularity === "Irregular" ? 0.15 : 0.05;
  const jitter = (Math.random() * 2 - 1) * baseInterval * jitterScale;

  let interval = baseInterval + jitter;

  if ((scenarioId || "").toLowerCase() === "c4-sick-sinus-syndrome") {
    // occasional long pause
    if (Math.random() < 0.2) {
      interval += baseInterval * 0.8;
    }
  }

  return Math.max(interval, baseInterval * 0.5);
}

function recordEvent(events, beatType, beat, output) {
  if (!beat.x.length || beat.x.length !== beat.y.length) return;

  const time =
    beatType === "Ventricular pacing" || beatType === "Ventricular spike only"
      ? beat.x[argMin(beat.y)]
      : beat.x[argMax(beat.y)];

  if (!Number.isFinite(time)) return;

  if (beatType === "Ventricular pacing" || beatType === "Ventricular spike only") {
    events.push({ time, type: "pace", beatType, captured: output >= CAPTURE_THRESHOLD });
  } else {
    events.push({ time, type: "sense", beatType });
  }
}

export function stitchBeatsNew(
  ecgFunc,
  gap,
  regularity,
  sensitivity,
  rate,
  output,
  asynchronous,
  options = {}
) {
  const scenarioId = options.waveformId || "c0-normal-sinus";
  const maxDurationSec =
    typeof options.durationSec === "number" && options.durationSec > 0
      ? options.durationSec
      : DEFAULT_STRIP_DURATION_SEC;

  if (scenarioId === "c2-third-degree-av-block") {
    return buildCompleteAvBlockStrip(maxDurationSec, { patientHR: options.patientHR });
  }

  const pacemakerEnabled =
    typeof options.pacemakerEnabled === "boolean" ? options.pacemakerEnabled : true;
  const patientHR =
    Number.isFinite(options.patientHR) && options.patientHR > 0 ? options.patientHR : 70;

  const intrinsicBeatDur = beatDurationSecForHR(patientHR);
  const intrinsicRR = Math.max(intrinsicBeatDur + gap, intrinsicBeatDur * 0.6);
  const mobitzProbConduction =
    typeof options.mobitzProbConduction === "number"
      ? clamp(options.mobitzProbConduction, 0, 1)
      : 0.7;

  const escapeInterval = pacemakerEnabled && Number.isFinite(rate) && rate > 0 ? 60 / rate : Infinity;
  const isAsynchronous = Boolean(asynchronous);

  // sensing threshold is simplified to a proportion of the intrinsic peak
  const sensingThreshold = templatePeakAbsY("Normal") * (Math.max(sensitivity, 0) / 10 + 0.1);

  let nextIntrinsic = 0;
  let nextPace = pacemakerEnabled ? (isAsynchronous ? 0 : escapeInterval) : Infinity;

  let timeCursor = 0;
  let beats = 0;
  const x = [];
  const y = [];
  const events = [];

  while (timeCursor < maxDurationSec && beats < MAX_BEATS_PER_STRIP) {
    const nextEventTime = Math.min(nextIntrinsic, nextPace);
    const isPacedEvent = nextEventTime === nextPace && pacemakerEnabled;

    if (!Number.isFinite(nextEventTime) || nextEventTime === Infinity) break;

    const beatDuration = isPacedEvent ? beatDurationSecForHR(rate || patientHR) : intrinsicBeatDur;
    const beatWaveformType = isPacedEvent
      ? output >= CAPTURE_THRESHOLD
        ? "Ventricular pacing"
        : "Ventricular spike only"
      : pickIntrinsicWaveform(scenarioId, mobitzProbConduction);

    const { x: beatX, y: beatY } = scaleWaveform(beatWaveformType, beatDuration);
    const shifted = shiftBeat({ x: beatX, y: beatY }, nextEventTime);

    x.push(...shifted.x);
    y.push(...shifted.y);
    recordEvent(events, beatWaveformType, shifted, output);

    beats += 1;
    timeCursor = nextEventTime;

    if (isPacedEvent) {
      nextPace = nextEventTime + escapeInterval;
      if (!isAsynchronous) {
        nextIntrinsic = Math.max(nextIntrinsic, nextEventTime + intrinsicInterval(intrinsicRR, regularity, scenarioId));
      }
    } else {
      const peak = Math.max(...beatY.map((v) => Math.abs(v)), 0);
      const sensed = peak >= sensingThreshold;
      if (sensed && !isAsynchronous) {
        nextPace = nextEventTime + escapeInterval;
      }
      nextIntrinsic = nextEventTime + intrinsicInterval(intrinsicRR, regularity, scenarioId);
    }
  }

  return { x, y, events };
}

