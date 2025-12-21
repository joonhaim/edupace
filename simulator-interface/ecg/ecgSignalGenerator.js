// ecg/ecgSignalGenerator.js
//
// Streaming ECG generator (beat-by-beat, on the go).
// Goal: keep the waveform SHAPES exactly as your templates (no extra reshaping,
// no extra random y-scaling). We only time-scale in X to hit ~0.8 s template
// duration (as in the python stitch logic), and we place beats using the SAME
// control-flow rules you pasted for:
//   - Mobitz II
//   - Slow conduction
//   - 3rd degree AV block (complete AV block pacing decision logic)
//
// IMPORTANT:
// - We do NOT create any new waveforms.
// - We ONLY use existing templates from ecgWaveforms.js:
//     "Normal", "Ventricular pacing", "Mobitz type II - no conduction", "Slow conduction"
// - For AV block ventricular escape (if you do not have a dedicated waveform),
//   we re-use your "Normal" template but slice away the early atrial portion
//   (no new points, just a subset of existing points).

import { compileWaveform } from "./ecgWaveforms.js";

const CAPTURE_THRESHOLD_MA = 1.5;

// Keep the engine effectively "non-looping" for practical usage.
const WAVEFORM_DURATION_SEC = Number.POSITIVE_INFINITY;

// How far ahead we generate beats beyond the latest requested sample time.
const LOOKAHEAD_SEC = 12;

// Prevent runaway generation if something goes wrong.
const MAX_SEGMENTS_PER_ENSURE = 500;

// Keep memory bounded: keep only last N seconds of segments/events.
const KEEP_SEC = 90;

// ------------------------- small utils --------------------------------------

function clamp(v, min, max) {
  return Math.min(Math.max(v, min), max);
}
function maxOf(arr) {
  let m = -Infinity;
  for (let i = 0; i < arr.length; i++) m = Math.max(m, arr[i]);
  return m;
}
function minOf(arr) {
  let m = Infinity;
  for (let i = 0; i < arr.length; i++) m = Math.min(m, arr[i]);
  return m;
}
function maxY(arr) {
  let m = -Infinity;
  for (let i = 0; i < arr.length; i++) m = Math.max(m, arr[i]);
  return m;
}
function peakAbs(arr) {
  let p = 0;
  for (let i = 0; i < arr.length; i++) p = Math.max(p, Math.abs(arr[i]));
  return p || 1;
}
function linearInterp(x0, y0, x1, y1, x) {
  if (x1 === x0) return y0;
  const t = (x - x0) / (x1 - x0);
  return y0 + (y1 - y0) * t;
}
function samplePiecewiseLinear(times, values, t) {
  const n = times.length;
  if (!n) return 0;

  if (t <= times[0]) return values[0];
  if (t >= times[n - 1]) return values[n - 1];

  // binary search
  let lo = 0;
  let hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (times[mid] <= t) lo = mid;
    else hi = mid;
  }
  return linearInterp(times[lo], values[lo], times[hi], values[hi], t);
}

// ------------------------- templates ----------------------------------------

// Safer wrapper: if waveform doesn't exist in ecgWaveforms.js, return null.
function tryCompile(signalType) {
  try {
    return compileWaveform(signalType);
  } catch (_e) {
    return null;
  }
}

// Build template with optional x slicing (subset only; no new points).
function buildTemplate(signalType, { sliceFromX = -Infinity, sliceToX = Infinity } = {}) {
  const raw = tryCompile(signalType);
  if (!raw) return null;

  const x = raw.x;
  const y = raw.y;

  const sx = [];
  const sy = [];
  for (let i = 0; i < x.length; i++) {
    const xi = x[i];
    if (xi >= sliceFromX && xi <= sliceToX) {
      sx.push(xi);
      sy.push(y[i]);
    }
  }

  const useX = sx.length >= 2 ? sx : x;
  const useY = sx.length >= 2 ? sy : y;

  const xMin = minOf(useX);
  const xMax = maxOf(useX);

  // Normalize x so template starts at 0 (shape unchanged).
  const nx = useX.map((v) => v - xMin);

  return {
    signalType,
    x: nx,
    y: [...useY], // IMPORTANT: keep exact y shape
    xMin: 0,
    xMax: xMax - xMin,
    peakAbsY: peakAbs(useY),
    peakMaxY: maxY(useY),
  };
}

const TPL_NORMAL = buildTemplate("Normal");
const TPL_PACED = buildTemplate("Ventricular pacing");
const TPL_MOBITZ_NOCONDUCTION = buildTemplate("Mobitz type II - no conduction");
const TPL_SLOW = buildTemplate("Slow conduction");

// AV block: atrial activity can use P-only template you already have
const TPL_P_ONLY = TPL_MOBITZ_NOCONDUCTION;

