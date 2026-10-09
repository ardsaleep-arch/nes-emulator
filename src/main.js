import { NES } from './nes.js';
import { Input } from './input.js';
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
document.getElementById('volume').addEventListener('input', (e) => audio.setVolume(e.target.value / 100));

addEventListener('dragover', (e) => e.preventDefault());
addEventListener('drop', (e) => {
  e.preventDefault();
  if (e.dataTransfer.files[0]) loadRom(e.dataTransfer.files[0]);
});
addEventListener('pagehide', saveBattery);

// exposed for debugging / automated tests
window.nes = nes;
