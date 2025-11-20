const canvas = document.getElementById('ecgCanvas');
const ctx = canvas?.getContext('2d') ?? null;
const leadLabel = document.getElementById('leadLabel');

const waveformCache = new Map();
let waveformIndex = null;
let activeWaveformId = null;

async function initEcgEngine() {
    if (!canvas || !ctx) {
        return;
    }

    drawGrid();

    window.addEventListener('edupace-scenario-change', (event) => {
        const waveformId = event.detail?.waveformId;
        if (waveformId) {
            setWaveform(waveformId);
        }
    });

    window.addEventListener('edupace-waveform-change', (event) => {
        const waveformId = event.detail?.waveformId;
        if (waveformId) {
            setWaveform(waveformId);
        }
    });
}

async function setWaveform(waveformId) {
    if (!waveformId || waveformId === activeWaveformId) {
        return;
    }

    const waveform = await loadWaveform(waveformId);
    if (!waveform) {
        return;
    }

    activeWaveformId = waveformId;
    renderWaveform(waveform);
    if (leadLabel && waveform.label) {
        leadLabel.textContent = waveform.label;
    }
}

async function loadWaveform(waveformId) {
    if (waveformCache.has(waveformId)) {
        return waveformCache.get(waveformId);
    }

    const index = await loadWaveformIndex();
    const entry = index.get(waveformId);
    if (!entry) {
        console.warn(`Waveform ${waveformId} not found in index`);
        return null;
    }

    const response = await fetch(`data/waveforms/${entry.file}`, { cache: 'no-store' });
    if (!response.ok) {
        console.error(`Unable to load waveform ${waveformId}`);
        return null;
    }

    const waveform = await response.json();
    waveformCache.set(waveformId, waveform);
    return waveform;
}

async function loadWaveformIndex() {
    if (waveformIndex) {
        return waveformIndex;
    }

    try {
        const response = await fetch('data/waveforms/index.json', { cache: 'no-store' });
        const payload = await response.json();
        waveformIndex = new Map();
        (payload.waveforms ?? []).forEach((wf) => {
            waveformIndex.set(wf.id, wf);
        });
    } catch (error) {
        console.error('Unable to load waveform index', error);
        waveformIndex = new Map();
    }

    return waveformIndex;
}

function drawGrid() {
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;

    ctx.fillStyle = '#030812';
    ctx.fillRect(0, 0, width, height);

    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    const smallSpacing = 25;

    for (let x = 0; x <= width; x += smallSpacing) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
    }

    for (let y = 0; y <= height; y += smallSpacing) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
    }

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
    const largeSpacing = smallSpacing * 5;
    for (let x = 0; x <= width; x += largeSpacing) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
    }
    for (let y = 0; y <= height; y += largeSpacing) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
    }
}

function renderWaveform(waveform) {
    if (!ctx) return;

    drawGrid();

    const width = canvas.width;
    const height = canvas.height;
    const baseline = height / 2;
    const scale = waveform.scale ?? 35;
    const points = (waveform.points ?? []).slice().sort((a, b) => a.time - b.time);

    if (!points.length) {
        return;
    }

    ctx.strokeStyle = '#6af7b8';
    ctx.lineWidth = 2;
    ctx.beginPath();

    points.forEach((point, index) => {
        const x = Math.min(width, Math.max(0, point.time * width));
        const y = baseline - point.value * scale;
        if (index === 0) {
            ctx.moveTo(x, y);
        } else {
            ctx.lineTo(x, y);
        }
    });

    ctx.stroke();

    if (waveform.spike) {
        drawPacingSpike(waveform.spike);
    }
}

function drawPacingSpike(spike) {
    const width = canvas.width;
    const height = canvas.height;
    const baseline = height / 2;
    const spikeX = spike.position * width;
    const spikeWidth = spike.width * width;
    const amplitude = spike.amplitude * 20;

    ctx.strokeStyle = '#f7e76a';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(spikeX - spikeWidth / 2, baseline);
    ctx.lineTo(spikeX, baseline - amplitude);
    ctx.lineTo(spikeX + spikeWidth / 2, baseline);
    ctx.stroke();
}

export { initEcgEngine };