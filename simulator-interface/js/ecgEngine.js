const GRID_SMALL_SPACING = 20;
const GRID_LARGE_SPACING = 100;
const DEFAULT_SCROLL_SPEED = 140; // pixels per second
const AMPLITUDE_SCALE = 0.35;

class PqrsWaveGenerator {
    constructor() {
        this.samples = buildPqrsSamples();
        this.index = 0;
    }

    nextSample() {
        if (this.samples.length === 0) {
            return 0;
        }

        const value = this.samples[this.index];
        this.index = (this.index + 1) % this.samples.length;
        return value;
    }
}

function buildPqrsSamples() {
    const cycle = [];

    const addSegment = (duration, fn) => {
        for (let i = 0; i < duration; i += 1) {
            cycle.push(fn(i, duration));
        }
    };

    addSegment(40, () => 0); // baseline
    addSegment(16, (i, duration) => 0.18 * Math.sin((Math.PI * i) / duration)); // P wave
    addSegment(12, () => 0); // PR interval
    addSegment(4, (i, duration) => -0.25 * (i + 1) / duration); // Q dip
    addSegment(2, (i) => 1 - (i * 0.15)); // R upstroke
    addSegment(4, (i, duration) => 0.3 - (0.6 * (i + 1)) / duration); // S drop
    addSegment(12, () => 0.05); // ST elevation
    addSegment(24, (i, duration) => 0.25 * Math.sin((Math.PI * i) / duration)); // T wave
    addSegment(60, () => 0); // return to baseline

    return cycle;
}

class EcgRenderer {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.scrollSpeed = DEFAULT_SCROLL_SPEED;
        this.generator = new PqrsWaveGenerator();
        this.data = new Array(canvas.width).fill(0);
        this.lastTimestamp = null;
        this.advanceRemainder = 0;
        this.running = false;

        window.addEventListener('resize', () => this.handleResize());
    }

    handleResize() {
        const rect = this.canvas.getBoundingClientRect();
        this.canvas.width = Math.floor(rect.width);
        this.canvas.height = Math.floor(rect.height);
        this.data = new Array(this.canvas.width).fill(0);
    }

    start() {
        this.running = true;
        this.handleResize();
        requestAnimationFrame((ts) => this.tick(ts));
    }

    stop() {
        this.running = false;
    }

    tick(timestamp) {
        if (!this.running) {
            return;
        }

        if (this.lastTimestamp === null) {
            this.lastTimestamp = timestamp;
        }

        const deltaSeconds = (timestamp - this.lastTimestamp) / 1000;
        this.lastTimestamp = timestamp;

        this.advanceRemainder += deltaSeconds * this.scrollSpeed;
        const samplesNeeded = Math.max(1, Math.floor(this.advanceRemainder));
        this.advanceRemainder -= samplesNeeded;

        for (let i = 0; i < samplesNeeded; i += 1) {
            this.pushSample(this.generator.nextSample());
        }

        this.draw();
        requestAnimationFrame((ts) => this.tick(ts));
    }

    pushSample(value) {
        this.data.push(value);
        if (this.data.length > this.canvas.width) {
            this.data.shift();
        }
    }

    drawGrid() {
        const { ctx, canvas } = this;
        ctx.fillStyle = '#020a18';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        ctx.strokeStyle = 'rgba(255,255,255,0.08)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let x = 0; x <= canvas.width; x += GRID_SMALL_SPACING) {
            ctx.moveTo(x + 0.5, 0);
            ctx.lineTo(x + 0.5, canvas.height);
        }
        for (let y = 0; y <= canvas.height; y += GRID_SMALL_SPACING) {
            ctx.moveTo(0, y + 0.5);
            ctx.lineTo(canvas.width, y + 0.5);
        }
        ctx.stroke();

        ctx.strokeStyle = 'rgba(255,255,255,0.15)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        for (let x = 0; x <= canvas.width; x += GRID_LARGE_SPACING) {
            ctx.moveTo(x + 0.5, 0);
            ctx.lineTo(x + 0.5, canvas.height);
        }
        for (let y = 0; y <= canvas.height; y += GRID_LARGE_SPACING) {
            ctx.moveTo(0, y + 0.5);
            ctx.lineTo(canvas.width, y + 0.5);
        }
        ctx.stroke();
    }

    drawWaveform() {
        const { ctx, canvas, data } = this;
        const baseline = canvas.height * 0.5;
        const scale = canvas.height * AMPLITUDE_SCALE;

        ctx.strokeStyle = '#00f58c';
        ctx.lineWidth = 2;
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';

        ctx.beginPath();
        data.forEach((value, index) => {
            const x = index;
            const y = baseline - value * scale;
            if (index === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        });
        ctx.stroke();
    }

    draw() {
        this.drawGrid();
        this.drawWaveform();
    }
}

function initEcgEngine() {
    const canvas = document.getElementById('ecgCanvas');
    if (!canvas) {
        return null;
    }

    const renderer = new EcgRenderer(canvas);

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => renderer.start(), { once: true });
    } else {
        renderer.start();
    }

    return renderer;
}

export { initEcgEngine };