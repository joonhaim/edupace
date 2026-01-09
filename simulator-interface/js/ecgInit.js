import { LiveECGEngine } from "../ecg/ecgEngine.js";

let engine = null;

function ensureEngine() {
  if (engine) return engine;

  const canvas = document.getElementById("ecgCanvas");
  if (!canvas) {
    console.warn("ecgInit: #ecgCanvas not found yet");
    return null;
  }

  engine = new LiveECGEngine({
    canvas,
    secondsOnScreen: 6,
    fs: 500,
    yMin: -12,   // match your Python-ish visual scale (big QRS)
    yMax: 12,
    gain: 1.0,
    showGrid: true,
    showSensitivity: true,
    params: {
      patientHR: 90,
      regularity: "Regular",
      sensitivity: 0.5,
      rate: 70,
      output: 1.8,
      asynchronous: false,
    },
  });

  // expose for quick console testing
  window.ecgEngine = engine;
  return engine;
}

function isTrainingViewActive() {
  const training = document.querySelector('[data-view="training"]');
  return training && !training.hasAttribute("hidden");
}

function startIfVisible() {
  const e = ensureEngine();
  if (!e) return;

  // canvas must have a real size (not display:none or hidden parent)
  if (isTrainingViewActive()) e.start();
  else e.stop();
}

// Start once on load (if training already visible)
window.addEventListener("DOMContentLoaded", () => {
  startIfVisible();

  // If your app toggles [hidden] when routing views, observe it
  const training = document.querySelector('[data-view="training"]');
  if (training) {
    const obs = new MutationObserver(() => startIfVisible());
    obs.observe(training, { attributes: true, attributeFilter: ["hidden", "class"] });
  }

  // Also: when window/tab becomes visible again
  document.addEventListener("visibilitychange", () => startIfVisible());
});

// Optional: helpers to connect UI to engine
export function ecgSetRate(r) {
  const e = ensureEngine();
  if (!e) return;
  e.updateParams({ rate: Number(r) });
}
export function ecgSetOutput(o) {
  const e = ensureEngine();
  if (!e) return;
  e.updateParams({ output: Number(o) });
}
export function ecgSetSensitivity(s) {
  const e = ensureEngine();
  if (!e) return;
  e.updateParams({ sensitivity: Number(s) });
}
export function ecgSetAsync(a) {
  const e = ensureEngine();
  if (!e) return;
  e.updateParams({ asynchronous: !!a });
}
