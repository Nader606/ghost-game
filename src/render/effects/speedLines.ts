// Radial speed lines emanating from the vanishing point. Active when
// speedNormalized > 0.7; turbo amplifies the outward speed. Streaks live in a
// module-level array; once a streak's radius exceeds the screen diagonal it
// respawns at radius 0 with a fresh random angle, so the ~20-streak pool
// produces a continuous burst of motion without per-frame allocation.

import type p5 from 'p5';
import { TOP_SPEED } from '../../game/physics';
import type { GameState } from '../../game/state';
import { NEON } from '../colors';
import { withGlow } from './bloom';

interface Streak {
  angle: number;
  radius: number;
  length: number;
  speed: number; // px/sec at speedMul=1
}

const STREAK_COUNT = 20;
const ACTIVE_THRESHOLD = 0.7;
const TURBO_BOOST = 1.5;
const LENGTH_MIN = 30;
const LENGTH_MAX = 80;
const SPEED_MIN = 400;
const SPEED_MAX = 1000;
const GLOW_BLUR = 3;

const streaks: Streak[] = [];

function newStreak(initialRadius: number): Streak {
  return {
    angle: Math.random() * 2 * Math.PI,
    radius: initialRadius,
    length: LENGTH_MIN + Math.random() * (LENGTH_MAX - LENGTH_MIN),
    speed: SPEED_MIN + Math.random() * (SPEED_MAX - SPEED_MIN),
  };
}

function ensurePopulated(maxRadius: number): void {
  if (streaks.length > 0) return;
  // Spread the initial pool across the full radius so the first frame above
  // the speed threshold isn't empty — otherwise every streak would start at
  // r=0 and take a beat to reach the screen edges.
  for (let i = 0; i < STREAK_COUNT; i++) {
    streaks.push(newStreak(Math.random() * maxRadius));
  }
}

export function updateSpeedLines(state: GameState, dt: number, p: p5): void {
  const sn = state.currentSpeed / TOP_SPEED;
  if (sn <= ACTIVE_THRESHOLD) return;

  const halfDiag = Math.hypot(p.width, p.height) * 0.5;
  ensurePopulated(halfDiag);

  const turboMul = state.turbo.state === 'ACTIVE' ? TURBO_BOOST : 1;
  const speedMul = sn * turboMul;

  for (const s of streaks) {
    s.radius += s.speed * speedMul * dt;
    if (s.radius > halfDiag) {
      // Respawn — full reset so the new streak has fresh angle/length/speed.
      const fresh = newStreak(0);
      s.angle = fresh.angle;
      s.radius = fresh.radius;
      s.length = fresh.length;
      s.speed = fresh.speed;
    }
  }
}

export function drawSpeedLines(state: GameState, p: p5): void {
  const sn = state.currentSpeed / TOP_SPEED;
  if (sn <= ACTIVE_THRESHOLD) return;
  if (streaks.length === 0) return;

  const ctx = p.drawingContext as CanvasRenderingContext2D;
  const centerX = p.width / 2;
  // Slightly above horizon (h/2) so the streaks read as coming from the road's
  // vanishing point rather than from the centre of the canvas.
  const centerY = p.height * 0.45;

  withGlow(p, NEON.white, GLOW_BLUR, () => {
    ctx.lineWidth = 1.5;
    for (const s of streaks) {
      const cos = Math.cos(s.angle);
      const sin = Math.sin(s.angle);
      const x1 = centerX + s.radius * cos;
      const y1 = centerY + s.radius * sin;
      const x2 = centerX + (s.radius + s.length) * cos;
      const y2 = centerY + (s.radius + s.length) * sin;

      // Fade both ends via a canvas2D linearGradient along the line — gives
      // the streak a comet-like shape without needing multiple stroke calls.
      const grad = ctx.createLinearGradient(x1, y1, x2, y2);
      grad.addColorStop(0, 'rgba(240, 240, 255, 0)');
      grad.addColorStop(0.5, 'rgba(240, 240, 255, 0.85)');
      grad.addColorStop(1, 'rgba(240, 240, 255, 0)');
      ctx.strokeStyle = grad;

      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }
  });
}
