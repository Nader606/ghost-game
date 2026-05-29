import type p5 from 'p5';
import { TOP_SPEED, TURBO_COOLDOWN, TURBO_DURATION } from '../game/physics';
import type { GameState } from '../game/state';
import { formatLapTime } from '../util/time';
import { COLORS } from './colors';

const GEAR_HOLD_TIME = 0.5; // s — debounce so the gear display doesn't flicker at boundary speeds
const RPM_LED_COUNT = 14;

// Cosmetic-only HUD state. Module-level rather than in GameState because it
// has no gameplay meaning and shouldn't survive a transition to/from the menu.
let displayedGear = 1;
let gearHoldTimer = 0;

export function resetHUDState(): void {
  displayedGear = 1;
  gearHoldTimer = 0;
}

export function drawHUD(p: p5, state: GameState, dt: number): void {
  drawTopCenter(p, state, dt);
  drawTopLeft(p, state);
  drawTopRight(p, state);
  drawWheelIndicator(p, state);
}

function drawTopCenter(p: p5, state: GameState, dt: number): void {
  const cx = p.width / 2;
  const speedKmh = Math.round(state.currentSpeed * 3.6);

  // RPM LED bar — fills left-to-right with speed ratio; green → yellow → red.
  const barW = 320;
  const barH = 10;
  const barX = cx - barW / 2;
  const barY = 20;
  const ledGap = 3;
  const ledW = (barW - ledGap * (RPM_LED_COUNT - 1)) / RPM_LED_COUNT;
  const speedRatio = Math.min(1, state.currentSpeed / TOP_SPEED);
  const litCount = Math.floor(speedRatio * RPM_LED_COUNT);

  p.noStroke();
  for (let i = 0; i < RPM_LED_COUNT; i++) {
    const lit = i < litCount;
    const ratio = i / RPM_LED_COUNT;
    let color: string;
    if (ratio < 0.55) color = COLORS.rpmLow;
    else if (ratio < 0.8) color = COLORS.rpmMid;
    else color = COLORS.rpmHigh;
    p.fill(lit ? color : COLORS.hudPanel);
    p.rect(barX + i * (ledW + ledGap), barY, ledW, barH, 1.5);
  }

  // Speedometer
  p.textFont('JetBrains Mono, monospace');
  p.textAlign(p.CENTER, p.TOP);
  p.fill(COLORS.hudText);
  p.textStyle(p.BOLD);
  p.textSize(56);
  p.text(String(speedKmh).padStart(3, '0'), cx, 38);

  p.fill(COLORS.hudMuted);
  p.textStyle(p.NORMAL);
  p.textSize(12);
  p.text('KM/H', cx, 98);

  // Gear with 0.5 s hold so the display doesn't flicker at gear-shift boundaries.
  const targetGear = Math.min(5, Math.max(1, Math.floor((state.currentSpeed / TOP_SPEED) * 5) + 1));
  if (targetGear !== displayedGear) {
    gearHoldTimer += dt;
    if (gearHoldTimer >= GEAR_HOLD_TIME) {
      displayedGear = targetGear;
      gearHoldTimer = 0;
    }
  } else {
    gearHoldTimer = 0;
  }

  p.fill(COLORS.hudAccent);
  p.textStyle(p.BOLD);
  p.textSize(22);
  p.text(`G${displayedGear}`, cx, 118);
}

function drawTopLeft(p: p5, state: GameState): void {
  const x = 24;
  let y = 24;

  p.textAlign(p.LEFT, p.TOP);
  p.textFont('JetBrains Mono, monospace');

  if (state.mode === 'lap') {
    const lapNum = Math.min(3, state.lap.current + 1);
    label(p, 'LAP', x, y);
    bigValue(p, `${lapNum}/3`, x, y + 14);
    y += 56;

    label(p, 'CURRENT', x, y);
    midValue(p, formatLapTime(state.lap.currentLapTime), x, y + 14);
    y += 42;

    label(p, 'BEST', x, y);
    midValue(
      p,
      state.lap.bestLapTime === null ? '—:—.—' : formatLapTime(state.lap.bestLapTime),
      x,
      y + 14,
    );
    return;
  }

  // Endless
  label(p, 'DISTANCE', x, y);
  bigValue(p, `${state.endlessDistance.toFixed(1)} km`, x, y + 14);
}

function drawTopRight(p: p5, state: GameState): void {
  const x = p.width - 24;
  const y = 24;

  p.textFont('JetBrains Mono, monospace');
  p.textAlign(p.RIGHT, p.TOP);

  p.fill(COLORS.hudMuted);
  p.textStyle(p.NORMAL);
  p.textSize(11);
  p.text('TURBO', x, y);

  let labelText: string;
  let color: string;
  switch (state.turbo.state) {
    case 'READY':
      labelText = 'READY';
      color = COLORS.hudText;
      break;
    case 'ARMED':
      labelText = 'ARMED';
      color = COLORS.hudAccent;
      break;
    case 'ACTIVE':
      labelText = `ACTIVE ${(TURBO_DURATION - state.turbo.timer).toFixed(1)}s`;
      color = COLORS.startFinish;
      break;
    case 'COOLDOWN':
      labelText = `COOLDOWN ${(TURBO_COOLDOWN - state.turbo.timer).toFixed(1)}s`;
      color = COLORS.hudMuted;
      break;
  }

  p.fill(color);
  p.textStyle(p.BOLD);
  p.textSize(20);
  p.text(labelText, x, y + 14);
}

function drawWheelIndicator(p: p5, state: GameState): void {
  const w = 120;
  const h = 16;
  const x = 16;
  const y = p.height - 16 - h;

  p.textFont('JetBrains Mono, monospace');
  p.textAlign(p.LEFT, p.TOP);
  p.fill(COLORS.hudMuted);
  p.textStyle(p.NORMAL);
  p.textSize(10);
  p.text('WHEEL', x, y - 14);

  // Track
  p.noStroke();
  p.fill(COLORS.hudPanel);
  p.rect(x, y, w, h, h / 2);

  // Centre tick
  p.fill(COLORS.hudMuted);
  p.rect(x + w / 2 - 1, y + 3, 2, h - 6);

  // Dot at the wheel position. Travel capped at 85 % of half-width so the dot
  // doesn't sit on the rounded end-cap.
  const dotX = x + w / 2 + state.wheel * w * 0.5 * 0.85;
  p.fill(COLORS.hudAccent);
  p.ellipse(dotX, y + h / 2, h * 0.75, h * 0.75);
}

function label(p: p5, text: string, x: number, y: number): void {
  p.fill(COLORS.hudMuted);
  p.textStyle(p.NORMAL);
  p.textSize(11);
  p.text(text, x, y);
}

function bigValue(p: p5, text: string, x: number, y: number): void {
  p.fill(COLORS.hudText);
  p.textStyle(p.BOLD);
  p.textSize(24);
  p.text(text, x, y);
}

function midValue(p: p5, text: string, x: number, y: number): void {
  p.fill(COLORS.hudText);
  p.textStyle(p.NORMAL);
  p.textSize(17);
  p.text(text, x, y);
}
