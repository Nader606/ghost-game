// Background music. Default path tries to load a synthwave loop from
// /audio/loop.mp3 (user-supplied, .gitignored). If the file isn't present the
// procedural fallback kicks in — a C-minor arpeggio that exists so the demo
// isn't silent without a real loop, not because it sounds good.
//
// All music routes through masterGain, so the M-key mute toggle silences it
// without needing a music-specific volume control.

import { getCtx, getMaster } from './audioBus';

let started = false;
const MUSIC_VOLUME = 0.25;
const LOOP_URL = '/audio/loop.mp3';

export function startMusic(): void {
  if (started) return;
  started = true;
  void loadEmbeddedLoop().catch(() => {
    // Network/decode/missing-file all collapse to "use the fallback". The error
    // detail isn't useful to surface — the README explains how to supply the mp3.
    startProceduralMusic();
  });
}

async function loadEmbeddedLoop(): Promise<void> {
  const ctx = getCtx();
  const master = getMaster();
  if (!ctx || !master) throw new Error('audio not initialised');

  const resp = await fetch(LOOP_URL);
  if (!resp.ok) throw new Error(`loop fetch ${resp.status}`);
  const data = await resp.arrayBuffer();
  const buf = await ctx.decodeAudioData(data);

  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.loop = true;
  const g = ctx.createGain();
  g.gain.value = MUSIC_VOLUME;
  src.connect(g);
  g.connect(master);
  src.start();
}

// Procedural fallback. Eight-note C-minor pattern, one note every 200 ms,
// sawtooth through a lowpass — utility grade. setTimeout drift under tab
// throttling is acceptable for a fallback nobody should be hearing in the demo.
function startProceduralMusic(): void {
  const notes = [261.63, 311.13, 392, 523.25, 622.25, 392, 311.13, 261.63];
  let i = 0;
  const tick = () => {
    const ctx = getCtx();
    const master = getMaster();
    if (!ctx || !master) return; // bail if context disappeared
    const f = notes[i % notes.length] ?? 261.63;

    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = f;

    const filt = ctx.createBiquadFilter();
    filt.type = 'lowpass';
    filt.frequency.value = 800;

    const g = ctx.createGain();
    g.gain.setValueAtTime(MUSIC_VOLUME * 0.4, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.18);

    osc.connect(filt);
    filt.connect(g);
    g.connect(master);
    osc.start();
    osc.stop(ctx.currentTime + 0.2);

    i++;
    setTimeout(tick, 200);
  };
  tick();
}
