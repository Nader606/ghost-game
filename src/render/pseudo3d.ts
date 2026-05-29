import type p5 from 'p5';
import {
  CAMERA_DEPTH_BEHIND,
  CAMERA_HEIGHT,
  DRAW_DISTANCE,
  FOV,
  ROAD_WIDTH,
  SEGMENT_LENGTH,
  WALL_HEIGHT,
} from '../game/physics';
import { lookupSegment } from '../game/road';
import type { GameState } from '../game/state';
import type { ProjectedPoint, Road, Segment, TrafficCar, WallCorners } from '../util/types';
import { drawTrafficCar } from './car';
import { COLORS } from './colors';

// FOV → cameraDepth (the "focal length" of the projection):
//   half-FOV in radians, then cameraDepth = 1 / tan(half-FOV).
// 100° FOV gives ≈ 0.84.
const cameraDepth = 1 / Math.tan(((FOV / 2) * Math.PI) / 180);

// Project a world-space point onto the screen. Returns null if the point is
// at or behind the camera plane (caller must skip).
//
// worldX/Y/Z are point coordinates; camX/Y/Z are camera coordinates; csX/Y/Z
// are camera-space deltas (point relative to camera). Both worldX and worldY
// are explicit so walls (Y = WALL_HEIGHT) and traffic cars (off-centre laneX)
// project correctly — not just road-plane points at Y = 0.
export function project(
  worldX: number,
  worldY: number,
  worldZ: number,
  camX: number,
  camY: number,
  camZ: number,
  screenW: number,
  screenH: number,
): ProjectedPoint | null {
  const csX = worldX - camX;
  const csY = worldY - camY;
  const csZ = worldZ - camZ;
  if (csZ <= 0) return null;
  const scale = cameraDepth / csZ;
  return {
    csZ,
    scale,
    screenX: screenW / 2 + scale * csX * (screenW / 2),
    screenY: screenH / 2 - scale * csY * (screenH / 2),
    // The ROAD_WIDTH/2 multiplier converts metres of world half-width into the
    // same per-metre screen scaling that screenX uses (screenW/2). CLAUDE.md's
    // verbatim formula multiplies by screenW (full canvas width), which makes
    // the road quad 2× too wide and causes walls at ±9 m to fall inside the
    // (over-inflated) road edge.
    screenW: scale * (ROAD_WIDTH / 2) * (screenW / 2),
  };
}

// Project the four corners of one segment's wall on one side. The wall sits at
// world-X ±0.75·ROAD_WIDTH (= ±9 m at v9 scale — same as playerX = ±1.5, the
// wall-contact threshold). Uses nearOffsetX for the near edge and farOffsetX
// for the far edge, so the wall bends with the road through curves rather than
// running parallel to the camera.
function projectWallSide(
  side: -1 | 1,
  nearZ: number,
  farZ: number,
  nearOffsetX: number,
  farOffsetX: number,
  camY: number,
  camZ: number,
  screenW: number,
  screenH: number,
): WallCorners | null {
  const wallX = side * 0.75 * ROAD_WIDTH;
  const nearBottom = project(wallX, 0, nearZ, nearOffsetX, camY, camZ, screenW, screenH);
  const nearTop = project(wallX, WALL_HEIGHT, nearZ, nearOffsetX, camY, camZ, screenW, screenH);
  const farBottom = project(wallX, 0, farZ, farOffsetX, camY, camZ, screenW, screenH);
  const farTop = project(wallX, WALL_HEIGHT, farZ, farOffsetX, camY, camZ, screenW, screenH);
  if (!nearBottom || !nearTop || !farBottom || !farTop) return null;
  return { nearBottom, nearTop, farBottom, farTop };
}

function drawWallTrapezoid(p: p5, c: WallCorners, fill: string, border: string): void {
  p.fill(fill);
  p.stroke(border);
  p.strokeWeight(1);
  p.beginShape();
  p.vertex(c.nearBottom.screenX, c.nearBottom.screenY);
  p.vertex(c.nearTop.screenX, c.nearTop.screenY);
  p.vertex(c.farTop.screenX, c.farTop.screenY);
  p.vertex(c.farBottom.screenX, c.farBottom.screenY);
  p.endShape(p.CLOSE);
  p.noStroke();
}

