// 2C02 PPU, stepped one dot at a time. Background uses the real loopy v/t/x/w scroll
// registers and shift-register pipeline; sprites are evaluated for the next line at dot 257.

const NT_MAP = [
  [0, 0, 1, 1], // horizontal
  [0, 1, 0, 1], // vertical
  [0, 0, 0, 0], // single screen 0
  [1, 1, 1, 1], // single screen 1
  [0, 1, 2, 3], // four screen
];

// 0xAABBGGRR for little-endian Uint32 framebuffer
const RGB = [
  0x666666, 0x002a88, 0x1412a7, 0x3b00a4, 0x5c007e, 0x6e0040, 0x6c0600, 0x561d00,
  0x333500, 0x0b4800, 0x005200, 0x004f08, 0x00404d, 0x000000, 0x000000, 0x000000,
  0xadadad, 0x155fd9, 0x4240ff, 0x7527fe, 0xa01acc, 0xb71e7b, 0xb53120, 0x994e00,
  0x6b6d00, 0x388700, 0x0c9300, 0x008f32, 0x007c8d, 0x000000, 0x000000, 0x000000,
  0xfffeff, 0x64b0ff, 0x9290ff, 0xc676ff, 0xf36aff, 0xfe6ecc, 0xfe8170, 0xea9e22,
  0xbcbe00, 0x88d800, 0x5ce430, 0x45e082, 0x48cdde, 0x4f4f4f, 0x000000, 0x000000,
  0xfffeff, 0xc0dfff, 0xd3d2ff, 0xe8c8ff, 0xfbc2ff, 0xfec4ea, 0xfeccc5, 0xf7d8a5,
  0xe4e594, 0xcfef96, 0xbdf4ab, 0xb3f3cc, 0xb5ebf2, 0xb8b8b8, 0x000000, 0x000000,
];
const PALETTE = new Uint32Array(64).map((_, i) => {
  const c = RGB[i];
  return 0xff000000 | ((c & 0xff) << 16) | (c & 0xff00) | (c >> 16);
});

export class PPU {
  constructor() {
    this.mapper = null;
    this.onNmi = () => {};
    this.vram = new Uint8Array(0x1000);
    this.palette = new Uint8Array(32);
    this.oam = new Uint8Array(256);
    this.spLine = new Uint8Array(256);
    this.framebuffer = new Uint32Array(256 * 240);
    this.reset();
  }

  reset() {
    this.ctrl = 0; this.mask = 0; this.status = 0; this.oamAddr = 0;
    this.v = 0; this.t = 0; this.x = 0; this.w = 0; this.buffer = 0;
    this.scanline = 0; this.cycle = 0; this.odd = false; this.frameReady = false;
    this.ntId = 0; this.ntAttr = 0; this.ntLo = 0; this.ntHi = 0;
    this.bgLo = 0; this.bgHi = 0; this.atLo = 0; this.atHi = 0;
  }

  // ---- PPU address space ----
  read(addr) {
    addr &= 0x3fff;
    if (addr < 0x2000) return this.mapper.ppuRead(addr);
    if (addr < 0x3f00) return this.vram[(NT_MAP[this.mapper.mirroring][(addr >> 10) & 3] << 10) | (addr & 0x3ff)];
    return this.palette[this.palIndex(addr)];
  }

  write(addr, v) {
    addr &= 0x3fff;
    if (addr < 0x2000) this.mapper.ppuWrite(addr, v);
    else if (addr < 0x3f00) this.vram[(NT_MAP[this.mapper.mirroring][(addr >> 10) & 3] << 10) | (addr & 0x3ff)] = v;
    else this.palette[this.palIndex(addr)] = v & 0x3f;
  }

  palIndex(addr) {
    addr &= 0x1f;
    return (addr & 0x13) === 0x10 ? addr & 0x0f : addr;
  }

