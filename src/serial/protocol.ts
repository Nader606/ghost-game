// Ghost yoke serial protocol — single source of truth, mirrored in the firmware
// Protocol.h. Line-based ASCII, '\n'-terminated, so every frame is readable in
// the Arduino Serial Monitor during the WP22 demo. No checksum: parsers must be
// fail-safe (see ghostSerial.ts) since one dropped byte must not become garbage
// steering.
//
// SIGN CONVENTION (load-bearing — input sign and FFB push direction must agree):
//   wheel  > 0  → steering RIGHT  (matches keyboard: → ramps wheel toward +1)
//   lateral > 0 → RIGHT-hand curve load (curve > 0). The firmware opposes it by
//                 pushing the wheel the physically-correct way; if the wheel
//                 fights the wrong direction in corners, flip the sign HERE, not
//                 in the firmware, so both ends stay consistent.

export const BAUD_RATE = 115200;

// Fixed-point scale: floats in [-1,1] / [0,1] are sent as integer milli-units to
// keep frames compact and integer-parseable on the MCU.
const MILLI = 1000;

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
const toMilli = (v: number, lo: number, hi: number) => Math.round(clamp(v, lo, hi) * MILLI);

// ── Browser → Arduino (haptics + telemetry) ────────────────────────────────

// Continuous feel, sent ~30 Hz. Drives fan idle (speed), stepper centering
// resistance (lateral), and off-road rumble (offroad).
export function encodeTelemetry(speed01: number, lateralSigned: number, offroad01: number): string {
  return `T ${toMilli(speed01, 0, 1)} ${toMilli(lateralSigned, -1, 1)} ${toMilli(offroad01, 0, 1)}\n`;
}

// Discrete one-shot kick on wall/traffic impact.
export function encodeCollision(severity01: number): string {
  return `C ${toMilli(severity01, 0, 1)}\n`;
}

// Turbo edges → full fan blast on / off.
export function encodeTurbo(active: boolean): string {
  return active ? 'B1\n' : 'B0\n';
}

// Optional lap-crossing pulse.
export function encodeLap(): string {
  return 'L\n';
}

// Surface feel — terrain baseline for the wheel: continuous rumble amplitude
// (firmware scales it by speed) and steering resistance (stepper holding
// current). Re-sent at ~1 Hz so a mid-game reconnect or a dropped line still
// converges on the right feel. Terrain definitions live in game/terrain.ts;
// the firmware just renders whatever arrives.
export function encodeSurface(rumble01: number, resist01: number): string {
  return `S ${toMilli(rumble01, 0, 1)} ${toMilli(resist01, 0, 1)}\n`;
}

// ── Arduino → Browser (input) ───────────────────────────────────────────────

export interface ParsedInput {
  wheel: number; // -1..+1
  accelerate: boolean;
  brake: boolean;
}

// Parse one inbound line. Returns null on any malformation (wrong prefix, bad
// arity, non-numeric wheel) so the caller can keep its last good snapshot.
//   I <wheelMilli> <accel 0|1> <brake 0|1>
export function parseInputFrame(line: string): ParsedInput | null {
  const parts = line.trim().split(/\s+/);
  if (parts.length !== 4 || parts[0] !== 'I') return null;
  const wheelMilli = Number(parts[1]);
  if (!Number.isFinite(wheelMilli)) return null;
  return {
    wheel: clamp(wheelMilli / MILLI, -1, 1),
    accelerate: parts[2] === '1',
    brake: parts[3] === '1',
  };
}
