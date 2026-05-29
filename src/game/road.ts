import { mulberry32, stringHash } from '../util/math';
import type { Mode, Road, Segment } from '../util/types';
import { DRAW_DISTANCE, LAP_SEED, NUM_SEGMENTS_LAP, SEGMENT_LENGTH } from './physics';

const ENDLESS_INITIAL_SEGMENTS = 1000;
// Endless lifecycle thresholds (in segments). CLAUDE.md's verbatim spec had
// grow at < 200, which is LESS than DRAW_DISTANCE (300) — the render loop
// reads `playerSegmentIndex .. playerSegmentIndex + DRAW_DISTANCE`, so the
// buffer ahead must always exceed DRAW_DISTANCE or lookupSegment runs off the
// end between a free and the next grow. Threshold is DRAW_DISTANCE + 100
// safety; grow appends 500 so each grow buys ~600 segments of headroom.
const ENDLESS_GROW_THRESHOLD = DRAW_DISTANCE + 100; // append when buffer ahead < this
const ENDLESS_GROW_COUNT = 500; // segments appended each grow
const ENDLESS_FREE_THRESHOLD = 50; // free when player is > this past oldest
const ENDLESS_FREE_COUNT = 50; // segments freed each free

// Endless-mode curve generator constants. Open-ended random walk via three
// summed sines at distinct (non-commensurate) wavelengths. RMS ≈ 0.3 — matches
// CLAUDE.md's "typical curve = 0.3" calibration for centripetal feel.
const ENDLESS_A1 = 0.35;
const ENDLESS_A2 = 0.15;
const ENDLESS_A3 = 0.05;
const ENDLESS_F1 = (2 * Math.PI) / 800; // ~800 m wavelength
const ENDLESS_F2 = (2 * Math.PI) / 350; // ~350 m
const ENDLESS_F3 = (2 * Math.PI) / 150; // ~150 m

export function buildRoad(mode: Mode): Road {
  if (mode === 'lap') {
    const curveAt = buildLapCurve();
    const segments = generateSegments(curveAt, 0, NUM_SEGMENTS_LAP);
    return { mode, segments, oldestRetainedIndex: 0 };
  }

  // Endless: draw phase offsets once, store on the Road so generate-ahead can
  // reproduce the same curve at higher indices later.
  const rng = mulberry32(Date.now() >>> 0);
  const phases: readonly [number, number, number] = [
    rng() * 2 * Math.PI,
    rng() * 2 * Math.PI,
    rng() * 2 * Math.PI,
  ];
  const curveAt = makeEndlessCurve(phases);
  const segments = generateSegments(curveAt, 0, ENDLESS_INITIAL_SEGMENTS);
  return { mode, segments, oldestRetainedIndex: 0, endlessPhases: phases };
}

// C1-continuous closed-loop generator for lap mode. Integer-multiple
// frequencies of 2π/L guarantee:
//   • curve(0) == curve(L)  (sin(0) = sin(2πk) = 0 for any integer k)
//   • curve'(0) == curve'(L) (cos(0) = cos(2πk) = 1)
// so the wrap from segment 749's far edge to segment 0's near edge is seamless
// with no kink. No correction pass needed — closure holds by construction.
// Amplitudes get small seeded perturbations for per-seed track variety while
// preserving the closure property.
function buildLapCurve(): (z: number) => number {
  const L = NUM_SEGMENTS_LAP * SEGMENT_LENGTH;
  const k = (2 * Math.PI) / L;
  const rng = mulberry32(stringHash(LAP_SEED));
  // A1 base dropped from CLAUDE.md's nominal 0.6 → 0.5 per its own playtest
  // tuning note: keeps the worst-case peak under ~1.0, so a 0.3 curve at top
  // speed only drifts 0.15 /s lateral — gentle counter-steer (~1.5 /s) easily
  // holds the line. Closure still C1 since amplitude scaling doesn't touch the
  // integer-frequency property.
  const A1 = 0.5 + (rng() - 0.5) * 0.2; // 0.4 .. 0.6
  const A2 = 0.3 + (rng() - 0.5) * 0.2; // 0.2 .. 0.4
  const A3 = 0.15 + (rng() - 0.5) * 0.2; // 0.05 .. 0.25
  return (z) => A1 * Math.sin(k * z) + A2 * Math.sin(2 * k * z) + A3 * Math.sin(3 * k * z);
}

function makeEndlessCurve(phases: readonly [number, number, number]): (z: number) => number {
  return (z) =>
    ENDLESS_A1 * Math.sin(ENDLESS_F1 * z + phases[0]) +
    ENDLESS_A2 * Math.sin(ENDLESS_F2 * z + phases[1]) +
    ENDLESS_A3 * Math.sin(ENDLESS_F3 * z + phases[2]);
}

function generateSegments(
  curveAt: (z: number) => number,
  startIndex: number,
  count: number,
): Segment[] {
  const segments: Segment[] = new Array(count);
  for (let i = 0; i < count; i++) {
    const idx = startIndex + i;
    const z = idx * SEGMENT_LENGTH;
    segments[i] = {
      index: idx,
      curve: curveAt(z),
      worldZ: z,
      color: idx % 2 === 0 ? 'light' : 'dark',
    };
  }
  return segments;
}

// Maintain the endless-mode segment window each frame: append more ahead when
// the buffer runs low, and free segments well behind the player so memory stays
// bounded on long drives. Lap mode is closed and never needs this.
export function maintainEndlessRoad(road: Road, playerSegmentIndex: number): void {
  if (road.mode !== 'endless' || !road.endlessPhases) return;

  const last = road.segments.at(-1);
  if (last && last.index - playerSegmentIndex < ENDLESS_GROW_THRESHOLD) {
    const curveAt = makeEndlessCurve(road.endlessPhases);
    const more = generateSegments(curveAt, last.index + 1, ENDLESS_GROW_COUNT);
    road.segments.push(...more);
  }

  if (playerSegmentIndex - road.oldestRetainedIndex > ENDLESS_FREE_THRESHOLD) {
    road.segments.splice(0, ENDLESS_FREE_COUNT);
    road.oldestRetainedIndex += ENDLESS_FREE_COUNT;
  }
}

// Resolve an absolute (monotonic) segment index to its stored Segment.
// Handles lap-mode wrap and endless-mode windowing (oldestRetainedIndex offset).
export function lookupSegment(road: Road, absoluteIndex: number): Segment {
  if (road.mode === 'lap') {
    const len = road.segments.length;
    const wrapped = ((absoluteIndex % len) + len) % len;
    const seg = road.segments[wrapped];
    if (!seg) throw new Error(`lap segment lookup out of bounds: ${wrapped}`);
    return seg;
  }
  const arrayIdx = absoluteIndex - road.oldestRetainedIndex;
  if (arrayIdx < 0) {
    // Defensive: asked for a freed segment. Render loop starts at the player's
    // segment and segments are freed well behind the player, so this should
    // never fire in practice.
    const head = road.segments[0];
    if (!head) throw new Error('road has no segments');
    return head;
  }
  const seg = road.segments[arrayIdx];
  if (!seg) {
    throw new Error(`endless segment lookup out of bounds: ${arrayIdx}/${road.segments.length}`);
  }
  return seg;
}