  // ---- CPU-facing registers ----
  readReg(reg) {
    switch (reg) {
      case 2: {
        const r = (this.status & 0xe0) | (this.buffer & 0x1f);
        this.status &= ~0x80;
        this.w = 0;
        return r;
      }
      case 4: {
        const b = this.oam[this.oamAddr];
        return (this.oamAddr & 3) === 2 ? b & 0xe3 : b;
      }
      case 7: {
        const a = this.v & 0x3fff;
        let r;
        if (a >= 0x3f00) {
          r = this.palette[this.palIndex(a)] & (this.mask & 1 ? 0x30 : 0x3f);
          this.buffer = this.read(a - 0x1000);
        } else {
          r = this.buffer;
          this.buffer = this.read(a);
        }
        this.v = (this.v + (this.ctrl & 4 ? 32 : 1)) & 0x7fff;
        return r;
      }
    }
    return 0;
  }

  writeReg(reg, val) {
    switch (reg) {
      case 0: {
        const wasNmi = this.ctrl & 0x80;
        this.ctrl = val;
        this.t = (this.t & 0x73ff) | ((val & 3) << 10);
        if (!wasNmi && val & 0x80 && this.status & 0x80) this.onNmi();
        break;
      }
      case 1: this.mask = val; break;
      case 3: this.oamAddr = val; break;
      case 4: this.oam[this.oamAddr] = val; this.oamAddr = (this.oamAddr + 1) & 0xff; break;
      case 5:
        if (!this.w) {
          this.x = val & 7;
          this.t = (this.t & 0x7fe0) | (val >> 3);
        } else {
          this.t = (this.t & 0x0c1f) | ((val & 7) << 12) | ((val >> 3) << 5);
        }
        this.w ^= 1;
        break;
      case 6:
        if (!this.w) this.t = (this.t & 0x00ff) | ((val & 0x3f) << 8);
        else {
          this.t = (this.t & 0x7f00) | val;
          this.v = this.t;
        }
        this.w ^= 1;
        break;
      case 7:
        this.write(this.v, val);
        this.v = (this.v + (this.ctrl & 4 ? 32 : 1)) & 0x7fff;
        break;
    }
  }

  // ---- rendering helpers ----
  incX() {
    if ((this.v & 0x1f) === 31) this.v = (this.v & ~0x1f) ^ 0x0400;
    else this.v++;
  }

  incY() {
    let v = this.v;
    if ((v & 0x7000) !== 0x7000) v += 0x1000;
    else {
      v &= ~0x7000;
      let y = (v & 0x03e0) >> 5;
      if (y === 29) { y = 0; v ^= 0x0800; }
      else if (y === 31) y = 0;
      else y++;
      v = (v & ~0x03e0) | (y << 5);
    }
    this.v = v;
  }

  loadShifters() {
    this.bgLo = (this.bgLo & 0xff00) | this.ntLo;
    this.bgHi = (this.bgHi & 0xff00) | this.ntHi;
    this.atLo = (this.atLo & 0xff00) | (this.ntAttr & 1 ? 0xff : 0);
    this.atHi = (this.atHi & 0xff00) | (this.ntAttr & 2 ? 0xff : 0);
  }

  // Evaluate sprites for `line` and build a per-pixel buffer.
  // Pixel byte: bit7 present, bit5 sprite-0, bit4 behind-bg, bits3-2 palette, bits1-0 colour.
  buildSprites(line) {
    const sp = this.spLine;
    sp.fill(0);
    if (line >= 240) return;
    const h = this.ctrl & 0x20 ? 16 : 8;
    const oam = this.oam;
    let count = 0;
    for (let n = 0; n < 64; n++) {
      let row = line - 1 - oam[n * 4];
      if (row < 0 || row >= h) continue;
      if (++count > 8) {
        this.status |= 0x20;
        break;
      }
      let tile = oam[n * 4 + 1];
      const attr = oam[n * 4 + 2];
      const sx = oam[n * 4 + 3];
      if (attr & 0x80) row = h - 1 - row;
      let addr;
      if (h === 8) addr = (this.ctrl & 8 ? 0x1000 : 0) + tile * 16 + row;
      else {
        const bank = tile & 1 ? 0x1000 : 0;
        tile &= 0xfe;
        if (row >= 8) { tile++; row -= 8; }
        addr = bank + tile * 16 + row;
      }
      const lo = this.mapper.ppuRead(addr);
      const hi = this.mapper.ppuRead(addr + 8);
      const flag = 0x80 | ((attr & 3) << 2) | (attr & 0x20 ? 0x10 : 0) | (n === 0 ? 0x20 : 0);
      for (let i = 0; i < 8; i++) {
        const px = sx + i;
        if (px > 255) break;
        const bit = attr & 0x40 ? i : 7 - i;
        const pix = ((lo >> bit) & 1) | (((hi >> bit) & 1) << 1);
        if (pix && !sp[px]) sp[px] = flag | pix;
      }
    }
  }

