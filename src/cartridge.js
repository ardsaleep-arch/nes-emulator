import { createMapper } from './mappers/index.js';
import { MIRROR } from './constants.js';

export class Cartridge {
  constructor(data) {
    const h = data;
    if (h[0] !== 0x4e || h[1] !== 0x45 || h[2] !== 0x53 || h[3] !== 0x1a) {
      throw new Error('ไม่ใช่ไฟล์ iNES (.nes)');
    }
    const prgBanks = h[4];
    const chrBanks = h[5];
    const flags6 = h[6];
    const flags7 = h[7];
    this.mapperId = (flags7 & 0xf0) | (flags6 >> 4);
    this.battery = (flags6 & 2) !== 0;
    this.mirroring = flags6 & 8 ? MIRROR.FOUR : flags6 & 1 ? MIRROR.V : MIRROR.H;

    let off = 16 + (flags6 & 4 ? 512 : 0);
    this.prg = data.slice(off, off + prgBanks * 0x4000);
    off += prgBanks * 0x4000;
    this.chrRam = chrBanks === 0;
    this.chr = this.chrRam ? new Uint8Array(0x2000) : data.slice(off, off + chrBanks * 0x2000);

    this.checksum = 0;
    for (let i = 0; i < this.prg.length; i++) this.checksum = (this.checksum * 31 + this.prg[i]) >>> 0;

    this.mapper = createMapper(this);
  }
}
