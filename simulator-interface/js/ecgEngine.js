

function handlePointerDown(event) {
    if (!canvas) return;
    event.preventDefault();
    const { x } = getPointerPosition(event);

    if (!isPaused) {
        isPaused = true;
        caliper = null;
        pendingCaliper = null;
        ignoreNextPointerUp = true;
        draw();
        return;
    }

    pendingCaliper = {
        startX: x,
        endX: x,
        active: false
    };
}

function handlePointerMove(event) {
    if (!isPaused || !pendingCaliper) return;

    event.preventDefault();
    const { x } = getPointerPosition(event);
    if (!pendingCaliper.active) {
        pendingCaliper.active = Math.abs(x - pendingCaliper.startX) > 4;
    }
    if (pendingCaliper.active) {
        const maxWidth = canvas?.width || canvas?.clientWidth || 0;
        pendingCaliper.endX = clamp(x, 0, maxWidth);
        draw();
    }
}

function handlePointerUp(event) {
    if (!isPaused) return;

    event?.preventDefault();

    if (ignoreNextPointerUp) {
        ignoreNextPointerUp = false;
        return;
    }

    if (pendingCaliper && pendingCaliper.active) {
        caliper = { ...pendingCaliper };
        pendingCaliper = null;
        draw();
        return;
    }

    pendingCaliper = null;
    caliper = null;
    isPaused = false;
}

function getPointerPosition(event) {
    const rect = canvas.getBoundingClientRect();
    return {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top
    };
}

function drawCaliper(width, height) {
    const activeCaliper = pendingCaliper?.active ? pendingCaliper : caliper;
    if (!isPaused || !activeCaliper || !ctx) return;

    const start = Math.max(0, Math.min(width, activeCaliper.startX));
    const end = Math.max(0, Math.min(width, activeCaliper.endX));
    const left = Math.min(start, end);
    const right = Math.max(start, end);
    const midY = height * 0.15;

    ctx.save();
    ctx.strokeStyle = '#f97316';
    ctx.fillStyle = 'rgba(249, 115, 22, 0.8)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 4]);

    ctx.beginPath();
    ctx.moveTo(left, 0);
    ctx.lineTo(left, height);
    ctx.moveTo(right, 0);
    ctx.lineTo(right, height);
    ctx.stroke();

    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(left, midY);
    ctx.lineTo(right, midY);
    ctx.stroke();

    const diffSeconds = ((right - left) / width) * SECONDS_VISIBLE;
    const diffMs = Math.max(0, diffSeconds * 1000);
    const label = `${diffMs.toFixed(0)} ms`;
    const textX = (left + right) / 2;

    ctx.font = '600 18px "IBM Plex Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText(label, textX, midY - 8);
    ctx.restore();
}

function drawPauseOverlay(width, height) {
    if (!isPaused || !ctx) return;

    ctx.save();
    ctx.fillStyle = 'rgba(2, 6, 23, 0.10)';
    ctx.fillRect(0, 0, width, height);

    ctx.fillStyle = '#f8fafc';
    ctx.textAlign = 'center';
    const mainY = height - 60;   // primary message 60px from bottom
    const subY  = height - 34;   // secondary message 34px from bottom
    ctx.font = '600 20px "Inter", sans-serif';
    ctx.fillText('Telemetry paused', width / 2, mainY);
    ctx.font = '14px "Inter", sans-serif';
    ctx.fillText('Click and drag to place calipers, or tap to resume', width / 2, subY);
    ctx.restore();
}

function gaussian(x, center, width) {
    const sigma = width || 0.01;
    const z = (x - center) / sigma;
    return Math.exp(-0.5 * z * z);
}

function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
}

export { initEcgEngine };
