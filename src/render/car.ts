import type p5 from 'p5';
import { CAR_WIDTH, ROAD_WIDTH } from '../game/physics';
import type { ProjectedPoint } from '../util/types';
import { COLORS } from './colors';

// Player car: fixed bottom-screen position. The camera follows playerX so the
// world drifts under a stationary car polygon. View is from behind, slightly
// elevated — a trapezoid body (wider at the bottom), darker windscreen quad on
// the upper half, two small wheel rectangles flanking the body, and a soft
// drop-shadow ellipse below.
export function drawPlayerCar(p: p5): void {
  const cx = p.width / 2;
  const w = Math.min(260, p.width * 0.2);
  const h = w * 0.55;
  const baseY = p.height - h * 0.6;

  const left = cx - w / 2;
  const right = cx + w / 2;
  const top = baseY - h;
  const bottom = baseY;

  p.push();
  p.noStroke();

  // Shadow
  p.fill(COLORS.carShadow);
  p.ellipse(cx, bottom + 10, w * 1.15, h * 0.3);

  // Wheels — drawn behind the body so the body's wider bottom edge overlaps
  // the inner half, leaving just the outer slice visible (the "wheel poking
  // out" look from behind).
  p.fill(COLORS.playerWheel);
  const wheelW = w * 0.16;
  const wheelH = h * 0.28;
  p.rect(left - wheelW * 0.35, bottom - wheelH * 0.95, wheelW, wheelH, 2);
  p.rect(right - wheelW * 0.65, bottom - wheelH * 0.95, wheelW, wheelH, 2);

  // Body trapezoid (wider at the bottom)
  p.fill(COLORS.carBody);
  p.beginShape();
  p.vertex(left, bottom);
  p.vertex(right, bottom);
  p.vertex(right - w * 0.1, top);
  p.vertex(left + w * 0.1, top);
  p.endShape(p.CLOSE);

  // Windscreen — darker quad on the upper half
  p.fill(COLORS.playerWindshield);
  p.beginShape();
  p.vertex(left + w * 0.2, top + h * 0.05);
  p.vertex(right - w * 0.2, top + h * 0.05);
  p.vertex(right - w * 0.24, top + h * 0.45);
  p.vertex(left + w * 0.24, top + h * 0.45);
  p.endShape(p.CLOSE);

  p.pop();
}

// Traffic car — drawn from a ProjectedPoint produced by the segment-render
// loop. The car sits ON the road plane (worldY = 0), so screenY is the bottom
// of the body. Width scales with depth via screenW: pixels = screenW × (CAR
// half-width / road half-width). Height stays at 0.8× width so the aspect
// ratio holds as the car recedes. One shared style for all traffic in iter 1.
export function drawTrafficCar(p: p5, carP: ProjectedPoint): void {
  const w = carP.screenW * (CAR_WIDTH / (ROAD_WIDTH / 2));
  if (w < 2) return; // sub-pixel cars at the horizon — skip to avoid AA noise
  const h = w * 0.8;
  const cx = carP.screenX;
  const bottom = carP.screenY;
  const top = bottom - h;
  const left = cx - w / 2;
  const right = cx + w / 2;

  p.push();
  p.noStroke();

  // Shadow ellipse on the road below the car.
  p.fill(COLORS.trafficShadow);
  p.ellipse(cx, bottom + h * 0.08, w * 1.15, h * 0.22);

  // Rear wheels — slightly darker than the body, peeking outside.
  p.fill(COLORS.trafficWheel);
  const wheelW = w * 0.22;
  const wheelH = h * 0.26;
  p.rect(left - wheelW * 0.15, bottom - wheelH * 0.9, wheelW, wheelH, 1);
  p.rect(right - wheelW * 0.85, bottom - wheelH * 0.9, wheelW, wheelH, 1);

  // Body — rounded rectangle in neutral metallic.
  p.fill(COLORS.trafficBody);
  p.rect(left, top, w, h, 3);

  // Rear window / roofline — darker quad on the upper third.
  p.fill(COLORS.trafficWindow);
  p.rect(left + w * 0.12, top + h * 0.1, w * 0.76, h * 0.32, 1);

  p.pop();
}
