const THEME_KEY = 'edupace-theme';

function applyTheme(theme) {
    const body = document.body;
    const isDark = theme === 'dark';

    body.classList.toggle('simulation-dark', isDark);
    body.classList.toggle('simulation-light', !isDark);

    const toggles = document.querySelectorAll('[data-theme-toggle]');
    toggles.forEach((toggle) => {
        toggle.textContent = isDark ? 'Dark mode' : 'Light mode';
        toggle.setAttribute('aria-pressed', String(isDark));
    });

    const metaTheme = document.querySelector('meta[name="theme-color"]');
    if (metaTheme) {
        metaTheme.setAttribute('content', isDark ? '#0c1422' : '#f5f7fa');
    }
}

function initThemeToggle() {
    const savedTheme = localStorage.getItem(THEME_KEY);
    const initialTheme = savedTheme || 'dark';

    applyTheme(initialTheme);

    const toggles = document.querySelectorAll('[data-theme-toggle]');
    if (!toggles.length) return;

    toggles.forEach((toggle) => {
        toggle.addEventListener('click', () => {
            const nextTheme = document.body.classList.contains('simulation-dark') ? 'light' : 'dark';
            applyTheme(nextTheme);
            localStorage.setItem(THEME_KEY, nextTheme);
        });
    });
}

export { initThemeToggle };
