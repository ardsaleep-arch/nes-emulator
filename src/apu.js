// NES APU: 2 pulse, triangle, noise, DMC. Clocked once per CPU cycle; produces mono samples.

const CPU_FREQ = 1789773;
const LENGTHS = [
  10, 254, 20, 2, 40, 4, 80, 6, 160, 8, 60, 10, 14, 12, 26, 14,
  12, 16, 24, 18, 48, 20, 96, 22, 192, 24, 72, 26, 16, 28, 32, 30,
];
const DUTY = [
  [0, 1, 0, 0, 0, 0, 0, 0],
  [0, 1, 1, 0, 0, 0, 0, 0],
  [0, 1, 1, 1, 1, 0, 0, 0],
  [1, 0, 0, 1, 1, 1, 1, 1],
];
const TRI_SEQ = [
  15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0,
  0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15,
];
const NOISE_PERIOD = [4, 8, 16, 32, 64, 96, 128, 160, 202, 254, 380, 508, 762, 1016, 2034, 4068];
const DMC_RATE = [428, 380, 340, 320, 286, 254, 226, 214, 190, 160, 142, 128, 106, 84, 72, 54];

// Envelope state shared by pulse and noise
class Envelope {
  constructor() {
    this.start = false;
    this.divider = 0;
    this.decay = 0;
    this.loop = false;
    this.constant = false;
    this.volume = 0;
  }
  setReg(v) {
    this.loop = !!(v & 0x20);
    this.constant = !!(v & 0x10);
    this.volume = v & 15;
  }
  clock() {
    if (this.start) {
      this.start = false;
      this.decay = 15;
      this.divider = this.volume;
    } else if (this.divider === 0) {
      this.divider = this.volume;
      if (this.decay > 0) this.decay--;
      else if (this.loop) this.decay = 15;
    } else this.divider--;
  }
  output() {
    return this.constant ? this.volume : this.decay;
  }
}

class Pulse {
  constructor(isChannel1) {
    this.ones = isChannel1; // channel 1 negates with one's complement
    this.env = new Envelope();
    this.enabled = false;
    this.duty = 0; this.seq = 0; this.timer = 0; this.period = 0; this.length = 0;
    this.sweepEnabled = false; this.sweepPeriod = 0; this.sweepNegate = false;
    this.sweepShift = 0; this.sweepDiv = 0; this.sweepReload = false;
  }
  write(reg, v) {
    switch (reg) {
      case 0: this.duty = v >> 6; this.env.setReg(v); break;
      case 1:
        this.sweepEnabled = !!(v & 0x80);
        this.sweepPeriod = (v >> 4) & 7;
        this.sweepNegate = !!(v & 8);
        this.sweepShift = v & 7;
        this.sweepReload = true;
        break;
      case 2: this.period = (this.period & 0x700) | v; break;
      case 3:
        this.period = (this.period & 0xff) | ((v & 7) << 8);
        if (this.enabled) this.length = LENGTHS[v >> 3];
        this.seq = 0;
        this.env.start = true;
        break;
    }
  }
  target() {
    const d = this.period >> this.sweepShift;
    return this.period + (this.sweepNegate ? (this.ones ? -d - 1 : -d) : d);
  }
  clockTimer() {
    if (this.timer === 0) {
      this.timer = this.period;
      this.seq = (this.seq + 1) & 7;
    } else this.timer--;
  }
  clockLength() {
    if (!this.env.loop && this.length > 0) this.length--;
  }
  clockSweep() {
    const t = this.target();
    if (this.sweepDiv === 0 && this.sweepEnabled && this.sweepShift > 0 && this.period >= 8 && t <= 0x7ff) this.period = t;
    if (this.sweepDiv === 0 || this.sweepReload) {
      this.sweepDiv = this.sweepPeriod;
      this.sweepReload = false;
    } else this.sweepDiv--;
  }
  output() {
    if (!this.enabled || this.length === 0 || this.period < 8 || this.target() > 0x7ff) return 0;
    return DUTY[this.duty][this.seq] ? this.env.output() : 0;
  }
}

class Triangle {
  constructor() {
    this.enabled = false;
    this.control = false; this.linearReload = 0; this.linear = 0; this.linearFlag = false;
    this.period = 0; this.timer = 0; this.seq = 0; this.length = 0;
  }
  write(reg, v) {
    switch (reg) {
      case 0: this.control = !!(v & 0x80); this.linearReload = v & 0x7f; break;
      case 2: this.period = (this.period & 0x700) | v; break;
      case 3:
        this.period = (this.period & 0xff) | ((v & 7) << 8);
        if (this.enabled) this.length = LENGTHS[v >> 3];
        this.linearFlag = true;
        break;
    }
  }
  clockTimer() {
    if (this.timer === 0) {
      this.timer = this.period;
      if (this.length > 0 && this.linear > 0) this.seq = (this.seq + 1) & 31;
    } else this.timer--;
  }
  clockLinear() {
    if (this.linearFlag) this.linear = this.linearReload;
    else if (this.linear > 0) this.linear--;
    if (!this.control) this.linearFlag = false;
  }
  clockLength() {
    if (!this.control && this.length > 0) this.length--;
  }
  output() {
    return this.period < 2 ? 7 : TRI_SEQ[this.seq];
  }
}

