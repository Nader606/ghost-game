// Spark particle system, subscribed to HapticBus for `collision` events. Lives
// at module scope: one Particle[] for all in-flight sparks, one HapticBus
// listener installed at first import. Pending collisions are buffered (we
// can't compute the player car centre without a p5 instance) and drained at
// the top of updateParticles.

import type p5 from 'p5';
import { HapticBus, type HapticEvent } from '../../haptics/eventBus';
import { NEON } from '../colors';
import { withGlow } from './bloom';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  lifetime: number; // 1 (fresh) → 0 (dead)
  color: string;
  size: number;
}

const PARTICLE_CAP = 80;
const LIFETIME_SEC = 0.6;
const GRAVITY = 200; // px/s²
// Spec's per-frame velocity *= 0.98 assumes 60 fps. We dt-adjust below so the
// drag rate is the same whether the game runs at 60 or 30 fps.
const DRAG_FRAME = 0.98;
const SPARK_COLORS = [NEON.pink, NEON.yellow, NEON.orange];
const GLOW_BLUR = 6;
const SPEED_BASE = 200;
const SPEED_SEVERITY_SCALE = 400;
const SPEED_JITTER = 200;
const COUNT_BASE = 12;
const COUNT_JITTER = 9; // 12..20

const particles: Particle[] = [];
let pendingSeverities: number[] = [];

HapticBus.on((e: HapticEvent) => {
  if (e.type === 'collision') pendingSeverities.push(e.severity);
});

// Player car centre, derived from drawPlayerCar's geometry. Kept in sync by
// hand — if car.ts's layout changes, this mirror needs updating.
function playerCarCentre(p: p5): { x: number; y: number } {
  const cx = p.width / 2;
  const w = Math.min(260, p.width * 0.2);
  const h = w * 0.55;
  const baseY = p.height - h * 0.6;
  return { x: cx, y: baseY - h / 2 };
}

function pickSparkColor(): string {
  return SPARK_COLORS[Math.floor(Math.random() * SPARK_COLORS.length)] ?? NEON.pink;
}

function spawnBurst(severity: number, origin: { x: number; y: number }): void {
  const count = COUNT_BASE + Math.floor(Math.random() * (COUNT_JITTER + 1));
  for (let i = 0; i < count; i++) {
    if (particles.length >= PARTICLE_CAP) return; // cap — extra impacts during full capacity drop
    const angle = Math.random() * Math.PI * 2;
    const speed = SPEED_BASE + severity * SPEED_SEVERITY_SCALE + Math.random() * SPEED_JITTER;
    particles.push({
      x: origin.x,
      y: origin.y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      lifetime: 1,
      color: pickSparkColor(),
      size: 4,
    });
  }
}

export function updateParticles(p: p5, dt: number): void {
  if (pendingSeverities.length > 0) {
    const origin = playerCarCentre(p);
    for (const sev of pendingSeverities) spawnBurst(sev, origin);
    pendingSeverities = [];
  }

  // Reverse iteration so in-place splice doesn't skip elements.
  const dragFactor = DRAG_FRAME ** (dt * 60);
  for (let i = particles.length - 1; i >= 0; i--) {
    const part = particles[i];
    if (!part) continue;
    part.lifetime -= dt / LIFETIME_SEC;
    if (part.lifetime <= 0) {
      particles.splice(i, 1);
      continue;
    }
    part.x += part.vx * dt;
    part.y += part.vy * dt;
    part.vy += GRAVITY * dt;
    part.vx *= dragFactor;
    part.vy *= dragFactor;
  }
}

export function drawParticles(p: p5): void {
  if (particles.length === 0) return;
  const ctx = p.drawingContext as CanvasRenderingContext2D;
  p.noStroke();
  // Group by color: one withGlow per palette entry (3 total) instead of one
  // per particle (up to 80). shadowBlur is per-shape regardless, but
  // collapsing save/restore + state changes into 3 amortises the overhead.
  for (const color of SPARK_COLORS) {
    let hasAny = false;
    for (const part of particles) {
      if (part.color === color) {
        hasAny = true;
        break;
      }
    }
    if (!hasAny) continue;

    withGlow(p, color, GLOW_BLUR, () => {
      p.fill(color);
      for (const part of particles) {
        if (part.color !== color) continue;
        ctx.globalAlpha = part.lifetime;
        p.circle(part.x, part.y, part.size * part.lifetime);
      }
    });
  }
  ctx.globalAlpha = 1;
}
