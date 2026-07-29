// Sky gradient + horizon sun. Replaces the flat p.background(COLORS.bg) call as
// the first thing drawn each frame. The gradient stops come from the selected
// terrain, so each environment owns its sky (Neon City keeps the synthwave
// purples; the sun itself is Neon City-only, gated by terrain.neonFx at the
// call site). Menu gets the gradient alone — a live preview of the selection.

import type p5 from 'p5';
import type { GameState } from '../../game/state';
import type { Terrain } from '../../game/terrain';
import { NEON } from '../colors';

// 3-stop vertical gradient covering ONLY the top half of the canvas (above
// the horizon). The bottom half is filled with the terrain's `below` colour so
// wall geometry drawn in gaps between grass bands renders against a matching
// dark tone — a mismatched fill there creates a visible seam at the horizon
// and makes walls look detached from the road plane.
export function drawSky(p: p5, terrain: Terrain): void {
  const ctx = p.drawingContext as CanvasRenderingContext2D;
  const horizonY = p.height / 2;
  const gradient = ctx.createLinearGradient(0, 0, 0, horizonY);
  gradient.addColorStop(0, terrain.sky.top);
  gradient.addColorStop(0.5, terrain.sky.mid);
  gradient.addColorStop(1, terrain.sky.horizon);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, p.width, horizonY);
  ctx.fillStyle = terrain.sky.below;
  ctx.fillRect(0, horizonY, p.width, p.height - horizonY);
}

// Horizon sun: half-disc above the horizon, vertical gradient (yellow → pink →
// orange), with 5 horizontal stripe cutouts of increasing thickness through the
// bottom 60% — the classic "setting sun behind a sea of horizon lines" look.
// Bloomed with a wide pink halo, parallaxed horizontally by player steering.
export function drawSun(p: p5, state: GameState): void {
  const ctx = p.drawingContext as CanvasRenderingContext2D;
  const horizonY = p.height / 2;
  const radius = p.height * 0.25;
  // playerX is normalised in [-1.5, +1.5]; max steering shifts the sun ±4% of
  // canvas width. Subtle — registers as a depth cue, not a literal world-shift.
  const sunX = p.width / 2 + (state.playerX / 1.5) * (p.width * 0.04);
  const topY = horizonY - radius;

  // Bloomed disc (no clipping yet — the halo must extend OUTSIDE the disc).
  // Blur 10 keeps a visible pink halo but is 6× cheaper than the spec's 25.
  ctx.save();
  ctx.shadowColor = NEON.pink;
  ctx.shadowBlur = 10;

  const sunGradient = ctx.createLinearGradient(0, topY, 0, horizonY);
  sunGradient.addColorStop(0, NEON.yellow);
  sunGradient.addColorStop(0.5, NEON.pink);
  sunGradient.addColorStop(1, NEON.orange);
  ctx.fillStyle = sunGradient;

  ctx.beginPath();
  // Canvas2D: angle 0 = 3 o'clock, PI = 9 o'clock; y is flipped so increasing
  // angle goes CLOCKWISE on screen. PI → 2π clockwise traces the UPPER
  // half-disc (through 12 o'clock). The previous `anticlockwise=true` traced
  // the LOWER half, which sat below the horizon and got overpainted by grass.
  ctx.arc(sunX, horizonY, radius, Math.PI, 2 * Math.PI, false);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  // Stripe cutouts. Clip to the disc so the bands only paint inside it; use
  // the deepPurple sky color so the bands read as "missing" rather than as
  // solid black ink lines, blending into the gradient sky behind.
  ctx.save();
  ctx.beginPath();
  ctx.arc(sunX, horizonY, radius, Math.PI, 2 * Math.PI, false);
  ctx.closePath();
  ctx.clip();

  ctx.fillStyle = NEON.deepPurple;
  // Five bands across the bottom 60% of the disc. Thicknesses grow geometrically
  // (1, 1.4, 1.95, 2.7, 3.8 units → sum ≈ 10.85). Equal gaps between bands.
  const bandStart = horizonY - radius * 0.6;
  const bandSpan = radius * 0.6;
  const weights = [1, 1.4, 1.95, 2.7, 3.8];
  const stripeTotal = weights.reduce((a, b) => a + b, 0);
  // Total = stripes (weight 10.85) + gaps. Pick gaps so the layout exactly fills
  // bandSpan: 5 stripes + 4 inter-stripe gaps. Gap = (bandSpan - stripeTotal*unit) / 4.
  // Solve for unit such that stripeTotal*unit + 4*gap = bandSpan. Pick gap =
  // unit (uniform "thickness unit") → unit*(stripeTotal + 4) = bandSpan.
  const unit = bandSpan / (stripeTotal + 4);
  let y = bandStart;
  for (const w of weights) {
    ctx.fillRect(sunX - radius, y, radius * 2, w * unit);
    y += w * unit + unit;
  }
  ctx.restore();
}
