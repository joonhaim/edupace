import { initHardwareIntegration } from './arduinoSerialAdapter.js';
import { initScenarios } from './scenarioEngine.js';
import { initRulesEngine } from './rulesEngine.js';
import { initEcgEngine } from './ecgEngine.js';
import { initVirtualController } from './virtualController.js';
import { initSettingsPanel } from './settingsPanel.js';
import { initSessionManager } from './sessionManager.js';

initHardwareIntegration();
initSessionManager();
initScenarios();
initRulesEngine();
initEcgEngine();
initVirtualController();
initSettingsPanel();