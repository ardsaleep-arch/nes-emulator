// CPU memory map: RAM, PPU/APU registers, controllers, cartridge.
export class Bus {
  constructor() {
    this.ram = new Uint8Array(0x800);
    this.cpu = null;
    this.ppu = null;
    this.apu = null;
    this.mapper = null;
    this.buttons = [0, 0]; // A,B,Select,Start,Up,Down,Left,Right = bits 0..7
    this.shift = [0, 0];
    this.strobe = 0;
    this.ppuAhead = 0; // PPU dots already run for the current instruction
  }

  // The CPU runs a whole instruction before the PPU catches up, so without this a $2002
  // read sees the PPU as it was when the instruction began. Run the PPU up to the access
  // (the last cycle of the instruction) first; games that poll $2002 for vblank while NMI
  // is on (e.g. Street Fighter III, mapper 91) only exit the loop thanks to that window.
  syncPpu() {
    if (this.ppuAhead || this.cpu.opCycles < 2) return;
    this.ppuAhead = (this.cpu.opCycles - 1) * 3;
    for (let i = this.ppuAhead; i > 0; i--) this.ppu.step();
  }

  irqActive() {
    return (this.mapper && this.mapper.irq) || this.apu.irq();
  }

  read(addr) {
    if (addr < 0x2000) return this.ram[addr & 0x7ff];
    if (addr < 0x4000) {
      this.syncPpu();
      return this.ppu.readReg(addr & 7);
    }
    if (addr < 0x4020) {
      if (addr === 0x4015) return this.apu.readStatus();
      if (addr === 0x4016 || addr === 0x4017) {
        const p = addr & 1;
        if (this.strobe) return 0x40 | (this.buttons[p] & 1);
        const bit = this.shift[p] & 1;
        this.shift[p] = (this.shift[p] >> 1) | 0x80; // after 8 reads, pads return 1
        return 0x40 | bit;
      }
      return 0;
    }
    return this.mapper.cpuRead(addr);
  }

  write(addr, v) {
    if (addr < 0x2000) this.ram[addr & 0x7ff] = v;
    else if (addr < 0x4000) {
      this.syncPpu();
      this.ppu.writeReg(addr & 7, v);
    }
    else if (addr < 0x4020) {
      if (addr === 0x4014) this.oamDma(v);
      else if (addr === 0x4016) {
        this.strobe = v & 1;
        this.shift = [this.buttons[0], this.buttons[1]];
      } else this.apu.write(addr, v);
    } else this.mapper.cpuWrite(addr, v);
  }

  oamDma(page) {
    const base = page << 8;
    const oam = this.ppu.oam;
    for (let i = 0; i < 256; i++) oam[(this.ppu.oamAddr + i) & 0xff] = this.read(base + i);
    this.cpu.stall += 513 + (this.cpu.cycles & 1);
  }
}
