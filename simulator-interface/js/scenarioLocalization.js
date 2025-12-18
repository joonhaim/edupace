import { getCurrentLanguage } from './languageToggle.js';

const SCENARIO_TRANSLATIONS = {
    M0: {
        title: 'M0 · Normaal sinusritme',
        description: 'Behoud VVI-stand-by pacing terwijl intrinsieke slagen worden gevolgd.',
        summaryLabel: 'Bewaking van sinusritme',
        primaryRhythm: 'Normaal sinusritme',
        location: 'Telemetrie',
        pacingMode: 'VVI (stand-by)',
        alarmText: 'Geen actieve alarmen',
        objective:
            'Bevestig dat de pacemaker geremd blijft terwijl de patiënt een intrinsiek sinusritme behoudt.',
        feedback:
            'Er mogen geen pacingspikes zichtbaar zijn. Als pacing optreedt, verlaag de rate onder het intrinsieke ritme of controleer de sensing-draden.'
    },
    M1: {
        title: 'M1 · Symptomatische bradycardie',
        description: 'Patiënt met symptomatische ventriculaire bradycardie die VVI-demand pacing nodig heeft.',
        summaryLabel: 'Bradycardie die VVI-pacing vereist',
        primaryRhythm: 'Symptomatische ventriculaire bradycardie',
        location: 'IC',
        pacingMode: 'VVI (demand)',
        alarmText: 'Symptomatische bradycardie – start pacing',
        objective:
            'Verhoog de VVI-snelheid boven het intrinsieke ritme van 34–38 ppm met voldoende output en sensitiviteit om consequente ventriculaire capture te bereiken.',
        feedback:
            'Start VVI-pacing, stel de rate in op 60–70 ppm, output op 5–10 mA en sensitiviteit rond 2 mV om paced QRS-complexen te verkrijgen.',
        rules: {
            'uc01-loss-of-capture': {
                description: 'Verlies van capture wanneer de pacingoutput ondanks hogere rate onvoldoende is.',
                alarmText: 'Geen capture – verhoog output',
                feedback: 'Verhoog output tot minstens 5 mA en controleer capture op het gepacede ritme.'
            },
            'uc01-oversensing': {
                description: 'Oversensing remt pacing doordat de sensitiviteit (mV) te laag staat (te gevoelig).',
                alarmText: 'Oversensing – verlaag sensitiviteit (verhoog mV)',
                feedback:
                    'Verhoog de mV-waarde richting ~2 mV zodat alleen echte R-toppen worden gedetecteerd en pacing niet onterecht wordt geremd.'
            },
            'uc01-vvi-capture': {
                description: 'Stabiele ventriculaire capture zodra rate, output en sensitiviteit goed zijn ingesteld.',
                alarmText: 'Capture bereikt – houd VVI-pacing aan',
                feedback:
                    'Het gepacede ritme is stabiel op de gekozen rate; elke pacingspike wordt gevolgd door een QRS-complex en een verbeterde bloeddruk.'
            }
        }
    },
    M2: {
        title: 'M2 · Capture-drempeltest',
        description: 'Bepaal de ventriculaire capture-drempel en programmeer een passende veiligheidsmarge.',
        summaryLabel: 'Capture-drempel testen',
        primaryRhythm: 'Sinusritme met ventriculaire pacing',
        location: 'IC',
        pacingMode: 'VVI (demand)',
        alarmText: 'Begin drempeltest – rate boven intrinsiek',
        objective:
            'Verhoog de VVI-rate boven het intrinsieke ritme, verlaag de output langzaam om de minimale output met consequente capture te vinden en programmeer daarna een 2–3× veiligheidsmarge.',
        feedback:
            'Stel de rate in op ≥70 ppm, verlaag de output tot capture verloren gaat en verhoog daarna tot elke spike opnieuw capture geeft. Gebruik die waarde als drempel en programmeer 2–3× hoger.',
        rules: {
            'uc02-loss-of-capture-during-test': {
                description: 'Tijdens de drempelzoektocht is de output te laag en gaat capture verloren.',
                alarmText: 'Geen capture – verhoog output langzaam',
                feedback:
                    'Je zit onder de capture-drempel. Verhoog de output in kleine stappen tot iedere pacingspike een QRS-complex geeft.'
            },
            'uc02-threshold-found-no-margin': {
                description: 'Output staat op de drempel zonder veiligheidsmarge.',
                alarmText: 'Output op drempel – voeg veiligheidsmarge toe',
                feedback:
                    'Je hebt de drempel gevonden, maar verhoog de output tot ongeveer 2–3× deze waarde om duurzame capture te garanderen.'
            },
            'uc02-safe-final-output': {
                description: 'Stabiele capture met ingestelde veiligheidsmarge.',
                alarmText: 'Stabiele capture – drempel en marge ingesteld',
                feedback:
                    'Alle slagen worden gepacet op de geprogrammeerde rate en elke spike geeft een QRS. De output biedt een veilige marge boven de drempel.'
            }
        }
    },
    M3: {
        title: 'M3 · Sensing & undersensing',
        description: 'Bepaal de ventriculaire sensing-drempel en corrigeer undersensing.',
        summaryLabel: 'Sensitiviteitsdrempel en undersensing',
        primaryRhythm: 'Intrinsiek sinusritme met intermitterende pacing',
        location: 'IC',
        pacingMode: 'VVI (demand)',
        alarmText: 'Stel rate onder intrinsiek en minimaliseer output',
        objective:
            'Stel de rate onder het intrinsieke ritme en minimaliseer de output; pas vervolgens de sensitiviteit aan om de sensing-drempel te vinden, undersensing te herkennen en een veilige instelling te programmeren.',
        feedback:
            'Zet de rate op 40–60 ppm en de output heel laag (bijvoorbeeld 0,1–1 mA). Pas de sensitiviteit aan zodat intrinsieke R-toppen betrouwbaar worden gedetecteerd en pacing wordt geremd wanneer er een intrinsieke QRS is.',
        rules: {
            'uc03-undersensing': {
                description:
                    'Undersensing: de pacemaker pacet ondanks intrinsieke QRS-complexen omdat de sensitiviteit (mV) te hoog staat (te ongevoelig).',
                alarmText: 'Undersensing – verhoog gevoeligheid (lager mV)',
                feedback:
                    'Je ziet pacingspikes op intrinsieke QRS-complexen en het SENSE-lampje knippert niet betrouwbaar. Verlaag de mV-waarde tot alle R-toppen worden gedetecteerd.'
            },
            'uc03-optimal-sensing': {
                description: 'Intrinsiek ritme wordt betrouwbaar gedetecteerd en pacing wordt terecht geremd.',
                alarmText: 'Sensingdrempel ingesteld – pacing correct geremd',
                feedback:
                    'Het SENSE-lampje knippert bij elke intrinsieke QRS en pacing stopt zodra een intrinsieke beat optreedt. De gevoeligheid staat binnen een veilige marge.'
            }
        }
    },
    M4: {
        title: 'M4 · Oversensing & inhibitie',
        description: 'Herken oversensing dat pacing onterecht remt en corrigeer dit.',
        summaryLabel: 'Oversensing en pauzes',
        primaryRhythm: 'Bradycardie met gepacede ondersteuning',
        location: 'IC',
        pacingMode: 'VVI (demand)',
        alarmText: 'Oversensing – lange pauzes door pacingremming',
        objective:
            'Identificeer oversensing (bijvoorbeeld T-toppen, ruis of far-field signalen) die pacing onterecht remt en corrigeer dit door de sensitiviteit te verlagen (mV verhogen) zonder undersensing te veroorzaken.',
        feedback:
            'Bij te lage sensitiviteit (klein mV) reageert het SENSE-lampje op ruis of T-toppen en wordt pacing geremd, wat pauzes geeft. Verhoog de mV-instelling tot alleen echte R-toppen worden gezien en pacing hervat wanneer nodig.',
        rules: {
            'uc04-oversensing-active': {
                description: 'Oversensing door te hoge gevoeligheid (laag mV) leidt tot bradycarde pauzes.',
                alarmText: 'Oversensing – pacing onterecht geremd',
                feedback:
                    'Het SENSE-lampje knippert vaak zonder echte QRS en pacingspikes blijven uit, waardoor lange pauzes ontstaan. Verhoog de mV-instelling tot oversensing verdwijnt.'
            },
            'uc04-resolved-oversensing': {
                description: 'Oversensing verholpen; pacing ondersteunt patiënt weer zonder undersensing.',
                alarmText: 'Oversensing verholpen – pacing passend',
                feedback:
                    'Het SENSE-lampje reageert alleen op echte QRS-complexen en pacing treedt op wanneer intrinsieke slagen ontbreken. Hartslag en bloeddruk verbeteren.'
            }
        }
    },
    M5: {
        title: 'M5 · Drempelverschuiving & LOC',
        description: 'Herken evoluerend verlies van capture en stel de output opnieuw af na drempelverschuiving of leadproblemen.',
        summaryLabel: 'Drempelverschuiving en loss of capture',
        primaryRhythm: 'Ventriculaire pacing met evoluerend captureverlies',
        location: 'IC',
        pacingMode: 'VVI (demand)',
        alarmText: 'Intermitterend captureverlies – beoordeel drempel',
        objective:
            'Herken intermitterend captureverlies door verhoogde drempel of leadproblemen, bepaal de capture-drempel opnieuw en verhoog de output om stabiele capture te herstellen.',
        feedback:
            'Voorheen stabiele pacing valt nu af en toe uit. Herhaal een capture-drempeltest en verhoog de output om opnieuw consequente capture te krijgen; drempels kunnen in de tijd veranderen.',
        rules: {
            'uc05-complete-loss-of-capture': {
                description: 'Output is ver onder de nieuwe drempel, waardoor volledige loss of capture optreedt.',
                alarmText: 'Volledig captureverlies – verhoog direct output',
                feedback:
                    'Er volgen geen QRS-complexen na pacingspikes. Verhoog de output en bepaal de drempel opnieuw. Overweeg leadpositie als zeer hoge outputs nodig zijn.'
            },
            'uc05-intermittent-loss-of-capture': {
                description: 'Output zit dicht bij de nieuwe drempel, wat intermitterend captureverlies geeft.',
                alarmText: 'Intermitterende capture – vergroot veiligheidsmarge',
                feedback:
                    'Sommige pacingspikes geven capture en andere niet. Verhoog de output om opnieuw een 2–3× veiligheidsmarge boven de nieuwe drempel te creëren.'
            },
            'uc05-restored-stable-capture': {
                description: 'Output voldoende verhoogd, capture hersteld met veiligheidsmarge.',
                alarmText: 'Stabiele capture – monitor op verdere veranderingen',
                feedback:
                    'Alle pacingspikes geven weer QRS-complexen. Blijf monitoren op drempelveranderingen en beoordeel de lead als ongewoon hoge outputs nodig zijn.'
            }
        }
    },
    M6: {
        title: 'M6 · PVC’s & PAC’s in VVI',
        description: 'Herken PVC’s en PAC’s op het ECG tijdens VVI-pacing en begrijp hun effect op pacingtiming.',
        summaryLabel: 'Ectopieherkenning tijdens pacing',
        primaryRhythm: 'Ventriculaire pacing met PVC’s en PAC’s',
        location: 'Telemetrie',
        pacingMode: 'VVI (demand)',
        alarmText: 'Geïsoleerde PVC’s en PAC’s – observeren',
        objective:
            'Herken PVC’s en PAC’s op een gepacede ECG en leg uit hoe deze ectopische slagen ventriculaire pacing resetten of remmen zonder dit te verwarren met pacemakerstoringen.',
        feedback:
            'Bij passende VVI-instellingen zie je een gepaced ritme onderbroken door af en toe een PVC of PAC. Herken hun morfologie en timingeffecten zonder onnodige parameterwijzigingen.',
        rules: {
            'uc06-appropriate-settings-with-ectopy': {
                description: 'Pacemaker correct geprogrammeerd; ectopie aanwezig maar device functioneert normaal.',
                alarmText: 'Ectopie aanwezig – pacemaker werkt normaal',
                feedback:
                    'Je ziet gepacede slagen met af en toe een PVC of PAC. De timing van pacingspikes past zich aan op gesensde slagen zoals verwacht; parameterwijzigingen zijn niet nodig.'
            }
        }
    },
    M7: {
        title: 'M7 · Brede vs smalle QRS',
        description: 'Onderscheid intrinsieke smalle QRS-complexen van brede QRS-pacingslagen en PVC’s.',
        summaryLabel: 'Interpretatie van QRS-morfologie',
        primaryRhythm: 'Gemengde intrinsieke en gepacede slagen',
        location: 'Telemetrie',
        pacingMode: 'VVI (demand)',
        alarmText: 'Interpreteer QRS-morfologie – geen directe interventie',
        objective:
            'Maak onderscheid tussen intrinsieke smalle QRS-complexen, brede QRS-pacingslagen en PVC’s op het ECG, en begrijp dat een brede QRS verwacht is bij ventriculaire pacing.',
        feedback:
            'Identificeer welke complexen intrinsiek zijn (smalle QRS), welke ventriculair gepaced zijn (brede QRS na een pacingspike) en welke PVC’s zijn (breed, prematuur zonder voorafgaande pacingspike). Zie normale gepacede morfologie niet als storing.',
        rules: {
            'uc07-correct-interpretation-parameters': {
                description:
                    'Pacemaker correct geprogrammeerd; scenario richt zich op ECG-interpretatie in plaats van parameteraanpassing.',
                alarmText: 'Parameters acceptabel – focus op morfologie',
                feedback:
                    'Pacemakerparameters zijn binnen normale grenzen. Focus op het onderscheiden van intrinsieke smalle QRS, brede gepacede QRS en PVC’s op basis van morfologie en aanwezigheid van pacingspikes.'
            }
        }
    },
    C1: {
        title: 'C1 · Derdegraads AV-blok',
        description: 'Placeholder-casus voor totaal AV-blok met minimale begeleiding.',
        summaryLabel: 'Compleet hartblok, beperkte begeleiding',
        primaryRhythm: 'Derdegraads atrioventriculair blok',
        location: 'Telemetrie',
        pacingMode: 'VVI (demand)',
        alarmText: 'Compleet hartblok – stabiliseer patiënt',
        objective:
            'Stabiliseer een patiënt met compleet hartblok door betrouwbare ventriculaire pacing en verbetering van perfusie te realiseren.',
        feedback:
            'Zoek naar gedissocieerde P-toppen met een traag ventriculair escape-ritme. Start pacing met passende rate en output en beoordeel de perfusie opnieuw.'
    },
    C2: {
        title: 'C2 · Tweedegraads AV-blok (Mobitz II)',
        description:
            'Intermitterende niet-geleide P-toppen met plots uitvallende QRS-complexen; tijdelijke waveform tot patroon is uitgewerkt.',
        summaryLabel: 'Mobitz II met intermitterende ventriculaire pauzes',
        primaryRhythm: 'Tweedegraads AV-blok, Mobitz II',
        location: 'Telemetrie',
        pacingMode: 'DDD',
        alarmText: 'Mobitz II-blok – verwacht progressie',
        objective:
            'Herken intermitterende niet-geleide P-toppen die plotselinge ventriculaire pauzes veroorzaken en wees klaar om de perfusie zo nodig met pacing te ondersteunen.',
        feedback:
            'Let op constante PR-intervallen met onverwachte uitval van QRS-complexen. Bereid je voor om te pacen als de perfusie verslechtert of pauzes langer worden.'
    },
    C3: {
        title: 'C3 · Sick-sinussyndroom',
        description: 'Sinusknoopdisfunctie met ongepaste bradycardie en pauzes; waveform wordt later verfijnd.',
        summaryLabel: 'Sinusknoopdisfunctie met lange pauzes',
        primaryRhythm: 'Sick-sinussyndroom',
        location: 'Telemetrie',
        pacingMode: 'AAI',
        alarmText: 'Sinuspauzes – beoordeel pacingbehoefte',
        objective:
            'Beoordeel symptomatische bradycardie door sinuspauzes en start pacing om de cardiac output zo nodig te behouden.',
        feedback:
            'Herken verlengde sinuspauzes met trage escape-slagen. Overweeg atriale of tweekamerpacing om perfusiedalingen te voorkomen.'
    },
    C4: {
        title: 'C4 · Trage geleiding',
        description:
            'Sterk vertraagde AV-geleiding met lage ventriculaire respons; tijdelijke waveform tot definitieve tracing.',
        summaryLabel: 'Trage geleiding met lage ventriculaire respons',
        primaryRhythm: 'Ernstige eerstegraads blok/trage ventriculaire geleiding',
        location: 'IC',
        pacingMode: 'DDI',
        alarmText: 'Trage ventriculaire respons',
        objective:
            'Beheer een patiënt met sterk vertraagde geleiding door pacingondersteuning te optimaliseren als de trage ventriculaire respons de perfusie ondermijnt.',
        feedback:
            'Let op zeer langdurige geleidingstijden en lage ventriculaire frequentie. Verhoog de pacingondersteuning om adequate cardiac output te behouden als er symptomen ontstaan.'
    },
    M8: {
        title: 'M8 · Willekeurige modus',
        description:
            'Gemengd scenario dat elementen van eerdere casussen combineert met willekeurige ritme-, sensing- en capturepatronen.',
        summaryLabel: 'Gemengde willekeurige casus',
        primaryRhythm: 'Gemengde intrinsieke, gepacede en ectopische slagen',
        location: 'IC',
        pacingMode: 'VVI (demand)',
        alarmText: 'Willekeurige casus – bepaal hoofdprobleem',
        objective:
            'Combineer alle pacingvaardigheden om te beslissen of pacing passend is of faalt en bepaal de juiste interventie, of herken wanneer geen aanpassing nodig is.',
        feedback:
            'Begin met het interpreteren van het ECG en het gedrag van de PACE- en SENSE-indicatoren. Pas rate, output en sensitiviteit alleen aan bij duidelijke undersensing, oversensing of captureverlies. Deze casus is bewust open.'
    }
};

