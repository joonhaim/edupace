import { initHardwareIntegration } from './arduinoSerialAdapter.js';
import { initScenarios } from './scenarioEngine.js';
import { initRulesEngine } from './rulesEngine.js';
import { initEcgEngine } from './ecgEngine.js';
import { initVirtualController } from './virtualController.js';

initHardwareIntegration();
initScenarios();
initRulesEngine();
initEcgEngine();
initVirtualController();