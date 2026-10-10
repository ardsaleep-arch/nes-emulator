// Audio output through an AudioWorklet that plays queued sample chunks.
const WORKLET = `
class NesPlayer extends AudioWorkletProcessor {
  constructor() {
    super();
    this.queue = [];
    this.pos = 0;
    this.buffered = 0;
    this.port.onmessage = (e) => {
      this.queue.push(e.data);
      this.buffered += e.data.length;
      // keep latency bounded (~100ms): drop oldest audio if emulation runs ahead
      while (this.buffered > sampleRate * 0.1 && this.queue.length > 1) {
        this.buffered -= this.queue.shift().length - this.pos;
        this.pos = 0;
      }
    };
  }
  process(inputs, outputs) {
    const out = outputs[0][0];
    for (let i = 0; i < out.length; i++) {
      if (this.queue.length === 0) { out[i] = 0; continue; }
      const chunk = this.queue[0];
      out[i] = chunk[this.pos++];
      this.buffered--;
      if (this.pos >= chunk.length) { this.queue.shift(); this.pos = 0; }
    }
    return true;
  }
}
registerProcessor('nes-player', NesPlayer);
`;

export class AudioOut {
  constructor() {
    this.ctx = null;
    this.node = null;
    this.gain = null;
    this.sampleRate = 44100;
    this.volume = 1;
  }

  // Must be called from a user gesture. Resolves to the actual sample rate.
  async start() {
    if (this.ctx) {
      await this.ctx.resume();
      return this.sampleRate;
    }
    this.ctx = new AudioContext({ sampleRate: 44100 });
    this.sampleRate = this.ctx.sampleRate;
    const url = URL.createObjectURL(new Blob([WORKLET], { type: 'text/javascript' }));
    await this.ctx.audioWorklet.addModule(url);
    this.node = new AudioWorkletNode(this.ctx, 'nes-player');
    this.gain = this.ctx.createGain();
    this.gain.gain.value = this.volume;
    this.node.connect(this.gain).connect(this.ctx.destination);
    return this.sampleRate;
  }

  push(samples) {
    if (this.node && samples.length) this.node.port.postMessage(samples, [samples.buffer]);
  }

  setVolume(v) {
    this.volume = v;
    if (this.gain) this.gain.gain.value = v;
  }
}
