// Off-road ambient loop. A 2-second brown-noise buffer played on loop with a
// gain controlled by the throttled `off_road` event intensity. Created once at
// startup and never stopped — gain holds at 0 when on-road.
//
// Brown noise (a.k.a. red noise) rolls off the high end of white noise via a
// running integrator. That gives the "grass rumble" character — fatter than
// the crackle of white noise, less hissy.

import { getCtx, getMaster } from './audioBus';

let src: AudioBufferSourceNode | null = null;
let gain: GainNode | null = null;

const OFF_ROAD_MAX_GAIN = 0.4;

export function startOffRoadLoop(): void {
  const ctx = getCtx();
  const master = getMaster();
  if (!ctx || !master || src) return;

  const sampleCount = ctx.sampleRate * 2;
  const buf = ctx.createBuffer(1, sampleCount, ctx.sampleRate);
  const data = buf.getChannelData(0);
  // Brown-noise integrator. The 0.02 step + /1.02 normalization is the classic
  // recipe; the *3.5 at the end brings the buffer back up to ~unity amplitude
  // since the integration heavily attenuates each sample.
  let lastOut = 0;
  for (let i = 0; i < sampleCount; i++) {
    const white = Math.random() * 2 - 1;
    const next = (lastOut + 0.02 * white) / 1.02;
    lastOut = next;
    data[i] = next * 3.5;
  }

  src = ctx.createBufferSource();
  src.buffer = buf;
  src.loop = true;

  gain = ctx.createGain();
  gain.gain.value = 0;

  src.connect(gain);
  gain.connect(master);
  src.start();
}

// Throttled at 10 Hz on the bus side; the 50 ms setTargetAtTime smoothing
// prevents stepping artifacts between events. When intensity drops to 0 the
// gain naturally fades to silence over ~50 ms.
export function setOffRoadIntensity(intensity: number): void {
  const ctx = getCtx();
  if (!ctx || !gain) return;
  gain.gain.setTargetAtTime(intensity * OFF_ROAD_MAX_GAIN, ctx.currentTime, 0.05);
}