export function renderRoad(p: p5, state: GameState, road: Road, cars: TrafficCar[]): void {
  const baseIndex = state.playerSegmentIndex;
  const baseSegment = lookupSegment(road, baseIndex);
  const playerPercent = ((state.playerZ % SEGMENT_LENGTH) + SEGMENT_LENGTH) % SEGMENT_LENGTH;
  const playerFrac = playerPercent / SEGMENT_LENGTH;

  const cameraX = state.playerX * (ROAD_WIDTH / 2);
  const cameraY = CAMERA_HEIGHT;
  const cameraZ = state.playerZ - CAMERA_DEPTH_BEHIND;

  // x = accumulated horizontal offset for road centre at the current iteration's
  // near edge; dx = additional offset added across one segment. Seeded with the
  // player's sub-segment progress so curve transitions are smooth, not stepped.
  let x = 0;
  let dx = -(baseSegment.curve * playerFrac);

  // maxY is the topmost screenY drawn so far. Segments whose far edge sits at or
  // below this don't add to the visible image (occluded by closer segments) and
  // can be skipped. Forward-compatible with hills (no-op on flat terrain).
  let maxY = p.height;

  // Traffic cars are COLLECTED here (near-to-far order) and drawn in a second
  // pass AFTER the segment loop. Drawing them inline would let farther
  // segments' grass/road overpaint nearer cars' roofs (cars are discrete
  // objects taller than the road plane; walls don't have this problem because
  // they're a contiguous surface and the next wall covers the prior overpaint).
  const carRenderQueue: ProjectedPoint[] = [];

  for (let n = 0; n < DRAW_DISTANCE; n++) {
    const segIndex = baseIndex + n;
    const seg = lookupSegment(road, segIndex);
    const nearZ = segIndex * SEGMENT_LENGTH;
    const farZ = nearZ + SEGMENT_LENGTH;

    // Snapshot BOTH x and dx at the start of this iteration so walls (spanning
    // the segment's near AND far depths) can use the correct offset at each end.
    const segmentX = x;
    const segmentDx = dx;
    const nearOffsetX = cameraX - segmentX;
    const farOffsetX = cameraX - segmentX - segmentDx;

    const p1 = project(0, 0, nearZ, nearOffsetX, cameraY, cameraZ, p.width, p.height);
    const p2 = project(0, 0, farZ, farOffsetX, cameraY, cameraZ, p.width, p.height);

    x += dx;
    dx += seg.curve;

    if (!p1 || !p2) continue;
    if (p2.screenY >= maxY) continue;
    if (p2.screenW < 1) break;

    drawSegmentQuad(p, p1, p2, seg);

    // Walls bend with the road because they reuse the same nearOffsetX /
    // farOffsetX as the segment quad. Drawing walls AFTER the road quad and
    // BEFORE the next iteration's grass band means the next iteration's grass
    // can eat into the top of this wall — but the next iteration's wall is
    // contiguous and covers that overpaint (shared near/far edge projection).
    const leftWall = projectWallSide(
      -1,
      nearZ,
      farZ,
      nearOffsetX,
      farOffsetX,
      cameraY,
      cameraZ,
      p.width,
      p.height,
    );
    const rightWall = projectWallSide(
      1,
      nearZ,
      farZ,
      nearOffsetX,
      farOffsetX,
      cameraY,
      cameraZ,
      p.width,
      p.height,
    );
    if (leftWall) drawWallTrapezoid(p, leftWall, COLORS.wallLeft, COLORS.wallBorder);
    if (rightWall) drawWallTrapezoid(p, rightWall, COLORS.wallRight, COLORS.wallBorder);

    // Collect (don't draw) any traffic cars whose segment matches. Using this
    // segment's nearOffsetX is sufficient: cars are point-depth entities and
    // the offset difference across one segment's depth is sub-perceptual.
    for (const car of cars) {
      if (Math.floor(car.worldZ / SEGMENT_LENGTH) !== segIndex) continue;
      const carP = project(
        car.laneX,
        0,
        car.worldZ,
        nearOffsetX,
        cameraY,
        cameraZ,
        p.width,
        p.height,
      );
      if (carP) carRenderQueue.push(carP);
    }

    maxY = p2.screenY;
  }

  // Second pass: draw cars far-to-near so nearer cars correctly occlude
  // farther ones, and so no road segment behind a car overpaints it.
  for (let i = carRenderQueue.length - 1; i >= 0; i--) {
    const carP = carRenderQueue[i];
    if (carP) drawTrafficCar(p, carP);
  }
}