class Noise {
  constructor() {
    this.env = new Envelope();
    this.enabled = false;
    this.mode = false; this.period = NOISE_PERIOD[0]; this.timer = 0; this.shift = 1; this.length = 0;
  }
  write(reg, v) {
    switch (reg) {
      case 0: this.env.setReg(v); break;
      case 2: this.mode = !!(v & 0x80); this.period = NOISE_PERIOD[v & 15]; break;
      case 3:
        if (this.enabled) this.length = LENGTHS[v >> 3];
        this.env.start = true;
        break;
    }
  }
  clockTimer() {
    if (--this.timer > 0) return;
    this.timer = this.period;
    const fb = (this.shift & 1) ^ ((this.shift >> (this.mode ? 6 : 1)) & 1);
    this.shift = (this.shift >> 1) | (fb << 14);
  }
  clockLength() {
    if (!this.env.loop && this.length > 0) this.length--;
  }
  output() {
    if (!this.enabled || this.length === 0 || this.shift & 1) return 0;
    return this.env.output();
  }
}

class DMC {
  constructor(bus) {
    this.bus = bus;
    this.irqEnable = false; this.irqFlag = false; this.loop = false;
    this.rate = DMC_RATE[0]; this.timer = DMC_RATE[0];
    this.output = 0; this.sampleAddr = 0xc000; this.sampleLen = 1;
    this.addr = 0xc000; this.bytesRemaining = 0;
    this.buffer = 0; this.bufferEmpty = true;
    this.shiftReg = 0; this.bitsRemaining = 8; this.silence = true;
  }
  write(reg, v) {
    switch (reg) {
      case 0:
        this.irqEnable = !!(v & 0x80);
        this.loop = !!(v & 0x40);
        this.rate = DMC_RATE[v & 15];
        if (!this.irqEnable) this.irqFlag = false;
        break;
      case 1: this.output = v & 0x7f; break;
      case 2: this.sampleAddr = 0xc000 + v * 64; break;
      case 3: this.sampleLen = v * 16 + 1; break;
    }
  }
  restart() {
    this.addr = this.sampleAddr;
    this.bytesRemaining = this.sampleLen;
  }
  setEnabled(on) {
    this.irqFlag = false;
    if (!on) this.bytesRemaining = 0;
    else if (this.bytesRemaining === 0) {
      this.restart();
      this.fill();
    }
  }
  fill() {
    if (!this.bufferEmpty || this.bytesRemaining === 0) return;
    this.buffer = this.bus.read(this.addr);
    this.bus.cpu.stall += 4;
    this.addr = this.addr === 0xffff ? 0x8000 : this.addr + 1;
    this.bufferEmpty = false;
    if (--this.bytesRemaining === 0) {
      if (this.loop) this.restart();
      else if (this.irqEnable) this.irqFlag = true;
    }
  }
  clockTimer() {
    if (--this.timer > 0) return;
    this.timer = this.rate;
    if (!this.silence) {
      if (this.shiftReg & 1) { if (this.output <= 125) this.output += 2; }
      else if (this.output >= 2) this.output -= 2;
      this.shiftReg >>= 1;
    }
    if (--this.bitsRemaining === 0) {
      this.bitsRemaining = 8;
      if (this.bufferEmpty) this.silence = true;
      else {
        this.silence = false;
        this.shiftReg = this.buffer;
        this.bufferEmpty = true;
        this.fill();
      }
    }
  }
}

export class APU {
  constructor(bus, sampleRate = 44100) {
    this.bus = bus;
    this.sampleRate = sampleRate;
    this.pulse1 = new Pulse(true);
    this.pulse2 = new Pulse(false);
    this.tri = new Triangle();
    this.noise = new Noise();
    this.dmc = new DMC(bus);
    this.cycle = 0;
    this.frameCycle = 0;
    this.fiveStep = false;
    this.inhibit = false;
    this.frameIrq = false;

    this.samples = new Float32Array(4096);
    this.sampleCount = 0;
    this.acc = 0;
    this.sums = [0, 0, 0, 0, 0];
    this.sumCount = 0;
    this.hpPrevIn = 0;
    this.hpPrevOut = 0;
  }

