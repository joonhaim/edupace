const viewStack = new Map(
    Array.from(document.querySelectorAll('.view')).map((view) => [view.dataset.view, view])
);

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

function showView(targetView) {
    if (!viewStack.has(targetView)) return;

    viewStack.forEach((view, key) => {
        const isActive = key === targetView;
        view.hidden = !isActive;
        view.classList.toggle('is-active', isActive);
    });

    setActiveNav(targetView);
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
    if (viewStack.has(initialView)) {
        showView(initialView);
    } else {
        showView('home');
    }
}

initViewRouter();
