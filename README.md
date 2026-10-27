# NES Emulator (Web)

NES emulator ที่รันในเบราว์เซอร์ เขียนด้วย JavaScript (ES modules) ไม่ต้องมี build step

- CPU 6502 (official + unofficial opcodes ที่ใช้บ่อย) — ผ่าน `nestest` ตรงทุกบรรทัดรวม cycle count
- PPU ระดับ dot (background + sprites, sprite 0 hit, scroll register จริง)
- APU: pulse x2, triangle, noise, DMC (ผ่าน AudioWorklet)
- Mappers: 0 (NROM), 1 (MMC1), 2 (UxROM), 3 (CNROM), 4 (MMC3), 91 (J.Y. Company), 230 (22-in-1 multicart: เปิดเครื่อง = Contra, กดรีเซ็ต = เมนู 22-in-1)
- คีย์บอร์ด + Gamepad (ตั้งปุ่มเองได้ทั้งคีย์บอร์ดและเกมแพด, ปุ่ม Turbo A/B เก็บใน localStorage), เต็มจอ (ปุ่ม F หรือดับเบิลคลิกจอ), battery save (localStorage)

## วิธีรัน

```sh
python3 -m http.server 8000
```

เปิด http://localhost:8000 แล้วเลือก/ลากไฟล์ `.nes` มาวาง (ไม่มี ROM ให้ในโปรเจกต์ ต้องใช้ ROM ของคุณเอง)

| ปุ่ม | หน้าที่ |
|---|---|
| ลูกศร | D-pad |
| Z / X | B / A |
| Enter | Start |
| Shift | Select |
| S / A | Turbo A / Turbo B (ปรับความเร็ว 30/15/10 ครั้งต่อวินาทีในหน้าตั้งค่าปุ่ม) |

## ทดสอบ

```sh
tests/fetch-roms.sh        # โหลด test ROM (ไม่ commit)
```

เปิด `tests/nestest.html`, `tests/blargg.html?rom=instr_official.nes`, `tests/screen.html?rom=...` ในเบราว์เซอร์ผ่าน http server

ผลที่ผ่านแล้ว: nestest, instr_test-v5 (official, MMC1), ppu_vbl_nmi 01, sprite_hit basics, apu_test 1-len_ctr

## ข้อจำกัดที่ทราบ

- MMC3 IRQ นับทุก scanline ที่ dot 260 ขณะ render เปิด ไม่ได้ตรวจขอบ A12 จริง จึงไม่ผ่าน mmc3_test_2 ข้อ 1-clocking และ 2-details (ที่สลับ A12 ผ่าน $2006)
- timing ระดับ instruction ไม่ใช่ cycle-exact ภายในคำสั่ง บางเกมที่พึ่ง timing ละเอียดอาจผิดเพี้ยน
- ยังไม่มี save state, PAL, mapper อื่น
