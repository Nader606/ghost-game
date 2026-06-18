// Bloom helper. Wraps canvas2D's native shadowBlur/shadowColor pair so that
// callers can describe a glow with one function call instead of manually
// save/restore-ing the context state. Every glowing element pays a real perf
// cost (shadowBlur is per-pixel Gaussian over the shape's bounding box), so
// apply selectively — see V3.
//
// The `enabled` flag lets callers cull bloom on distant or low-impact shapes
// without restructuring the code. When false the fn runs without any context
// state mutation, so the no-bloom path is essentially free.

import type p5 from 'p5';
import { perfFlags } from '../perfFlags';

export function withGlow(p: p5, color: string, blur: number, fn: () => void, enabled = true): void {
  if (!enabled || (import.meta.env.DEV && !perfFlags.bloom)) {
    fn();
    return;
  }
  const ctx = p.drawingContext as CanvasRenderingContext2D;
  ctx.save();
  ctx.shadowColor = color;
  ctx.shadowBlur = blur;
  fn();
  ctx.restore();
}
