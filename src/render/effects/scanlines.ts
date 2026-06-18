// CRT scanline overlay. Pre-rendered into a p5.Graphics buffer once per canvas
// size and stamped with one image() call per frame — much cheaper than
// drawing ~hundreds of horizontal bands every frame.
//
// The optional rolling-jitter line from the spec was removed for perf: a
// per-frame full-canvas-width thin rect was a non-trivial cost in the worst
// frames. The static scanline texture alone is enough for the CRT look.

import type p5 from 'p5';

let cached: p5.Graphics | null = null;
let cachedW = 0;
let cachedH = 0;

const ROW_HEIGHT = 2;
const DARKEN_ALPHA_255 = 0.15 * 255;

function rebuildCache(p: p5): void {
  cached = p.createGraphics(p.width, p.height);
  cached.noStroke();
  cached.clear();
  cached.fill(0, 0, 0, DARKEN_ALPHA_255);
  for (let y = ROW_HEIGHT; y < p.height; y += 2 * ROW_HEIGHT) {
    cached.rect(0, y, p.width, ROW_HEIGHT);
  }
  cachedW = p.width;
  cachedH = p.height;
}

export function drawScanlines(p: p5, _dt: number): void {
  if (!cached || cachedW !== p.width || cachedH !== p.height) {
    rebuildCache(p);
  }
  if (!cached) return;
  p.image(cached, 0, 0);
}