// AV block ventricular escape: if you have a dedicated waveform name, we’ll use it.
// Otherwise: slice Normal to remove the early atrial portion (approx after P ends).
// (No new points; just a subset)
const TPL_AV_VENT_ESCAPE =
  buildTemplate("Third-degree AV block") ||
  buildTemplate("3rd degree AV block") ||
  buildTemplate("Complete AV block") ||
  (TPL_NORMAL ? buildTemplate("Normal", { sliceFromX: 8.1 }) : null);

if (!TPL_NORMAL || !TPL_PACED || !TPL_P_ONLY || !TPL_SLOW || !TPL_AV_VENT_ESCAPE) {
  // We keep this explicit so failures are obvious in console.
  // (If this throws for you, it means a required waveform name doesn't exist.)
  throw new Error(
    "ecgSignalGenerator: Missing required waveform templates. " +
      "Ensure ecgWaveforms.js includes Normal, Ventricular pacing, Mobitz type II - no conduction, Slow conduction."
  );
}

// ------------------------- segment model ------------------------------------

// A segment is one beat waveform instance placed in time.
// times[] must be monotonic.
function makeSegment({ template, shiftT, scaleX, label, eventMode }) {
  const rawX = template.x;
  const rawY = template.y;

  const times = new Array(rawX.length);
  const vals = new Array(rawY.length);

  for (let i = 0; i < rawX.length; i++) {
    times[i] = shiftT + rawX[i] * scaleX;
    vals[i] = rawY[i]; // EXACT SHAPE in Y (no scaling)
  }

  const startTime = times[0];
  const endTime = times[times.length - 1];

  let eventTime = null;
  if (eventMode === "maxY") {
    let idx = 0;
    let best = -Infinity;
    for (let i = 0; i < vals.length; i++) {
      if (vals[i] > best) {
        best = vals[i];
        idx = i;
      }
    }
    eventTime = times[idx];
  } else if (eventMode === "minY") {
    let idx = 0;
    let best = Infinity;
    for (let i = 0; i < vals.length; i++) {
      if (vals[i] < best) {
        best = vals[i];
        idx = i;
      }
    }
    eventTime = times[idx];
  }

  return {
    label,
    startTime,
    endTime,
    times,
    vals,
    // Use actual segment amplitude for display scaling
    peakAbsY: peakAbs(vals),
    peakMaxY: maxY(vals),
    eventTime,
  };
}

// Insert in time order (append-mostly), and handle overlap similarly to your python post-sort:
// if overlap occurs and new wave is "dominant", truncate old.
function insertSegment(segments, seg) {
  if (!seg) return;

  // append-mostly: keep segments sorted by startTime
  if (!segments.length || segments[segments.length - 1].startTime <= seg.startTime) {
    segments.push(seg);
  } else {
    // binary insert
    let lo = 0;
    let hi = segments.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (segments[mid].startTime <= seg.startTime) lo = mid + 1;
      else hi = mid;
    }
    segments.splice(lo, 0, seg);
  }

  // Overlap resolution with left neighbor only (sufficient for forward generation)
  const idx = segments.indexOf(seg);
  const leftIdx = idx - 1;
  if (leftIdx >= 0) {
    const left = segments[leftIdx];
    if (left.endTime > seg.startTime) {
      // If seg is "stronger", truncate left at seg.startTime, else truncate seg start
      if (seg.peakAbsY >= left.peakAbsY) {
        const cutT = seg.startTime;
        let cutPos = left.times.length - 1;
        for (let i = 0; i < left.times.length; i++) {
          if (left.times[i] > cutT) {
            cutPos = i - 1;
            break;
          }
        }
        cutPos = Math.max(1, cutPos);
        left.times = left.times.slice(0, cutPos + 1);
        left.vals = left.vals.slice(0, cutPos + 1);
        left.endTime = left.times[left.times.length - 1];
      } else {
        const cutT = left.endTime;
        let startPos = 0;
        for (let i = 0; i < seg.times.length; i++) {
          if (seg.times[i] >= cutT) {
            startPos = i;
            break;
          }
        }
        if (seg.times.length - startPos < 2) {
          // drop seg
          segments.splice(idx, 1);
          return;
        }
        seg.times = seg.times.slice(startPos);
        seg.vals = seg.vals.slice(startPos);
        seg.startTime = seg.times[0];
      }
    }
  }
}

// ------------------------- scenario mapping ---------------------------------

function waveformIdToRhythm(waveformId) {
  switch (waveformId) {
    case "c0-normal-sinus":
      return "normal";
    case "c2-third-degree-av-block":
      return "complete_av_block";
    case "c3-second-degree-av-block":
      return "mobitz_ii";
    case "c5-slow-conduction":
      return "slow_conduction";
    default:
      return "normal";
  }
}

