// Base mapper: PRG is mapped in 4 x 8KB slots ($8000-$FFFF), CHR in 8 x 1KB slots.
// Subclasses only set the bank maps and implement writeReg().
export class Mapper {
  constructor(cart) {
    this.prg = cart.prg;
    this.chr = cart.chr;
    this.chrRam = cart.chrRam;
    this.mirroring = cart.mirroring;
    this.prgRam = new Uint8Array(0x2000);
    this.prgMap = new Int32Array(4);
    this.chrMap = new Int32Array(8);
    this.prgBanks8 = Math.max(1, this.prg.length >> 13);
    this.chrBanks1 = Math.max(1, this.chr.length >> 10);
    this.irq = false;
  }

  setPrg8(slot, bank) {
    this.prgMap[slot] = (bank % this.prgBanks8) * 0x2000;
  }
  setPrg16(slot16, bank) {
    this.setPrg8(slot16 * 2, bank * 2);
    this.setPrg8(slot16 * 2 + 1, bank * 2 + 1);
  }
  setPrg32(bank) {
    this.setPrg16(0, bank * 2);
    this.setPrg16(1, bank * 2 + 1);
  }
  setChr1(slot, bank) {
    this.chrMap[slot] = (bank % this.chrBanks1) * 0x400;
  }
  setChr2(slot, bank) {
    this.setChr1(slot, bank);
    this.setChr1(slot + 1, bank + 1);
  }
  setChr4(slot, bank) {
    this.setChr2(slot, bank * 4);
    this.setChr2(slot + 2, bank * 4 + 2);
  }
  setChr8(bank) {
    this.setChr4(0, bank * 2);
    this.setChr4(4, bank * 2 + 1);
  }

  cpuRead(addr) {
    if (addr >= 0x8000) return this.prg[this.prgMap[(addr >> 13) & 3] + (addr & 0x1fff)];
    if (addr >= 0x6000) return this.prgRam[addr & 0x1fff];
    return 0;
  }

  cpuWrite(addr, v) {
    if (addr >= 0x8000) this.writeReg(addr, v);
    else if (addr >= 0x6000) this.prgRam[addr & 0x1fff] = v;
  }

  ppuRead(addr) {
    return this.chr[this.chrMap[addr >> 10] + (addr & 0x3ff)];
  }

  ppuWrite(addr, v) {
    if (this.chrRam) this.chr[this.chrMap[addr >> 10] + (addr & 0x3ff)] = v;
  }

  writeReg() {}
  clockScanline() {}
}
