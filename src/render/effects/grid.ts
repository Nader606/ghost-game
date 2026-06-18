// Perspective grid floor — vaporwave's signature visual element. A flat 3D
// grid at worldY = 0, projected with the same per-depth cameraX-shift
// accumulators that renderRoad uses, so the grid bends with the road's
// apparent curve instead of sitting flat under it.
//
// DEVIATION FROM SPEC: NEON.md says draw order is sky → sun → grid → road and
// that the road's grass overpaints grid lines in the road area, leaving the
// grid visible only in the grass region. Our pseudo3d.ts paints grass as a
// full-canvas-width band — drawing grid before the road would hide every line.
// We draw grid AFTER the road instead, and split lateral lines into left+right
// segments at the road's worldX edge (±ROAD_WIDTH/2) so lines don't cross the
// asphalt. Longitudinal lines stay at worldX outside ±ROAD_WIDTH/2 so they're
// already entirely in the grass region.

import type p5 from 'p5';
import { CAMERA_DEPTH_BEHIND, CAMERA_HEIGHT, ROAD_WIDTH, SEGMENT_LENGTH } from '../../game/physics';
import { lookupSegment } from '../../game/road';
import type { GameState } from '../../game/state';
import type { Road } from '../../util/types';
import { NEON } from '../colors';
import { project } from '../pseudo3d';

const LONG_X_POSITIONS = [-60, -45, -30, -15, 15, 30, 45, 60];

const LATERAL_SPACING = 20;
const LATERAL_COUNT = 25;
const LATERAL_NEAR_M = 1;
const LATERAL_FAR_M = 500;

const LATERAL_OUTER_X = 60;
const LATERAL_INNER_X = ROAD_WIDTH / 2;

const FADE_START_CSZ = 100;
const FADE_END_CSZ = 500;

const GLOW_BLUR = 4;
// Bloom the closest N lateral lines only — distant lines are <2 px on screen
// and the halo dominates the cost. Geometry still draws for all visible lines.
const LATERAL_BLOOM_NEAREST = 10;

// Walk enough segments to cover LATERAL_FAR_M plus the player's sub-segment
// offset (worst case ~1 extra segment) and a safety margin.
const SEGMENTS_TO_WALK = Math.ceil(LATERAL_FAR_M / SEGMENT_LENGTH) + 3;

function alphaForCsZ(csZ: number): number {
  if (csZ < FADE_START_CSZ) return 1;
  if (csZ > FADE_END_CSZ) return 0;
  return 1 - (csZ - FADE_START_CSZ) / (FADE_END_CSZ - FADE_START_CSZ);
}

