// All tunable game-feel constants live here. Units: metres, m/s, m/s².
// See CLAUDE.md "Camera geometry — three constraints" before adjusting any of
// CAMERA_HEIGHT / CAMERA_DEPTH_BEHIND / SEGMENT_LENGTH / ROAD_WIDTH — they're
// coupled and break the road rendering if changed individually.

import { HapticBus } from '../haptics/eventBus';
import type { InputState } from '../input/input';
import { applyCollision } from './collisions';
import type { GameState } from './state';
import { getTerrain } from './terrain';

export const TOP_SPEED_KMH = 300;
export const TOP_SPEED = TOP_SPEED_KMH / 3.6; // m/s, ≈ 83.33

export const ACCELERATION = 14;
export const BRAKE_DECEL = 30;
export const OFF_ROAD_DRAG = 50;
export const COLLISION_SPEED_LOSS = 0.5;

export const TURBO_MULTIPLIER = 1.4;
export const TURBO_DURATION = 3;
export const TURBO_COOLDOWN = 6;

export const LATERAL_RATE = 1.5;
export const CENTRIPETAL_FACTOR = 0.5;
export const WHEEL_RISE_RATE = 4;
export const WHEEL_RETURN_RATE = 5;

export const ROAD_WIDTH = 14;
export const SEGMENT_LENGTH = 10;
export const NUM_SEGMENTS_LAP = 750;
export const DRAW_DISTANCE = 300;

export const TRAFFIC_SPAWN_NEAR = 100;
export const TRAFFIC_SPAWN_FAR = 600;
export const CAR_WIDTH = 2;

export const FOV = 100;
export const CAMERA_HEIGHT = 12;
export const CAMERA_DEPTH_BEHIND = 10;
export const WALL_HEIGHT = 5;

export const LAP_SEED = 'ghost-iter1';

// Turbo state machine. READY → ARMED (accel pressed) → ACTIVE (held ≥1.0 s) →
// COOLDOWN (after TURBO_DURATION) → READY (after TURBO_COOLDOWN AND accel
// released). Re-arming requires releasing accelerate — holding through a full
// cycle leaves state at COOLDOWN until release. turbo_start/turbo_end emit at
// the ARMED→ACTIVE and ACTIVE→COOLDOWN transitions.
function updateTurbo(state: GameState, accel: boolean, dt: number): void {
  switch (state.turbo.state) {
    case 'READY':
      if (accel) {
        state.turbo.state = 'ARMED';
        state.turbo.timer = 0;
      }
      break;
    case 'ARMED':
      if (!accel) {
        state.turbo.state = 'READY';
      } else {
        state.turbo.timer += dt;
        if (state.turbo.timer >= 1) {
          state.turbo.state = 'ACTIVE';
          state.turbo.timer = 0;
          HapticBus.emit({ type: 'turbo_start' });
        }
      }
      break;
    case 'ACTIVE':
      state.turbo.timer += dt;
      if (state.turbo.timer >= TURBO_DURATION) {
        state.turbo.state = 'COOLDOWN';
        state.turbo.timer = 0;
        HapticBus.emit({ type: 'turbo_end' });
      }
      break;
    case 'COOLDOWN':
      state.turbo.timer += dt;
      if (state.turbo.timer >= TURBO_COOLDOWN && !accel) {
        state.turbo.state = 'READY';
        state.turbo.timer = 0;
      }
      break;
  }
}

