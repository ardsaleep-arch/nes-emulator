// MOS 6502 (NES variant, no decimal mode). Instruction-stepped with per-instruction cycle counts.

const IMP = 0, ACC = 1, IMM = 2, ZP = 3, ZPX = 4, ZPY = 5, ABS = 6, ABX = 7, ABY = 8, IND = 9, IZX = 10, IZY = 11, REL = 12;

// name -> { mode: [opcode, cycles] }
const DEFS = {
  ADC: { IMM: [0x69, 2], ZP: [0x65, 3], ZPX: [0x75, 4], ABS: [0x6d, 4], ABX: [0x7d, 4], ABY: [0x79, 4], IZX: [0x61, 6], IZY: [0x71, 5] },
  AND: { IMM: [0x29, 2], ZP: [0x25, 3], ZPX: [0x35, 4], ABS: [0x2d, 4], ABX: [0x3d, 4], ABY: [0x39, 4], IZX: [0x21, 6], IZY: [0x31, 5] },
  EOR: { IMM: [0x49, 2], ZP: [0x45, 3], ZPX: [0x55, 4], ABS: [0x4d, 4], ABX: [0x5d, 4], ABY: [0x59, 4], IZX: [0x41, 6], IZY: [0x51, 5] },
  ORA: { IMM: [0x09, 2], ZP: [0x05, 3], ZPX: [0x15, 4], ABS: [0x0d, 4], ABX: [0x1d, 4], ABY: [0x19, 4], IZX: [0x01, 6], IZY: [0x11, 5] },
  CMP: { IMM: [0xc9, 2], ZP: [0xc5, 3], ZPX: [0xd5, 4], ABS: [0xcd, 4], ABX: [0xdd, 4], ABY: [0xd9, 4], IZX: [0xc1, 6], IZY: [0xd1, 5] },
  LDA: { IMM: [0xa9, 2], ZP: [0xa5, 3], ZPX: [0xb5, 4], ABS: [0xad, 4], ABX: [0xbd, 4], ABY: [0xb9, 4], IZX: [0xa1, 6], IZY: [0xb1, 5] },
  SBC: { IMM: [0xe9, 2], ZP: [0xe5, 3], ZPX: [0xf5, 4], ABS: [0xed, 4], ABX: [0xfd, 4], ABY: [0xf9, 4], IZX: [0xe1, 6], IZY: [0xf1, 5] },
  STA: { ZP: [0x85, 3], ZPX: [0x95, 4], ABS: [0x8d, 4], ABX: [0x9d, 5], ABY: [0x99, 5], IZX: [0x81, 6], IZY: [0x91, 6] },
  LDX: { IMM: [0xa2, 2], ZP: [0xa6, 3], ZPY: [0xb6, 4], ABS: [0xae, 4], ABY: [0xbe, 4] },
  LDY: { IMM: [0xa0, 2], ZP: [0xa4, 3], ZPX: [0xb4, 4], ABS: [0xac, 4], ABX: [0xbc, 4] },
  STX: { ZP: [0x86, 3], ZPY: [0x96, 4], ABS: [0x8e, 4] },
  STY: { ZP: [0x84, 3], ZPX: [0x94, 4], ABS: [0x8c, 4] },
  CPX: { IMM: [0xe0, 2], ZP: [0xe4, 3], ABS: [0xec, 4] },
  CPY: { IMM: [0xc0, 2], ZP: [0xc4, 3], ABS: [0xcc, 4] },
  BIT: { ZP: [0x24, 3], ABS: [0x2c, 4] },
  ASL: { ACC: [0x0a, 2], ZP: [0x06, 5], ZPX: [0x16, 6], ABS: [0x0e, 6], ABX: [0x1e, 7] },
  LSR: { ACC: [0x4a, 2], ZP: [0x46, 5], ZPX: [0x56, 6], ABS: [0x4e, 6], ABX: [0x5e, 7] },
  ROL: { ACC: [0x2a, 2], ZP: [0x26, 5], ZPX: [0x36, 6], ABS: [0x2e, 6], ABX: [0x3e, 7] },
  ROR: { ACC: [0x6a, 2], ZP: [0x66, 5], ZPX: [0x76, 6], ABS: [0x6e, 6], ABX: [0x7e, 7] },
  INC: { ZP: [0xe6, 5], ZPX: [0xf6, 6], ABS: [0xee, 6], ABX: [0xfe, 7] },
  DEC: { ZP: [0xc6, 5], ZPX: [0xd6, 6], ABS: [0xce, 6], ABX: [0xde, 7] },
  BPL: { REL: [0x10, 2] }, BMI: { REL: [0x30, 2] }, BVC: { REL: [0x50, 2] }, BVS: { REL: [0x70, 2] },
  BCC: { REL: [0x90, 2] }, BCS: { REL: [0xb0, 2] }, BNE: { REL: [0xd0, 2] }, BEQ: { REL: [0xf0, 2] },
  JMP: { ABS: [0x4c, 3], IND: [0x6c, 5] },
  JSR: { ABS: [0x20, 6] },
  RTS: { IMP: [0x60, 6] }, RTI: { IMP: [0x40, 6] }, BRK: { IMP: [0x00, 7] },
  PHA: { IMP: [0x48, 3] }, PHP: { IMP: [0x08, 3] }, PLA: { IMP: [0x68, 4] }, PLP: { IMP: [0x28, 4] },
  CLC: { IMP: [0x18, 2] }, SEC: { IMP: [0x38, 2] }, CLI: { IMP: [0x58, 2] }, SEI: { IMP: [0x78, 2] },
  CLD: { IMP: [0xd8, 2] }, SED: { IMP: [0xf8, 2] }, CLV: { IMP: [0xb8, 2] },
  TAX: { IMP: [0xaa, 2] }, TAY: { IMP: [0xa8, 2] }, TSX: { IMP: [0xba, 2] },
  TXA: { IMP: [0x8a, 2] }, TXS: { IMP: [0x9a, 2] }, TYA: { IMP: [0x98, 2] },
  INX: { IMP: [0xe8, 2] }, INY: { IMP: [0xc8, 2] }, DEX: { IMP: [0xca, 2] }, DEY: { IMP: [0x88, 2] },
  NOP: {
    IMP: [0xea, 2],
    IMM: [0x80, 2], ZP: [0x04, 3], ZPX: [0x14, 4], ABS: [0x0c, 4], ABX: [0x1c, 4],
  },
  // unofficial opcodes used by some games / test ROMs
  LAX: { ZP: [0xa7, 3], ZPY: [0xb7, 4], ABS: [0xaf, 4], ABY: [0xbf, 4], IZX: [0xa3, 6], IZY: [0xb3, 5] },
  SAX: { ZP: [0x87, 3], ZPY: [0x97, 4], ABS: [0x8f, 4], IZX: [0x83, 6] },
  DCP: { ZP: [0xc7, 5], ZPX: [0xd7, 6], ABS: [0xcf, 6], ABX: [0xdf, 7], ABY: [0xdb, 7], IZX: [0xc3, 8], IZY: [0xd3, 8] },
  ISB: { ZP: [0xe7, 5], ZPX: [0xf7, 6], ABS: [0xef, 6], ABX: [0xff, 7], ABY: [0xfb, 7], IZX: [0xe3, 8], IZY: [0xf3, 8] },
  SLO: { ZP: [0x07, 5], ZPX: [0x17, 6], ABS: [0x0f, 6], ABX: [0x1f, 7], ABY: [0x1b, 7], IZX: [0x03, 8], IZY: [0x13, 8] },
  RLA: { ZP: [0x27, 5], ZPX: [0x37, 6], ABS: [0x2f, 6], ABX: [0x3f, 7], ABY: [0x3b, 7], IZX: [0x23, 8], IZY: [0x33, 8] },
  SRE: { ZP: [0x47, 5], ZPX: [0x57, 6], ABS: [0x4f, 6], ABX: [0x5f, 7], ABY: [0x5b, 7], IZX: [0x43, 8], IZY: [0x53, 8] },
  RRA: { ZP: [0x67, 5], ZPX: [0x77, 6], ABS: [0x6f, 6], ABX: [0x7f, 7], ABY: [0x7b, 7], IZX: [0x63, 8], IZY: [0x73, 8] },
};

