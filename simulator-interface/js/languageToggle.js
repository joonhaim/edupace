const LANGUAGE_KEY = 'edupace-language';
const DEFAULT_LANGUAGE = 'en';

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
