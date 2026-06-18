// Connection manager owning the single Web Serial port for the Ghost yoke.
// Owns both directions: an async read loop parses inbound `I` frames into a
// cached input snapshot (read synchronously by the WebSerial InputAdapter), and
// `write()` ships outbound haptic/telemetry commands.
//
// Web Serial constraints (all handled here): Chromium-desktop only; HTTPS-only
// outside localhost (Vite dev on http://localhost is exempt); requestPort() must
// fire on a user gesture (the "Connect Controller" button); a port can be owned
// by only one tab — so we close it on pagehide AND on Vite HMR dispose, else
// reconnect throws "port already open".

import { type ParsedInput, parseInputFrame } from './protocol';

const DEFAULT_SNAPSHOT: ParsedInput = { wheel: 0, accelerate: false, brake: false };

export class GhostSerial {
  private port: SerialPort | null = null;
  private writer: WritableStreamDefaultWriter<Uint8Array> | null = null;
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  private readonly encoder = new TextEncoder();
  private readonly decoder = new TextDecoder();
  // Last good input. Kept across malformed frames so a dropped byte can't inject
  // garbage steering — we simply reuse the previous valid snapshot.
  private snapshot: ParsedInput = DEFAULT_SNAPSHOT;
  private connected = false;

  static isSupported(): boolean {
    return typeof navigator !== 'undefined' && 'serial' in navigator;
  }

  get isConnected(): boolean {
    return this.connected;
  }

  read(): ParsedInput {
    return this.snapshot;
  }

  // Must be called from a user gesture (click). Throws if unsupported or denied;
  // callers surface that to the user and fall back to keyboard.
  async connect(baudRate: number): Promise<void> {
    if (!GhostSerial.isSupported()) {
      throw new Error('Web Serial not supported in this browser (use Chrome/Edge on desktop).');
    }
    const port = await navigator.serial.requestPort();
    await port.open({ baudRate }); // camelCase — `baudrate` silently no-ops.
    this.port = port;

    if (port.writable) {
      this.writer = port.writable.getWriter();
    }
    this.connected = true;
    globalThis.addEventListener('pagehide', this.handlePageHide);
    void this.readLoop();
  }

  // Async read loop. A reader.read() chunk is NOT a whole line, so we decode
  // through TextDecoderStream and carry a partial-line buffer across reads,
  // splitting on '\n'. Malformed lines are dropped (snapshot unchanged).
  private async readLoop(): Promise<void> {
    if (!this.port?.readable) return;
    this.reader = this.port.readable.getReader();
    let buffer = '';
    try {
      while (true) {
        const { value, done } = await this.reader.read();
        if (done) break;
        if (!value) continue;
        // Decode incrementally — a chunk may split a multi-byte char or a line.
        buffer += this.decoder.decode(value, { stream: true });
        let nl = buffer.indexOf('\n');
        while (nl !== -1) {
          const line = buffer.slice(0, nl);
          buffer = buffer.slice(nl + 1);
          const parsed = parseInputFrame(line);
          if (parsed) this.snapshot = parsed;
          nl = buffer.indexOf('\n');
        }
      }
    } catch {
      // Device unplugged or stream error — treat as a disconnect.
    } finally {
      await this.disconnect();
    }
  }

  // Fire-and-forget outbound command. Tolerant of a closed/absent port so haptic
  // listeners never have to guard the connection state themselves.
  write(command: string): void {
    if (!this.writer) return;
    this.writer.write(this.encoder.encode(command)).catch(() => {
      // Write after close — ignore; disconnect handling will reset state.
    });
  }

  async disconnect(): Promise<void> {
    if (!this.connected && !this.port) return;
    this.connected = false;
    this.snapshot = DEFAULT_SNAPSHOT;
    globalThis.removeEventListener('pagehide', this.handlePageHide);
    try {
      await this.reader?.cancel();
    } catch {}
    this.reader = null;
    try {
      this.writer?.releaseLock();
    } catch {}
    this.writer = null;
    try {
      await this.port?.close();
    } catch {}
    this.port = null;
  }

  private readonly handlePageHide = (): void => {
    void this.disconnect();
  };
}