const MODE_ID = { IMP, ACC, IMM, ZP, ZPX, ZPY, ABS, ABX, ABY, IND, IZX, IZY, REL };
// read-type instructions pay +1 cycle when an indexed address crosses a page
const PAGE_PENALTY = new Set(['ADC', 'AND', 'EOR', 'ORA', 'CMP', 'LDA', 'SBC', 'LDX', 'LDY', 'LAX', 'NOP']);

const OP_NAME = new Array(256).fill('NOP');
const OP_MODE = new Uint8Array(256).fill(IMP);
const OP_CYCLES = new Uint8Array(256).fill(2);
const OP_PENALTY = new Uint8Array(256);

for (const [name, modes] of Object.entries(DEFS)) {
  for (const [mode, [code, cycles]] of Object.entries(modes)) {
    OP_NAME[code] = name;
    OP_MODE[code] = MODE_ID[mode];
    OP_CYCLES[code] = cycles;
    OP_PENALTY[code] = PAGE_PENALTY.has(name) && (mode === 'ABX' || mode === 'ABY' || mode === 'IZY') ? 1 : 0;
  }
}
// extra unofficial NOP encodings and SBC alias
for (const c of [0x1a, 0x3a, 0x5a, 0x7a, 0xda, 0xfa]) { OP_NAME[c] = 'NOP'; OP_MODE[c] = IMP; OP_CYCLES[c] = 2; }
for (const c of [0x82, 0x89, 0xc2, 0xe2]) { OP_NAME[c] = 'NOP'; OP_MODE[c] = IMM; OP_CYCLES[c] = 2; }
for (const c of [0x44, 0x64]) { OP_NAME[c] = 'NOP'; OP_MODE[c] = ZP; OP_CYCLES[c] = 3; }
for (const c of [0x34, 0x54, 0x74, 0xd4, 0xf4]) { OP_NAME[c] = 'NOP'; OP_MODE[c] = ZPX; OP_CYCLES[c] = 4; }
for (const c of [0x3c, 0x5c, 0x7c, 0xdc, 0xfc]) { OP_NAME[c] = 'NOP'; OP_MODE[c] = ABX; OP_CYCLES[c] = 4; OP_PENALTY[c] = 1; }
OP_NAME[0xeb] = 'SBC'; OP_MODE[0xeb] = IMM; OP_CYCLES[0xeb] = 2;

