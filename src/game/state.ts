import type { Mode, Screen } from '../util/types';
import type { TerrainId } from './terrain';

export type TurboState = 'READY' | 'ARMED' | 'ACTIVE' | 'COOLDOWN';

export interface Turbo {
  state: TurboState;
  timer: number;
}

export interface LapRunState {
  current: number;
  currentLapTime: number;
  bestLapTime: number | null;
  totalTime: number;
  finished: boolean;
}

export interface GameState {
  screen: Screen;
  mode: Mode;
  // Menu-selected surface. Deliberately NOT reset by startGame — it's a
  // persistent preference, like the mode focus, not per-run transient state.
  terrain: TerrainId;
  playerX: number;
  currentSpeed: number;
  wheel: number;
  playerZ: number;
  playerSegmentIndex: number;
  againstWall: boolean;
  turbo: Turbo;
  lap: LapRunState;
  endlessDistance: number;
  offRoadEmitTimer: number;
  curveLoadEmitTimer: number;
}

export function createInitialState(): GameState {
  return {
    screen: 'menu',
    mode: 'endless',
    terrain: 'asphalt',
    playerX: 0,
    currentSpeed: 0,
    wheel: 0,
    playerZ: 0,
    playerSegmentIndex: 0,
    againstWall: false,
    turbo: { state: 'READY', timer: 0 },
    lap: {
      current: 0,
      currentLapTime: 0,
      bestLapTime: null,
      totalTime: 0,
      finished: false,
    },
    endlessDistance: 0,
    offRoadEmitTimer: 0,
    curveLoadEmitTimer: 0,
  };
}

export function startGame(state: GameState, mode: Mode): void {
  state.screen = 'game';
  state.mode = mode;
  state.playerX = 0;
  state.currentSpeed = 0;
  state.wheel = 0;
  state.playerZ = 0;
  state.playerSegmentIndex = 0;
  state.againstWall = false;
  state.turbo = { state: 'READY', timer: 0 };
  state.lap = {
    current: 0,
    currentLapTime: 0,
    bestLapTime: null,
    totalTime: 0,
    finished: false,
  };
  state.endlessDistance = 0;
  state.offRoadEmitTimer = 0;
  state.curveLoadEmitTimer = 0;
}