// Per-frame physics integrator implementing CLAUDE.md's full 10-step order.
// Steps 9 (lap-wrap) and 10 (traffic) arrive in later build steps.
//
// `currentCurve` is the curve of the segment the player is in, passed by the
// caller (which holds the road) — keeps physics decoupled from road storage.
export function updatePhysics(
  state: GameState,
  input: InputState,
  currentCurve: number,
  dt: number,
): void {
  // Step 1: mirror input.wheel into state (rise/return integration lives in
  // the keyboard adapter; hardware will write wheel directly).
  state.wheel = input.wheel;

  // Terrain modifiers — scale the asphalt-baseline constants. Looked up once
  // per frame; the same terrain also drives the palette and the wheel feel.
  const terrain = getTerrain(state.terrain);

  // Step 2: speed update.
  // 2a: turbo state machine — may transition states and emit events.
  updateTurbo(state, input.accelerate, dt);

  // 2b: accel + brake.
  if (input.accelerate) state.currentSpeed += ACCELERATION * dt;
  if (input.brake) state.currentSpeed -= BRAKE_DECEL * dt;

  // 2c: off-road drag — uses PRIOR frame's playerX (steps 3/4 update it AFTER
  // this, so reading state.playerX here gives last frame's value). The one-
  // frame lag is invisible at 30+ fps.
  //
  // Scaled by speed so drag tapers off as the car slows. A flat 50 m/s² drag
  // would overwhelm throttle (14 m/s²) → speed decays to 0 → steering
  // authority (gated on speed) dies → soft-lock against the wall with no
  // escape. Speed-scaling means drag and throttle reach equilibrium near
  // v ≈ 0.28 × TOP_SPEED on grass — punishing but recoverable, and recovery
  // counter-steering still works because the car isn't pinned at v = 0. The
  // continuous "scraping the wall" haptic still ships via the 10 Hz off_road
  // event (step 7), unchanged.
  if (Math.abs(state.playerX) > 1) {
    state.currentSpeed -=
      OFF_ROAD_DRAG * terrain.offRoadDragMul * (state.currentSpeed / TOP_SPEED) * dt;
  }

  // 2d: clamp speed to [0, currentMaxSpeed]. On ACTIVE → COOLDOWN edges the
  // speed is likely above TOP_SPEED — soft-decay at BRAKE_DECEL/2 so the cap
  // drop isn't a visible jolt, rather than hard-clamping.
  if (state.currentSpeed < 0) state.currentSpeed = 0;
  const currentMaxSpeed = state.turbo.state === 'ACTIVE' ? TOP_SPEED * TURBO_MULTIPLIER : TOP_SPEED;
  if (state.currentSpeed > currentMaxSpeed) {
    if (state.turbo.state === 'ACTIVE') {
      state.currentSpeed = currentMaxSpeed;
    } else {
      state.currentSpeed -= (BRAKE_DECEL / 2) * dt;
      if (state.currentSpeed < TOP_SPEED) state.currentSpeed = TOP_SPEED;
    }
  }

  const speedNormalized = state.currentSpeed / TOP_SPEED;

  // Step 3: steering. Pure lateral velocity — no heading, no clamp here. Wall
  // collision (step 5) is the canonical clamp. Multiplying by speedNormalized
  // means a stationary car can't steer, and at top speed full input traverses
  // the road's normalised range (2 wide) in 2/1.5 ≈ 1.33 s.
  state.playerX += state.wheel * LATERAL_RATE * speedNormalized * dt;

  // Step 4: centripetal — curves push the player outward, magnitude ∝ curve·v².
  // No clamp. v² reflects real physics; at turbo speed centripetal is ~2×
  // stronger, so curves bite harder. Counter-steer authority is 1.5/s at top
  // speed — ~10× a 0.3-curve's drift, so the player has to work but can hold.
  // centripetalMul is the terrain grip: >1 (ice) slides out harder, <1 (sand)
  // holds the line but pays for it in wheel weight.
  state.playerX -=
    currentCurve *
    speedNormalized *
    speedNormalized *
    CENTRIPETAL_FACTOR *
    terrain.centripetalMul *
    dt;

  // Step 5: wall collision. Leading-edge gating ensures one `collision` event
  // per impact — sustained contact (centripetal pinning into a curve's outer
  // wall) doesn't flood the bus. The continuous "scraping" feel comes from
  // off_road events (step 7), which fire at 10 Hz throughout the contact since
  // |playerX| > 1 there too.
  const hittingWall = Math.abs(state.playerX) >= 1.5;
  if (hittingWall && !state.againstWall) {
    applyCollision(state);
  }
  if (hittingWall) {
    state.playerX = Math.sign(state.playerX) * 1.49;
  }
  state.againstWall = hittingWall;

  // Step 6: advance world Z; segmentIndex is derived (monotonic, never wraps).
  // Mode-specific run-state tickers (HUD reads these): lap mode accumulates
  // the in-progress lap time; endless mode tracks total distance in km.
  state.playerZ += state.currentSpeed * dt;
  state.playerSegmentIndex = Math.floor(state.playerZ / SEGMENT_LENGTH);
  if (state.mode === 'lap') {
    state.lap.currentLapTime += dt;
  } else {
    state.endlessDistance = state.playerZ / 1000;
  }

  // Step 7: off-road haptic emit (10 Hz throttle). The "reset to threshold on
  // exit" detail makes the first event of a new excursion fire immediately
  // rather than after a 100 ms delay.
  state.offRoadEmitTimer += dt;
  const isOffRoad = Math.abs(state.playerX) > 1;
  if (isOffRoad && state.offRoadEmitTimer >= 0.1) {
    HapticBus.emit({
      type: 'off_road',
      // Maps [1.0, 1.5] → [0, 1]. The ×2 is because playerX maxes at 1.5
      // (wall), so without it intensity would top out at 0.5 — the haptic
      // device is calibrated for [0, 1] and wall-grinding should hit full.
      intensity: Math.min(1, (Math.abs(state.playerX) - 1) * 2),
    });
    state.offRoadEmitTimer = 0;
  }
  if (!isOffRoad) state.offRoadEmitTimer = 0.1;

  // Step 8: curve_load haptic emit (10 Hz throttle, gated by lateralG > 0.2 so
  // gentle sweepers don't constantly buzz the wheel).
  state.curveLoadEmitTimer += dt;
  const lateralG = Math.min(1, Math.abs(currentCurve * speedNormalized * speedNormalized));
  const inCurve = lateralG > 0.2;
  if (inCurve && state.curveLoadEmitTimer >= 0.1) {
    HapticBus.emit({ type: 'curve_load', lateralG });
    state.curveLoadEmitTimer = 0;
  }
  if (!inCurve) state.curveLoadEmitTimer = 0.1;

  // Step 9: lap completion (lap mode only). Lap progress comes directly from
  // the monotonic playerSegmentIndex — no prevSegmentIndex bookkeeping needed.
  // On a fresh wrap: bank the just-finished lap into best + total, reset the
  // running timer, advance the lap counter. On the 3rd wrap, transition to the
  // finish screen.
  if (state.mode === 'lap') {
    const lapsCompleted = Math.floor(state.playerSegmentIndex / NUM_SEGMENTS_LAP);
    if (lapsCompleted > state.lap.current) {
      // Defensive: don't bank near-zero times from the dev `]` jump near race
      // start (would set a bestLapTime that nothing can beat).
      if (state.lap.currentLapTime > 0) {
        if (state.lap.bestLapTime === null || state.lap.currentLapTime < state.lap.bestLapTime) {
          state.lap.bestLapTime = state.lap.currentLapTime;
        }
        state.lap.totalTime += state.lap.currentLapTime;
      }
      state.lap.current = lapsCompleted;
      state.lap.currentLapTime = 0;
      HapticBus.emit({ type: 'lap_complete' });
      if (lapsCompleted >= 3) {
        state.lap.finished = true;
        state.screen = 'finish';
      }
    }
  }
}