export class CPU {
  constructor(bus) {
    this.bus = bus;
    this.stall = 0;
    this.nmiPending = false;
    this.cycles = 0;
    this.opCycles = 0;
    this.a = this.x = this.y = this.pc = 0;
    this.sp = 0xfd;
    this.c = this.z = this.i = this.d = this.v = this.n = 0;
  }

  reset() {
    this.a = 0;
    this.x = 0;
    this.y = 0;
    this.sp = 0xfd;
    this.c = 0; this.z = 0; this.i = 1; this.d = 0; this.v = 0; this.n = 0;
    this.pc = this.read16(0xfffc);
    this.nmiPending = false;
    this.stall = 0;
    this.cycles = 7;
  }

  read(a) { return this.bus.read(a); }
  write(a, v) { this.bus.write(a, v); }
  read16(a) { return this.read(a) | (this.read((a + 1) & 0xffff) << 8); }

  push(v) { this.write(0x100 | this.sp, v); this.sp = (this.sp - 1) & 0xff; }
  pull() { this.sp = (this.sp + 1) & 0xff; return this.read(0x100 | this.sp); }

  getP(b) {
    return this.c | (this.z << 1) | (this.i << 2) | (this.d << 3) | (b ? 0x10 : 0) | 0x20 | (this.v << 6) | (this.n << 7);
  }
  setP(p) {
    this.c = p & 1; this.z = (p >> 1) & 1; this.i = (p >> 2) & 1; this.d = (p >> 3) & 1;
    this.v = (p >> 6) & 1; this.n = (p >> 7) & 1;
  }
  nz(v) { this.z = v === 0 ? 1 : 0; this.n = v >> 7; }

  interrupt(vector, b) {
    this.push(this.pc >> 8);
    this.push(this.pc & 0xff);
    this.push(this.getP(b));
    this.i = 1;
    this.pc = this.read16(vector);
  }

