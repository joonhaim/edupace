const LANGUAGE_KEY = 'edupace-language';
const DEFAULT_LANGUAGE = 'en';

const TRANSLATIONS = {
    en: {
        'controls.settings': 'Open settings',
        'controls.theme': 'Toggle theme',
        'controls.language': 'Toggle language',
        'nav.home': 'Home',
        'nav.training': 'Training',
        'nav.logs': 'Logs',
        'nav.instructions': 'Instructions',
        'connection.title': 'Device connection',
        'connection.help': 'Plug in EduPace to pair via USB.',
        'connection.status': 'Device',
        'connection.disconnected': 'Disconnected',
        'connection.button': 'Connect',
        'connection.devices': 'Serial devices',
        'connection.choose': 'Choose a device',
        'connection.subtitle': 'Plug in EduPace and pick a USB serial connection.',
        'connection.empty': 'No serial devices found. Plug in your console and scan again.',
        'connection.refresh': 'Refresh list',
        'connection.scan': 'Scan & grant access',
        'connection.support': 'Supports Chrome, Edge, or the EduPace desktop app.',
        'home.title': 'Home',
        'home.subtitle': 'Temporary External Pacemaker Trainer',
        'home.searchLabel': 'Search scenarios',
        'home.searchPlaceholder': 'Search scenarios…',
        'home.quickStart.label': 'Quick start',
        'home.quickStart.title': 'Start training',
        'home.quickStart.body': 'Open the training workspace and load a scenario.',
        'home.quickStart.open': 'Open training',
        'home.quickStart.instructions': 'Instructions',
        'home.quickStart.meta': 'Designed for CCU / ER nurse training',
        'home.scenarios.label': 'Scenarios',
        'home.scenarios.title': 'Browse',
        'home.scenarios.module': 'Module',
        'home.scenarios.clinical': 'Clinical',
        'home.scenarios.hint': 'Selecting a scenario opens the training workspace with that case loaded.',
        'home.recent.title': 'Recent',
        'home.recent.empty': 'No recent sessions yet.',
        'training.header.tag': 'Hands-on practice',
        'training.header.title': 'Training workspace',
        'training.scenario.pill': 'Scenario',
        'training.scenario.empty': 'No scenario active',
        'training.scenario.hint': 'Pick a module or clinical case to begin training.',
        'training.scenario.start': 'Start',
        'training.scenario.end': 'End',
        'training.scenario.status': 'Select a module or clinical case to begin.',
        'training.telemetry.noAlarms': 'No active alarms',
        'training.telemetry.calibration': 'Calibration',
        'training.telemetry.ms': 'ms',
        'training.learning.objective': 'Current Objective',
        'training.learning.feedback': 'Feedback',
        'logs.header.label': 'Recorded sessions',
        'logs.header.title': 'Session logs',
        'logs.header.copy': 'Download completed runs as JSON or CSV.',
        'logs.filters.search': 'Search',
        'logs.filters.searchPlaceholder': 'Scenario, operator, notes',
        'logs.filters.sort': 'Sort by',
        'logs.filters.newest': 'Newest first',
        'logs.filters.oldest': 'Oldest first',
        'logs.filters.duration': 'Longest duration',
        'logs.filters.events': 'Most events',
        'logs.empty': 'No sessions have been logged yet. Complete a run to see it here.',
        'instructions.label': 'Quick start',
        'instructions.title': 'Run a pacing session in four steps',
        'instructions.steps.connect.title': 'Connect the device',
        'instructions.steps.connect.body': 'Plug in the EduPace console via USB. Open the Training page and allow the browser to access the serial device by pressing on the "CONNECT" button.',
        'instructions.steps.input.title': 'Choose input mode',
        'instructions.steps.input.body': 'Select Hardware if the Arduino console is available. It is recommended to use Google Chrome or Edge. Otherwise switch to the Virtual controller for keyboard / mouse practice.',
        'instructions.steps.scenario.title': 'Select a scenario',
        'instructions.steps.scenario.body': 'Pick a training case from the scenario dropdown (e.g. symptomatic bradycardia, undersensing, oversensing) and read the summary banner.',
        'instructions.steps.parameters.title': 'Adjust pacing parameters',
        'instructions.steps.parameters.body': 'Use the knobs (or virtual sliders) to set Rate, Output and Sensitivity. Watch the ECG, PACE/SENSE LEDs and HR tile to confirm capture and appropriate sensing.'
    },
    nl: {
        'controls.settings': 'Open instellingen',
        'controls.theme': 'Schakel thema',
        'controls.language': 'Wissel taal',
        'nav.home': 'Home',
        'nav.training': 'Training',
        'nav.logs': 'Logs',
        'nav.instructions': 'Instructies',
        'connection.title': 'Apparaatverbinding',
        'connection.help': 'Sluit EduPace via USB aan.',
        'connection.status': 'Apparaat',
        'connection.disconnected': 'Niet verbonden',
        'connection.button': 'Verbind',
        'connection.devices': 'Seriële apparaten',
        'connection.choose': 'Kies een apparaat',
        'connection.subtitle': 'Sluit EduPace aan en kies een USB-seriële verbinding.',
        'connection.empty': 'Geen seriële apparaten gevonden. Sluit de console aan en scan opnieuw.',
        'connection.refresh': 'Lijst vernieuwen',
        'connection.scan': 'Scannen en toegang verlenen',
        'connection.support': 'Ondersteunt Chrome, Edge of de EduPace-desktopapp.',
        'home.title': 'Home',
        'home.subtitle': 'Tijdelijke externe pacemakertrainer',
        'home.searchLabel': 'Zoek scenario’s',
        'home.searchPlaceholder': 'Zoek scenario’s…',
        'home.quickStart.label': 'Snelstart',
        'home.quickStart.title': 'Begin met trainen',
        'home.quickStart.body': 'Open de trainingsomgeving en laad een scenario.',
        'home.quickStart.open': 'Open training',
        'home.quickStart.instructions': 'Instructies',
        'home.quickStart.meta': 'Ontworpen voor training van CCU/SEH-verpleegkundigen',
        'home.scenarios.label': 'Scenario’s',
        'home.scenarios.title': 'Bladeren',
        'home.scenarios.module': 'Module',
        'home.scenarios.clinical': 'Klinisch',
        'home.scenarios.hint': 'Het kiezen van een scenario opent de trainingsomgeving met die casus.',
        'home.recent.title': 'Recent',
        'home.recent.empty': 'Nog geen sessies.',
        'training.header.tag': 'Praktijk',
        'training.header.title': 'Trainingsomgeving',
        'training.scenario.pill': 'Scenario',
        'training.scenario.empty': 'Geen actief scenario',
        'training.scenario.hint': 'Kies een module of klinische casus om te starten.',
        'training.scenario.start': 'Start',
        'training.scenario.end': 'Stop',
        'training.scenario.status': 'Selecteer een module of klinische casus om te beginnen.',
        'training.telemetry.noAlarms': 'Geen actieve alarmen',
        'training.telemetry.calibration': 'Calibratie',
        'training.telemetry.ms': 'ms',
        'training.learning.objective': 'Huidig doel',
        'training.learning.feedback': 'Feedback',
        'logs.header.label': 'Opgeslagen sessies',
        'logs.header.title': 'Sessielogs',
        'logs.header.copy': 'Download afgeronde sessies als JSON of CSV.',
        'logs.filters.search': 'Zoeken',
        'logs.filters.searchPlaceholder': 'Scenario, operator, notities',
        'logs.filters.sort': 'Sorteren op',
        'logs.filters.newest': 'Nieuwste eerst',
        'logs.filters.oldest': 'Oudste eerst',
        'logs.filters.duration': 'Langste duur',
        'logs.filters.events': 'Meeste gebeurtenissen',
        'logs.empty': 'Er zijn nog geen sessies gelogd. Rond een run af om hem hier te zien.',
        'instructions.label': 'Snelstart',
        'instructions.title': 'Voer een pacingsessie uit in vier stappen',
        'instructions.steps.connect.title': 'Verbind het apparaat',
        'instructions.steps.connect.body': 'Sluit de EduPace-console via USB aan. Open de Trainingspagina en geef de browser toegang tot het seriële apparaat door op de knop "CONNECT" te drukken.',
        'instructions.steps.input.title': 'Kies invoermodus',
        'instructions.steps.input.body': 'Selecteer Hardware als de Arduino-console beschikbaar is. Gebruik bij voorkeur Google Chrome of Edge. Schakel anders over op de Virtuele controller voor oefening met toetsenbord of muis.',
        'instructions.steps.scenario.title': 'Selecteer een scenario',
        'instructions.steps.scenario.body': 'Kies een training uit het scenariomenu (bijv. symptomatische bradycardie, undersensing, oversensing) en lees de samenvatting.',
        'instructions.steps.parameters.title': 'Pas pacingparameters aan',
        'instructions.steps.parameters.body': 'Gebruik de knoppen of schuifregelaars om Rate, Output en Sensitivity in te stellen. Let op het ECG, de PACE/SENSE-leds en het HR-vak om capture en juiste sensing te bevestigen.'
    }
};

