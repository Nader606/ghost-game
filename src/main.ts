import p5 from 'p5';
import { createInitialState } from './game/state';
import { HapticBus } from './haptics/eventBus';
import { attachSerialHaptics } from './haptics/serialOut';
import { GhostSerial } from './serial/ghostSerial';
import { BAUD_RATE } from './serial/protocol';
import { buildSketch } from './sketch';

const host = document.getElementById('canvas-host');
if (!host) {
  throw new Error('Missing #canvas-host in index.html');
}

// Iteration-1 haptic sink: log every event with a coloured [haptic] prefix so
// the WP22 demo can show events firing live. Kept alongside the serial sink.
HapticBus.on((e) => {
  console.debug(
    `%c[haptic]%c ${e.type}`,
    'color: #E94560; font-weight: bold;',
    'color: inherit;',
    e,
  );
});

// Iteration-2 hardware sink: forward discrete haptic events to the Ghost yoke.
// Continuous telemetry is pushed per-frame from the sketch (sendTelemetry). The
// serial port stays disconnected until the user clicks "Connect Controller".
const serial = new GhostSerial();
attachSerialHaptics(serial);

// Web Serial needs a user gesture to request a port. Wire the connect button;
// hide it on success, and disable it outright on unsupported browsers (the game
// stays fully playable on keyboard either way).
const connectButton = document.getElementById('connect-controller') as HTMLButtonElement | null;
if (connectButton) {
  if (!GhostSerial.isSupported()) {
    connectButton.disabled = true;
    connectButton.textContent = 'Controller needs Chrome/Edge';
  } else {
    connectButton.addEventListener('click', () => {
      serial
        .connect(BAUD_RATE)
        .then(() => {
          connectButton.textContent = '● Controller connected';
          connectButton.classList.add('connected');
        })
        .catch((err) => {
          console.warn('[ghost] controller connect failed — staying on keyboard:', err);
        });
    });
  }
}

const state = createInitialState();
new p5(buildSketch(state, serial), host);
