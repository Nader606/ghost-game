import { HapticBus } from '../haptics/eventBus';
import { COLLISION_SPEED_LOSS, TOP_SPEED } from './physics';
import type { GameState } from './state';

// Shared collision response — used by wall impacts (physics step 5) and
// traffic-car impacts (traffic step 10). Halves speed and emits a `collision`
// haptic event with severity proportional to the pre-loss speed.
export function applyCollision(state: GameState): void {
  HapticBus.emit({
    type: 'collision',
    severity: Math.min(1, state.currentSpeed / TOP_SPEED),
  });
  state.currentSpeed *= COLLISION_SPEED_LOSS;
}
