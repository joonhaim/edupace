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

