// ecg/continuousEcgEngine.js
import { RingBufferF32 } from "./ringBuffer.js";
import { renderBeatSamples, getBeatTemplate } from "./waveformAdapter.js";

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

export function createContinuousEcgEngine({
  sampleRate = 500,
  secondsVisible = 6,
  bufferSeconds = 12,          // ring buffer length (keep > secondsVisible)
  baselineNoiseMv = 0.004,     // small noise floor
  captureThreshold = 1.5,      // like your notebook
  getParams,                   // () => { rate, sensitivity, output, pacerOn }
  scenario,                    // scenario object from scenarios.js
  intrinsicBeatType = null,    // override if you want
  pacedBeatType = "Ventricular pacing",
  onEvent = null,              // (evt) => {} for labels/logging
} = {}) {
  if (typeof getParams !== "function") {
    throw new Error("createContinuousEcgEngine: getParams() is required.");
  }
  if (!scenario?.reset || !scenario?.nextIntrinsicTimeSec) {
    throw new Error("createContinuousEcgEngine: scenario must implement reset() and nextIntrinsicTimeSec().");
  }

  const ringLen = Math.max(1024, Math.round(sampleRate * bufferSeconds));
  const ring = new RingBufferF32(ringLen);

  // Internal time (seconds)
  let tSec = 0;

  // Scheduling
  let nextIntrinsicSec = 0;
  let nextPaceSec = Infinity;
  let lastSensedSec = -Infinity;

  // Running flag
  let running = false;

  // Cache a small buffer for baseline chunks
  function makeBaselineBlock(n) {
    const out = new Float32Array(n);
    // cheap noise (no RNG needed; this is just for “alive”)
    for (let i = 0; i < n; i++) {
      out[i] = (Math.random() * 2 - 1) * baselineNoiseMv;
    }
    return out;
  }

  function scheduleFromNow() {
    const { rate, pacerOn } = getParams();
    const r = clamp(rate ?? 60, 30, 200);
    const escape = 60 / r;

    if (pacerOn) {
      // If we’ve never sensed, pace from "now"
      const anchor = Number.isFinite(lastSensedSec) && lastSensedSec > -1e8 ? lastSensedSec : tSec;
      nextPaceSec = anchor + escape;
      if (nextPaceSec <= tSec) nextPaceSec = tSec + escape;
    } else {
      nextPaceSec = Infinity;
    }

    nextIntrinsicSec = scenario.nextIntrinsicTimeSec(tSec);
  }

  function reset(tStartSec = 0) {
    tSec = tStartSec;
    ring.clear(0);

    lastSensedSec = -Infinity;

    scenario.reset(tStartSec);
    nextIntrinsicSec = scenario.nextIntrinsicTimeSec(tStartSec);

    // pace from start if pacer on
    const { rate, pacerOn } = getParams();
    if (pacerOn) {
      const r = clamp(rate ?? 60, 30, 200);
      nextPaceSec = tStartSec + 60 / r;
    } else {
      nextPaceSec = Infinity;
    }
  }

  function emit(evt) {
    if (typeof onEvent === "function") onEvent(evt);
  }

  function handleIntrinsicEvent() {
    const { sensitivity } = getParams();

    const beatType = intrinsicBeatType ?? scenario.intrinsicBeatType ?? "Normal";

    // Sensing based on peak vs sensitivity threshold (notebook-style)
    const tpl = getBeatTemplate(beatType);
    const sens = Number.isFinite(sensitivity) ? sensitivity : 0.3;
    const sensed = tpl.peak >= sens;

    // Duration: use the intrinsic RR interval implied by scenario if possible.
    // We approximate by using time until the next scheduled intrinsic event (bounded).
    const nextAfter = scenario.nextIntrinsicTimeSec(tSec + 1e-6);
    const rr = clamp(nextAfter - tSec, 0.25, 2.5);

    const samples = renderBeatSamples(beatType, sampleRate, rr);
    ring.pushBlock(samples);
    tSec += samples.length / sampleRate;

    if (sensed) {
      lastSensedSec = tSec; // sensed near end of beat in this simple model
      emit({ type: "intrinsic", timeSec: tSec, beatType, sensed: true });
    } else {
      emit({ type: "intrinsic", timeSec: tSec, beatType, sensed: false });
    }

    // Reschedule pace from last sensed if pacer is on
    const { rate, pacerOn } = getParams();
    if (pacerOn) {
      const r = clamp(rate ?? 60, 30, 200);
      const escape = 60 / r;
      if (sensed) nextPaceSec = lastSensedSec + escape;
      // if not sensed, pacer continues toward its existing nextPaceSec
    } else {
      nextPaceSec = Infinity;
    }

    // Schedule next intrinsic
    nextIntrinsicSec = scenario.nextIntrinsicTimeSec(tSec);
  }

  function handlePaceEvent() {
    const { output, rate, pacerOn } = getParams();
    if (!pacerOn) {
      nextPaceSec = Infinity;
      return;
    }

    const r = clamp(rate ?? 60, 30, 200);
    const escape = 60 / r;

    const captured = (output ?? 0) >= captureThreshold;

    // Pace beat duration follows escape interval (bounded)
    const dur = clamp(escape, 0.25, 2.5);

    const beatType = pacedBeatType;

    if (captured) {
      const samples = renderBeatSamples(beatType, sampleRate, dur);
      ring.pushBlock(samples);
      tSec += samples.length / sampleRate;
      emit({ type: "pace", timeSec: tSec, beatType, captured: true, output });
    } else {
      // No capture: spike-only (simple but realistic enough)
      // We create a short spike and then baseline until next event.
      const spikeLen = Math.max(2, Math.round(sampleRate * 0.02)); // 20 ms
      const spike = new Float32Array(Math.round(sampleRate * dur));

      // Put a sharp spike at the beginning (visual cue)
      const spikeAmp = -0.9; // keep fixed so you don't "alter" your waveforms
      for (let i = 0; i < spikeLen && i < spike.length; i++) spike[i] = spikeAmp;
      // rest stays 0 baseline
      ring.pushBlock(spike);
      tSec += spike.length / sampleRate;

      emit({ type: "pace", timeSec: tSec, beatType, captured: false, output });
    }

    // Pacemaker knows it fired; restart escape interval from "now"
    lastSensedSec = tSec;
    nextPaceSec = lastSensedSec + escape;

    // Intrinsic schedule continues independently
    nextIntrinsicSec = scenario.nextIntrinsicTimeSec(tSec);
  }

  /**
   * Advance by dtSec, generating enough samples to cover that time.
   * You call this from requestAnimationFrame or a timer.
   */
  function step(dtSec) {
    if (!running) return;

    // In case user changes knobs, we re-evaluate nextPaceSec conservatively
    // by only recomputing if RATE or pacerOn changes meaningfully from now.
    // (Simple version: just re-schedule from current state.)
    scheduleFromNow();

    // Convert dt to target sample count
    const targetSamples = Math.max(0, Math.round(dtSec * sampleRate));
    let produced = 0;

    while (produced < targetSamples) {
      // Determine next event time in absolute seconds
      const tNextEvent = Math.min(nextIntrinsicSec, nextPaceSec);

      // If next event is in the future, fill baseline until then (or until target reached)
      const tUntil = tNextEvent - tSec;
      if (tUntil > 1e-6) {
        const fillSamples = Math.min(
          targetSamples - produced,
          Math.round(tUntil * sampleRate)
        );
        if (fillSamples > 0) {
          ring.pushBlock(makeBaselineBlock(fillSamples));
          produced += fillSamples;
          tSec += fillSamples / sampleRate;
          continue;
        }
      }

      // We are at (or past) an event time
      if (nextIntrinsicSec <= nextPaceSec) {
        handleIntrinsicEvent();
      } else {
        handlePaceEvent();
      }

      // After event handlers we already pushed samples and advanced time.
      // Count those samples toward produced by measuring ring.totalWritten delta is complicated;
      // simplest: just allow the loop to continue until target reached via baseline fills.
      // (Your display only needs "latest buffer", not exact produced count.)
      // To avoid infinite loop, break if dt was tiny.
      if (targetSamples === 0) break;

      // We don't strictly add produced here; baseline fill will catch up.
      // If you want strict pacing, you can track totalWritten before/after.
      if (produced >= targetSamples) break;
    }
  }

  function start() { running = true; }
  function stop() { running = false; }

  function getWindow(seconds = secondsVisible) {
    const n = Math.round(sampleRate * seconds);
    return ring.getLast(n);
  }

  function getTimeSec() { return tSec; }
  function isRunning() { return running; }

  // Init
  reset(0);

  return {
    start,
    stop,
    reset,
    step,
    getWindow,
    getTimeSec,
    isRunning,
    sampleRate,
    secondsVisible,
  };
}
