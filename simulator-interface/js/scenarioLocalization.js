import { getCurrentLanguage } from './languageToggle.js';

const SCENARIO_TRANSLATIONS = {
    NSR: {
        title: 'Normaal sinusritme',
        description: 'Stabiel intrinsiek ritme met normale geleiding.',
        summaryLabel: 'Normaal sinusritme',
        objective: 'Houd de patiënt stabiel zonder onnodige pacing.',
        feedback: '✅ Patiënt stabiel — intrinsiek ritme is voldoende, pacing niet nodig\n⚠️ Onnodige pacing gedetecteerd — verlaag RATE of OUTPUT\n❌ Patiënt instabiel — pacing verstoort het intrinsieke ritme',
        feedbackStatus: {
            stable: '✅ Patiënt stabiel — intrinsiek ritme is voldoende, pacing niet nodig',
            partial: '⚠️ Onnodige pacing gedetecteerd — verlaag RATE of OUTPUT',
            unstable: '❌ Patiënt instabiel — pacing verstoort het intrinsieke ritme'
        }
    },
    AV3: {
        title: 'Derdegraads AV-blok',
        description: 'Compleet AV-blok met ventriculair escape-ritme.',
        summaryLabel: 'Derdegraads AV-blok',
        objective: 'Stabiliseer de patiënt door effectieve ventriculaire pacing te starten.',
        feedback: '✅ Patiënt gestabiliseerd — effectieve ventriculaire pacing actief\n⚠️ Gedeeltelijke stabilisatie — controleer capture of RATE\n❌ Patiënt instabiel — ventriculaire pacing onvoldoende',
        feedbackStatus: {
            stable: '✅ Patiënt gestabiliseerd — effectieve ventriculaire pacing actief',
            partial: '⚠️ Gedeeltelijke stabilisatie — controleer capture of RATE',
            unstable: '❌ Patiënt instabiel — ventriculaire pacing onvoldoende'
        }
    },
    Mobitz2: {
        title: 'Tweedegraads AV-blok (Mobitz II)',
        description: 'Intermitterend uitvallende ventriculaire slagen met vaste PR-interval.',
        summaryLabel: 'Tweedegraads AV-blok (Mobitz II)',
        objective: 'Voorkom instabiliteit door te pacen tijdens intermitterende geleidingsuitval.',
        feedback: '✅ Patiënt gestabiliseerd — pacing voorkomt uitvallende slagen\n⚠️ Instabiliteit blijft — er zijn nog pauzes\n❌ Patiënt instabiel — pacing voorkomt pauzes onvoldoende',
        feedbackStatus: {
            stable: '✅ Patiënt gestabiliseerd — pacing voorkomt uitvallende slagen',
            partial: '⚠️ Instabiliteit blijft — er zijn nog pauzes',
            unstable: '❌ Patiënt instabiel — pacing voorkomt pauzes onvoldoende'
        }
    },
    SlowConduction: {
        title: 'Vertraagde geleiding',
        description: 'Vertraagde ventriculaire geleiding met verlengde intervallen.',
        summaryLabel: 'Vertraagde geleiding',
        objective: 'Behoud voldoende hartminuutvolume ondanks vertraagde ventriculaire geleiding.',
        feedback: '✅ Patiënt gestabiliseerd — pacing compenseert vertraagde geleiding\n⚠️ Suboptimale ondersteuning — capture is inconsistent\n❌ Patiënt instabiel — vertraagde geleiding niet voldoende onder controle',
        feedbackStatus: {
            stable: '✅ Patiënt gestabiliseerd — pacing compenseert vertraagde geleiding',
            partial: '⚠️ Suboptimale ondersteuning — capture is inconsistent',
            unstable: '❌ Patiënt instabiel — vertraagde geleiding niet voldoende onder controle'
        }
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

    const keys = ['title', 'description', 'summaryLabel', 'objective', 'feedback'];
    keys.forEach((key) => {
        if (translation[key]) {
            localized[key] = translation[key];
        }
    });

    if (translation.feedbackStatus) {
        localized.feedbackStatus = { ...translation.feedbackStatus };
    }

    return localized;
}

function localizeScenarioList(scenarios, language = getCurrentLanguage()) {
    return (scenarios || []).map((scenario) => localizeScenario(scenario, language)).filter(Boolean);
}

export { SCENARIO_TRANSLATIONS, localizeScenario, localizeScenarioList };
