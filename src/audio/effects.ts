// One-shot sound effects. N1 ships menu beeps only; collision/turbo/lap
// helpers land in N2/N3 alongside the HapticBus routing in audioBus.ts.

import { getCtx, getMaster } from './audioBus';

// Generic short sine pulse used for both menu beeps. Frequency picks the
// pitch (nav vs confirm); duration is fixed-short so navigation feels snappy.
function playBeep(freq: number, duration: number, peak: number): void {
  const ctx = getCtx();
  const master = getMaster();
  if (!ctx || !master) return;
  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.value = freq;
  const g = ctx.createGain();
  // Short AD envelope. setValueAtTime + exponentialRampToValueAtTime avoids
  // the click that a raw start/stop would produce on a sine.
  g.gain.setValueAtTime(0.0001, ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(peak, ctx.currentTime + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);
  osc.connect(g);
  g.connect(master);
  osc.start();
  osc.stop(ctx.currentTime + duration + 0.02);
}

export function playMenuNav(): void {
  playBeep(440, 0.05, 0.4);
}

export function playMenuConfirm(): void {
  playBeep(660, 0.08, 0.4);
}

// Sawtooth filter sweep — building block for turbo_start / turbo_end. Both
// sweeps share the shape; only the frequency direction differs.
function playSweep(fromHz: number, toHz: number, durationSec: number, peakGain: number): void {
  const ctx = getCtx();
  const master = getMaster();
  if (!ctx || !master) return;
  const osc = ctx.createOscillator();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(fromHz, ctx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(toHz, ctx.currentTime + durationSec);
  const g = ctx.createGain();
  g.gain.setValueAtTime(peakGain, ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + durationSec + 0.1);
  osc.connect(g);
  g.connect(master);
  osc.start();
  osc.stop(ctx.currentTime + durationSec + 0.15);
}

export function playTurboStart(): void {
  playSweep(80, 800, 0.5, 0.3);
}

export function playTurboEnd(): void {
  // Longer than the start sweep (0.8 vs 0.5 s) so the "winding down" feel is
  // distinguishable from a fresh launch — and it matches the player's expectation
  // that turbo expires gradually, not abruptly.
  playSweep(800, 80, 0.8, 0.3);
}

// Lap-completion sound: three sine notes in quick succession (G4 → B4 → D5).
// Schedules all three at audio-clock-accurate offsets so timing doesn't drift
// even if the main thread stalls.
export function playLapComplete(): void {
  const ctx = getCtx();
  const master = getMaster();
  if (!ctx || !master) return;
  const notes = [392, 493.88, 587.33]; // G4, B4, D5
  const noteLen = 0.1;
  for (let i = 0; i < notes.length; i++) {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = notes[i] ?? 440;
    const g = ctx.createGain();
    const start = ctx.currentTime + i * noteLen;
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(0.35, start + 0.005);
    g.gain.exponentialRampToValueAtTime(0.001, start + noteLen);
    osc.connect(g);
    g.connect(master);
    osc.start(start);
    osc.stop(start + noteLen + 0.02);
  }
}

// Collision one-shot — a 400 ms noise burst through a lowpass whose cutoff
// scales with severity (harder hits = brighter, more presence). Gain peaks at
// 0.3 + severity*0.4 and decays exponentially. Punches through the engine
// drone and music by sitting in a higher gain band than either.
export function playCollision(severity: number): void {
  const ctx = getCtx();
  const master = getMaster();
  if (!ctx || !master) return;

  const sampleCount = Math.floor(ctx.sampleRate * 0.4);
  const buf = ctx.createBuffer(1, sampleCount, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < sampleCount; i++) data[i] = Math.random() * 2 - 1;

  const src = ctx.createBufferSource();
  src.buffer = buf;

  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 200 + severity * 800;

  const g = ctx.createGain();
  const peak = 0.3 + severity * 0.4;
  g.gain.setValueAtTime(peak, ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);

  src.connect(lp);
  lp.connect(g);
  g.connect(master);
  src.start();
  src.stop(ctx.currentTime + 0.4);
}
