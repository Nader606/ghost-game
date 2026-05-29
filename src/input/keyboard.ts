import { WHEEL_RETURN_RATE, WHEEL_RISE_RATE } from '../game/physics';
import type { InputAdapter, InputState } from './input';

// Keyboard mock for the future Ghost yoke. Tracks Z/X (accelerate/brake) and
// ArrowLeft/Right (steering, integrated as a continuous signal in update(dt)).
// The InputAdapter abstraction means the game loop never branches on input
// source: swap this for a WebSerial adapter and nothing else changes.

export function createKeyboardAdapter(): InputAdapter {
  const keys = new Set<string>();
  let wheel = 0;

  const handleDown = (e: KeyboardEvent) => {
    keys.add(e.key.toLowerCase());
  };
  const handleUp = (e: KeyboardEvent) => {
    keys.delete(e.key.toLowerCase());
  };
  // When the window loses focus mid-press, the corresponding keyup may never
  // fire — without this, the player would "still be accelerating" after
  // alt-tabbing away. Clear all held keys on blur.
  const handleBlur = () => {
    keys.clear();
    wheel = 0;
  };

  return {
    start() {
      globalThis.addEventListener('keydown', handleDown);
      globalThis.addEventListener('keyup', handleUp);
      globalThis.addEventListener('blur', handleBlur);
    },
    stop() {
      globalThis.removeEventListener('keydown', handleDown);
      globalThis.removeEventListener('keyup', handleUp);
      globalThis.removeEventListener('blur', handleBlur);
      keys.clear();
      wheel = 0;
    },
    update(dt: number) {
      // ←/→ ramp the wheel toward ∓1 at WHEEL_RISE_RATE. Neither (or both)
      // held → decay toward 0 at WHEEL_RETURN_RATE. The continuous signal is
      // what makes keyboard play a faithful preview of the future encoder.
      const left = keys.has('arrowleft');
      const right = keys.has('arrowright');
      if (left && !right) {
        wheel = Math.max(-1, wheel - WHEEL_RISE_RATE * dt);
      } else if (right && !left) {
        wheel = Math.min(1, wheel + WHEEL_RISE_RATE * dt);
      } else if (wheel > 0) {
        wheel = Math.max(0, wheel - WHEEL_RETURN_RATE * dt);
      } else if (wheel < 0) {
        wheel = Math.min(0, wheel + WHEEL_RETURN_RATE * dt);
      }
    },
    read(): InputState {
      return {
        wheel,
        accelerate: keys.has('z'),
        brake: keys.has('x'),
      };
    },
  };
}
