export interface InputState {
  wheel: number; // -1..+1
  accelerate: boolean;
  brake: boolean;
}

export interface InputAdapter {
  start(): void;
  stop(): void;
  // Tick internal state once per frame. Keyboard mock uses dt to integrate the
  // wheel rise/return; hardware adapters can no-op this.
  update(dt: number): void;
  read(): InputState;
}
