// Button bits: A, B, Select, Start, Up, Down, Left, Right
const KEYS = {
  KeyX: 0, KeyZ: 1, ShiftLeft: 2, ShiftRight: 2, Enter: 3,
  ArrowUp: 4, ArrowDown: 5, ArrowLeft: 6, ArrowRight: 7,
};

export class Input {
  constructor() {
    this.keys = 0;
    addEventListener('keydown', (e) => this.onKey(e, true));
    addEventListener('keyup', (e) => this.onKey(e, false));
    addEventListener('blur', () => { this.keys = 0; });
  }

  onKey(e, down) {
    const bit = KEYS[e.code];
    if (bit === undefined) return;
    e.preventDefault();
    this.keys = down ? this.keys | (1 << bit) : this.keys & ~(1 << bit);
  }

  // Combined keyboard + first gamepad state
  read() {
    let state = this.keys;
    const pad = (navigator.getGamepads?.() || []).find((p) => p);
    if (pad) {
      const b = (i) => pad.buttons[i]?.pressed;
      if (b(0)) state |= 1;
      if (b(2) || b(1)) state |= 2;
      if (b(8)) state |= 4;
      if (b(9)) state |= 8;
      if (b(12) || pad.axes[1] < -0.5) state |= 16;
      if (b(13) || pad.axes[1] > 0.5) state |= 32;
      if (b(14) || pad.axes[0] < -0.5) state |= 64;
      if (b(15) || pad.axes[0] > 0.5) state |= 128;
    }
    return state;
  }
}
