// Button bits: A, B, Select, Start, Up, Down, Left, Right, then virtual Turbo A / Turbo B
// (bits 8-9), which fold into A/B while the turbo clock is high.
const MAP_KEY = 'nes-pad-map';
const KEY_MAP_KEY = 'nes-key-map';
const TURBO_KEY = 'nes-turbo-rate';
const COUNT = 10;
export const TURBO_RATES = [30, 15, 10]; // presses per second; half-period = 30 / rate frames
const DEFAULT_KEYS = ['KeyX', 'KeyZ', 'ShiftLeft', 'Enter', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyS', 'KeyA'];
export const BUTTON_NAMES = ['A', 'B', 'Select', 'Start', 'Up', 'Down', 'Left', 'Right', 'Turbo A', 'Turbo B'];
// Standard-layout defaults, indexed by NES button bit
const DEFAULT_MAP = [
  { b: 0 }, { b: 2 }, { b: 8 }, { b: 9 },
  { b: 12 }, { b: 13 }, { b: 14 }, { b: 15 },
  { b: 1 }, { b: 3 },
];

export class Input {
  constructor() {
    this.keys = 0;
    this.map = this.loadMap();
    this.keyMap = this.loadKeyMap();
    this.turboRate = this.loadTurboRate();
    this.frame = 0;
    this.keyCapture = null; // callback(code) while the settings dialog waits for a key
    addEventListener('keydown', (e) => this.onKey(e, true));
    addEventListener('keyup', (e) => this.onKey(e, false));
    addEventListener('blur', () => { this.keys = 0; });
  }

  onKey(e, down) {
    if (this.keyCapture) {
      e.preventDefault();
      if (down && !e.repeat) this.keyCapture(e.code);
      return;
    }
    let hit = false;
    this.keyMap.forEach((code, bit) => {
      if (code !== e.code) return;
      hit = true;
      this.keys = down ? this.keys | (1 << bit) : this.keys & ~(1 << bit);
    });
    if (hit) e.preventDefault();
  }

  loadKeyMap() {
    try {
      const m = JSON.parse(localStorage.getItem(KEY_MAP_KEY));
      // Maps saved before turbo existed have 8 entries; fill the rest with defaults.
      if (Array.isArray(m) && m.length >= 8 && m.every((c) => typeof c === 'string')) {
        return DEFAULT_KEYS.map((d, i) => (i < m.length ? m[i] : m.includes(d) ? '' : d));
      }
    } catch {}
    return [...DEFAULT_KEYS];
  }

  // A key can drive only one NES button, so taking it from another button unbinds that one.
  setKey(bit, code) {
    this.keyMap = this.keyMap.map((c, i) => (i !== bit && c === code ? '' : c));
    this.keyMap[bit] = code;
    this.keys = 0;
    try { localStorage.setItem(KEY_MAP_KEY, JSON.stringify(this.keyMap)); } catch {}
  }

  resetKeys() {
    this.keyMap = [...DEFAULT_KEYS];
    this.keys = 0;
    try { localStorage.setItem(KEY_MAP_KEY, JSON.stringify(this.keyMap)); } catch {}
  }

  loadMap() {
    try {
      const m = JSON.parse(localStorage.getItem(MAP_KEY));
      if (Array.isArray(m) && m.length >= 8) return DEFAULT_MAP.map((d, i) => m[i] ?? { ...d });
    } catch {}
    return DEFAULT_MAP.map((x) => ({ ...x }));
  }

  setMap(bit, binding) {
    this.map[bit] = binding;
    this.saveMap();
  }

  resetMap() {
    this.map = DEFAULT_MAP.map((x) => ({ ...x }));
    this.saveMap();
  }

  saveMap() {
    try { localStorage.setItem(MAP_KEY, JSON.stringify(this.map)); } catch {}
  }

  loadTurboRate() {
    try {
      const r = Number(localStorage.getItem(TURBO_KEY));
      if (TURBO_RATES.includes(r)) return r;
    } catch {}
    return 15;
  }

  setTurboRate(rate) {
    this.turboRate = rate;
    try { localStorage.setItem(TURBO_KEY, String(rate)); } catch {}
  }

  pad() {
    return (navigator.getGamepads?.() || []).find((p) => p && p.connected);
  }

  // First pressed button / pushed axis on the pad, as a binding; null if idle.
  captureBinding() {
    const pad = this.pad();
    if (!pad) return null;
    const i = pad.buttons.findIndex((b) => b.pressed);
    if (i >= 0) return { b: i };
    const a = pad.axes.findIndex((v) => Math.abs(v) > 0.7);
    if (a >= 0) return { a, d: pad.axes[a] > 0 ? 1 : -1 };
    return null;
  }

  // Combined keyboard + first gamepad state as the 8 NES bits. Call once per frame.
  read() {
    let state = this.keys;
    const pad = this.pad();
    if (pad) {
      this.map.forEach((m, bit) => {
        const on = m.b !== undefined ? pad.buttons[m.b]?.pressed : (pad.axes[m.a] ?? 0) * m.d > 0.5;
        if (on) state |= 1 << bit;
      });
    }
    const half = 30 / this.turboRate;
    const turboOn = Math.floor(this.frame++ / half) % 2 === 0;
    return (state & 0xff) | (turboOn ? (state >> 8) & 3 : 0);
  }
}
