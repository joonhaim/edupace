async function loadPartial(placeholder, partialPath, replacements = {}) {
    if (!placeholder) return;

    try {
        const response = await fetch(partialPath);
        if (!response.ok) {
            throw new Error(`Failed to load partial: ${partialPath}`);
        }

        let html = await response.text();
        Object.entries(replacements).forEach(([token, value]) => {
            html = html.split(token).join(value);
        });

        placeholder.outerHTML = html;
    } catch (error) {
        console.error(error);
    }
}

function getNavReplacements(activePage) {
    return {
        '{{ACTIVE_HOME}}': activePage === 'home' ? ' active' : '',
        '{{ACTIVE_SIMULATION}}': activePage === 'simulation' ? ' active' : '',
        '{{ACTIVE_INSTRUCTIONS}}': activePage === 'instructions' ? ' active' : ''
    };
}

function initPartials() {
    const navPlaceholder = document.querySelector('[data-partial="nav"]');
    if (navPlaceholder) {
        const activePage = navPlaceholder.getAttribute('data-active-page');
        const replacements = getNavReplacements(activePage);
        loadPartial(navPlaceholder, 'partials/nav.html', replacements);
    }

    const footerPlaceholder = document.querySelector('[data-partial="footer"]');
    if (footerPlaceholder) {
        loadPartial(footerPlaceholder, 'partials/footer.html');
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initPartials);
} else {
    initPartials();
}