function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

// Small deterministic jitter so it doesn't look robotic
function jitteredIntervalSec(baseIntervalSec, jitterFrac, rng) {
  const j = (rng() * 2 - 1) * jitterFrac; // [-jitterFrac, +jitterFrac]
  return baseIntervalSec * (1 + j);
}

// Tiny PRNG (seeded) so scenarios are reproducible
export function makeMulberry32(seed = 123456) {
  let t = seed >>> 0;
  return function rng() {
    t += 0x6D2B79F5;
    let x = Math.imul(t ^ (t >>> 15), 1 | t);
    x ^= x + Math.imul(x ^ (x >>> 7), 61 | x);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Scenario interface:
 *  - nextIntrinsicTimeSec(tNowSec): returns next intrinsic ventricular event time (seconds)
 *  - intrinsicBeatType: string passed to waveform generator (usually "Normal")
 *
 * More advanced scenarios can add their own state.
 */
export function createNormalSinusScenario({
  hr = 78,
  jitterFrac = 0.02,
  seed = 1,
} = {}) {
  const rng = makeMulberry32(seed);
  const baseInterval = () => 60 / clamp(hr, 20, 220);

  let next = 0;

  return {
    id: "normal-sinus",
    name: "Normal Sinus",
    intrinsicBeatType: "Normal",

    reset(tStartSec = 0) {
      next = tStartSec + jitteredIntervalSec(baseInterval(), jitterFrac, rng);
    },

    nextIntrinsicTimeSec(tNowSec) {
      // Ensure next is in the future
      while (next <= tNowSec) {
        next += jitteredIntervalSec(baseInterval(), jitterFrac, rng);
      }
      return next;
    },
  };
}

/**
 * Very simple "complete AV block" starter:
 * - Ventricular intrinsic is a slow escape rhythm (e.g. 30 bpm)
 * - Pacemaker may take over if RATE > escape and sensing allows inhibition
 */
export function createCompleteAVBlockScenario({
  ventricularEscapeHr = 30,
  jitterFrac = 0.02,
  seed = 2,
} = {}) {
  const rng = makeMulberry32(seed);
  const baseInterval = () => 60 / clamp(ventricularEscapeHr, 10, 80);
  let next = 0;

  return {
    id: "complete-av-block",
    name: "Complete AV Block",
    intrinsicBeatType: "Normal", // morphology can stay "Normal" for now

    reset(tStartSec = 0) {
      next = tStartSec + jitteredIntervalSec(baseInterval(), jitterFrac, rng);
    },

    nextIntrinsicTimeSec(tNowSec) {
      while (next <= tNowSec) {
        next += jitteredIntervalSec(baseInterval(), jitterFrac, rng);
      }
      return next;
    },
  };
}

/**
 * Mobitz II starter:
 * - Underlying ventricular events attempt at atrial rate
 * - Some beats are dropped in a pattern (e.g., 3:2, 4:3, etc.)
 */
export function createMobitzIIScenario({
  atrialHr = 80,
  conducted = 2,   // number conducted per cycle
  total = 3,       // beats per cycle
  jitterFrac = 0.01,
  seed = 3,
} = {}) {
  const rng = makeMulberry32(seed);
  const baseInterval = () => 60 / clamp(atrialHr, 20, 220);

  let nextA = 0;
  let idxInCycle = 0;

  return {
    id: "mobitz-ii",
    name: "Mobitz II",
    intrinsicBeatType: "Normal",

    reset(tStartSec = 0) {
      nextA = tStartSec + jitteredIntervalSec(baseInterval(), jitterFrac, rng);
      idxInCycle = 0;
    },

    nextIntrinsicTimeSec(tNowSec) {
      // Find next conducted ventricular beat time
      while (true) {
        while (nextA <= tNowSec) {
          nextA += jitteredIntervalSec(baseInterval(), jitterFrac, rng);
          idxInCycle = (idxInCycle + 1) % total;
        }

        // At nextA time: is it conducted?
        const willConduct = idxInCycle < conducted;
        if (willConduct) return nextA;

        // Drop it: move to the following atrial time
        nextA += jitteredIntervalSec(baseInterval(), jitterFrac, rng);
        idxInCycle = (idxInCycle + 1) % total;
      }
    },
  };
}
