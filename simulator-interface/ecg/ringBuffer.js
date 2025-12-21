
export class RingBufferF32 {
  constructor(length) {
    this.length = length;
    this.data = new Float32Array(length);
    this.writeIndex = 0;   // next write position
    this.totalWritten = 0; // total samples written since start (monotonic)
  }

  clear(value = 0) {
    this.data.fill(value);
    this.writeIndex = 0;
    this.totalWritten = 0;
  }

  // Write a block of samples sequentially
  pushBlock(samples) {
    const n = samples.length;
    let wi = this.writeIndex;

    // Write in up to 2 chunks (wrap-around)
    const first = Math.min(this.length - wi, n);
    this.data.set(samples.subarray(0, first), wi);

    const remaining = n - first;
    if (remaining > 0) {
      this.data.set(samples.subarray(first), 0);
      wi = remaining;
    } else {
      wi += first;
    }

    this.writeIndex = wi % this.length;
    this.totalWritten += n;
  }

  // Get the most recent `n` samples in chronological order
  getLast(n) {
    n = Math.min(n, this.length);
    const out = new Float32Array(n);

    // The "end" is writeIndex (exclusive), so start is writeIndex - n
    let start = (this.writeIndex - n) % this.length;
    if (start < 0) start += this.length;

    const first = Math.min(this.length - start, n);
    out.set(this.data.subarray(start, start + first), 0);

    const remaining = n - first;
    if (remaining > 0) {
      out.set(this.data.subarray(0, remaining), first);
    }

    return out;
  }
}
