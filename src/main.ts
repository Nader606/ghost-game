import p5 from 'p5';
import { createInitialState } from './game/state';
import { HapticBus } from './haptics/eventBus';
import { buildSketch } from './sketch';

const host = document.getElementById('canvas-host');
if (!host) {
  throw new Error('Missing #canvas-host in index.html');
}

// Iteration-1 haptic sink: log every event with a coloured [haptic] prefix so
// the WP22 demo can show events firing live. Iteration 2 will replace this
// with a WebSerial writer that forwards events to the Ghost yoke.
HapticBus.on((e) => {
  console.debug(
    `%c[haptic]%c ${e.type}`,
    'color: #E94560; font-weight: bold;',
    'color: inherit;',
    e,
  );
});

const state = createInitialState();
new p5(buildSketch(state), host);