  irq() {
    return this.frameIrq || this.dmc.irqFlag;
  }

  readStatus() {
    const r = (this.pulse1.length > 0 ? 1 : 0) | (this.pulse2.length > 0 ? 2 : 0) | (this.tri.length > 0 ? 4 : 0) |
      (this.noise.length > 0 ? 8 : 0) | (this.dmc.bytesRemaining > 0 ? 16 : 0) |
      (this.frameIrq ? 0x40 : 0) | (this.dmc.irqFlag ? 0x80 : 0);
    this.frameIrq = false;
    return r;
  }

  write(addr, v) {
    if (addr <= 0x4003) this.pulse1.write(addr & 3, v);
    else if (addr <= 0x4007) this.pulse2.write(addr & 3, v);
    else if (addr <= 0x400b) this.tri.write(addr & 3, v);
    else if (addr <= 0x400f) this.noise.write(addr & 3, v);
    else if (addr <= 0x4013) this.dmc.write(addr & 3, v);
    else if (addr === 0x4015) {
      this.pulse1.enabled = !!(v & 1);
      this.pulse2.enabled = !!(v & 2);
      this.tri.enabled = !!(v & 4);
      this.noise.enabled = !!(v & 8);
      if (!this.pulse1.enabled) this.pulse1.length = 0;
      if (!this.pulse2.enabled) this.pulse2.length = 0;
      if (!this.tri.enabled) this.tri.length = 0;
      if (!this.noise.enabled) this.noise.length = 0;
      this.dmc.setEnabled(!!(v & 16));
    } else if (addr === 0x4017) {
      this.fiveStep = !!(v & 0x80);
      this.inhibit = !!(v & 0x40);
      if (this.inhibit) this.frameIrq = false;
      this.frameCycle = 0;
      if (this.fiveStep) {
        this.clockQuarter();
        this.clockHalf();
      }
    }
  }

  clockQuarter() {
    this.pulse1.env.clock();
    this.pulse2.env.clock();
    this.noise.env.clock();
    this.tri.clockLinear();
  }

  clockHalf() {
    this.pulse1.clockLength();
    this.pulse2.clockLength();
    this.tri.clockLength();
    this.noise.clockLength();
    this.pulse1.clockSweep();
    this.pulse2.clockSweep();
  }

  // Run for `n` CPU cycles
  run(n) {
    for (let i = 0; i < n; i++) this.clock();
  }

  clock() {
    // frame counter
    this.frameCycle++;
    switch (this.frameCycle) {
      case 7457: this.clockQuarter(); break;
      case 14913: this.clockQuarter(); this.clockHalf(); break;
      case 22371: this.clockQuarter(); break;
      case 29829:
        if (!this.fiveStep) {
          this.clockQuarter(); this.clockHalf();
          if (!this.inhibit) this.frameIrq = true;
        }
        break;
      case 29830:
        if (!this.fiveStep) this.frameCycle = 0;
        break;
      case 37281:
        this.clockQuarter(); this.clockHalf();
        break;
      case 37282:
        this.frameCycle = 0;
        break;
    }

    // channel timers
    if (this.cycle++ & 1) {
      this.pulse1.clockTimer();
      this.pulse2.clockTimer();
    }
    this.tri.clockTimer();
    this.noise.clockTimer();
    this.dmc.clockTimer();

    // accumulate for downsampling
    const s = this.sums;
    s[0] += this.pulse1.output();
    s[1] += this.pulse2.output();
    s[2] += this.tri.output();
    s[3] += this.noise.output();
    s[4] += this.dmc.output;
    this.sumCount++;

    this.acc += this.sampleRate;
    if (this.acc >= CPU_FREQ) {
      this.acc -= CPU_FREQ;
      this.emitSample();
    }
  }

  emitSample() {
    const n = this.sumCount;
    const s = this.sums;
    const p = (s[0] + s[1]) / n;
    const pulseOut = p === 0 ? 0 : 95.88 / (8128 / p + 100);
    const t = s[2] / n / 8227 + s[3] / n / 12241 + s[4] / n / 22638;
    const tndOut = t === 0 ? 0 : 159.79 / (1 / t + 100);
    s.fill(0);
    this.sumCount = 0;

    // one-pole high-pass to remove DC offset
    const x = pulseOut + tndOut;
    const y = x - this.hpPrevIn + 0.996 * this.hpPrevOut;
    this.hpPrevIn = x;
    this.hpPrevOut = y;

    if (this.sampleCount === this.samples.length) {
      const bigger = new Float32Array(this.samples.length * 2);
      bigger.set(this.samples);
      this.samples = bigger;
    }
    this.samples[this.sampleCount++] = y;
  }
}