export function drawGrid(p: p5, state: GameState, road: Road): void {
  const ctx = p.drawingContext as CanvasRenderingContext2D;
  const cameraX = state.playerX * (ROAD_WIDTH / 2);
  const cameraY = CAMERA_HEIGHT;
  const cameraZ = state.playerZ - CAMERA_DEPTH_BEHIND;

  const baseIndex = state.playerSegmentIndex;
  const baseSegment = lookupSegment(road, baseIndex);
  const playerFrac =
    (((state.playerZ % SEGMENT_LENGTH) + SEGMENT_LENGTH) % SEGMENT_LENGTH) / SEGMENT_LENGTH;

  // Mirror renderRoad's accumulator walk. segXs[n] is the cumulative worldX
  // offset at the near edge of (baseIndex + n); segDxs[n] is the delta added
  // across that segment, so segXs[n] + segDxs[n] === segXs[n+1] (continuous
  // at boundaries — same property the road relies on).
  const segXs = new Array<number>(SEGMENTS_TO_WALK + 1);
  const segDxs = new Array<number>(SEGMENTS_TO_WALK);
  {
    let x = 0;
    let dx = -(baseSegment.curve * playerFrac);
    for (let n = 0; n < SEGMENTS_TO_WALK; n++) {
      segXs[n] = x;
      segDxs[n] = dx;
      const seg = lookupSegment(road, baseIndex + n);
      x += dx;
      dx += seg.curve;
    }
    segXs[SEGMENTS_TO_WALK] = x;
  }

  // Effective cameraX for a given worldZ — linearly interpolates the
  // accumulator within the segment that contains worldZ.
  const effectiveCameraX = (worldZ: number): number | null => {
    const absIndex = Math.floor(worldZ / SEGMENT_LENGTH);
    const n = absIndex - baseIndex;
    if (n < 0 || n >= SEGMENTS_TO_WALK) return null;
    const frac = (worldZ - absIndex * SEGMENT_LENGTH) / SEGMENT_LENGTH;
    const segX = segXs[n] ?? 0;
    const segDx = segDxs[n] ?? 0;
    return cameraX - (segX + frac * segDx);
  };

  ctx.save();
  ctx.lineWidth = 1;

  // Longitudinal vertices: start, every segment boundary in between, end.
  // Same depth list for every longitudinal line, so compute once.
  const startZ = state.playerZ + LATERAL_NEAR_M;
  const endZ = state.playerZ + LATERAL_FAR_M;
  const vertexZs: number[] = [startZ];
  const firstBoundary = Math.ceil(startZ / SEGMENT_LENGTH) * SEGMENT_LENGTH;
  for (let z = firstBoundary; z < endZ; z += SEGMENT_LENGTH) {
    if (z > startZ) vertexZs.push(z);
  }
  const lastVertex = vertexZs[vertexZs.length - 1];
  if (lastVertex !== undefined && endZ > lastVertex) vertexZs.push(endZ);

  for (let i = 0; i < LONG_X_POSITIONS.length; i++) {
    const worldX = LONG_X_POSITIONS[i] ?? 0;
    const color = i % 2 === 0 ? NEON.cyan : NEON.electricBlue;

    ctx.strokeStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = GLOW_BLUR;
    ctx.beginPath();

    let started = false;
    for (const worldZ of vertexZs) {
      const camX = effectiveCameraX(worldZ);
      if (camX === null) continue;
      const pt = project(worldX, 0, worldZ, camX, cameraY, cameraZ, p.width, p.height);
      if (!pt) continue;
      if (started) ctx.lineTo(pt.screenX, pt.screenY);
      else {
        ctx.moveTo(pt.screenX, pt.screenY);
        started = true;
      }
    }
    if (started) ctx.stroke();
  }

  // Lateral lines. Phase wraps worldZ values into a stable absolute grid (the
  // math reduces to floor(playerZ/spacing)*spacing + k*spacing), so lines hold
  // their absolute worldZ until the player crosses a 20 m boundary — at which
  // point all of them shift one step. Each line is at a single depth, so its
  // effective cameraX is one value and the projected line is straight in
  // screen-space but ride-shifted by the curve at that depth.
  const phase = ((state.playerZ % LATERAL_SPACING) + LATERAL_SPACING) % LATERAL_SPACING;
  for (let k = 1; k <= LATERAL_COUNT; k++) {
    const worldZ = state.playerZ + k * LATERAL_SPACING - phase;
    const csZ = worldZ - cameraZ;
    if (csZ <= 0) continue;
    const alpha = alphaForCsZ(csZ);
    if (alpha <= 0) continue;

    const camX = effectiveCameraX(worldZ);
    if (camX === null) continue;

    const color = k % 2 === 0 ? NEON.cyan : NEON.electricBlue;

    const leftOuter = project(
      -LATERAL_OUTER_X,
      0,
      worldZ,
      camX,
      cameraY,
      cameraZ,
      p.width,
      p.height,
    );
    const leftInner = project(
      -LATERAL_INNER_X,
      0,
      worldZ,
      camX,
      cameraY,
      cameraZ,
      p.width,
      p.height,
    );
    const rightInner = project(
      LATERAL_INNER_X,
      0,
      worldZ,
      camX,
      cameraY,
      cameraZ,
      p.width,
      p.height,
    );
    const rightOuter = project(
      LATERAL_OUTER_X,
      0,
      worldZ,
      camX,
      cameraY,
      cameraZ,
      p.width,
      p.height,
    );

    ctx.globalAlpha = alpha;
    ctx.strokeStyle = color;
    ctx.shadowColor = color;
    // Cull bloom past the closest N lines — far lateral lines are sub-pixel and
    // the halo dwarfs the line geometry.
    ctx.shadowBlur = k <= LATERAL_BLOOM_NEAREST ? GLOW_BLUR : 0;

    if (leftOuter && leftInner) {
      ctx.beginPath();
      ctx.moveTo(leftOuter.screenX, leftOuter.screenY);
      ctx.lineTo(leftInner.screenX, leftInner.screenY);
      ctx.stroke();
    }
    if (rightInner && rightOuter) {
      ctx.beginPath();
      ctx.moveTo(rightInner.screenX, rightInner.screenY);
      ctx.lineTo(rightOuter.screenX, rightOuter.screenY);
      ctx.stroke();
    }
  }

  ctx.restore();
}