function drawSegmentQuad(p: p5, near: ProjectedPoint, far: ProjectedPoint, seg: Segment): void {
  p.noStroke();

  // 1. Grass — full-width band from the far edge down to the near edge of this
  //    segment. Successive segments stack upward toward the horizon; the bg
  //    fill above the topmost grass band shows through as sky.
  p.fill(seg.index % 2 === 0 ? COLORS.grass1 : COLORS.grass2);
  p.beginShape();
  p.vertex(0, far.screenY);
  p.vertex(p.width, far.screenY);
  p.vertex(p.width, near.screenY);
  p.vertex(0, near.screenY);
  p.endShape(p.CLOSE);

  // 2. Road surface (zebra-striped via seg.color; segment 0 is the start/
  // finish line, painted bright white so the wrap is unmistakable).
  if (seg.index === 0) {
    p.fill(COLORS.startFinish);
  } else {
    p.fill(seg.color === 'light' ? COLORS.road1 : COLORS.road2);
  }
  p.beginShape();
  p.vertex(near.screenX - near.screenW, near.screenY);
  p.vertex(near.screenX + near.screenW, near.screenY);
  p.vertex(far.screenX + far.screenW, far.screenY);
  p.vertex(far.screenX - far.screenW, far.screenY);
  p.endShape(p.CLOSE);

  // 3. Rumble strips — thin trapezoids just outside each road edge (12% of
  //    road half-width). Segment 0's rumbles are accent-coloured: it's the
  //    start/finish line for lap mode.
  const rumbleColor =
    seg.index === 0 ? COLORS.hudAccent : seg.index % 2 === 0 ? COLORS.rumble1 : COLORS.rumble2;
  const rumbleNearW = near.screenW * 0.12;
  const rumbleFarW = far.screenW * 0.12;

  p.fill(rumbleColor);
  // Left rumble
  p.beginShape();
  p.vertex(near.screenX - near.screenW - rumbleNearW, near.screenY);
  p.vertex(near.screenX - near.screenW, near.screenY);
  p.vertex(far.screenX - far.screenW, far.screenY);
  p.vertex(far.screenX - far.screenW - rumbleFarW, far.screenY);
  p.endShape(p.CLOSE);
  // Right rumble
  p.beginShape();
  p.vertex(near.screenX + near.screenW, near.screenY);
  p.vertex(near.screenX + near.screenW + rumbleNearW, near.screenY);
  p.vertex(far.screenX + far.screenW + rumbleFarW, far.screenY);
  p.vertex(far.screenX + far.screenW, far.screenY);
  p.endShape(p.CLOSE);

  // 4. Dashed centre stripe — drawn on segments where index % 4 < 2 (produces
  //    two-on, two-off dash/gap pattern).
  if (seg.index % 4 < 2) {
    const stripeNear = near.screenW * 0.02;
    const stripeFar = far.screenW * 0.02;
    p.fill(COLORS.centerline);
    p.beginShape();
    p.vertex(near.screenX - stripeNear, near.screenY);
    p.vertex(near.screenX + stripeNear, near.screenY);
    p.vertex(far.screenX + stripeFar, far.screenY);
    p.vertex(far.screenX - stripeFar, far.screenY);
    p.endShape(p.CLOSE);
  }
}
