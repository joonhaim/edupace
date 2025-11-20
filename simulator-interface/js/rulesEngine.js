const rulesState = {
    scenario: null,
    parameters: {
        rate: null,
        output: null,
        sensitivity: null
    },
    lastEffectsKey: ''
};

function initRulesEngine() {
    window.addEventListener('edupace-scenario-change', (event) => {
        rulesState.scenario = event.detail;
        rulesState.lastEffectsKey = '';
        evaluateRules();
    });

    window.addEventListener('edupace-parameters', (event) => {
        Object.assign(rulesState.parameters, event.detail ?? {});
        evaluateRules();
    });
}

function evaluateRules() {
    const scenario = rulesState.scenario;
    if (!scenario) {
        return;
    }

    const { rate, output, sensitivity } = rulesState.parameters;
    let matchedEffects = {};

    if (scenario.rules && Array.isArray(scenario.rules)) {
        matchedEffects = scenario.rules.find((rule) => ruleMatches(rule, { rate, output, sensitivity }))?.effects ?? {};
    }

    const effectsKey = JSON.stringify(matchedEffects);
    if (effectsKey === rulesState.lastEffectsKey) {
        return;
    }
    rulesState.lastEffectsKey = effectsKey;

    window.dispatchEvent(
        new CustomEvent('edupace-rule-effects', {
            detail: {
                scenarioId: scenario.id,
                effects: matchedEffects
            }
        })
    );
}

function ruleMatches(rule, parameters) {
    if (!rule || !rule.condition) {
        return false;
    }

    const { rate, output, sensitivity } = parameters;
    const condition = rule.condition;

    return (
        matchesRange(condition.rate, rate) &&
        matchesRange(condition.output, output) &&
        matchesRange(condition.sensitivity, sensitivity)
    );
}

function matchesRange(range, value) {
    if (!range) {
        return true;
    }
    if (value === null || value === undefined) {
        return false;
    }

    const [min, max] = range;
    const lowerBound = Number.isFinite(min) ? min : -Infinity;
    const upperBound = Number.isFinite(max) ? max : Infinity;
    return value >= lowerBound && value <= upperBound;
}

export { initRulesEngine };