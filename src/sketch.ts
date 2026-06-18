import type p5 from 'p5';
import { setOffRoadIntensity } from './audio/ambient';
import { audioInit, toggleMute } from './audio/audioBus';
import { playMenuConfirm, playMenuNav } from './audio/effects';
import { setEngineActive, updateEngine } from './audio/engine';
import { NUM_SEGMENTS_LAP, SEGMENT_LENGTH, updatePhysics } from './game/physics';
import { buildRoad, lookupSegment, maintainEndlessRoad } from './game/road';
import type { GameState } from './game/state';
import { startGame } from './game/state';
import { spawnInitialCars, updateTraffic } from './game/traffic';
import { sendTelemetry } from './haptics/serialOut';
import { createKeyboardAdapter } from './input/keyboard';
import { createWebSerialAdapter } from './input/webserial';
import { drawPlayerCar } from './render/car';
import { COLORS } from './render/colors';
import { drawHUD, resetHUDState } from './render/hud';
import { drawMenu, type MenuFocus } from './render/menu';
import { renderRoad } from './render/pseudo3d';
import type { GhostSerial } from './serial/ghostSerial';
import { formatLapTime } from './util/time';
import type { Road, TrafficCar } from './util/types';

export function buildSketch(state: GameState, serial: GhostSerial): (p: p5) => void {
  let menuFocus: MenuFocus = 0;
  let road: Road | null = null;
  let cars: TrafficCar[] = [];
  const keyboard = createKeyboardAdapter();
  const yoke = createWebSerialAdapter(serial);

  const enterGame = (mode: 'endless' | 'lap') => {
    startGame(state, mode);
    road = buildRoad(mode);
    cars = spawnInitialCars(state.playerZ);
    resetHUDState();
    setEngineActive(true);
  };

  const exitToMenu = () => {
    state.screen = 'menu';
    road = null;
    cars = [];
    setEngineActive(false);
    setOffRoadIntensity(0);
  };

  return (p: p5) => {
    p.setup = () => {
      p.createCanvas(p.windowWidth, p.windowHeight);
      p.noStroke();
      p.textFont('-apple-system, Segoe UI, Roboto, sans-serif');
      keyboard.start();
    };

    p.windowResized = () => {
      p.resizeCanvas(p.windowWidth, p.windowHeight);
    };

    const handleMenuKey = (code: number) => {
      if (code === p.UP_ARROW || code === p.DOWN_ARROW) {
        menuFocus = menuFocus === 0 ? 1 : 0;
        playMenuNav();
      } else if (code === p.ENTER || code === p.RETURN) {
        playMenuConfirm();
        enterGame(menuFocus === 0 ? 'endless' : 'lap');
      }
      // Esc on the menu is intentionally a no-op: a browser tab cannot close
      // itself from JS, so there's nowhere to go from here.
    };

    const handleGameKey = (code: number) => {
      if (code === p.ESCAPE) {
        playMenuNav();
        exitToMenu();
        return;
      }
      // Dev-only: `]` jumps forward by 10% of a lap so the lap-mode wrap
      // (segment 749 → 0) is verifiable in seconds instead of minutes. The
      // import.meta.env.DEV gate is constant-folded out of the production
      // bundle, so this binding ships only in `vite dev`.
      if (import.meta.env.DEV && p.key === ']') {
        state.playerZ += (NUM_SEGMENTS_LAP / 10) * SEGMENT_LENGTH;
        state.playerSegmentIndex = Math.floor(state.playerZ / SEGMENT_LENGTH);
      }
    };

    const handleFinishKey = (code: number) => {
      if (code === p.ENTER || code === p.RETURN) {
        playMenuConfirm();
        enterGame(state.mode);
      } else if (code === p.ESCAPE) {
        playMenuNav();
        exitToMenu();
      }
    };

    p.keyPressed = () => {
      // First keypress on any screen unlocks the AudioContext (browser
      // autoplay policy). Idempotent — subsequent calls are no-ops.
      audioInit();

      // Global mute toggle. Works on every screen so the demo can be silenced
      // mid-run without diving into a menu.
      if (p.key === 'm' || p.key === 'M') {
        toggleMute();
        return;
      }

      const code = p.keyCode;
      if (state.screen === 'menu') handleMenuKey(code);
      else if (state.screen === 'game') handleGameKey(code);
      else handleFinishKey(code);
    };

    p.draw = () => {
      p.background(COLORS.bg);

      if (state.screen === 'menu') {
        drawMenu(p, menuFocus);
        return;
      }

      const dt = Math.min(p.deltaTime / 1000, 1 / 30);

      // Physics + world updates only run in 'game' screen. updatePhysics can
      // flip state.screen to 'finish' on lap 3 completion (step 9).
      if (state.screen === 'game' && road) {
        // Drive from the yoke when connected, else the keyboard mock. Menu nav
        // stays on the keyboard (handled in p.keyPressed) regardless.
        const driver = serial.isConnected ? yoke : keyboard;
        driver.update(dt);
        const input = driver.read();
        const currentSegment = lookupSegment(road, state.playerSegmentIndex);
        updatePhysics(state, input, currentSegment.curve, dt);
        // Push continuous telemetry (speed / curve load / off-road) to the yoke;
        // internally throttled and a no-op when disconnected.
        sendTelemetry(serial, state, currentSegment.curve);
        updateTraffic(state, cars, dt);
        maintainEndlessRoad(road, state.playerSegmentIndex);
        updateEngine(state);
      } else if (state.screen === 'finish') {
        // physics step 9 may have just transitioned us here. Idempotent fade.
        setEngineActive(false);
        setOffRoadIntensity(0);
      }

      // Render the world for both 'game' and 'finish' screens — the finish
      // overlay sits on top so the player can see where they crossed the line.
      if (road) {
        renderRoad(p, state, road, cars);
        drawPlayerCar(p);
      }

      if (state.screen === 'game') {
        drawHUD(p, state, dt);
      } else if (state.screen === 'finish') {
        drawFinishScreen(p, state);
      }
    };
  };
}