function getTranslation(language, key) {
    return TRANSLATIONS[language]?.[key] || TRANSLATIONS[DEFAULT_LANGUAGE]?.[key] || null;
}

function applyTranslations(language) {
    const normalizedLanguage = language === 'nl' ? 'nl' : DEFAULT_LANGUAGE;

    document.querySelectorAll('[data-i18n-key]').forEach((element) => {
        const key = element.dataset.i18nKey;
        if (!key) return;

        const translation = getTranslation(normalizedLanguage, key);
        if (!translation) return;

        const attrTargets = (element.dataset.i18nAttr || '')
            .split(',')
            .map((attr) => attr.trim())
            .filter(Boolean);

        if (attrTargets.length) {
            attrTargets.forEach((attr) => element.setAttribute(attr, translation));
        } else {
            element.textContent = translation;
        }
    });
}

function updateLanguageButtons(language) {
    const isEnglish = language === 'en';
    const buttons = document.querySelectorAll('[data-language-toggle]');

    buttons.forEach((button) => {
        const label = button.querySelector('[data-language-label]');
        if (label) {
            label.textContent = language.toUpperCase();
        }

        button.setAttribute('aria-pressed', String(isEnglish));
        button.setAttribute('aria-label', isEnglish ? 'Switch to Dutch' : 'Switch to English');
    });
}

