import { initHardwareIntegration } from './arduinoSerialAdapter.js';
import { initScenarios } from './scenarioEngine.js';
import { initEcgEngine } from './ecgEngine.js';


initHardwareIntegration();
initScenarios();
initEcgEngine();