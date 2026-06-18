// Bridges the game's haptic + telemetry output to the Ghost yoke over serial.
// Two paths:
//   1. Discrete HapticBus events (collision / turbo / lap) → one-shot commands.
//   2. Continuous telemetry (speed, curve load, off-road) → throttled `T` frames
//      read straight from GameState, since these aren't discrete events.
// off_road / curve_load HapticBus events are intentionally NOT forwarded here —
// their continuous feel rides the telemetry frame instead.

import { TOP_SPEED } from '../game/physics';
import type { GameState } from '../game/state';
import type { GhostSerial } from '../serial/ghostSerial';
import { encodeCollision, encodeLap, encodeTelemetry, encodeTurbo } from '../serial/protocol';
import { HapticBus } from './eventBus';

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

// Telemetry cadence: ~30 Hz is plenty for fan/centering feel and keeps the
// link well clear of saturation at 115200 baud.
const TELEMETRY_INTERVAL_MS = 33;
let lastTelemetryMs = -Infinity;

// Register the discrete-event listener. Returns an unsubscribe for symmetry,
// though iter-2 keeps it attached for the page lifetime.
export function attachSerialHaptics(serial: GhostSerial): () => void {
  const listener = (e: import('./eventBus').HapticEvent): void => {
    switch (e.type) {
      case 'collision':
        serial.write(encodeCollision(e.severity));
        break;
      case 'turbo_start':
        serial.write(encodeTurbo(true));
        break;
      case 'turbo_end':
        serial.write(encodeTurbo(false));
        break;
      case 'lap_complete':
        serial.write(encodeLap());
        break;
      // off_road / curve_load → telemetry frame, not here.
    }
  };
  HapticBus.on(listener);
  return () => HapticBus.off(listener);
}

// Called once per game frame with the player's current segment curve. Internally
// throttled, so calling every frame is fine. No-op when disconnected.
export function sendTelemetry(serial: GhostSerial, state: GameState, curve: number): void {
  if (!serial.isConnected) return;
  const now = performance.now();
  if (now - lastTelemetryMs < TELEMETRY_INTERVAL_MS) return;
  lastTelemetryMs = now;

  const speedNorm = state.currentSpeed / TOP_SPEED;
  // Signed curve load = curve · v² (same shape as the physics centripetal term).
  // Sign carries left/right; encodeTelemetry clamps to [-1,1].
  const lateral = curve * speedNorm * speedNorm;
  // Off-road amount maps [1.0, 1.5] (asphalt edge → wall) to [0, 1].
  const offroad = clamp((Math.abs(state.playerX) - 1) * 2, 0, 1);

  serial.write(encodeTelemetry(clamp(speedNorm, 0, 1), lateral, offroad));
}
