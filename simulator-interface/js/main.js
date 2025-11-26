import { initHardwareIntegration } from './arduinoSerialAdapter.js';
import { initScenarios } from './scenarioEngine.js';
import { initRulesEngine } from './rulesEngine.js';
import { initEcgEngine } from './ecgEngine.js';
import { initVirtualController } from './virtualController.js';
import { initSettingsPanel } from './settingsPanel.js';
import { initThemeToggle } from './themeToggle.js';

initHardwareIntegration();
initScenarios();
initRulesEngine();
initEcgEngine();
initVirtualController();
initSettingsPanel();
initThemeToggle();