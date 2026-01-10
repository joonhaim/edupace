import { getCurrentLanguage } from './languageToggle.js';

const SCENARIO_TRANSLATIONS = {
    NSR: {
        title: 'Normaal sinusritme',
        description: 'Stabiel intrinsiek ritme met normale geleiding.',
        summaryLabel: 'Normaal sinusritme'
    },
    AV3: {
        title: 'Derdegraads AV-blok',
        description: 'Compleet AV-blok met ventriculair escape-ritme.',
        summaryLabel: 'Compleet hartblok'
    }
};

function localizeScenario(scenario, language = getCurrentLanguage()) {
    if (!scenario) return null;
    const normalizedLanguage = language === 'nl' ? 'nl' : 'en';
    if (normalizedLanguage !== 'nl') {
        return { ...scenario };
    }

    const translation = SCENARIO_TRANSLATIONS[scenario.id];
    if (!translation) return { ...scenario };

    const localized = {
        ...scenario
    };

    const keys = ['title', 'description', 'summaryLabel'];
    keys.forEach((key) => {
        if (translation[key]) {
            localized[key] = translation[key];
        }
    });

    return localized;
}

function localizeScenarioList(scenarios, language = getCurrentLanguage()) {
    return (scenarios || []).map((scenario) => localizeScenario(scenario, language)).filter(Boolean);
}

export { SCENARIO_TRANSLATIONS, localizeScenario, localizeScenarioList };
