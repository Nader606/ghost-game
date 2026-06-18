import type { GhostSerial } from '../serial/ghostSerial';
import type { InputAdapter, InputState } from './input';

// Hardware InputAdapter backed by the Ghost yoke over Web Serial. Drop-in
// replacement for the keyboard mock — the game loop never branches on source.
//
// Unlike the keyboard adapter, there's no rise/return integration: the AS5600
// encoder reports an absolute wheel angle directly, so `update()` is a no-op and
// `read()` just hands back the connection manager's cached snapshot. The serial
// lifecycle (connect/disconnect) is owned by GhostSerial + the connect button,
// so start()/stop() are no-ops here too.

export function createWebSerialAdapter(serial: GhostSerial): InputAdapter {
  return {
    start() {},
    stop() {},
    update(_dt: number) {},
    read(): InputState {
      const snap = serial.read();
      return {
        wheel: snap.wheel,
        accelerate: snap.accelerate,
        brake: snap.brake,
      };
    },
  };
}