// ------------------------- generator ----------------------------------------

export function createEcgSignalGenerator() {
  const state = {
    poweredOn: false,
    rate: 60,          // pacer bpm
    output: 5.0,       // mA
    sensitivity: 2.5,  // mV threshold (compared to max(y))
    asynchronous: false,

    patientHR: 72,     // intrinsic HR (scenario vitals.hr)
    waveformId: "c0-normal-sinus",
    rhythm: "normal",
    regularity: "Regular", // used by python, we keep default
  };

  // Streaming data
  let segments = [];
  let events = []; // { type: 'pace'|'sense', time: number }
  let cursorSegIdx = 0;

  // For display scaling: use current max abs amplitude of kept segments
  let currentMaxAbs = 1;

  // The latest time the renderer asked for
  let lastSampleTime = 0;

  // ---- schedulers (per scenario) ----

  const sched = {
    // Normal/brady scheduler (VVI-ish)
    normal: {
      nextIntrinsic: 0,
      // next pacer timeout based on last sensed vent event
      lastSensed: 0,
      nextPacer: 0,
      started: false,
    },

    // Mobitz II scheduler (python beat_list logic)
    mobitz: {
      beatList: ["Normal"],
      i: 0,
      offset: 0,
      timeSinceSensed: 0,
      R_location: 0,
      gapBase: 0.1,
      started: false,
      probConduction: 0.8,
    },

    // Slow conduction scheduler (python beat_list logic)
    slow: {
      beatList: ["Slow conduction"],
      i: 0,
      offset: 0,
      timeSinceSensed: 0,
      R_location: 0,
      gapBase: 0.1,
      started: false,
    },

    // Complete AV block scheduler
    av: {
      nextP: 0,
      nextV: 0,
      timeSinceSensed: 0,
      RR: 1,
      PP: 1,
      started: false,
    },
  };

  function resetSchedulers(startTime = 0) {
    segments = [];
    events = [];
    cursorSegIdx = 0;
    currentMaxAbs = 1;

    sched.normal = {
      nextIntrinsic: startTime,
      lastSensed: startTime,
      nextPacer: startTime + 60 / Math.max(state.rate, 1),
      started: false,
    };

    sched.mobitz = {
      beatList: ["Normal"],
      i: 0,
      offset: startTime,
      timeSinceSensed: 0,
      R_location: startTime,
      gapBase: 0.1,
      started: false,
      probConduction: 0.8,
    };

    sched.slow = {
      beatList: ["Slow conduction"],
      i: 0,
      offset: startTime,
      timeSinceSensed: 0,
      R_location: startTime,
      gapBase: 0.1,
      started: false,
    };

    sched.av = {
      nextP: startTime,
      nextV: startTime,
      timeSinceSensed: 0,
      RR: 60 / Math.max(state.patientHR, 1),
      PP: 60 / Math.max(state.patientHR, 1),
      started: false,
    };
  }

  // Keep past intact, but when knobs/scenario change, the simplest safe behavior is:
  // drop future (>= now) and re-generate forward with new rules.
  function invalidateFuture(fromTime) {
    const guard = 0.02;
    const cut = Math.max(0, fromTime - guard);

    segments = segments.filter((s) => s.endTime <= cut);
    events = events.filter((e) => e.time <= cut);
    cursorSegIdx = Math.min(cursorSegIdx, segments.length);

    // Reset schedulers starting from cut (no history assumptions).
    resetSchedulers(cut);
  }

  function pushEvent(type, time) {
    if (!Number.isFinite(time)) return;
    events.push({ type, time });
  }

  function recomputeCurrentMaxAbs() {
    let m = 1;
    for (const s of segments) {
      if (s && Number.isFinite(s.peakAbsY)) m = Math.max(m, s.peakAbsY);
    }
    currentMaxAbs = m;
  }

  function pruneOld(keepAfterTime) {
    const cutoff = Math.max(0, keepAfterTime - KEEP_SEC);

    // segments
    let firstKept = 0;
    while (firstKept < segments.length && segments[firstKept].endTime < cutoff) firstKept++;
    if (firstKept > 0) {
      segments = segments.slice(firstKept);
      cursorSegIdx = Math.max(0, cursorSegIdx - firstKept);
    }

    // events
    events = events.filter((e) => e.time >= cutoff);

    recomputeCurrentMaxAbs();
  }

  // ---------------------- Normal / Brady (no python given) ------------------
  // We keep EXACT template shapes, and apply VVI timing behavior:
  // - intrinsic at patientHR
  // - if poweredOn and NOT async:
  //     * if intrinsic R peak >= sensitivity -> sensed -> inhibit pacing timer
  //     * if not sensed -> pacer may pace after 60/rate
  // - if async: pace at fixed 60/rate regardless (like VOO); we output paced beats only
  function initNormalIfNeeded(startTime) {
    if (sched.normal.started) return;
    sched.normal.started = true;

    sched.normal.nextIntrinsic = startTime;
    sched.normal.lastSensed = startTime;
    sched.normal.nextPacer = startTime + 60 / Math.max(state.rate, 1);
  }

  function generateNormalThrough(targetT, startTime) {
    initNormalIfNeeded(startTime);

    const intrinsicRR = 60 / Math.max(state.patientHR, 1);
    const pacerRR = 60 / Math.max(state.rate, 1);

    // scale X so one template beat is ~0.8 sec (python stitch style)
    const normalScaleX = 0.8 / Math.max(TPL_NORMAL.xMax, 1e-6);
    const pacedScaleX = 0.8 / Math.max(TPL_PACED.xMax, 1e-6);

    let created = 0;

    while (created < MAX_SEGMENTS_PER_ENSURE) {
      // Determine next event time
      const tIntrinsic = sched.normal.nextIntrinsic;
      const tPacer = state.poweredOn ? sched.normal.nextPacer : Infinity;

      const nextT = Math.min(tIntrinsic, tPacer);
      if (nextT >= targetT) break;

      // ASYNC: pace only at pacer rate
      if (state.poweredOn && state.asynchronous) {
        // Only generate paced beats
        if (state.output >= CAPTURE_THRESHOLD_MA) {
          const seg = makeSegment({
            template: TPL_PACED,
            shiftT: tPacer,
            scaleX: pacedScaleX,
            label: "Ventricular pacing",
            eventMode: "maxY", // spike is max
          });
          insertSegment(segments, seg);
          currentMaxAbs = Math.max(currentMaxAbs, seg.peakAbsY);

          pushEvent("pace", seg.eventTime ?? tPacer);

          // In async, we do not inhibit, so next pacer is fixed
          sched.normal.nextPacer += pacerRR;

          // Keep intrinsic clock roughly in step so we don't lag forever
          while (sched.normal.nextIntrinsic <= tPacer) sched.normal.nextIntrinsic += intrinsicRR;

          created++;
          continue;
        } else {
          // output too low: show intrinsic beats only (can't capture)
          // fall through to intrinsic handling
        }
      }

      // Demand mode: whichever happens first
      if (tIntrinsic <= tPacer) {
        // Intrinsic Normal
        const seg = makeSegment({
          template: TPL_NORMAL,
          shiftT: tIntrinsic,
          scaleX: normalScaleX,
          label: "Normal",
          eventMode: "maxY", // R peak
        });

        insertSegment(segments, seg);
        currentMaxAbs = Math.max(currentMaxAbs, seg.peakAbsY);

        // Sensing only if pacer on and not async
        if (state.poweredOn && !state.asynchronous) {
          if (seg.peakMaxY >= state.sensitivity) {
            pushEvent("sense", seg.eventTime ?? tIntrinsic);
            sched.normal.lastSensed = seg.eventTime ?? tIntrinsic;
            sched.normal.nextPacer = sched.normal.lastSensed + pacerRR;
          }
        }

        sched.normal.nextIntrinsic += intrinsicRR;
        created++;
      } else {
        // Pacer fires (only if poweredOn)
        if (state.output >= CAPTURE_THRESHOLD_MA) {
          const seg = makeSegment({
            template: TPL_PACED,
            shiftT: tPacer,
            scaleX: pacedScaleX,
            label: "Ventricular pacing",
            eventMode: "maxY",
          });

          insertSegment(segments, seg);
          currentMaxAbs = Math.max(currentMaxAbs, seg.peakAbsY);

          pushEvent("pace", seg.eventTime ?? tPacer);

          // In demand pacing, paced event acts as ventricular event
          sched.normal.lastSensed = seg.eventTime ?? tPacer;
          sched.normal.nextPacer = sched.normal.lastSensed + pacerRR;

          // Advance intrinsic to stay ahead
          while (sched.normal.nextIntrinsic <= tPacer) sched.normal.nextIntrinsic += intrinsicRR;

          created++;
        } else {
          // output too low => no effective pacing; just schedule next pacer attempt
          sched.normal.nextPacer += pacerRR;
          created++;
        }
      }
    }
  }

  // ---------------------- Mobitz II (python logic) --------------------------

  function initMobitzIfNeeded(startTime) {
    if (sched.mobitz.started) return;
    sched.mobitz.started = true;

    const rr = 60 / Math.max(state.patientHR, 1);
    // python: beat duration ~0.8, gap is provided. We choose base to match RR.
    sched.mobitz.gapBase = Math.max(0, rr - 0.8);

    sched.mobitz.offset = startTime; // time origin
    sched.mobitz.i = 0;
    sched.mobitz.timeSinceSensed = 0;
    sched.mobitz.R_location = startTime;
    sched.mobitz.beatList = ["Normal"];

    // python: if async -> regular
    if (state.asynchronous) state.regularity = "Regular";
  }

  function generateMobitzThrough(targetT, startTime) {
    initMobitzIfNeeded(startTime);

    const max_time_since_sensed = 60 / Math.max(state.rate, 1);
    const pacedScaleX = 0.8 / Math.max(TPL_PACED.xMax, 1e-6);
    const normalScaleX = 0.8 / Math.max(TPL_NORMAL.xMax, 1e-6);
    const pOnlyScaleX = 0.8 / Math.max(TPL_P_ONLY.xMax, 1e-6);

    let created = 0;

    // We generate beats until "offset" surpasses targetT
    while (created < MAX_SEGMENTS_PER_ENSURE) {
      const i = sched.mobitz.i;

      if (sched.mobitz.offset >= targetT) break;

      if (i >= sched.mobitz.beatList.length) sched.mobitz.beatList.push("Normal");

      const rand_num = Math.random();
      const beatType = sched.mobitz.beatList[i];

      let tpl = TPL_NORMAL;
      let scaleX = normalScaleX;
      let eventMode = "maxY";

      if (beatType === "Ventricular pacing") {
        tpl = TPL_PACED;
        scaleX = pacedScaleX;
        eventMode = "maxY"; // spike
      } else if (beatType === "Mobitz type II - no conduction") {
        tpl = TPL_P_ONLY;
        scaleX = pOnlyScaleX;
        eventMode = null;
      }

      // Gap based on regularity (python)
      let gap = sched.mobitz.gapBase;
      if (sched.mobitz.offset !== startTime && state.regularity === "Irregular") {
        gap += Math.random() * gap;
      }

      const shiftT = (sched.mobitz.i === 0) ? startTime : (sched.mobitz.offset + gap);

      const seg = makeSegment({
        template: tpl,
        shiftT,
        scaleX,
        label: beatType,
        eventMode,
      });

      insertSegment(segments, seg);
      currentMaxAbs = Math.max(currentMaxAbs, seg.peakAbsY);

      // python sensing/pacing decisions
      if (state.poweredOn) {
        if (seg.peakMaxY < state.sensitivity) {
          // not sensed
          sched.mobitz.timeSinceSensed += (seg.endTime - seg.startTime) + (sched.mobitz.i === 0 ? 0 : gap);

          if (sched.mobitz.timeSinceSensed >= max_time_since_sensed) {
            if (state.output >= CAPTURE_THRESHOLD_MA) {
              sched.mobitz.beatList.push("Ventricular pacing");
            } else if (state.asynchronous) {
              sched.mobitz.beatList.push("Ventricular pacing");
            } else {
              if (rand_num <= sched.mobitz.probConduction) sched.mobitz.beatList.push("Normal");
              else sched.mobitz.beatList.push("Mobitz type II - no conduction");
            }
            sched.mobitz.timeSinceSensed = 0;
          } else if (state.asynchronous) {
            sched.mobitz.beatList.push("Ventricular pacing");
          } else {
            if (rand_num <= sched.mobitz.probConduction) sched.mobitz.beatList.push("Normal");
            else sched.mobitz.beatList.push("Mobitz type II - no conduction");
          }
        } else {
          // sensed
          const R_time = seg.eventTime ?? seg.startTime;
          pushEvent("sense", R_time);

          if (sched.mobitz.i === 0) {
            sched.mobitz.R_location = R_time;
          } else {
            const RR_dist = R_time - sched.mobitz.R_location;
            const measured_rate = RR_dist > 0 ? 60 / RR_dist : 999;

            // update R_location
            // python: paced uses argmin; we keep eventTime=maxY spike, but for R-to-R we want the QRS;
            // since we keep shapes, the QRS min is later. However you asked "exact shapes", not perfect physiology.
            // If you want, we can refine by using minY time for paced only.
            sched.mobitz.R_location = R_time;

            if (measured_rate < state.rate) {
              if (state.output >= CAPTURE_THRESHOLD_MA) sched.mobitz.beatList.push("Ventricular pacing");
              else if (state.asynchronous) sched.mobitz.beatList.push("Ventricular pacing");
              else {
                if (rand_num <= sched.mobitz.probConduction) sched.mobitz.beatList.push("Normal");
                else sched.mobitz.beatList.push("Mobitz type II - no conduction");
              }

              if (!state.asynchronous) {
                if (sched.mobitz.probConduction <= 0.8) sched.mobitz.beatList.push("Normal");
                else sched.mobitz.beatList.push("Mobitz type II - no conduction");
              }
            } else if (state.asynchronous) {
              sched.mobitz.beatList.push("Ventricular pacing");
            } else {
              if (rand_num <= sched.mobitz.probConduction) sched.mobitz.beatList.push("Normal");
              else sched.mobitz.beatList.push("Mobitz type II - no conduction");
            }
          }

          // always reset on sensed in python
          sched.mobitz.timeSinceSensed = 0;

          // if beat itself was pacing, emit pace LED
          if (beatType === "Ventricular pacing") {
            pushEvent("pace", seg.eventTime ?? seg.startTime);
          }
        }
      } else {
        // pacer off: just conduction randomness
        if (rand_num <= sched.mobitz.probConduction) sched.mobitz.beatList.push("Normal");
        else sched.mobitz.beatList.push("Mobitz type II - no conduction");
      }

      sched.mobitz.offset = seg.endTime;
      sched.mobitz.i++;
      created++;
    }
  }

  // ---------------------- Slow conduction (python logic) --------------------

  const SLOW_X_DENOM = 24 + 2.582287981996621; // same constant used in your python

  function initSlowIfNeeded(startTime) {
    if (sched.slow.started) return;
    sched.slow.started = true;

    const rr = 60 / Math.max(state.patientHR, 1);
    sched.slow.gapBase = Math.max(0, rr - 0.8);

    sched.slow.offset = startTime;
    sched.slow.i = 0;
    sched.slow.timeSinceSensed = 0;
    sched.slow.R_location = startTime;
    sched.slow.beatList = ["Slow conduction"];

    if (state.asynchronous) state.regularity = "Regular";
  }

  function generateSlowThrough(targetT, startTime) {
    initSlowIfNeeded(startTime);

    const max_time_since_sensed = 60 / Math.max(state.rate, 1);

    // python uses fixed denom for slow conduction scaling in X.
    // We apply the same style: scaleX so (denom) maps to 0.8 sec.
    const slowScaleX = 0.8 / SLOW_X_DENOM;
    const pacedScaleX = 0.8 / Math.max(TPL_PACED.xMax, 1e-6);

    let created = 0;

    while (created < MAX_SEGMENTS_PER_ENSURE) {
      const i = sched.slow.i;
      if (sched.slow.offset >= targetT) break;

      if (i >= sched.slow.beatList.length) sched.slow.beatList.push("Slow conduction");

      const beatType = sched.slow.beatList[i];

      let tpl = TPL_SLOW;
      let scaleX = slowScaleX;
      let eventMode = "maxY";

      if (beatType === "Ventricular pacing") {
        tpl = TPL_PACED;
        scaleX = pacedScaleX;
        eventMode = "maxY";
      }

      let gap = sched.slow.gapBase;
      if (sched.slow.offset !== startTime && state.regularity === "Irregular") {
        gap += Math.random() * gap;
      }

      const shiftT = (sched.slow.i === 0) ? startTime : (sched.slow.offset + gap);

      const seg = makeSegment({
        template: tpl,
        shiftT,
        scaleX,
        label: beatType,
        eventMode,
      });

      insertSegment(segments, seg);
      currentMaxAbs = Math.max(currentMaxAbs, seg.peakAbsY);

      if (state.poweredOn) {
        if (seg.peakMaxY < state.sensitivity) {
          sched.slow.timeSinceSensed += (seg.endTime - seg.startTime) + (sched.slow.i === 0 ? 0 : gap);

          if (sched.slow.timeSinceSensed >= max_time_since_sensed) {
            if (state.output >= CAPTURE_THRESHOLD_MA) {
              sched.slow.beatList.push("Ventricular pacing");
            } else if (state.asynchronous) {
              sched.slow.beatList.push("Ventricular pacing");
            } else {
              sched.slow.beatList.push("Slow conduction");
            }
            sched.slow.timeSinceSensed = 0;
          } else if (state.asynchronous) {
            sched.slow.beatList.push("Ventricular pacing");
          } else {
            sched.slow.beatList.push("Slow conduction");
          }
        } else {
          const R_time = seg.eventTime ?? seg.startTime;
          pushEvent("sense", R_time);

          // python: measured rate check
          if (sched.slow.i > 0) {
            const RR_dist = R_time - sched.slow.R_location;
            const measured_rate = RR_dist > 0 ? 60 / RR_dist : 999;

            sched.slow.R_location = R_time;

            if (measured_rate < state.rate) {
              if (state.output >= CAPTURE_THRESHOLD_MA) sched.slow.beatList.push("Ventricular pacing");
              else if (state.asynchronous) sched.slow.beatList.push("Ventricular pacing");
              else sched.slow.beatList.push("Slow conduction");

              if (!state.asynchronous) sched.slow.beatList.push("Slow conduction");
            } else if (state.asynchronous) {
              sched.slow.beatList.push("Ventricular pacing");
            } else {
              sched.slow.beatList.push("Slow conduction");
            }
          } else {
            sched.slow.R_location = R_time;
            if (state.asynchronous) sched.slow.beatList.push("Ventricular pacing");
            else sched.slow.beatList.push("Slow conduction");
          }

          sched.slow.timeSinceSensed = 0;

          if (beatType === "Ventricular pacing") {
            pushEvent("pace", seg.eventTime ?? seg.startTime);
          }
        }
      } else {
        sched.slow.beatList.push("Slow conduction");
      }

      sched.slow.offset = seg.endTime;
      sched.slow.i++;
      created++;
    }
  }

  // ---------------------- Complete AV block (python pacing logic) -----------

  function initAvIfNeeded(startTime) {
    if (sched.av.started) return;
    sched.av.started = true;

    const RR_interval = 60 / Math.max(state.patientHR, 1);
    // python: PP_interval = RR_interval-0.3 + 0.04*rand -0.02
    const PP_interval = RR_interval - 0.3 + (Math.random() * 0.04 - 0.02);

    sched.av.RR = RR_interval;
    sched.av.PP = PP_interval;

    sched.av.nextP = startTime;
    sched.av.nextV = startTime;
    sched.av.timeSinceSensed = 0;
  }

  function generateAvBlockThrough(targetT, startTime) {
    initAvIfNeeded(startTime);

    const RR_interval = sched.av.RR;
    const PP_interval = sched.av.PP;

    const max_time_since_sensed = 60 / Math.max(state.rate, 1);

    // Place waveforms with ~0.8 sec duration in time (like python stitched beats)
    const pScaleX = 0.8 / Math.max(TPL_P_ONLY.xMax, 1e-6);
    const ventEscapeScaleX = 0.8 / Math.max(TPL_AV_VENT_ESCAPE.xMax, 1e-6);
    const pacedScaleX = 0.8 / Math.max(TPL_PACED.xMax, 1e-6);

    let created = 0;

    while (created < MAX_SEGMENTS_PER_ENSURE) {
      const nextT = Math.min(sched.av.nextP, sched.av.nextV);
      if (nextT >= targetT) break;

      const isP = sched.av.nextP <= sched.av.nextV;

      if (isP) {
        // P wave (not used for sensing)
        const seg = makeSegment({
          template: TPL_P_ONLY,
          shiftT: sched.av.nextP,
          scaleX: pScaleX,
          label: "P",
          eventMode: null,
        });

        insertSegment(segments, seg);
        currentMaxAbs = Math.max(currentMaxAbs, seg.peakAbsY);

        sched.av.nextP += PP_interval;
        created++;
        continue;
      }

      // Ventricular event: decide paced vs escape using python logic
      const tV = sched.av.nextV;

      let beatType = "Ventricular escape";
      let tpl = TPL_AV_VENT_ESCAPE;
      let scaleX = ventEscapeScaleX;
      let doPace = false;

      if (state.poweredOn) {
        if (state.asynchronous) {
          if (state.output >= CAPTURE_THRESHOLD_MA) {
            beatType = "Ventricular pacing";
            tpl = TPL_PACED;
            scaleX = pacedScaleX;
            doPace = true;
            // python resets on pacing
            sched.av.timeSinceSensed = 0;
          } else {
            // python: if output too low, show normal R instead
            sched.av.timeSinceSensed = 0;
          }
        } else if (sched.av.timeSinceSensed >= max_time_since_sensed) {
          if (state.output >= CAPTURE_THRESHOLD_MA) {
            beatType = "Ventricular pacing";
            tpl = TPL_PACED;
            scaleX = pacedScaleX;
            doPace = true;
            sched.av.timeSinceSensed = 0;
          } else {
            // output too low => show escape, and python resets time_since_sensed
            sched.av.timeSinceSensed = 0;
          }
        } else {
          // escape sufficient -> don't pace
        }
      }

      const seg = makeSegment({
        template: tpl,
        shiftT: tV,
        scaleX,
        label: beatType,
        eventMode: beatType === "Ventricular pacing" ? "maxY" : "maxY",
      });

      insertSegment(segments, seg);
      currentMaxAbs = Math.max(currentMaxAbs, seg.peakAbsY);

      if (state.poweredOn && doPace) {
        pushEvent("pace", seg.eventTime ?? seg.startTime);
      }

      // Sensing (ventricular only) if poweredOn and not async
      if (state.poweredOn && !state.asynchronous) {
        if (seg.peakMaxY < state.sensitivity) {
          sched.av.timeSinceSensed += (seg.endTime - seg.startTime);
        } else {
          pushEvent("sense", seg.eventTime ?? seg.startTime);
          sched.av.timeSinceSensed = 0;
        }
      }

      sched.av.nextV += RR_interval;
      created++;
    }
  }

  // ---------------------- generation / sampling -----------------------------

  function ensureThrough(t) {
    // handle backwards time requests (rare)
    if (t < lastSampleTime) cursorSegIdx = 0;
    lastSampleTime = t;

    pruneOld(t);

    const startTime = Math.max(0, t - 0.05); // small guard so we don't place right at prune cutoff
    const targetT = t + LOOKAHEAD_SEC;

    let created = 0;
    while (created < MAX_SEGMENTS_PER_ENSURE && segments.length < MAX_SEGMENTS_PER_ENSURE) {
      // Generate for active rhythm
      if (state.rhythm === "mobitz_ii") {
        generateMobitzThrough(targetT, startTime);
      } else if (state.rhythm === "slow_conduction") {
        generateSlowThrough(targetT, startTime);
      } else if (state.rhythm === "complete_av_block") {
        generateAvBlockThrough(targetT, startTime);
      } else {
        generateNormalThrough(targetT, startTime);
      }
      break; // generators already fill forward to targetT
    }
  }

  function sampleAt(t) {
    ensureThrough(t);

    if (!segments.length) return 0;

    // advance cursor
    while (cursorSegIdx < segments.length && segments[cursorSegIdx].endTime < t) {
      cursorSegIdx++;
    }

    let v0 = 0;
    const s0 = segments[cursorSegIdx];
    if (s0 && t >= s0.startTime && t <= s0.endTime) {
      v0 = samplePiecewiseLinear(s0.times, s0.vals, t);
    }

    // possible overlap with next segment
    const s1 = segments[cursorSegIdx + 1];
    if (s1 && t >= s1.startTime && t <= s1.endTime) {
      const v1 = samplePiecewiseLinear(s1.times, s1.vals, t);
      return Math.abs(v1) >= Math.abs(v0) ? v1 : v0;
    }

    return v0;
  }

  // ---------------------- public API ----------------------------------------

  const api = {
    updateParameters(partial) {
      if (!partial || typeof partial !== "object") return;

      const normalized = { ...partial };

      if (typeof partial.power === "boolean" && typeof partial.poweredOn !== "boolean") {
        normalized.poweredOn = partial.power;
      }

      if (typeof normalized.poweredOn === "boolean") state.poweredOn = normalized.poweredOn;
      if (Number.isFinite(normalized.rate)) state.rate = clamp(normalized.rate, 30, 200);
      if (Number.isFinite(normalized.output)) state.output = clamp(normalized.output, 0, 25);
      if (Number.isFinite(normalized.sensitivity))
        state.sensitivity = clamp(normalized.sensitivity, 0.1, 20);
      if (typeof normalized.asynchronous === "boolean") state.asynchronous = normalized.asynchronous;

      invalidateFuture(lastSampleTime);
    },

    updateScenario(scenario) {
      if (!scenario || typeof scenario !== "object") return;

      const waveformId = scenario.waveformId ?? state.waveformId;
      state.waveformId = waveformId;
      state.rhythm = waveformIdToRhythm(waveformId);

      if (scenario.vitals && Number.isFinite(scenario.vitals.hr)) {
        state.patientHR = clamp(scenario.vitals.hr, 20, 220);
      }
      if (scenario.pacing && typeof scenario.pacing.poweredOn === "boolean") {
        state.poweredOn = scenario.pacing.poweredOn;
      }

      invalidateFuture(lastSampleTime);
    },

    updateWaveformId(waveformId) {
      if (!waveformId) return;
      state.waveformId = waveformId;
      state.rhythm = waveformIdToRhythm(waveformId);
      invalidateFuture(lastSampleTime);
    },

    updateRuleEffects(_effects) {
      // Keep compatibility; apply later if needed.
    },

    regenerate(_secondsVisible) {
      // No finite strip: just make sure forward beats exist.
      ensureThrough(lastSampleTime);
    },

    sample(timeSeconds) {
      if (!Number.isFinite(timeSeconds) || timeSeconds < 0) return 0;
      // Keep time bounded (engEngine might mod sweepTime by waveformDuration)
      const t = timeSeconds % WAVEFORM_DURATION_SEC;
      return sampleAt(t);
    },

    getMeta() {
      // Keep events list trimmed
      pruneOld(lastSampleTime);

      return {
        waveformDuration: WAVEFORM_DURATION_SEC,
        waveformEvents: events.map((e) => ({ type: e.type, time: e.time })),
        // CRITICAL: this drives display scaling in engEngine
        maxWaveAmplitude: currentMaxAbs,
      };
    },

    getState() {
      return { ...state };
    },
  };

  resetSchedulers(0);
  return api;
}
