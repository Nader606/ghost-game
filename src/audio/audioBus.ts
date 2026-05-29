// Audio bus — owns the single AudioContext + master gain, subscribes to
// HapticBus, and routes events to per-module players. Mirrors the HapticBus
// composition: physics emits events, listeners (haptic device, audio, future
// telemetry) consume them independently.
//
// Browser autoplay policy: AudioContext stays uncreated until the first user
// gesture. audioInit() is called from sketch.ts keyPressed. Before unlock,
// every public API here is a no-op so the menu remains silent and bug-free.

import { HapticBus, type HapticEvent } from '../haptics/eventBus';
import { setOffRoadIntensity, startOffRoadLoop } from './ambient';
import { playCollision, playLapComplete, playTurboEnd, playTurboStart } from './effects';
import { setCurveLoad, startEngine } from './engine';
import { startMusic } from './music';

let ctx: AudioContext | null = null;
let masterGain: GainNode | null = null;
let unlocked = false;
let muted = false;

const MASTER_VOLUME = 0.8;

export function audioInit(): void {
  if (unlocked) return;
  const g = globalThis as unknown as {
    AudioContext?: typeof AudioContext;
    webkitAudioContext?: typeof AudioContext;
  };
  const Ctor = g.AudioContext ?? g.webkitAudioContext;
  if (!Ctor) return;
  ctx = new Ctor();
  masterGain = ctx.createGain();
  masterGain.gain.value = MASTER_VOLUME;
  masterGain.connect(ctx.destination);
  unlocked = true;
  startEngine();
  startOffRoadLoop();
  startMusic();
  HapticBus.on(routeEvent);
}

export function isAudioUnlocked(): boolean {
  return unlocked;
}

export function getCtx(): AudioContext | null {
  return ctx;
}

export function getMaster(): GainNode | null {
  return masterGain;
}

// Global mute toggle bound to `M` in sketch.ts. Cheap to flip — just ramps the
// master gain, sub-modules keep playing in case mute is unmuted mid-sound.
export function toggleMute(): boolean {
  if (!unlocked || !ctx || !masterGain) return muted;
  muted = !muted;
  masterGain.gain.setTargetAtTime(muted ? 0 : MASTER_VOLUME, ctx.currentTime, 0.02);
  return muted;
}

export function isMuted(): boolean {
  return muted;
}

// Single HapticBus subscription. Later steps wire collision/turbo/off-road/
// curve_load/lap_complete; N1 leaves them as no-ops so the bus is plumbed
// even when only menu beeps make sound.
function routeEvent(e: HapticEvent): void {
  if (!unlocked) return;
  switch (e.type) {
    case 'collision':
      playCollision(e.severity);
      break;
    case 'turbo_start':
      playTurboStart();
      break;
    case 'turbo_end':
      playTurboEnd();
      break;
    case 'off_road':
      setOffRoadIntensity(e.intensity);
      break;
    case 'curve_load':
      setCurveLoad(e.lateralG);
      break;
    case 'lap_complete':
      playLapComplete();
      break;
  }
}