function withTranslatedAlarm(alarm, alarmText) {
    if (!alarm) return null;
    return { ...alarm, text: alarmText ?? alarm.text };
}

function localizeRule(rule, scenarioTranslations, language) {
    if (language !== 'nl' || !scenarioTranslations?.rules?.[rule.id]) {
        return { ...rule };
    }

    const overrides = scenarioTranslations.rules[rule.id];
    const effects = rule.effects ? { ...rule.effects } : undefined;

    if (effects?.alarm || overrides?.alarmText) {
        effects.alarm = withTranslatedAlarm(effects?.alarm, overrides?.alarmText ?? effects?.alarm?.text);
    }

    if (effects && overrides?.feedback) {
        effects.feedback = overrides.feedback;
    }

    return {
        ...rule,
        description: overrides.description ?? rule.description,
        effects
    };
}

function localizeScenario(scenario, language = getCurrentLanguage()) {
    if (!scenario) return null;
    const normalizedLanguage = language === 'nl' ? 'nl' : 'en';
    if (normalizedLanguage !== 'nl') {
        return { ...scenario };
    }

    const translation = SCENARIO_TRANSLATIONS[scenario.id];
    if (!translation) return { ...scenario };

    const localized = {
        ...scenario,
        pacing: scenario.pacing ? { ...scenario.pacing } : undefined
    };

    const keys = ['title', 'description', 'summaryLabel', 'primaryRhythm', 'location', 'objective', 'feedback'];
    keys.forEach((key) => {
        if (translation[key]) {
            localized[key] = translation[key];
        }
    });

    if (localized.pacing && translation.pacingMode) {
        localized.pacing.mode = translation.pacingMode;
    }

    if (localized.alarm || translation.alarmText) {
        localized.alarm = withTranslatedAlarm(localized.alarm, translation.alarmText ?? localized.alarm?.text);
    }

    if (Array.isArray(localized.rules) && localized.rules.length) {
        localized.rules = localized.rules.map((rule) => localizeRule(rule, translation, normalizedLanguage));
    }

    return localized;
}

function localizeScenarioList(scenarios, language = getCurrentLanguage()) {
    return (scenarios || []).map((scenario) => localizeScenario(scenario, language)).filter(Boolean);
}

export { SCENARIO_TRANSLATIONS, localizeScenario, localizeScenarioList };