  // Executes one instruction (or interrupt / DMA stall). Returns CPU cycles used.
  step() {
    this.opCycles = 0;
    if (this.stall > 0) {
      const s = this.stall;
      this.stall = 0;
      this.cycles += s;
      return s;
    }
    if (this.nmiPending) {
      this.nmiPending = false;
      this.interrupt(0xfffa, false);
      this.cycles += 7;
      return 7;
    }
    if (!this.i && this.bus.irqActive()) {
      this.interrupt(0xfffe, false);
      this.cycles += 7;
      return 7;
    }

    const opcode = this.read(this.pc);
    this.pc = (this.pc + 1) & 0xffff;
    const mode = OP_MODE[opcode];
    let cycles = OP_CYCLES[opcode];
    let addr = 0;
    let crossed = 0;

    switch (mode) {
      case IMM: addr = this.pc; this.pc = (this.pc + 1) & 0xffff; break;
      case ZP: addr = this.read(this.pc); this.pc = (this.pc + 1) & 0xffff; break;
      case ZPX: addr = (this.read(this.pc) + this.x) & 0xff; this.pc = (this.pc + 1) & 0xffff; break;
      case ZPY: addr = (this.read(this.pc) + this.y) & 0xff; this.pc = (this.pc + 1) & 0xffff; break;
      case ABS: addr = this.read16(this.pc); this.pc = (this.pc + 2) & 0xffff; break;
      case ABX: {
        const base = this.read16(this.pc); this.pc = (this.pc + 2) & 0xffff;
        addr = (base + this.x) & 0xffff;
        crossed = (base ^ addr) & 0xff00 ? 1 : 0;
        break;
      }
      case ABY: {
        const base = this.read16(this.pc); this.pc = (this.pc + 2) & 0xffff;
        addr = (base + this.y) & 0xffff;
        crossed = (base ^ addr) & 0xff00 ? 1 : 0;
        break;
      }
      case IND: {
        const ptr = this.read16(this.pc); this.pc = (this.pc + 2) & 0xffff;
        addr = this.read(ptr) | (this.read((ptr & 0xff00) | ((ptr + 1) & 0xff)) << 8);
        break;
      }
      case IZX: {
        const zp = (this.read(this.pc) + this.x) & 0xff; this.pc = (this.pc + 1) & 0xffff;
        addr = this.read(zp) | (this.read((zp + 1) & 0xff) << 8);
        break;
      }
      case IZY: {
        const zp = this.read(this.pc); this.pc = (this.pc + 1) & 0xffff;
        const base = this.read(zp) | (this.read((zp + 1) & 0xff) << 8);
        addr = (base + this.y) & 0xffff;
        crossed = (base ^ addr) & 0xff00 ? 1 : 0;
        break;
      }
      case REL: {
        const off = this.read(this.pc); this.pc = (this.pc + 1) & 0xffff;
        addr = (this.pc + (off < 128 ? off : off - 256)) & 0xffff;
        break;
      }
    }
    if (crossed && OP_PENALTY[opcode]) cycles++;
    this.opCycles = cycles; // lets the bus run the PPU up to this instruction's memory access

    cycles += this.exec(OP_NAME[opcode], mode, addr);
    this.cycles += cycles;
    return cycles;
  }

  branch(cond, addr) {
    if (!cond) return 0;
    const extra = (this.pc ^ addr) & 0xff00 ? 2 : 1;
    this.pc = addr;
    return extra;
  }

  adc(m) {
    const s = this.a + m + this.c;
    this.v = (~(this.a ^ m) & (this.a ^ s) & 0x80) ? 1 : 0;
    this.c = s > 0xff ? 1 : 0;
    this.a = s & 0xff;
    this.nz(this.a);
  }

  cmp(r, m) {
    const t = r - m;
    this.c = t >= 0 ? 1 : 0;
    this.nz(t & 0xff);
  }

  asl(v) { this.c = v >> 7; v = (v << 1) & 0xff; this.nz(v); return v; }
  lsr(v) { this.c = v & 1; v >>= 1; this.nz(v); return v; }
  rol(v) { const c = this.c; this.c = v >> 7; v = ((v << 1) | c) & 0xff; this.nz(v); return v; }
  ror(v) { const c = this.c; this.c = v & 1; v = (v >> 1) | (c << 7); this.nz(v); return v; }

  // read-modify-write helper; accumulator mode operates on A
  rmw(mode, addr, fn) {
    if (mode === ACC) { this.a = fn(this.a); return; }
    this.write(addr, fn(this.read(addr)));
  }

