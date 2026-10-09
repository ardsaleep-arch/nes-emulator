#!/bin/sh
# Downloads freely distributable test ROMs into tests/roms (not committed).
set -e
cd "$(dirname "$0")"
mkdir -p roms
B=https://raw.githubusercontent.com/christopherpow/nes-test-roms/master
curl -fsSL -o roms/nestest.nes $B/other/nestest.nes
curl -fsSL -o roms/nestest.log $B/other/nestest.log
curl -fsSL -o roms/instr_official.nes $B/instr_test-v5/official_only.nes
curl -fsSL -o roms/ppu_vbl_basics.nes $B/ppu_vbl_nmi/rom_singles/01-vbl_basics.nes
curl -fsSL -o roms/sprite_hit_basics.nes $B/sprite_hit_tests_2005.10.05/01.basics.nes
curl -fsSL -o roms/apu_len_ctr.nes $B/apu_test/rom_singles/1-len_ctr.nes
