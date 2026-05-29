// Continuous engine drone — a sawtooth oscillator through a lowpass filter.
// Frequency tracks state.currentSpeed; filter cutoff is modulated by N3's
// curve_load event (curves push cutoff down → engine sounds "strained").
//
// Gating: the oscillator is created once at audioInit and runs forever, but
// its gain is held at 0 until setEngineActive(true) fires on entering the
// game screen. Without gating the menu would have a constant 60 Hz idle.

import { TOP_SPEED } from '../game/physics';
import type { GameState } from '../game/state';
import { getCtx, getMaster } from './audioBus';

let osc: OscillatorNode | null = null;
let filter: BiquadFilterNode | null = null;
let gain: GainNode | null = null;

const ENGINE_VOLUME = 0.15;
const FILTER_IDLE_CUTOFF = 1400;
const FILTER_RANGE = 1200;

export function startEngine(): void {
  const ctx = getCtx();
  const master = getMaster();
  if (!ctx || !master || osc) return;

  osc = ctx.createOscillator();
  osc.type = 'sawtooth';
  osc.frequency.value = 60;

  filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = FILTER_IDLE_CUTOFF;
  filter.Q.value = 5;

  gain = ctx.createGain();
  gain.gain.value = 0; // silent until setEngineActive(true)

  osc.connect(filter);
  filter.connect(gain);
  gain.connect(master);
  osc.start();
}

// Fade engine in/out at the game-screen boundary. Short ramp avoids click.
// Re-activating also resets the lowpass cutoff so a previous run's curve_load
// state doesn't leak into the next race as a muffled idle.
export function setEngineActive(active: boolean): void {
  const ctx = getCtx();
  if (!ctx || !gain) return;
  gain.gain.setTargetAtTime(active ? ENGINE_VOLUME : 0, ctx.currentTime, 0.05);
  if (active && filter) {
    filter.frequency.setTargetAtTime(FILTER_IDLE_CUTOFF, ctx.currentTime, 0.05);
  }
}

export function updateEngine(state: GameState): void {
  const ctx = getCtx();
  if (!ctx || !osc) return;
  // sn ∈ [0, ~1.4] (turbo lifts the cap above 1). Map to 60 Hz idle → 312 Hz
  // at TOP_SPEED, with turbo overshooting to ~432 Hz — sounds like a downshift
  // straining the redline. setTargetAtTime smoothing prevents zipper noise.
  const sn = state.currentSpeed / TOP_SPEED;
  osc.frequency.setTargetAtTime(60 + sn * 180, ctx.currentTime, 0.08);
}

// Curve-load modulator. Wired in N3: tighter curves at speed push the cutoff
// down to ~200 Hz so the engine sounds "loaded" through the turn rather than
// playing a separate sound. Called from audioBus.routeEvent on 'curve_load'.
export function setCurveLoad(lateralG: number): void {
  const ctx = getCtx();
  if (!ctx || !filter) return;
  const cutoff = FILTER_IDLE_CUTOFF - lateralG * FILTER_RANGE;
  filter.frequency.setTargetAtTime(cutoff, ctx.currentTime, 0.05);
}
