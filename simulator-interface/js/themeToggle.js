const THEME_KEY = 'edupace-theme';
const THEME_ICONS = {
    dark: 'assets/icons/theme-dark.svg',
    light: 'assets/icons/theme-light.svg'
};
const SETTINGS_ICONS = {
    dark: 'assets/icons/settings-dark.svg',
    light: 'assets/icons/settings.svg'
};

function applyTheme(theme) {
    const body = document.body;
    const isDark = theme === 'dark';

    body.classList.toggle('simulation-dark', isDark);
    body.classList.toggle('simulation-light', !isDark);

    const toggles = document.querySelectorAll('[data-theme-toggle]');
    toggles.forEach((toggle) => {
        const icon = toggle.querySelector('[data-theme-icon]');
        if (icon) {
            const iconPath = isDark ? THEME_ICONS.dark : THEME_ICONS.light;
            icon.setAttribute('src', iconPath);
        }

        toggle.setAttribute('aria-pressed', String(isDark));
        toggle.setAttribute('aria-label', isDark ? 'Switch to light mode' : 'Switch to dark mode');
    });

    const metaTheme = document.querySelector('meta[name="theme-color"]');
    if (metaTheme) {
        metaTheme.setAttribute('content', isDark ? '#0c1422' : '#f5f7fa');
    }

    const settingsIcons = document.querySelectorAll('[data-settings-icon]');
    settingsIcons.forEach((icon) => {
        const iconPath = isDark ? SETTINGS_ICONS.dark : SETTINGS_ICONS.light;
        icon.setAttribute('src', iconPath);
    });
}

function initThemeToggle() {
    const savedTheme = localStorage.getItem(THEME_KEY);
    const initialTheme = savedTheme || 'light';

    applyTheme(initialTheme);

    const bindToggles = (toggleElements) => {
        toggleElements.forEach((toggle) => {
            if (toggle.dataset.themeBound === 'true') return;

            toggle.dataset.themeBound = 'true';
            toggle.addEventListener('click', () => {
                const nextTheme = document.body.classList.contains('simulation-dark') ? 'light' : 'dark';
                applyTheme(nextTheme);
                localStorage.setItem(THEME_KEY, nextTheme);
            });
        });

        applyTheme(document.body.classList.contains('simulation-dark') ? 'dark' : 'light');
    };

    const toggles = Array.from(document.querySelectorAll('[data-theme-toggle]'));

    if (toggles.length) {
        bindToggles(toggles);
    } else {
        const observer = new MutationObserver(() => {
            const discovered = Array.from(document.querySelectorAll('[data-theme-toggle]'));
            if (discovered.length) {
                bindToggles(discovered);
                observer.disconnect();
            }
        });

        observer.observe(document.body, { childList: true, subtree: true });
    }
}

export { initThemeToggle };
