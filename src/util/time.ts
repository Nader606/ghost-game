// Format a duration in seconds as MM:SS.mmm — used for the lap timer HUD.
export function formatLapTime(seconds: number): string {
  const totalMs = Math.floor(seconds * 1000);
  const mm = Math.floor(totalMs / 60000);
  const ss = Math.floor((totalMs % 60000) / 1000);
  const mmm = totalMs % 1000;
  return `${mm.toString().padStart(2, '0')}:${ss.toString().padStart(2, '0')}.${mmm
    .toString()
    .padStart(3, '0')}`;
}
