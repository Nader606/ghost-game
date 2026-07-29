import type p5 from 'p5';
import { getTerrain, type TerrainId } from '../game/terrain';
import { COLORS } from './colors';

export type MenuFocus = 0 | 1;

interface MenuItem {
  label: string;
  subtitle: string;
}

const ITEMS: readonly MenuItem[] = [
  { label: 'ENDLESS', subtitle: 'free drive · no end' },
  { label: 'LAP — 3 LAPS', subtitle: 'timed circuit · best lap recorded' },
] as const;

export function drawMenu(p: p5, focus: MenuFocus, terrainId: TerrainId): void {
  p.push();
  p.textAlign(p.CENTER, p.CENTER);

  // Title (top third)
  p.fill(COLORS.hudText);
  p.textStyle(p.BOLD);
  p.textSize(Math.min(120, p.width * 0.12));
  p.text('GHOST', p.width / 2, p.height * 0.28);

  p.textStyle(p.NORMAL);
  p.textSize(16);
  p.fill(COLORS.hudMuted);
  p.text('pseudo-3D haptic racer · WP22 iter 1', p.width / 2, p.height * 0.28 + 70);

  // Stacked buttons
  const buttonW = Math.min(420, p.width * 0.6);
  const buttonH = 84;
  const gap = 24;
  const totalH = buttonH * 2 + gap;
  const startY = p.height * 0.6 - totalH / 2;
  const x = p.width / 2 - buttonW / 2;

  ITEMS.forEach((item, i) => {
    const y = startY + i * (buttonH + gap);
    const focused = i === focus;

    p.noFill();
    p.strokeWeight(focused ? 2 : 1);
    p.stroke(focused ? COLORS.hudAccent : COLORS.hudMuted);
    p.rect(x, y, buttonW, buttonH, 6);
    p.noStroke();

    p.fill(focused ? COLORS.hudAccent : COLORS.hudText);
    p.textStyle(p.BOLD);
    p.textSize(28);
    p.text(item.label, p.width / 2, y + buttonH / 2 - 10);

    p.fill(COLORS.hudMuted);
    p.textStyle(p.NORMAL);
    p.textSize(13);
    p.text(item.subtitle, p.width / 2, y + buttonH / 2 + 18);
  });

  // Terrain selector — ←/→ cycles. Sits under the mode buttons; the swatch
  // pair previews the terrain's ground palette, and the subtitle telegraphs
  // the wheel feel before the player commits.
  const terrain = getTerrain(terrainId);
  const selY = startY + totalH + 46;
  p.fill(COLORS.hudMuted);
  p.textStyle(p.NORMAL);
  p.textSize(13);
  p.text('◀', p.width / 2 - 150, selY);
  p.text('▶', p.width / 2 + 150, selY);
  p.fill(COLORS.hudText);
  p.textStyle(p.BOLD);
  p.textSize(18);
  p.text(terrain.name, p.width / 2, selY);
  p.fill(COLORS.hudMuted);
  p.textStyle(p.NORMAL);
  p.textSize(12);
  p.text(terrain.subtitle, p.width / 2, selY + 22);
  p.noStroke();
  p.fill(terrain.grass1);
  p.rect(p.width / 2 - 118, selY - 7, 14, 14, 3);
  p.fill(terrain.grass2);
  p.rect(p.width / 2 + 104, selY - 7, 14, 14, 3);

  // Controls hint — appears once on the menu so the player knows the inputs
  // before entering a mode. (In-game these are discoverable, but the first
  // time you load the page you'd otherwise have to guess.)
  p.fill(COLORS.hudMuted);
  p.textStyle(p.NORMAL);
  p.textSize(13);
  p.text('Z accelerate  ·  X brake  ·  ← →  steer  ·  Esc menu', p.width / 2, p.height - 80);

  // Navigation hint
  p.textSize(13);
  p.text('↑/↓ mode  ·  ←/→ terrain  ·  Enter to confirm', p.width / 2, p.height - 52);

  // Academic context — required by CLAUDE.md credits brief.
  p.textSize(11);
  p.text('WP22 SS2026  ·  BHT Berlin', p.width / 2, p.height - 24);

  p.pop();
}
