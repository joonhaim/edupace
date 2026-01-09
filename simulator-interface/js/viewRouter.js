import { getCurrentLanguage, translateKey } from './languageToggle.js';

const viewStack = new Map(
    Array.from(document.querySelectorAll('.view')).map((view) => [view.dataset.view, view])
);

const globalTitle = document.querySelector('[data-global-title]');
const globalSubtitle = document.querySelector('[data-global-subtitle]');
const globalSearch = document.querySelector('[data-global-search]');
const globalSettingsToggle = document.querySelector('[data-global-settings-toggle]');

let activeView = null;
const pageClasses = ['page-home', 'page-training', 'page-training-draft', 'page-logs', 'page-instructions'];

function setActiveNav(targetView) {
    const navLinks = document.querySelectorAll('[data-view-target]');
    navLinks.forEach((link) => {
        const isActive = link.dataset.viewTarget === targetView;
        link.classList.toggle('active', isActive);
        if (isActive) {
            link.setAttribute('aria-current', 'page');
        } else {
            link.removeAttribute('aria-current');
        }
    });
}

function updateGlobalHeader(targetView) {
    const view = viewStack.get(targetView);
    if (!view) return;

    const language = getCurrentLanguage();
    const titleKey = view.dataset.titleKey || `nav.${targetView}`;
    const subtitleKey = view.dataset.subtitleKey || '';

    if (globalTitle) {
        globalTitle.textContent = translateKey(titleKey, language);
    }

    if (globalSubtitle) {
        const subtitle = subtitleKey ? translateKey(subtitleKey, language) : '';
        globalSubtitle.textContent = subtitle;
        globalSubtitle.hidden = !subtitle;
    }

    if (globalSearch) {
        const showSearch = view.dataset.showSearch !== 'false';
        globalSearch.hidden = !showSearch;
    }

    if (globalSettingsToggle) {
        const showSettings = view.dataset.showSettings === 'true';
        globalSettingsToggle.hidden = !showSettings;
    }
}

function showView(targetView) {
    if (!viewStack.has(targetView)) return;

    viewStack.forEach((view, key) => {
        const isActive = key === targetView;
        view.hidden = !isActive;
        view.classList.toggle('is-active', isActive);
    });

    document.body.classList.remove(...pageClasses);
    document.body.classList.add(`page-${targetView}`);

    setActiveNav(targetView);
    activeView = targetView;
    updateGlobalHeader(targetView);
    history.replaceState(null, '', `#${targetView}`);

    document.dispatchEvent(
        new CustomEvent('edupace:view-change', {
            detail: { view: targetView }
        })
    );
}

function handleNav(event) {
    const trigger = event.target.closest('[data-view-target]');
    if (!trigger) return;

    const targetView = trigger.dataset.viewTarget;
    if (!targetView || !viewStack.has(targetView)) return;

    event.preventDefault();
    showView(targetView);

    const activeMain = viewStack.get(targetView)?.querySelector('main, section, .workspace');
    activeMain?.focus?.({ preventScroll: true });
}

function initViewRouter() {
    document.addEventListener('click', handleNav);

    const initialView = location.hash?.replace('#', '') || 'home';
    const startingView = viewStack.has(initialView) ? initialView : 'home';
    showView(startingView);

    document.addEventListener('edupace:language-changed', () => {
        updateGlobalHeader(activeView || startingView);
    });
}

initViewRouter();
