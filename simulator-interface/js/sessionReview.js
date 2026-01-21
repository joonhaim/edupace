import { translateKey } from './languageToggle.js';

const reviewElements = {
    modal: document.getElementById('sessionReviewModal'),
    overlay: document.getElementById('sessionReviewOverlay'),
    closeBtn: document.getElementById('sessionReviewClose'),
    doneBtn: document.getElementById('sessionReviewDone'),
    scenario: document.getElementById('sessionReviewScenario'),
    status: document.getElementById('sessionReviewStatus'),
    stabilizedValue: document.getElementById('sessionReviewStabilizedValue'),
    timeRow: document.getElementById('sessionReviewTimeRow'),
    timeValue: document.getElementById('sessionReviewTimeValue')
};

function formatDuration(seconds) {
    if (!Number.isFinite(seconds) || seconds < 0) return translateKey('review.timeUnknown');
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const remaining = seconds % 60;
    return remaining ? `${minutes}m ${remaining}s` : `${minutes}m`;
}

function setVisibility(isVisible) {
    const visible = Boolean(isVisible);
    reviewElements.modal?.classList.toggle('is-visible', visible);
    reviewElements.modal?.setAttribute('aria-hidden', String(!visible));
    if (reviewElements.overlay) {
        reviewElements.overlay.hidden = !visible;
    }
}

function closeSessionReview() {
    setVisibility(false);
}

function openSessionReview(summary) {
    if (!reviewElements.modal) return;
    const scenarioTitle = summary?.scenarioTitle ?? translateKey('logs.unknownScenario');
    const stabilized =
        typeof summary?.stabilized === 'boolean'
            ? summary.stabilized
            : null;
    const stabilizationSeconds = Number(summary?.stabilizationSeconds);

    if (reviewElements.scenario) {
        reviewElements.scenario.textContent = scenarioTitle;
    }

    if (reviewElements.status) {
        const statusKey = stabilized === null
            ? 'review.status.unknown'
            : stabilized
                ? 'review.status.stable'
                : 'review.status.unstable';
        reviewElements.status.textContent = translateKey(statusKey);
        reviewElements.status.dataset.status =
            stabilized === null ? 'unknown' : stabilized ? 'stable' : 'unstable';
    }

    if (reviewElements.stabilizedValue) {
        reviewElements.stabilizedValue.textContent = stabilized === null
            ? '—'
            : translateKey(stabilized ? 'review.stabilized.yes' : 'review.stabilized.no');
    }

    if (reviewElements.timeRow && reviewElements.timeValue) {
        if (stabilized === true && Number.isFinite(stabilizationSeconds)) {
            reviewElements.timeRow.hidden = false;
            reviewElements.timeValue.textContent = formatDuration(stabilizationSeconds);
        } else {
            reviewElements.timeRow.hidden = true;
            reviewElements.timeValue.textContent = translateKey('review.timeUnknown');
        }
    }

    setVisibility(true);
}

function initSessionReview() {
    if (!reviewElements.modal) return;
    reviewElements.closeBtn?.addEventListener('click', closeSessionReview);
    reviewElements.doneBtn?.addEventListener('click', closeSessionReview);
    reviewElements.overlay?.addEventListener('click', closeSessionReview);
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && reviewElements.modal?.classList.contains('is-visible')) {
            closeSessionReview();
        }
    });
}

export { initSessionReview, openSessionReview };
