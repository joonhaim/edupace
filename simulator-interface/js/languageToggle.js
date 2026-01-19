const LANGUAGE_KEY = 'edupace-language';
const DEFAULT_LANGUAGE = 'en';

function normalizeLanguage(language) {
    return language === 'nl' ? 'nl' : DEFAULT_LANGUAGE;
}

const TRANSLATIONS = {
    en: {
        'controls.settings': 'Open settings',
        'controls.theme': 'Toggle theme',
        'controls.language': 'Toggle language',
        'nav.home': 'Dashboard',
        'nav.training': 'Training',
        'nav.logs': 'Session Log',
        'nav.instructions': 'Instructions',
        'connection.title': 'Device connection',
        'connection.help': 'Plug in EduPace to pair via USB.',
        'connection.status': 'Device',
        'connection.disconnected': 'Disconnected',
        'connection.button': 'Connect',
        'connection.devices': 'Devices',
        'connection.choose': 'Select device',
        'connection.subtitle': 'USB devices nearby',
        'connection.empty': 'No devices found. Plug in EduPace and scan again.',
        'connection.refresh': 'Refresh',
        'connection.scan': 'Scan',
        'connection.support': 'Chrome or Edge recommended.',
        'home.title': 'Dashboard',
        'home.subtitle': 'Temporary External Pacemaker Trainer',
        'home.searchLabel': 'Search scenarios',
        'home.searchPlaceholder': 'Search scenarios…',
        'home.quickStart.label': 'Quick start',
        'home.quickStart.title': 'Start training',
        'home.quickStart.body': 'Open the training workspace and load a scenario.',
        'home.quickStart.open': 'Open training →',
        'home.quickStart.instructions': 'Instructions',
        'home.quickStart.meta': 'Designed for CCU / ER nurse training',
        'home.scenarios.label': 'Scenarios',
        'home.scenarios.title': 'Browse',
        'home.scenarios.module': 'Module',
        'home.scenarios.clinical': 'Clinical',
        'home.scenarios.hint': 'Selecting a scenario opens the training workspace with that case loaded.',
        'home.scenarios.empty': 'No scenarios available yet.',
        'home.scenarios.error': 'Unable to load scenarios.',
        'home.recent.title': 'Recent',
        'home.recent.unknownTime': 'Unknown time',
        'home.recent.empty': 'No recent sessions yet.',
        'home.progress.title': 'My progress',
        'home.steps.title': 'Session steps',
        'home.steps.tag': '4 steps',
        'home.resources.label': 'Resources',
        'home.resources.title': 'Keep training handy',
        'home.resources.body': 'Shortcuts to manuals and instructions.',
        'home.progress.count': '{completed} / {total} scenarios complete',
        'home.progress.loading': 'Loading scenarios…',
        'home.progress.startHint': 'Start any scenario to see your progress fill up.',
        'home.progress.remaining': '{remaining} to go for full coverage.',
        'home.suggested.label': 'Suggested',
        'home.suggested.title': 'Try next',
        'home.suggested.empty': 'Add clinical scenarios to see suggestions here.',
        'home.suggested.fallbackSummary': 'Practice this case next.',
        'home.suggested.start': 'Start training',
        'home.suggested.shuffle': 'Shuffle',
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
        'training.controls.eyebrow': 'Control',
        'training.controls.input.title': 'Input source',
        'training.controls.input.hardware': 'Hardware',
        'training.controls.input.virtual': 'Virtual',
        'training.controls.input.caption': 'Choose whether the simulator follows the physical EduPace device or on-screen controls.',
        'training.pacemaker.eyebrow': 'Pacemaker',
        'training.pacemaker.parameters': 'Pacemaker parameters',
        'training.pacemaker.virtualController': 'Virtual Pacemaker Controller',
        'training.intrinsic.title': 'Intrinsic HR Settings',
        'training.menu.module': 'Module Training',
        'training.menu.clinical': 'Clinical Cases',
        'training.menu.trainingModes': 'Training modes',
        'training.menu.empty': 'No scenarios available',
        'training.menu.comingSoon': 'Coming soon',
        'logs.header.label': 'Recorded sessions',
        'logs.header.title': 'Session log',
        'logs.header.copy': 'Download completed runs as JSON or CSV.',
        'logs.filters.search': 'Search',
        'logs.filters.searchPlaceholder': 'Scenario, operator, notes',
        'logs.filters.sort': 'Sort by',
        'logs.filters.newest': 'Newest first',
        'logs.filters.oldest': 'Oldest first',
        'logs.filters.duration': 'Longest duration',
        'logs.filters.events': 'Most events',
        'logs.empty': 'No sessions have been logged yet. Complete a run to see it here.',
        'logs.location.browserOnly': 'Browser storage (local only)',
        'logs.location.nativeHint': 'Logs are kept as a JSON file you can browse on disk.',
        'logs.location.browserHint': 'Logs stay in this browser storage unless you export them.',
        'logs.time.unknown': 'Unknown time',
        'logs.meta.notProvided': 'Not provided',
        'logs.meta.editHint': 'Double-click to edit',
        'logs.events.count': '{count} events',
        'logs.card.meta': '{date} • {duration} • {events}',
        'logs.card.addLabel': 'Add label or operator',
        'logs.detail.empty': 'Select a session to view its details.',
        'logs.detail.close': 'Close session details',
        'logs.detail.sessionId': 'Session ID',
        'logs.detail.started': 'Started',
        'logs.detail.duration': 'Duration',
        'logs.detail.events': 'Events',
        'logs.actions.downloadJson': 'Download JSON',
        'logs.actions.downloadCsv': 'Download CSV',
        'logs.actions.delete': 'Delete entry',
        'logs.actions.save': 'Save',
        'logs.actions.cancel': 'Cancel',
        'logs.actions.edit': 'Edit',
        'logs.list.empty': 'No sessions match the current filters yet.',
        'logs.unknownScenario': 'Unknown scenario',
        'logs.form.label': 'Label',
        'logs.form.labelPlaceholder': 'e.g., Weekly practice',
        'logs.form.operator': 'Operator',
        'logs.form.operatorPlaceholder': 'Name of person running the session',
        'logs.form.notes': 'Notes / annotations',
        'logs.form.notesPlaceholder': 'Observations, alarms, adjustments, etc.',
        'logs.form.notesShort': 'Notes',
        'instructions.label': 'Quick start',
        'instructions.title': 'Ready, connect, pace',
        'instructions.tagline': 'Learn how to use EduPace in simple steps',
        'instructions.manual': 'Open user manual (PDF)',
        'instructions.cta.training': 'Go to training',
        'instructions.steps.connect.step': 'Setup',
        'instructions.steps.connect.title': 'Connect the device',
        'instructions.steps.connect.body': 'Plug in the EduPace console via USB. Open the Training page and allow the browser to access the serial device by pressing on the "CONNECT" button.',
        'instructions.steps.input.step': 'Mode',
        'instructions.steps.input.title': 'Choose input mode',
        'instructions.steps.input.body': 'Select Hardware if the Arduino console is available. It is recommended to use Google Chrome or Edge. Otherwise switch to the Virtual controller for keyboard / mouse practice.',
        'instructions.steps.scenario.step': 'Scenario',
        'instructions.steps.scenario.title': 'Select a scenario',
        'instructions.steps.scenario.body': 'Pick a training case from the scenario dropdown (Normal Sinus Rhythm or 3rd degree AV block) and read the summary banner.',
        'instructions.steps.parameters.step': 'Tune',
        'instructions.steps.parameters.title': 'Adjust pacing parameters',
        'instructions.steps.parameters.body': 'Use the knobs (or virtual sliders) to set Rate, Output and Sensitivity. Watch the ECG, PACE/SENSE LEDs and HR tile to confirm capture and appropriate sensing.',

        'settings.header.label': 'Settings',
        'settings.header.title': 'Settings',
        'settings.header.reset': 'Reset to defaults',
        'settings.tabs.ecg': 'ECG',
        'settings.tabs.sound': 'Sound',
        'settings.tabs.simulation': 'Simulation',
        'settings.tabs.logs': 'Session logs',
        'settings.section.layout': 'Layout',
        'settings.section.appearance': 'Appearance',
        'settings.section.annotations': 'Annotations',
        'settings.section.beats': 'Beats',
        'settings.section.volume': 'Volume',
        'settings.section.device': 'Device behaviour',
        'settings.section.intrinsicRates': 'Scenario intrinsic rates',
        'settings.section.sessionLog': 'Session log',
        'settings.intrinsicScenario.hint': 'Set baseline intrinsic bpm for this scenario.',
        'settings.intrinsicScenario.rateLabel': 'Intrinsic rate (bpm)',
        'settings.intrinsicScenario.nsr.title': 'Normal Sinus Rhythm',
        'settings.intrinsicScenario.av3.title': '3rd Degree AV Block',
        'settings.intrinsicScenario.mobitz2.title': 'Mobitz II',
        'settings.intrinsicScenario.slowConduction.title': 'Slow Conduction',
        'settings.intrinsicRate.title': 'Intrinsic heart rate',
        'settings.intrinsicRate.hint': 'Set baseline intrinsic bpm.',
        'settings.intrinsicRegularity.title': 'Intrinsic regularity',
        'settings.intrinsicRegularity.hint': 'Regular or irregular intrinsic rhythm.',
        'settings.intrinsicRegularity.aria': 'Intrinsic regularity',
        'settings.intrinsicRegularity.regular': 'Regular',
        'settings.intrinsicRegularity.irregular': 'Irregular',
        'settings.traceLook.title': 'Trace look',
        'settings.traceLook.hint': 'Color and stroke weight.',
        'settings.traceColor.aria': 'Trace color',
        'settings.colors.green': 'Green',
        'settings.colors.blue': 'Blue',
        'settings.colors.amber': 'Amber',
        'settings.colors.white': 'White',
        'settings.traceThickness.aria': 'Trace thickness',
        'settings.traceThickness.thin': 'Thin',
        'settings.traceThickness.normal': 'Normal',
        'settings.traceThickness.thick': 'Thick',
        'settings.gridlines.title': 'Gridlines',
        'settings.gridlines.hint': 'Toggle ECG grid overlay.',
        'settings.gridDensity.title': 'Grid density',
        'settings.gridDensity.hint': '1 mm or 2 mm boxes.',
        'settings.gridDensity.aria': 'Grid density',
        'settings.gridIntensity.title': 'Grid intensity',
        'settings.gridIntensity.hint': 'Adjust line brightness.',
        'settings.hrDisplay.title': 'HR display',
        'settings.hrDisplay.hint': 'Show heart rate overlay.',
        'settings.hrDisplay.aria': 'Heart rate color',
        'settings.leadLabel.title': 'Lead label',
        'settings.leadLabel.hint': 'Show current lead overlay.',
        'settings.leadLabel.aria': 'Lead label color',
        'settings.overlaySize.title': 'Overlay size',
        'settings.overlaySize.hint': 'Increase or reduce ECG label text.',
        'settings.overlaySize.aria': 'Overlay size',
        'settings.overlaySize.compact': 'Compact',
        'settings.overlaySize.normal': 'Normal',
        'settings.overlaySize.large': 'Large',
        'settings.sensitivityGuide.title': 'Sensitivity guide',
        'settings.sensitivityGuide.hint': 'Show current sensing threshold line.',
        'settings.paceMarkers.title': 'Pace markers',
        'settings.paceMarkers.hint': 'Show paced beat indicators.',
        'settings.paceMarkers.aria': 'Pace marker color',
        'settings.senseMarkers.title': 'Sense markers',
        'settings.senseMarkers.hint': 'Show intrinsic beat indicators.',
        'settings.senseMarkers.aria': 'Sense marker color',
        'settings.intervalRulers.title': 'Interval rulers',
        'settings.intervalRulers.hint': 'RR/PP calipers on drag.',
        'settings.qrsBeep.title': 'ECG beep',
        'settings.qrsBeep.hint': 'On or off.',
        'settings.qrsBeep.aria': 'ECG beep',
        'settings.qrsBeepVolume.title': 'ECG beep volume',
        'settings.qrsBeepVolume.hint': 'Adjust the ECG beep loudness.',
        'settings.autoLock.title': 'Auto-lock knobs',
        'settings.autoLock.hint': 'Lock after inactivity.',
        'settings.autoLock.aria': 'Auto-lock knobs',
        'settings.actionLog.title': 'Action log',
        'settings.actionLog.hint': 'Record actions for debrief.',
        'settings.dateFormat.title': 'Date format',
        'settings.dateFormat.hint': 'Choose how dates display in session logs.',
        'settings.shared.format': 'Format',
        'settings.timeFormat.title': 'Time format',
        'settings.timeFormat.hint': 'Control the clock style in logs.',
        'settings.timeFormat.twentyFour': '24-hour',
        'settings.timeFormat.twelve': '12-hour',
        'settings.logStorage.title': 'Log storage',
        'settings.logStorage.hint': 'Choose or open the folder where EduPace saves session logs.',
        'settings.logStorage.detecting': 'Detecting log folder…',
        'settings.logStorage.change': 'Change location',
        'settings.logStorage.open': 'Open folder',
        'settings.logStorage.refresh': 'Refresh from disk',
        'settings.actions.save': 'Save',
        'settings.actions.saveAria': 'Save and close settings',
        'settings.shared.off': 'Off',
        'settings.shared.on': 'On'
    },
    nl: {
        'controls.settings': 'Open instellingen',
        'controls.theme': 'Schakel thema',
        'controls.language': 'Wissel taal',
        'nav.home': 'Dashboard',
        'nav.training': 'Training',
        'nav.logs': 'Sessielog',
        'nav.instructions': 'Instructies',
        'connection.title': 'Apparaatverbinding',
        'connection.help': 'Sluit EduPace via USB aan.',
        'connection.status': 'Apparaat',
        'connection.disconnected': 'Niet verbonden',
        'connection.button': 'Verbind',
        'connection.devices': 'Apparaten',
        'connection.choose': 'Selecteer apparaat',
        'connection.subtitle': 'USB-apparaten in de buurt',
        'connection.empty': 'Geen apparaten gevonden. Sluit EduPace aan en scan opnieuw.',
        'connection.refresh': 'Vernieuwen',
        'connection.scan': 'Scannen',
        'connection.support': 'Chrome of Edge aanbevolen.',
        'home.title': 'Dashboard',
        'home.subtitle': 'Tijdelijke externe pacemakertrainer',
        'home.searchLabel': 'Zoek scenario’s',
        'home.searchPlaceholder': 'Zoek scenario’s…',
        'home.quickStart.label': 'Snelstart',
        'home.quickStart.title': 'Begin met trainen',
        'home.quickStart.body': 'Open de trainingsomgeving en laad een scenario.',
        'home.quickStart.open': 'Training openen →',
        'home.quickStart.instructions': 'Instructies',
        'home.quickStart.meta': 'Ontworpen voor training van CCU/SEH-verpleegkundigen',
        'home.scenarios.label': 'Scenario’s',
        'home.scenarios.title': 'Bladeren',
        'home.scenarios.module': 'Module',
        'home.scenarios.clinical': 'Klinisch',
        'home.scenarios.hint': 'Het kiezen van een scenario opent de trainingsomgeving met die casus.',
        'home.scenarios.empty': 'Nog geen scenario’s beschikbaar.',
        'home.scenarios.error': 'Scenario’s konden niet worden geladen.',
        'home.recent.title': 'Recent',
        'home.recent.unknownTime': 'Onbekende tijd',
        'home.recent.empty': 'Nog geen sessies.',
        'home.progress.title': 'Mijn voortgang',
        'home.steps.title': 'Sessiestappen',
        'home.steps.tag': '4 stappen',
        'home.resources.label': 'Bronnen',
        'home.resources.title': 'Alles bij de hand',
        'home.resources.body': 'Snel naar handleiding en instructies.',
        'home.progress.count': '{completed} / {total} scenario’s voltooid',
        'home.progress.loading': 'Scenario’s worden geladen…',
        'home.progress.startHint': 'Start een scenario om je voortgang te zien.',
        'home.progress.remaining': 'Nog {remaining} te gaan voor volledige dekking.',
        'home.suggested.label': 'Aanbevolen',
        'home.suggested.title': 'Probeer hierna',
        'home.suggested.empty': 'Voeg klinische scenario’s toe om hier suggesties te zien.',
        'home.suggested.fallbackSummary': 'Oefen deze casus hierna.',
        'home.suggested.start': 'Start met trainen',
        'home.suggested.shuffle': 'Willekeurig',
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
        'training.controls.eyebrow': 'Bediening',
        'training.controls.input.title': 'Invoerbron',
        'training.controls.input.hardware': 'Hardware',
        'training.controls.input.virtual': 'Virtueel',
        'training.controls.input.caption': 'Kies of de simulator het fysieke EduPace-apparaat volgt of de bediening op het scherm.',
        'training.pacemaker.eyebrow': 'Pacemaker',
        'training.pacemaker.parameters': 'Pacemakerparameters',
        'training.pacemaker.virtualController': 'Virtuele pacemakercontroller',
        'training.intrinsic.title': 'Intrinsieke HR-instellingen',
        'training.menu.module': 'Moduletraining',
        'training.menu.clinical': 'Klinische casussen',
        'training.menu.trainingModes': 'Trainingsmodi',
        'training.menu.empty': 'Geen scenario’s beschikbaar',
        'training.menu.comingSoon': 'Binnenkort beschikbaar',
        'logs.header.label': 'Opgeslagen sessies',
        'logs.header.title': 'Sessielog',
        'logs.header.copy': 'Download afgeronde sessies als JSON of CSV.',
        'logs.filters.search': 'Zoeken',
        'logs.filters.searchPlaceholder': 'Scenario, operator, notities',
        'logs.filters.sort': 'Sorteren op',
        'logs.filters.newest': 'Nieuwste eerst',
        'logs.filters.oldest': 'Oudste eerst',
        'logs.filters.duration': 'Langste duur',
        'logs.filters.events': 'Meeste gebeurtenissen',
        'logs.empty': 'Er zijn nog geen sessies gelogd. Rond een run af om hem hier te zien.',
        'logs.location.browserOnly': 'Browseropslag (alleen lokaal)',
        'logs.location.nativeHint': 'Logs worden opgeslagen als een JSON-bestand dat je op schijf kunt openen.',
        'logs.location.browserHint': 'Logs blijven in deze browseropslag tenzij je ze exporteert.',
        'logs.time.unknown': 'Onbekende tijd',
        'logs.meta.notProvided': 'Niet opgegeven',
        'logs.meta.editHint': 'Dubbelklik om te bewerken',
        'logs.events.count': '{count} gebeurtenissen',
        'logs.card.meta': '{date} • {duration} • {events}',
        'logs.card.addLabel': 'Voeg label of operator toe',
        'logs.detail.empty': 'Selecteer een sessie om details te bekijken.',
        'logs.detail.close': 'Sluit sessiedetails',
        'logs.detail.sessionId': 'Sessienummer',
        'logs.detail.started': 'Gestart',
        'logs.detail.duration': 'Duur',
        'logs.detail.events': 'Gebeurtenissen',
        'logs.actions.downloadJson': 'Download JSON',
        'logs.actions.downloadCsv': 'Download CSV',
        'logs.actions.delete': 'Verwijder item',
        'logs.actions.save': 'Opslaan',
        'logs.actions.cancel': 'Annuleren',
        'logs.actions.edit': 'Bewerken',
        'logs.list.empty': 'Geen sessies passen nog bij de huidige filters.',
        'logs.unknownScenario': 'Onbekend scenario',
        'logs.form.label': 'Label',
        'logs.form.labelPlaceholder': 'bijv. Wekelijkse oefening',
        'logs.form.operator': 'Operator',
        'logs.form.operatorPlaceholder': 'Naam van de persoon die de sessie uitvoert',
        'logs.form.notes': 'Notities / opmerkingen',
        'logs.form.notesPlaceholder': 'Observaties, alarmen, aanpassingen, etc.',
        'logs.form.notesShort': 'Notities',
        'instructions.label': 'Snelstart',
        'instructions.title': 'Klaar, verbinden, pacen',
        'instructions.tagline': 'Leer hoe je EduPace in eenvoudige stappen gebruikt',
        'instructions.manual': 'Open gebruikershandleiding (PDF)',
        'instructions.cta.training': 'Ga naar training',
        'instructions.steps.connect.step': 'Setup',
        'instructions.steps.connect.title': 'Verbind het apparaat',
        'instructions.steps.connect.body': 'Sluit de EduPace-console via USB aan. Open de Trainingspagina en geef de browser toegang tot het seriële apparaat door op de knop "CONNECT" te drukken.',
        'instructions.steps.input.step': 'Modus',
        'instructions.steps.input.title': 'Kies invoermodus',
        'instructions.steps.input.body': 'Selecteer Hardware als de Arduino-console beschikbaar is. Gebruik bij voorkeur Google Chrome of Edge. Schakel anders over op de Virtuele controller voor oefening met toetsenbord of muis.',
        'instructions.steps.scenario.step': 'Scenario',
        'instructions.steps.scenario.title': 'Selecteer een scenario',
        'instructions.steps.scenario.body': 'Kies een training uit het scenariomenu (normaal sinusritme of derdegraads AV-blok) en lees de samenvatting.',
        'instructions.steps.parameters.step': 'Afstemmen',
        'instructions.steps.parameters.title': 'Pas pacingparameters aan',
        'instructions.steps.parameters.body': 'Gebruik de knoppen of schuifregelaars om Rate, Output en Sensitivity in te stellen. Let op het ECG, de PACE/SENSE-leds en het HR-vak om capture en juiste sensing te bevestigen.',

        'settings.header.label': 'Instellingen',
        'settings.header.title': 'Instellingen',
        'settings.header.reset': 'Terugzetten naar standaardwaarden',
        'settings.tabs.ecg': 'ECG',
        'settings.tabs.sound': 'Geluid',
        'settings.tabs.simulation': 'Simulatie',
        'settings.tabs.logs': 'Sessielogs',
        'settings.section.layout': 'Indeling',
        'settings.section.appearance': 'Uiterlijk',
        'settings.section.annotations': 'Annotaties',
        'settings.section.beats': 'Slagen',
        'settings.section.volume': 'Volume',
        'settings.section.device': 'Apparaatgedrag',
        'settings.section.intrinsicRates': 'Scenario intrinsieke hartslag',
        'settings.section.sessionLog': 'Sessielog',
        'settings.intrinsicScenario.hint': 'Stel de intrinsieke bpm in voor dit scenario.',
        'settings.intrinsicScenario.rateLabel': 'Intrinsieke rate (bpm)',
        'settings.intrinsicScenario.nsr.title': 'Normaal sinusritme',
        'settings.intrinsicScenario.av3.title': 'Derdegraads AV-blok',
        'settings.intrinsicScenario.mobitz2.title': 'Mobitz II',
        'settings.intrinsicScenario.slowConduction.title': 'Trage geleiding',
        'settings.intrinsicRate.title': 'Intrinsieke hartslag',
        'settings.intrinsicRate.hint': 'Stel de intrinsieke bpm in.',
        'settings.intrinsicRegularity.title': 'Intrinsieke regelmaat',
        'settings.intrinsicRegularity.hint': 'Regelmatig of onregelmatig intrinsiek ritme.',
        'settings.intrinsicRegularity.aria': 'Intrinsieke regelmaat',
        'settings.intrinsicRegularity.regular': 'Regelmatig',
        'settings.intrinsicRegularity.irregular': 'Onregelmatig',
        'settings.traceLook.title': 'Uitstraling van trace',
        'settings.traceLook.hint': 'Kleur en lijngewicht.',
        'settings.traceColor.aria': 'Tracekleur',
        'settings.colors.green': 'Groen',
        'settings.colors.blue': 'Blauw',
        'settings.colors.amber': 'Amber',
        'settings.colors.white': 'Wit',
        'settings.traceThickness.aria': 'Lijndikte',
        'settings.traceThickness.thin': 'Dun',
        'settings.traceThickness.normal': 'Normaal',
        'settings.traceThickness.thick': 'Dik',
        'settings.gridlines.title': 'Rasterlijnen',
        'settings.gridlines.hint': 'Schakel ECG-raster overlay.',
        'settings.gridDensity.title': 'Rasterdichtheid',
        'settings.gridDensity.hint': '1 mm- of 2 mm-vakken.',
        'settings.gridDensity.aria': 'Rasterdichtheid',
        'settings.gridIntensity.title': 'Rasterintensiteit',
        'settings.gridIntensity.hint': 'Pas lijnhelderheid aan.',
        'settings.hrDisplay.title': 'HR-weergave',
        'settings.hrDisplay.hint': 'Toon hartslagoverlay.',
        'settings.hrDisplay.aria': 'Hartslagkleur',
        'settings.leadLabel.title': 'Afleidingslabel',
        'settings.leadLabel.hint': 'Toon huidige afleiding.',
        'settings.leadLabel.aria': 'Kleur afleidingslabel',
        'settings.overlaySize.title': 'Overlaygrootte',
        'settings.overlaySize.hint': 'Vergroot of verklein ECG-labeltekst.',
        'settings.overlaySize.aria': 'Overlaygrootte',
        'settings.overlaySize.compact': 'Compact',
        'settings.overlaySize.normal': 'Normaal',
        'settings.overlaySize.large': 'Groot',
        'settings.sensitivityGuide.title': 'Sensitiviteitslijn',
        'settings.sensitivityGuide.hint': 'Toon huidige sensordrempel.',
        'settings.paceMarkers.title': 'Pace-markeringen',
        'settings.paceMarkers.hint': 'Toon pacingindicatoren.',
        'settings.paceMarkers.aria': 'Kleur pace-markering',
        'settings.senseMarkers.title': 'Sense-markeringen',
        'settings.senseMarkers.hint': 'Toon intrinsieke slagen.',
        'settings.senseMarkers.aria': 'Kleur sense-markering',
        'settings.intervalRulers.title': 'Intervalcalipers',
        'settings.intervalRulers.hint': 'RR/PP-calipers tijdens slepen.',
        'settings.qrsBeep.title': 'ECG-beep',
        'settings.qrsBeep.hint': 'Aan of uit.',
        'settings.qrsBeep.aria': 'ECG-beep',
        'settings.qrsBeepVolume.title': 'ECG-beepvolume',
        'settings.qrsBeepVolume.hint': 'Pas het volume van de ECG-beep aan.',
        'settings.autoLock.title': 'Automatisch knoppen vergrendelen',
        'settings.autoLock.hint': 'Vergrendel na inactiviteit.',
        'settings.autoLock.aria': 'Automatisch vergrendelen',
        'settings.actionLog.title': 'Actielog',
        'settings.actionLog.hint': 'Log acties voor nabespreking.',
        'settings.dateFormat.title': 'Datumnotatie',
        'settings.dateFormat.hint': 'Kies hoe data in sessielogs worden getoond.',
        'settings.shared.format': 'Formaat',
        'settings.timeFormat.title': 'Tijdnotatie',
        'settings.timeFormat.hint': 'Bepaal de klokstijl in logs.',
        'settings.timeFormat.twentyFour': '24-uurs',
        'settings.timeFormat.twelve': '12-uurs',
        'settings.logStorage.title': 'Logopslag',
        'settings.logStorage.hint': 'Kies of open de map waar EduPace sessielogs bewaart.',
        'settings.logStorage.detecting': 'Logmap wordt gedetecteerd…',
        'settings.logStorage.change': 'Locatie wijzigen',
        'settings.logStorage.open': 'Map openen',
        'settings.logStorage.refresh': 'Verversen vanaf schijf',
        'settings.actions.save': 'Opslaan',
        'settings.actions.saveAria': 'Instellingen opslaan en sluiten',
        'settings.shared.off': 'Uit',
        'settings.shared.on': 'Aan'
    }
};

function getTranslation(language, key) {
    return TRANSLATIONS[language]?.[key] || TRANSLATIONS[DEFAULT_LANGUAGE]?.[key] || null;
}

function getCurrentLanguage() {
    const documentLang = document.documentElement.getAttribute('lang');
    const storedLang = localStorage.getItem(LANGUAGE_KEY);
    return normalizeLanguage(documentLang || storedLang || DEFAULT_LANGUAGE);
}

function translateKey(key, language = getCurrentLanguage()) {
    return getTranslation(language, key) ?? key;
}

function applyTranslations(language) {
    const normalizedLanguage = normalizeLanguage(language);

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
    const normalizedLanguage = normalizeLanguage(language);
    document.documentElement.setAttribute('lang', normalizedLanguage);
    localStorage.setItem(LANGUAGE_KEY, normalizedLanguage);
    updateLanguageButtons(normalizedLanguage);
    applyTranslations(normalizedLanguage);

    document.dispatchEvent(
        new CustomEvent('edupace:language-changed', {
            detail: { language: normalizedLanguage }
        })
    );
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

export { initLanguageToggle, getCurrentLanguage, translateKey, applyLanguage };