function drawFinishScreen(p: p5, state: GameState): void {
  p.push();

  // Semi-transparent darkening overlay over the frozen game frame.
  p.noStroke();
  p.fill(COLORS.finishOverlay);
  p.rect(0, 0, p.width, p.height);

  p.textAlign(p.CENTER, p.CENTER);

  // Title — bold sans-serif.
  p.textFont('-apple-system, Segoe UI, Roboto, sans-serif');
  p.fill(COLORS.hudText);
  p.textStyle(p.BOLD);
  p.textSize(Math.min(72, p.width * 0.08));
  p.text('RACE COMPLETE', p.width / 2, p.height * 0.3);

  // Times — monospace for digit alignment.
  p.textFont('JetBrains Mono, monospace');

  p.fill(COLORS.hudMuted);
  p.textStyle(p.NORMAL);
  p.textSize(13);
  p.text('TOTAL TIME', p.width / 2, p.height * 0.45);
  p.fill(COLORS.hudText);
  p.textStyle(p.BOLD);
  p.textSize(34);
  p.text(formatLapTime(state.lap.totalTime), p.width / 2, p.height * 0.45 + 34);

  p.fill(COLORS.hudMuted);
  p.textStyle(p.NORMAL);
  p.textSize(13);
  p.text('BEST LAP', p.width / 2, p.height * 0.58);
  p.fill(COLORS.hudAccent);
  p.textStyle(p.BOLD);
  p.textSize(34);
  p.text(
    state.lap.bestLapTime === null ? '—:—.—' : formatLapTime(state.lap.bestLapTime),
    p.width / 2,
    p.height * 0.58 + 34,
  );

  // Footer hint — sans-serif again.
  p.textFont('-apple-system, Segoe UI, Roboto, sans-serif');
  p.fill(COLORS.hudMuted);
  p.textStyle(p.NORMAL);
  p.textSize(14);
  p.text('Press Enter to retry  ·  Esc for menu', p.width / 2, p.height - 50);

  p.pop();
}