  renderPixel(x) {
    const mask = this.mask;
    let bgPix = 0, bgPal = 0;
    if (mask & 8 && (x >= 8 || mask & 2)) {
      const m = 0x8000 >> this.x;
      bgPix = (this.bgLo & m ? 1 : 0) | (this.bgHi & m ? 2 : 0);
      bgPal = (this.atLo & m ? 1 : 0) | (this.atHi & m ? 2 : 0);
    }
    const sp = mask & 0x10 && (x >= 8 || mask & 4) ? this.spLine[x] : 0;
    const spPix = sp & 3;

    let idx;
    if (!bgPix && !spPix) idx = 0;
    else if (!bgPix) idx = 0x10 | ((sp >> 2) & 3) << 2 | spPix;
    else if (!spPix) idx = (bgPal << 2) | bgPix;
    else {
      if (sp & 0x20 && x !== 255) this.status |= 0x40;
      idx = sp & 0x10 ? (bgPal << 2) | bgPix : 0x10 | ((sp >> 2) & 3) << 2 | spPix;
    }
    this.framebuffer[this.scanline * 256 + x] = PALETTE[this.palette[idx] & (mask & 1 ? 0x30 : 0x3f)];
  }

  step() {
    const sl = this.scanline;
    const cy = this.cycle;
    const rendering = this.mask & 0x18;
    const visible = sl < 240;

    if (visible || sl === 261) {
      if (sl === 261 && cy === 1) this.status &= ~0xe0;

      if (rendering) {
        if ((cy >= 2 && cy < 258) || (cy >= 321 && cy < 338)) {
          if (this.mask & 8) {
            this.bgLo = (this.bgLo << 1) & 0xffff;
            this.bgHi = (this.bgHi << 1) & 0xffff;
            this.atLo = (this.atLo << 1) & 0xffff;
            this.atHi = (this.atHi << 1) & 0xffff;
          }
          switch ((cy - 1) & 7) {
            case 0:
              this.loadShifters();
              this.ntId = this.read(0x2000 | (this.v & 0x0fff));
              break;
            case 2: {
              const v = this.v;
              let a = this.read(0x23c0 | (v & 0x0c00) | ((v >> 4) & 0x38) | ((v >> 2) & 7));
              if ((v >> 5) & 2) a >>= 4;
              if (v & 2) a >>= 2;
              this.ntAttr = a & 3;
              break;
            }
            case 4:
              this.ntLo = this.read((this.ctrl & 0x10 ? 0x1000 : 0) + (this.ntId << 4) + ((this.v >> 12) & 7));
              break;
            case 6:
              this.ntHi = this.read((this.ctrl & 0x10 ? 0x1000 : 0) + (this.ntId << 4) + ((this.v >> 12) & 7) + 8);
              break;
            case 7:
              this.incX();
              break;
          }
        }
        if (cy === 256) this.incY();
        if (cy === 257) {
          this.loadShifters();
          this.v = (this.v & ~0x041f) | (this.t & 0x041f);
          this.buildSprites(sl === 261 ? 0 : sl + 1);
        }
        if (cy === 260) this.mapper.clockScanline();
        if (sl === 261 && cy >= 280 && cy < 305) this.v = (this.v & ~0x7be0) | (this.t & 0x7be0);
      }

      if (visible && cy >= 1 && cy <= 256) this.renderPixel(cy - 1);
    } else if (sl === 241 && cy === 1) {
      this.status |= 0x80;
      if (this.ctrl & 0x80) this.onNmi();
    }

    this.cycle++;
    if (this.cycle > 340 || (this.cycle === 340 && sl === 261 && this.odd && rendering)) {
      this.cycle = 0;
      if (++this.scanline > 261) {
        this.scanline = 0;
        this.odd = !this.odd;
        this.frameReady = true;
      }
    }
  }
}
