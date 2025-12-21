import { beatDurationSecForHR, clamp, maxArray, minArray } from "./ecgMath.js";
import { compileWaveform, templatePeakAbsY } from "./ecgWaveforms.js";

const DEFAULT_STRIP_DURATION_SEC = 10;
const MAX_BEATS_PER_STRIP = 40;
const AMP_JITTER = 0.05;
const CAPTURE_THRESHOLD = 1.5; // mA

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
    const { x, y } = buildCompleteAvBlockStrip(maxDurationSec);
    const events = detectCompleteBlockEvents(x, y);
    return { x, y, events };
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

// -----------------------------------------------------------------------------
// Specialised strips (complete heart block)
// -----------------------------------------------------------------------------

function mergeTraces(x, y, xTemp, yTemp) {
  return { x: x.concat(xTemp), y: y.concat(yTemp) };
}

function completeAvBlock(iterations = 5) {
  const PP_interval = 4 + Math.random();
  const RR_interval = 5 + Math.random();

  const start = [[1, 0, 0]];
  const points_P = [
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
  ];

  const points_R_first = [
    [1, 4.4, 0],
    [2, 4.45, 0.05],
    [1, 4.5, 0.15],
    [1, 4.55, 0.8],
    [5, 4.625, 1.2],
    [1, 4.68, 0.8],
    [1, 4.7, 0.4],
    [2, 4.72, 0],
  ];

  const points_R_second = [
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
  ];

  const points_R_third = [
    [1, 5.7, 0],
    [1, 5.75, 0.15],
    [1, 5.8, 0.25],
    [1, 5.85, 0.9],
    [5, 5.925, 1.3],
    [1, 5.98, 0.9],
    [1, 6, 0.45],
    [2, 6.02, 0.1],
  ];

  const end = [
    [2, 6.02, 0.1],
    [1, 6.06, 0],
    [1, 6.2, 0],
    [1, 6.4, 0],
  ];

  const P1 = cloneWaveform("Normal");
  const P2 = cloneWaveform("Normal");
  const P3 = cloneWaveform("Normal");
  const R1 = cloneWaveform("Normal");
  const R2 = cloneWaveform("Normal");
  const R3 = cloneWaveform("Normal");
  const END = cloneWaveform("Normal");

  P1.x = P1.x.map((v) => v * PP_interval + start[0][1]);
  P1.y = P1.y.map((v) => v * 0.15);
  P2.x = P2.x.map((v) => v * PP_interval + start[0][1] + PP_interval);
  P2.y = P2.y.map((v) => v * 0.15);
  P3.x = P3.x.map((v) => v * PP_interval + start[0][1] + PP_interval * 2);
  P3.y = P3.y.map((v) => v * 0.15);

  R1.x = R1.x.map((v) => v * (RR_interval / 2) + points_R_first[0][1]);
  R1.y = R1.y.map((v) => v * 0.25);
  R2.x = R2.x.map((v) => v * (RR_interval / 2) + points_R_second[0][1]);
  R2.y = R2.y.map((v) => v * 0.25);
  R3.x = R3.x.map((v) => v * (RR_interval / 2) + points_R_third[0][1]);
  R3.y = R3.y.map((v) => v * 0.25);
  END.x = END.x.map((v) => v * (RR_interval / 2) + end[0][1]);
  END.y = END.y.map((v) => v * 0.25);

  let temp = { x: [], y: [] };
  let tempP = { x: [], y: [] };
  for (let i = 0; i < iterations; i++) {
    tempP = mergeTraces(tempP.x, tempP.y, P1.x, P1.y);
    tempP = mergeTraces(tempP.x, tempP.y, P2.x, P2.y);
    tempP = mergeTraces(tempP.x, tempP.y, P3.x, P3.y);
  }
  temp = mergeTraces(temp.x, temp.y, tempP.x, tempP.y);

  let tempR = { x: [], y: [] };
  for (let i = 0; i < iterations; i++) {
    tempR = mergeTraces(tempR.x, tempR.y, R1.x, R1.y);
    tempR = mergeTraces(tempR.x, tempR.y, R2.x, R2.y);
    tempR = mergeTraces(tempR.x, tempR.y, R3.x, R3.y);
  }
  temp = mergeTraces(temp.x, temp.y, tempR.x, tempR.y);

  temp = mergeTraces(temp.x, temp.y, END.x, END.y);
  return temp;
}

function buildCompleteAvBlockStrip(durationSec) {
  const base = completeAvBlock(6);
  const spanX = maxArray(base.x) - minArray(base.x) || 1;
  const scaleToDuration = durationSec > 0 ? durationSec / spanX : 1;
  return { x: base.x.map((v) => v * scaleToDuration), y: base.y };
}

function detectCompleteBlockEvents(x, y) {
  if (!Array.isArray(x) || !Array.isArray(y) || x.length !== y.length) return [];

  const maxAmplitude = Math.max(...y.map((v) => Math.abs(v)), 0);
  const threshold = maxAmplitude * 0.6;
  const events = [];

  for (let i = 1; i < y.length - 1; i++) {
    const peak = y[i];
    if (peak > threshold && peak >= y[i - 1] && peak >= y[i + 1] && Number.isFinite(x[i])) {
      events.push({ time: x[i], type: "sense", beatType: "CompleteHeartBlock" });
    }
  }
  return events;
}
