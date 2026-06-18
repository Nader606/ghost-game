// Dev-only perf isolation flags. Each can be toggled with a number key to
// disable an effect at runtime; FPS deltas between configurations point at
// the actual bottleneck without recompiles.
//
// All flags ship as `true` (everything on). The whole module is gated behind
// import.meta.env.DEV at the call sites, so prod bundles strip the toggles.

interface PerfFlags {
  bloom: boolean;
  sun: boolean;
  grid: boolean;
  scanlines: boolean;
  speedLines: boolean;
  particles: boolean;
}

export const perfFlags: PerfFlags = {
  bloom: true,
  sun: true,
  grid: true,
  scanlines: true,
  speedLines: true,
  particles: true,
};

export function togglePerfFlag(key: keyof PerfFlags): void {
  perfFlags[key] = !perfFlags[key];
  // biome-ignore lint/suspicious/noConsole: dev-only diagnostic
  console.log(`[perf] ${key} = ${perfFlags[key]}`);
}
