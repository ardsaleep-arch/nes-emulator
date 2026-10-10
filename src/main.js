import { NES } from './nes.js';
import { Input, BUTTON_NAMES } from './input.js';
import { AudioOut } from './audio.js';

const FRAME_MS = 1000 / 60.0988;

const canvas = document.getElementById('screen');
const ctx = canvas.getContext('2d');
const image = ctx.createImageData(256, 240);
const pixels = new Uint32Array(image.data.buffer);
const status = document.getElementById('status');
const pauseBtn = document.getElementById('pause');

const nes = new NES();
const input = new Input();
const audio = new AudioOut();

let running = false;
let paused = false;
let last = 0;
let behind = 0;
let saveKey = null;
let lastSave = 0;

function setStatus(msg) {
  status.textContent = msg;
}

async function loadRom(file) {
  try {
    const data = new Uint8Array(await file.arrayBuffer());
    nes.load(data);
  } catch (e) {
    setStatus(`โหลดไม่สำเร็จ: ${e.message}`);
    return;
  }
  try {
    nes.apu.sampleRate = await audio.start();
  } catch (e) {
    console.warn('audio unavailable', e);
  }
  loadBattery();
  setStatus(`${file.name} — mapper ${nes.cart.mapperId}`);
  if (!running) {
    running = true;
    last = performance.now();
    requestAnimationFrame(tick);
  }
  paused = false;
  pauseBtn.textContent = 'หยุดชั่วคราว';
}

function loadBattery() {
  saveKey = nes.cart.battery ? `nes-sram-${nes.cart.checksum}` : null;
  if (!saveKey) return;
  try {
    const saved = localStorage.getItem(saveKey);
    if (saved) nes.cart.mapper.prgRam.set(Uint8Array.from(atob(saved), (c) => c.charCodeAt(0)));
  } catch {}
}

function saveBattery() {
  if (!saveKey) return;
  try {
    localStorage.setItem(saveKey, btoa(String.fromCharCode(...nes.cart.mapper.prgRam)));
  } catch {}
}

function tick(now) {
  requestAnimationFrame(tick);
  if (paused) {
    last = now;
    return;
  }
  behind += Math.min(now - last, 100);
  last = now;
  let frames = 0;
  while (behind >= FRAME_MS && frames < 4) {
    nes.bus.buttons[0] = input.read();
    nes.frame();
    behind -= FRAME_MS;
    frames++;
    audio.push(nes.takeSamples());
  }
  if (frames) {
    pixels.set(nes.ppu.framebuffer);
    ctx.putImageData(image, 0, 0);
  }
  if (now - lastSave > 5000) {
    lastSave = now;
    saveBattery();
  }
}

document.getElementById('rom').addEventListener('change', (e) => {
  if (e.target.files[0]) loadRom(e.target.files[0]);
});
pauseBtn.addEventListener('click', () => {
  paused = !paused;
  pauseBtn.textContent = paused ? 'เล่นต่อ' : 'หยุดชั่วคราว';
});
document.getElementById('reset').addEventListener('click', () => nes.cart && nes.reset());
const volume = document.getElementById('volume');
volume.addEventListener('input', () => audio.setVolume(volume.value / 100));
audio.setVolume(volume.value / 100); // the browser may restore a slider position on reload

addEventListener('dragover', (e) => e.preventDefault());
addEventListener('drop', (e) => {
  e.preventDefault();
  if (e.dataTransfer.files[0]) loadRom(e.dataTransfer.files[0]);
});
addEventListener('pagehide', saveBattery);

// fullscreen
const stage = document.getElementById('stage');
function toggleFullscreen() {
  if (document.fullscreenElement) document.exitFullscreen();
  else stage.requestFullscreen?.().catch((e) => setStatus(`เข้าโหมดเต็มจอไม่ได้: ${e.message}`));
}
document.getElementById('fullscreen').addEventListener('click', toggleFullscreen);
addEventListener('keydown', (e) => {
  if (e.code === 'KeyF' && !input.keyCapture && !input.keyMap.includes('KeyF') && !e.repeat && !e.metaKey && !e.ctrlKey) toggleFullscreen();
});
stage.addEventListener('dblclick', toggleFullscreen);

// gamepad settings
const dlg = document.getElementById('paddlg');
const rows = document.getElementById('padrows');
const padInfo = document.getElementById('padinfo');
let capturing = null;
let captureTimer = 0;

function bindingText(m) {
  return m.b !== undefined ? `ปุ่ม ${m.b}` : `แกน ${m.a} ${m.d > 0 ? '+' : '−'}`;
}

function keyText(code) {
  if (!code) return '—';
  return code.replace(/^Key/, '').replace(/^Digit/, '').replace(/^Arrow/, '↔ ').replace(/^Numpad/, 'Num ');
}

// capturing: null | { bit, kind: 'pad' | 'key' }
function renderPad() {
  const pad = input.pad();
  padInfo.textContent = pad ? `ตรวจพบเกมแพด: ${pad.id}` : 'ไม่พบเกมแพด — เสียบแล้วกดปุ่มใดก็ได้เพื่อให้เบราว์เซอร์ตรวจพบ';
  rows.replaceChildren();
  const head = (t) => Object.assign(document.createElement('b'), { textContent: t });
  rows.append(head(''), head('คีย์บอร์ด'), head('เกมแพด'));
  BUTTON_NAMES.forEach((name, bit) => {
    const label = document.createElement('span');
    label.textContent = name;
    const cell = (kind, text) => {
      const btn = document.createElement('button');
      const active = capturing?.bit === bit && capturing.kind === kind;
      btn.textContent = active ? (kind === 'key' ? 'กดแป้น… (Esc ยกเลิก)' : 'กดปุ่มบนจอย…') : text;
      btn.className = active ? 'wait' : '';
      btn.addEventListener('click', () => startCapture(bit, kind));
      return btn;
    };
    rows.append(label, cell('key', keyText(input.keyMap[bit])), cell('pad', bindingText(input.map[bit])));
  });
}

function stopCapture() {
  capturing = null;
  input.keyCapture = null;
  clearInterval(captureTimer);
}

function startCapture(bit, kind) {
  stopCapture();
  capturing = { bit, kind };
  if (kind === 'key') {
    input.keyCapture = (code) => {
      if (code !== 'Escape') input.setKey(bit, code);
      stopCapture();
      renderPad();
    };
  } else {
    let armed = false; // wait until everything is released so the click-time state isn't captured
    captureTimer = setInterval(() => {
      const b = input.captureBinding();
      if (!b) { armed = true; return; }
      if (!armed) return;
      input.setMap(bit, b);
      stopCapture();
      renderPad();
    }, 50);
  }
  renderPad();
}

document.getElementById('padcfg').addEventListener('click', () => {
  if (document.fullscreenElement) document.exitFullscreen();
  renderPad();
  dlg.showModal();
});
document.getElementById('padreset').addEventListener('click', () => { stopCapture(); input.resetMap(); input.resetKeys(); renderPad(); });
document.getElementById('padclose').addEventListener('click', () => dlg.close());
dlg.addEventListener('close', stopCapture);
// Esc while waiting for a key cancels the capture instead of closing the dialog
dlg.addEventListener('cancel', (e) => { if (capturing) e.preventDefault(); });
addEventListener('gamepadconnected', () => dlg.open && renderPad());
addEventListener('gamepaddisconnected', () => dlg.open && renderPad());

// exposed for debugging / automated tests
window.nes = nes;