  // returns extra cycles (branches only)
  exec(name, mode, addr) {
    switch (name) {
      case 'LDA': this.a = this.read(addr); this.nz(this.a); break;
      case 'LDX': this.x = this.read(addr); this.nz(this.x); break;
      case 'LDY': this.y = this.read(addr); this.nz(this.y); break;
      case 'STA': this.write(addr, this.a); break;
      case 'STX': this.write(addr, this.x); break;
      case 'STY': this.write(addr, this.y); break;
      case 'TAX': this.x = this.a; this.nz(this.x); break;
      case 'TAY': this.y = this.a; this.nz(this.y); break;
      case 'TXA': this.a = this.x; this.nz(this.a); break;
      case 'TYA': this.a = this.y; this.nz(this.a); break;
      case 'TSX': this.x = this.sp; this.nz(this.x); break;
      case 'TXS': this.sp = this.x; break;
      case 'PHA': this.push(this.a); break;
      case 'PHP': this.push(this.getP(true)); break;
      case 'PLA': this.a = this.pull(); this.nz(this.a); break;
      case 'PLP': this.setP(this.pull()); break;
      case 'AND': this.a &= this.read(addr); this.nz(this.a); break;
      case 'ORA': this.a |= this.read(addr); this.nz(this.a); break;
      case 'EOR': this.a ^= this.read(addr); this.nz(this.a); break;
      case 'ADC': this.adc(this.read(addr)); break;
      case 'SBC': this.adc(this.read(addr) ^ 0xff); break;
      case 'CMP': this.cmp(this.a, this.read(addr)); break;
      case 'CPX': this.cmp(this.x, this.read(addr)); break;
      case 'CPY': this.cmp(this.y, this.read(addr)); break;
      case 'BIT': {
        const m = this.read(addr);
        this.z = (this.a & m) === 0 ? 1 : 0;
        this.v = (m >> 6) & 1;
        this.n = m >> 7;
        break;
      }
      case 'INC': this.rmw(mode, addr, (v) => { v = (v + 1) & 0xff; this.nz(v); return v; }); break;
      case 'DEC': this.rmw(mode, addr, (v) => { v = (v - 1) & 0xff; this.nz(v); return v; }); break;
      case 'INX': this.x = (this.x + 1) & 0xff; this.nz(this.x); break;
      case 'INY': this.y = (this.y + 1) & 0xff; this.nz(this.y); break;
      case 'DEX': this.x = (this.x - 1) & 0xff; this.nz(this.x); break;
      case 'DEY': this.y = (this.y - 1) & 0xff; this.nz(this.y); break;
      case 'ASL': this.rmw(mode, addr, (v) => this.asl(v)); break;
      case 'LSR': this.rmw(mode, addr, (v) => this.lsr(v)); break;
      case 'ROL': this.rmw(mode, addr, (v) => this.rol(v)); break;
      case 'ROR': this.rmw(mode, addr, (v) => this.ror(v)); break;
      case 'JMP': this.pc = addr; break;
      case 'JSR': {
        const ret = (this.pc - 1) & 0xffff;
        this.push(ret >> 8);
        this.push(ret & 0xff);
        this.pc = addr;
        break;
      }
      case 'RTS': {
        const lo = this.pull();
        this.pc = ((lo | (this.pull() << 8)) + 1) & 0xffff;
        break;
      }
      case 'RTI': {
        this.setP(this.pull());
        const lo = this.pull();
        this.pc = lo | (this.pull() << 8);
        break;
      }
      case 'BRK':
        this.pc = (this.pc + 1) & 0xffff;
        this.interrupt(0xfffe, true);
        break;
      case 'BPL': return this.branch(!this.n, addr);
      case 'BMI': return this.branch(this.n, addr);
      case 'BVC': return this.branch(!this.v, addr);
      case 'BVS': return this.branch(this.v, addr);
      case 'BCC': return this.branch(!this.c, addr);
      case 'BCS': return this.branch(this.c, addr);
      case 'BNE': return this.branch(!this.z, addr);
      case 'BEQ': return this.branch(this.z, addr);
      case 'CLC': this.c = 0; break;
      case 'SEC': this.c = 1; break;
      case 'CLI': this.i = 0; break;
      case 'SEI': this.i = 1; break;
      case 'CLD': this.d = 0; break;
      case 'SED': this.d = 1; break;
      case 'CLV': this.v = 0; break;
      // unofficial
      case 'LAX': this.a = this.x = this.read(addr); this.nz(this.a); break;
      case 'SAX': this.write(addr, this.a & this.x); break;
      case 'DCP': {
        const v = (this.read(addr) - 1) & 0xff;
        this.write(addr, v);
        this.cmp(this.a, v);
        break;
      }
      case 'ISB': {
        const v = (this.read(addr) + 1) & 0xff;
        this.write(addr, v);
        this.adc(v ^ 0xff);
        break;
      }
      case 'SLO': {
        const v = this.asl(this.read(addr));
        this.write(addr, v);
        this.a |= v; this.nz(this.a);
        break;
      }
      case 'RLA': {
        const v = this.rol(this.read(addr));
        this.write(addr, v);
        this.a &= v; this.nz(this.a);
        break;
      }
      case 'SRE': {
        const v = this.lsr(this.read(addr));
        this.write(addr, v);
        this.a ^= v; this.nz(this.a);
        break;
      }
      case 'RRA': {
        const v = this.ror(this.read(addr));
        this.write(addr, v);
        this.adc(v);
        break;
      }
      case 'NOP':
        // unofficial NOPs with operands still perform the read (side effects on I/O registers)
        if (mode !== IMP && mode !== IMM) this.read(addr);
        break;
    }
    return 0;
  }
}