function applyLanguage(language) {
    const normalizedLanguage = language === 'nl' ? 'nl' : DEFAULT_LANGUAGE;
    document.documentElement.setAttribute('lang', normalizedLanguage);
    localStorage.setItem(LANGUAGE_KEY, normalizedLanguage);
    updateLanguageButtons(normalizedLanguage);
    applyTranslations(normalizedLanguage);
}

function bindLanguageToggles(toggleElements) {
    toggleElements.forEach((toggle) => {
        if (toggle.dataset.languageBound === 'true') return;

        toggle.dataset.languageBound = 'true';
        toggle.addEventListener('click', () => {
            const currentLanguage = document.documentElement.getAttribute('lang') || DEFAULT_LANGUAGE;
            const nextLanguage = currentLanguage === 'en' ? 'nl' : 'en';
            applyLanguage(nextLanguage);
        });
    });

    const currentLanguage = document.documentElement.getAttribute('lang') || DEFAULT_LANGUAGE;
    applyLanguage(currentLanguage);
}

function initLanguageToggle() {
    const savedLanguage = localStorage.getItem(LANGUAGE_KEY) || DEFAULT_LANGUAGE;
    applyLanguage(savedLanguage);

    const toggles = Array.from(document.querySelectorAll('[data-language-toggle]'));
    if (toggles.length) {
        bindLanguageToggles(toggles);
        return;
    }

    const observer = new MutationObserver(() => {
        const discovered = Array.from(document.querySelectorAll('[data-language-toggle]'));
        if (discovered.length) {
            bindLanguageToggles(discovered);
            observer.disconnect();
        }
    });

    observer.observe(document.body, { childList: true, subtree: true });
}

export { initLanguageToggle };
