import { Mapper } from './mapper.js';
import { MIRROR } from '../constants.js';

// 0: NROM
class NROM extends Mapper {
  constructor(cart) {
    super(cart);
    this.setPrg32(0);
    this.setChr8(0);
  }
}

// 1: MMC1
class MMC1 extends Mapper {
  constructor(cart) {
    super(cart);
    this.shift = 0x10;
    this.control = 0x0c;
    this.chr0 = 0;
    this.chr1 = 0;
    this.prgReg = 0;
    this.update();
  }

  writeReg(addr, v) {
    if (v & 0x80) {
      this.shift = 0x10;
      this.control |= 0x0c;
      this.update();
      return;
    }
    const full = this.shift & 1;
    this.shift = (this.shift >> 1) | ((v & 1) << 4);
    if (!full) return;
    const val = this.shift;
    this.shift = 0x10;
    switch ((addr >> 13) & 3) {
      case 0: this.control = val; break;
      case 1: this.chr0 = val; break;
      case 2: this.chr1 = val; break;
      case 3: this.prgReg = val & 0x0f; break;
    }
    this.update();
  }

  update() {
    const c = this.control;
    this.mirroring = [MIRROR.SINGLE0, MIRROR.SINGLE1, MIRROR.V, MIRROR.H][c & 3];
    const mode = (c >> 2) & 3;
    if (mode < 2) this.setPrg32(this.prgReg >> 1);
    else if (mode === 2) {
      this.setPrg16(0, 0);
      this.setPrg16(1, this.prgReg);
    } else {
      this.setPrg16(0, this.prgReg);
      this.setPrg16(1, (this.prgBanks8 >> 1) - 1);
    }
    if (c & 0x10) {
      this.setChr4(0, this.chr0);
      this.setChr4(4, this.chr1);
    } else {
      this.setChr8(this.chr0 >> 1);
    }
  }
}

// 2: UxROM
class UxROM extends Mapper {
  constructor(cart) {
    super(cart);
    this.setPrg16(0, 0);
    this.setPrg16(1, (this.prgBanks8 >> 1) - 1);
    this.setChr8(0);
  }
  writeReg(addr, v) {
    this.setPrg16(0, v);
  }
}

// 3: CNROM
class CNROM extends Mapper {
  constructor(cart) {
    super(cart);
    this.setPrg32(0);
    this.setChr8(0);
  }
  writeReg(addr, v) {
    this.setChr8(v);
  }
}

// 4: MMC3
class MMC3 extends Mapper {
  constructor(cart) {
    super(cart);
    this.fourScreen = cart.mirroring === MIRROR.FOUR;
    this.regs = new Uint8Array(8);
    this.select = 0;
    this.latch = 0;
    this.counter = 0;
    this.reload = false;
    this.irqEnabled = false;
    this.update();
  }

  writeReg(addr, v) {
    const odd = addr & 1;
    switch ((addr >> 13) & 3) {
      case 0:
        if (!odd) this.select = v;
        else this.regs[this.select & 7] = v;
        this.update();
        break;
      case 1:
        if (!odd && !this.fourScreen) this.mirroring = v & 1 ? MIRROR.H : MIRROR.V;
        break;
      case 2:
        if (!odd) this.latch = v;
        else {
          this.counter = 0;
          this.reload = true;
        }
        break;
      case 3:
        this.irqEnabled = !!odd;
        if (!odd) this.irq = false;
        break;
    }
  }

  update() {
    const r = this.regs;
    const last = this.prgBanks8 - 1;
    if (this.select & 0x40) {
      this.setPrg8(0, last - 1);
      this.setPrg8(2, r[6]);
    } else {
      this.setPrg8(0, r[6]);
      this.setPrg8(2, last - 1);
    }
    this.setPrg8(1, r[7]);
    this.setPrg8(3, last);

    const inv = this.select & 0x80 ? 4 : 0;
    this.setChr2(0 ^ inv, r[0] & 0xfe);
    this.setChr2(2 ^ inv, r[1] & 0xfe);
    this.setChr1(4 ^ inv, r[2]);
    this.setChr1(5 ^ inv, r[3]);
    this.setChr1(6 ^ inv, r[4]);
    this.setChr1(7 ^ inv, r[5]);
  }

  clockScanline() {
    if (this.counter === 0 || this.reload) this.counter = this.latch;
    else this.counter--;
    if (this.counter === 0 && this.irqEnabled) this.irq = true;
    this.reload = false;
  }
}

// 91: J.Y. Company pirate boards (Street Fighter III, Mortal Kombat II ...).
// Registers live at $6000-$7FFF; IRQ fires after 8 scanlines once started.
class JY91 extends Mapper {
  constructor(cart) {
    super(cart);
    this.irqCount = 0;
    this.irqEnabled = false;
    this.setPrg8(0, 0);
    this.setPrg8(1, 0);
    this.setPrg8(2, this.prgBanks8 - 2);
    this.setPrg8(3, this.prgBanks8 - 1);
    this.setChr8(0);
  }

  cpuWrite(addr, v) {
    if (addr < 0x6000 || addr >= 0x8000) return;
    if (addr < 0x7000) {
      this.setChr2((addr & 3) * 2, v * 2);
      return;
    }
    switch (addr & 3) {
      case 0:
      case 1:
        this.setPrg8(addr & 1, v);
        break;
      case 2:
        this.irqEnabled = false;
        this.irqCount = 0;
        this.irq = false;
        break;
      case 3:
        this.irqEnabled = true;
        this.irq = false;
        break;
    }
  }

  clockScanline() {
    if (this.irqEnabled && this.irqCount < 8 && ++this.irqCount === 8) this.irq = true;
  }
}

// 230: 22-in-1 multicart. Power-on selects Contra (first 128KB); reset switches to the 22-in-1 menu.
class Multicart230 extends Mapper {
  constructor(cart) {
    super(cart);
    this.contra = true;
    this.setChr8(0);
    this.writeReg(0x8000, 0);
  }

  reset() {
    this.contra = false;
    this.writeReg(0x8000, 0);
  }

  writeReg(addr, v) {
    if (this.contra) {
      this.setPrg16(0, v & 7);
      this.setPrg16(1, 7);
      this.mirroring = MIRROR.V;
      return;
    }
    const bank = (v & 0x1f) + 8;
    if (v & 0x20) {
      this.setPrg16(0, bank);
      this.setPrg16(1, bank);
    } else {
      this.setPrg16(0, bank & ~1);
      this.setPrg16(1, bank | 1);
    }
    this.mirroring = v & 0x40 ? MIRROR.V : MIRROR.H;
  }
}

const MAPPERS = { 0: NROM, 1: MMC1, 2: UxROM, 3: CNROM, 4: MMC3, 91: JY91, 230: Multicart230 };

export function createMapper(cart) {
  const M = MAPPERS[cart.mapperId];
  if (!M) throw new Error(`ยังไม่รองรับ mapper ${cart.mapperId}`);
  return new M(cart);
}
