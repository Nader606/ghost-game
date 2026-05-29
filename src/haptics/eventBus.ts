// Haptic event bus — generic pub/sub for physics-emitted events. Listeners
// translate events to their domain: iteration 1 logs to console; iteration 2
// will attach a WebSerial writer that sends commands to the Ghost yoke.

export type HapticEvent =
  | { type: 'collision'; severity: number } // 0..1
  | { type: 'turbo_start' }
  | { type: 'turbo_end' }
  | { type: 'off_road'; intensity: number } // 0..1
  | { type: 'curve_load'; lateralG: number }; // 0..1, normalized centripetal magnitude

type Listener = (e: HapticEvent) => void;

const listeners = new Set<Listener>();

export const HapticBus = {
  emit(e: HapticEvent): void {
    for (const l of listeners) l(e);
  },
  on(l: Listener): void {
    listeners.add(l);
  },
  off(l: Listener): void {
    listeners.delete(l);
  },
};
