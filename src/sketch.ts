import type p5 from 'p5';
import { setOffRoadIntensity } from './audio/ambient';
import { audioInit, toggleMute } from './audio/audioBus';
import { playMenuConfirm, playMenuNav } from './audio/effects';
import { setEngineActive, updateEngine } from './audio/engine';
import { NUM_SEGMENTS_LAP, SEGMENT_LENGTH, updatePhysics } from './game/physics';
import { buildRoad, lookupSegment, maintainEndlessRoad } from './game/road';
import type { GameState } from './game/state';
import { startGame } from './game/state';
import { cycleTerrain, getTerrain, TERRAINS, type TerrainId } from './game/terrain';
import { spawnInitialCars, updateTraffic } from './game/traffic';
import { sendTelemetry } from './haptics/serialOut';
import { createKeyboardAdapter } from './input/keyboard';
import { createWebSerialAdapter } from './input/webserial';
import { drawPlayerCar } from './render/car';
import { COLORS } from './render/colors';
import { drawGrid } from './render/effects/grid';
import { drawParticles, updateParticles } from './render/effects/particles';
import { drawScanlines } from './render/effects/scanlines';
import { drawSpeedLines, updateSpeedLines } from './render/effects/speedLines';
import { drawSky, drawSun } from './render/effects/sun';
import { perfFlags, togglePerfFlag } from './render/perfFlags';

// Dev-only number-key map for the perf toggles. Module-scope so the keyPressed
// handler stays simple (the cognitive-complexity lint flags inline if-chains).
const PERF_TOGGLE_KEYS: Record<string, keyof typeof perfFlags> = {
  '1': 'bloom',
  '2': 'sun',
  '3': 'grid',
  '4': 'scanlines',
  '5': 'speedLines',
  '6': 'particles',
};

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

      // Dev-only deep link for screenshots/demos: ?terrain=sand&mode=endless
      // jumps straight into a run. Constant-folded out of production builds.
      if (import.meta.env.DEV) {
        const params = new URLSearchParams(globalThis.location.search);
        const t = params.get('terrain');
        if (t && TERRAINS.some((x) => x.id === t)) state.terrain = t as TerrainId;
        const m = params.get('mode');
        if (m === 'endless' || m === 'lap') enterGame(m);
      }
    };

    p.windowResized = () => {
      p.resizeCanvas(p.windowWidth, p.windowHeight);
    };

    const handleMenuKey = (code: number) => {
      if (code === p.UP_ARROW || code === p.DOWN_ARROW) {
        menuFocus = menuFocus === 0 ? 1 : 0;
        playMenuNav();
      } else if (code === p.LEFT_ARROW || code === p.RIGHT_ARROW) {
        state.terrain = cycleTerrain(state.terrain, code === p.LEFT_ARROW ? -1 : 1);
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

      // Dev-only perf isolation toggles. Press 1-6 to flip an effect off/on
      // while reading the FPS counter — points at the actual bottleneck.
      if (import.meta.env.DEV) {
        const flag = PERF_TOGGLE_KEYS[p.key];
        if (flag) {
          togglePerfFlag(flag);
          return;
        }
      }

      const code = p.keyCode;
      if (state.screen === 'menu') handleMenuKey(code);
      else if (state.screen === 'game') handleGameKey(code);
      else handleFinishKey(code);
    };

    p.draw = () => {
      // dt computed up front so scanlines (drawn on every screen) can advance
      // their rolling jitter even on the menu.
      const dt = Math.min(p.deltaTime / 1000, 1 / 30);

      // Sky gradient replaces the old flat p.background(COLORS.bg). Drawn on
      // every screen in the selected terrain's palette — on the menu this makes
      // the ←/→ terrain cycle a live preview. The NEON effects package (sun,
      // grid, scanlines, road bloom) is Neon City's identity, gated by neonFx.
      const terrain = getTerrain(state.terrain);
      drawSky(p, terrain);

      if (state.screen === 'menu') {
        drawMenu(p, menuFocus, state.terrain);
        if (perfFlags.scanlines && terrain.neonFx) drawScanlines(p, dt);
        return;
      }

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
        if (perfFlags.speedLines) updateSpeedLines(state, dt, p);
        if (perfFlags.particles) updateParticles(p, dt);
      } else if (state.screen === 'finish') {
        // physics step 9 may have just transitioned us here. Idempotent fade.
        setEngineActive(false);
        setOffRoadIntensity(0);
      }

      // Draw order: sky (done) → sun → road → grid → player → particles →
      // speed lines → HUD/finish → scanlines. Grid AFTER road — see deviation
      // note in render/effects/grid.ts.
      if (road) renderWorld(p, state, road, cars);
      if (state.screen === 'game') drawHUD(p, state, dt);
      else if (state.screen === 'finish') drawFinishScreen(p, state);
      if (perfFlags.scanlines && terrain.neonFx) drawScanlines(p, dt);
    };
  };
}

function renderWorld(p: p5, state: GameState, road: Road, cars: TrafficCar[]): void {
  const neonFx = getTerrain(state.terrain).neonFx;
  if (perfFlags.sun && neonFx) drawSun(p, state);
  renderRoad(p, state, road, cars);
  if (perfFlags.grid && neonFx) drawGrid(p, state, road);
  drawPlayerCar(p);
  if (perfFlags.particles) drawParticles(p);
  if (perfFlags.speedLines) drawSpeedLines(state, p);
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
