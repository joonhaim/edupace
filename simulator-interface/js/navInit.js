import { initThemeToggle } from './themeToggle.js';

const LANGUAGE_KEY = 'edupace-language';

const savedLanguage = localStorage.getItem(LANGUAGE_KEY);
if (savedLanguage) {
    document.documentElement.setAttribute('lang', savedLanguage);
}

initThemeToggle();
