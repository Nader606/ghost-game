import type { TrafficCar } from '../util/types';
import { applyCollision } from './collisions';
import {
  CAR_WIDTH,
  ROAD_WIDTH,
  SEGMENT_LENGTH,
  TOP_SPEED,
  TRAFFIC_SPAWN_FAR,
  TRAFFIC_SPAWN_NEAR,
} from './physics';
import type { GameState } from './state';

const INITIAL_COUNT_MIN = 8;
const INITIAL_COUNT_MAX = 12;
const SPEED_FRACTION_MIN = 0.5;
const SPEED_FRACTION_MAX = 0.85;

// Spawn the initial 8–12 car population uniformly distributed 1–6 km ahead of
// the player. This range × 10-car density ≈ one visible vehicle every 500–750 m,
// which matches the arcade-density target.
export function spawnInitialCars(playerZ: number): TrafficCar[] {
  const count =
    INITIAL_COUNT_MIN + Math.floor(Math.random() * (INITIAL_COUNT_MAX - INITIAL_COUNT_MIN + 1));
  const cars: TrafficCar[] = [];
  for (let i = 0; i < count; i++) {
    cars.push({
      laneX: randomLaneX(),
      speed: randomSpeed(),
      worldZ: randomForwardZ(playerZ),
    });
  }
  return cars;
}

// Per-frame traffic update — CLAUDE.md physics step 10. Advances each car,
// respawns those that fell outside the visible window, then checks collision
// against the player. Collisions emit the same haptic event as wall impacts.
export function updateTraffic(state: GameState, cars: TrafficCar[], dt: number): void {
  const playerXWorld = state.playerX * (ROAD_WIDTH / 2);
  const respawnBack = -2 * SEGMENT_LENGTH;
  const respawnFar = TRAFFIC_SPAWN_FAR * SEGMENT_LENGTH * 1.2;

  for (const car of cars) {
    // 1. Advance the car forward along the road.
    car.worldZ += car.speed * dt;

    // 2. Respawn if the car drifted out of the [-2·SEG, 1.2·far·SEG] window
    //    relative to the player. Keeps population steady at 8–12 visible.
    const relZ = car.worldZ - state.playerZ;
    if (relZ < respawnBack || relZ > respawnFar) {
      car.laneX = randomLaneX();
      car.speed = randomSpeed();
      car.worldZ = randomForwardZ(state.playerZ);
      continue; // freshly respawned cars can't have collided this frame
    }

    // 3. Collision check — discrete: same segment AND lateral overlap within
    //    one car width. On hit, halve speed + emit collision event, then
    //    nudge the offending car laterally so the next frame doesn't re-hit.
    //    No leading-edge gate needed: the nudge separates the bodies after
    //    one impact, so re-emission isn't a concern.
    if (
      Math.floor(car.worldZ / SEGMENT_LENGTH) === state.playerSegmentIndex &&
      Math.abs(playerXWorld - car.laneX) < CAR_WIDTH
    ) {
      applyCollision(state);
      const nudgeDir = car.laneX === playerXWorld ? 1 : Math.sign(car.laneX - playerXWorld);
      car.laneX += nudgeDir * CAR_WIDTH;
    }
  }
}

function randomLaneX(): number {
  const half = ROAD_WIDTH / 2;
  const min = -half + CAR_WIDTH;
  const max = half - CAR_WIDTH;
  return min + Math.random() * (max - min);
}

function randomSpeed(): number {
  return (
    TOP_SPEED * (SPEED_FRACTION_MIN + Math.random() * (SPEED_FRACTION_MAX - SPEED_FRACTION_MIN))
  );
}

function randomForwardZ(playerZ: number): number {
  const nearM = TRAFFIC_SPAWN_NEAR * SEGMENT_LENGTH;
  const farM = TRAFFIC_SPAWN_FAR * SEGMENT_LENGTH;
  return playerZ + nearM + Math.random() * (farM - nearM);
}
