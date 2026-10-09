import { Bus } from './bus.js';
import { CPU } from './cpu.js';
import { PPU } from './ppu.js';
import { APU } from './apu.js';
import { Cartridge } from './cartridge.js';

export class NES {
  constructor(sampleRate = 44100) {
    this.bus = new Bus();
    this.cpu = new CPU(this.bus);
    this.ppu = new PPU();
    this.apu = new APU(this.bus, sampleRate);
    this.bus.cpu = this.cpu;
    this.bus.ppu = this.ppu;
    this.bus.apu = this.apu;
    this.ppu.onNmi = () => { this.cpu.nmiPending = true; };
    this.cart = null;
  }

  load(data) {
    this.cart = new Cartridge(data);
    this.bus.mapper = this.cart.mapper;
    this.ppu.mapper = this.cart.mapper;
    this.reset();
  }

  reset() {
    this.ppu.reset();
    this.ppu.oam.fill(0);
    this.bus.ram.fill(0);
    this.cpu.reset();
  }

  // Run until the PPU finishes a frame.
  frame() {
    const { cpu, ppu, apu } = this;
    while (!ppu.frameReady) {
      const c = cpu.step();
      for (let i = c * 3; i > 0; i--) ppu.step();
      apu.run(c);
    }
    ppu.frameReady = false;
  }

  // Drain generated audio samples.
  takeSamples() {
    const out = this.apu.samples.slice(0, this.apu.sampleCount);
    this.apu.sampleCount = 0;
    return out;
  }
}
