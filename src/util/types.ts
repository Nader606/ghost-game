export type Mode = 'endless' | 'lap';
export type Screen = 'menu' | 'game' | 'finish';

export interface Segment {
  index: number;
  curve: number;
  worldZ: number;
  color: 'light' | 'dark';
}

export interface Road {
  mode: Mode;
  segments: Segment[];
  oldestRetainedIndex: number;
  // Endless mode only: phase offsets so the curve can be extended deterministically
  // into new segment indices without re-seeding. Undefined for lap mode (closed
  // loop never extends).
  endlessPhases?: readonly [number, number, number];
}

export interface TrafficCar {
  speed: number;
  laneX: number;
  worldZ: number;
}

export interface ProjectedPoint {
  csZ: number;
  scale: number;
  screenX: number;
  screenY: number;
  screenW: number;
}

export interface WallCorners {
  nearBottom: ProjectedPoint;
  nearTop: ProjectedPoint;
  farBottom: ProjectedPoint;
  farTop: ProjectedPoint;
}
