import { initEcgEngine } from "../ecg/ecgEngine.js";

let engine = null;

function ensureEngine() {
  if (!engine) engine = initEcgEngine();
  if (!engine) {
    console.warn("ecgInit: #ecgCanvas not found yet");
  }
  return engine;
}

window.addEventListener("DOMContentLoaded", () => {
  const e = ensureEngine();
  if (e) window.ecgEngine = e;
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
