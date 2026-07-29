# Ghost — Pseudo-3D Racing Game

Iteration 1 of the **software half** of the **Ghost** project — a haptic racing controller built for *WP22 Advanced Topics in HCI* at BHT Berlin. The game runs entirely in the browser as a self-contained arcade racer (think Pole Position / OutRun) and exposes a clean event bus where iteration 2 will plug in the physical yoke over WebSerial. Hardware integration, sound, and AI opponents are explicitly out of scope for iter 1; the goal here is to be playable enough on keyboard to be a real testbed.

## Quickstart

```bash
nvm use            # picks Node 20.19 from .nvmrc
npm install
npm run dev        # http://127.0.0.1:5173
```

For a production build:

```bash
npm run build      # biome check + tsc --noEmit + vite build
npm run preview    # serves dist/ on http://127.0.0.1:4173
```

`npm run build` chains **Biome** (lint + format check) + **tsc --noEmit** (strict type-check) + **vite build**. A red Biome line or a TS error fails the build — don't rely on `vite build` alone.

## Node version

Pinned to **Node 20.19** via [`.nvmrc`](./.nvmrc) and `engines.node` in [`package.json`](./package.json). Vite 8 requires ≥20.19; using nvm avoids the cliff.

## p5.js 1.x pin (deliberate)

The project pins `p5@^1.11`, not 2.0. p5 1.x stopped getting updates at the end of March 2026, so we're knowingly running against an EOL line. The pin is a trade-off: p5 2.0 ships breaking changes around `preload`/async lifecycle that would require a full rewrite of the sketch boot path for a game whose actual visual story (programmatic polygons, no asset preload) doesn't benefit from the new lifecycle. We accept the EOL risk for iter 1 and will migrate when iter 2 lands. See p5.js 2.0 release notes and the official compatibility add-on at https://p5js.org for the migration path.

> Note on TypeScript: the project was specified against TypeScript 6 (strict mode by default). TypeScript 6 is not on npm yet, so the pin resolves to **5.9.3** with strict mode explicitly enabled in [`tsconfig.json`](./tsconfig.json) (`strict`, `noUncheckedIndexedAccess`, `noUnusedLocals`, `noUnusedParameters`). Behaviour matches the spec.

## Controls

| Key             | Action                                   |
|-----------------|------------------------------------------|
| **Z** (hold)    | Accelerate                               |
| **X**           | Brake                                    |
| **← / →**       | Steer (continuous, ramped)               |
| **Z** held >1 s | Arm + activate turbo (3 s burst)         |
| **Esc**         | Return to menu (from a race or finish)   |
| **↑ / ↓**       | Menu / focus toggle                      |
| **← / →** (menu)| Cycle terrain                            |
| **Enter**       | Confirm menu choice / retry from finish  |
| `]`             | *Dev only* — jump 750 m forward (10 % of a lap). Stripped from production builds via `import.meta.env.DEV`. |

The keyboard mock integrates the steering wheel as a continuous signal (rise/return rates in [`game/physics.ts`](./src/game/physics.ts)), faithfully previewing what the rotary encoder on the Ghost yoke will produce. Swapping the input source doesn't change the game loop — see [`input/input.ts`](./src/input/input.ts). With the hardware yoke connected (see below), the keyboard stays as an always-available fallback.

## Hardware controller — the Ghost yoke (iteration 2)

The physical controller plugs into the two seams iter 1 left open: the `InputAdapter` interface (steering + buttons in) and the `HapticBus` (force-feedback + wind out). The game loop never learns whether input came from the keyboard or the yoke.

**Connecting:** open the game in **Chrome or Edge on desktop** (Web Serial is Chromium-only, and the page must be `https://` or `localhost` — Vite dev is fine). Click **⚙ Connect Controller** (top-right) and pick the Arduino's port. The button turns into a green status pill; on unsupported browsers it's disabled and the game stays fully playable on keyboard.

**Hardware:** Arduino UNO R4 Minima · AS5600 magnetic encoder (steering) · NEMA 17 stepper + TMC2209 driver (force-feedback wheel) · 2× DC blower fans + XY-MOS (wind) · two thumb buttons (accelerate / brake). Firmware, the full pin map, and **wiring diagrams (SVG + PDF, one per component)** live in [`firmware/ghost-yoke/`](../firmware/ghost-yoke/) and [`firmware/ghost-yoke/wiring/`](../firmware/ghost-yoke/wiring/).

**Browser-side code** ([`src/serial/`](./src/serial/), [`src/input/webserial.ts`](./src/input/webserial.ts), [`src/haptics/serialOut.ts`](./src/haptics/serialOut.ts)):

- **[`serial/protocol.ts`](./src/serial/protocol.ts)** — line-based ASCII wire protocol (the single source of truth, mirrored in the firmware's `Protocol.h`), plus the load-bearing left/right sign convention.
- **[`serial/ghostSerial.ts`](./src/serial/ghostSerial.ts)** — the port manager: user-gesture `connect()`, an async read loop with a partial-line buffer + fail-safe parsing (no checksum on the link), and clean teardown on tab close.
- **[`input/webserial.ts`](./src/input/webserial.ts)** — the hardware `InputAdapter`. The AS5600 reports an absolute angle, so there's no rise/return integration — `read()` just returns the cached snapshot.
- **[`haptics/serialOut.ts`](./src/haptics/serialOut.ts)** — forwards discrete `HapticBus` events (collision / turbo / lap) as commands, and streams a throttled **telemetry frame** (speed / curve-load / off-road) read straight from `GameState`, since those continuous values aren't discrete events.

| Direction | Frame | Drives |
|-----------|-------|--------|
| Yoke → game | `I <wheel> <accel> <brake>` | steering + buttons |
| game → yoke | `T <speed> <lateral> <offroad>` (~30 Hz) | fan wind + stepper centering force |
| game → yoke | `S <rumble> <resist>` (~1 Hz) | terrain wheel feel (vibration + stiffness) |
| game → yoke | `C <severity>` / `B1`·`B0` / `L` | collision jolt / turbo / lap pulse |

> **Force-feedback note:** the stepper is driven as a torque-limited *resistance* (UART `VACTUAL` velocity + run-current modulation), not a servo chasing a center setpoint — that would fight the user on the same shaft. It approximates FFB; real torque control wants a BLDC + FOC. Tuning constants are in the firmware.

## Modes

- **Endless** — procedurally generated, open-ended track. Score is distance travelled in km. No fail state; collisions slow you down but don't end the run. Per-run randomised via `Date.now()` seed.
- **Lap (3 laps)** — fixed seeded circuit. 7.5 km closed loop (750 segments × 10 m), C1-continuous at the wrap by construction (integer-multiple sine frequencies — segment 749 meets segment 0 with no visible kink). Lap timer + best lap. Finish screen on lap 3 with retry / menu.

### Terrains

`←/→` on the menu cycles the surface. Each terrain is a full environment — its own sky gradient, ground/road/wall palette, driving physics, **and wheel feel on the yoke** — all defined in one place, [`game/terrain.ts`](./src/game/terrain.ts). The synthwave effects package (horizon sun, perspective grid, scanlines, bloom) is exclusive to Neon City via the `neonFx` flag; the other terrains render clean. The feel parameters stream to the firmware as the `S` frame, so tuning a terrain never requires a reflash. Dev builds accept a deep link for demos: `?terrain=sand&mode=endless`.

| Terrain | Drives like | Wheel feels like |
|---------|-------------|------------------|
| **Neon City** | baseline asphalt | smooth, light |
| **Gravel Run** | slightly loose | constant buzz |
| **Desert Dusk** | holds the line, brutal off-road | heavy, stiff |
| **Glacier** | slides out hard in curves | light, floaty, faint shimmer |

## Architecture

Game loop is one-direction with a side-channel for haptics:

```
   ┌──────────┐      ┌─────────────┐      ┌───────────┐
   │  input/  │─────▶│    game/    │─────▶│  render/  │──▶ canvas
   │ keyboard │      │  state +    │      │  pseudo-  │
   │  OR yoke │      │  physics +  │      │  3D + HUD │
   └──────────┘      │  road +     │      └───────────┘
        ▲            │  traffic    │
        │ I-frames   └──────┬──────┘
        │                   │ emits HapticEvent + telemetry
   ┌────┴───────────────────▼──────┐      ┌─────────────────────┐
   │  serial/ (Web Serial)         │─────▶│  Ghost yoke firmware │
   │  + haptics/eventBus (pub-sub) │      │  (Arduino R4)        │
   └───────────────────────────────┘      └─────────────────────┘
```

Five subsystems, grouped by directory:

- **[`input/`](./src/input/)** — `InputAdapter` interface + keyboard adapter. Holds continuous wheel state, accelerate/brake bool flags. Hardware adapter will implement the same interface; the game loop never branches on input source.
- **[`game/`](./src/game/)** — flat `GameState`, the 10-step physics integrator, segment-based road generator (lap-closed or endless-windowed), traffic spawn/advance/respawn, shared collision response.
- **[`render/`](./src/render/)** — pseudo-3D segment projection (Jake Gordon school), HUD, menu, finish screen. Pure read-from-state, no mutation.
- **[`haptics/`](./src/haptics/)** — generic `HapticBus` pub-sub. Physics emits `collision`, `turbo_start`, `turbo_end`, `off_road`, `curve_load`, `lap_complete`. A console-debug listener and (iter 2) a WebSerial writer both subscribe.
- **[`serial/`](./src/serial/)** — Web Serial transport for the Ghost yoke: protocol, port manager. Feeds the WebSerial `InputAdapter` and the haptic/telemetry writer.
- **[`util/`](./src/util/)** — `mulberry32`/`stringHash` seeded PRNG, `formatLapTime`, shared types.

The `main.ts` / `sketch.ts` boundary: `main.ts` is the Vite entry that mounts the p5 instance; `sketch.ts` owns the p5 lifecycle (`setup` / `draw` / `keyPressed` / `windowResized`) and dispatches per-screen.

### Notable design decisions

A few non-obvious calls that diverge from CLAUDE.md's verbatim text and are worth flagging for future me / contributors:

- **Projection formula fix.** CLAUDE.md's verbatim `project()` returns `screenW = scale × (ROAD_WIDTH/2) × canvas_width`, but `screenX` scales by `canvas_width / 2`. The factor-of-2 mismatch makes the road quad render at twice its geometric width and pulls the walls (at ±9 m world) **inside** the road edge. Fixed in [`render/pseudo3d.ts`](./src/render/pseudo3d.ts) — `screenW` now uses `canvas_width / 2` to match `screenX`.
- **Off-road drag is speed-scaled.** A flat 50 m/s² drag would overpower throttle (14 m/s²) the moment you scraped a wall, decay speed to 0, kill steering authority (gated on speed), and soft-lock the car. Drag is now `OFF_ROAD_DRAG × speedNormalized × dt` — punishing at full speed, tapering off as you slow so throttle can rebuild authority for the recovery counter-steer.
- **Lap-mode A1 amplitude reduced.** CLAUDE.md's nominal 0.6 + 0.3 + 0.15 amplitudes produced peaks that were borderline uncounterable. A1 dropped to 0.5 (CLAUDE.md's own playtest note), keeping worst-case curve under ~0.95.
- **Endless segment grow threshold.** CLAUDE.md spec'd grow at `< 200` segments of buffer ahead, but `DRAW_DISTANCE = 300`. The render loop walks past the buffer end between a free and the next grow. Threshold is now `DRAW_DISTANCE + 100` so the buffer ahead always exceeds the read window.

## Haptic events

Emitted by the physics integrator, consumed by whatever listener you attach to `HapticBus`:

| Event         | When                                           | Payload                     |
|---------------|------------------------------------------------|-----------------------------|
| `collision`   | Fresh wall impact (leading-edge gated) or any traffic-car hit | `severity` ∈ [0, 1] from current speed |
| `off_road`    | `|playerX| > 1`, throttled to 10 Hz            | `intensity` ∈ [0, 1] from how far off-road |
| `curve_load`  | `lateralG > 0.2` and at speed, throttled to 10 Hz | `lateralG` ∈ [0, 1]      |
| `turbo_start` | Accel held continuously through the 1 s arm    | —                           |
| `turbo_end`   | `TURBO_DURATION = 3 s` after `turbo_start`     | —                           |

Open the browser console at **Verbose / Debug** log level — events stream there with a coloured `[haptic]` prefix.

## Next iterations

- **WebSerial hardware adapter** — ✅ done (iteration 2). See "Hardware controller" above; firmware in [`firmware/ghost-yoke/`](../firmware/ghost-yoke/). Remaining: tune the force-feedback feel on the real rig.
- **Turbo redesign — power-up pickups + charge meter.** Replace the hold-to-arm turbo with collectable road pickups, an on-screen charge meter, single-key activation, and an active visual effect (screen-edge speed lines / motion blur). Deferred from iter 1 — see chat log for design sketch.
- **AI ghost driver** — second virtual racer following the player's previous lap line, used for difficulty modeling and the demo "race against your last attempt" experience.
- **Sound effects + music** — engine RPM, collision impact, curve_load buzz, ambient track.
- **Additional environments** — desert, night, tunnel; one procedural generator can re-skin via colour palettes.
- **Migrate to p5 2.0** — once the official compatibility add-on path is exercised by a few more public games, port off the EOL 1.x line.

## Smoke tests (no automated suite)

The "test runner" for iter 1 is `npm run build` exiting 0. No Vitest, no Playwright — p5 in instance mode is awkward to host in JSDOM and not worth the dependency weight for one smoke check.

Manual verify on a fresh checkout:

1. `npm install && npm run dev` → menu loads with `GHOST` title, two buttons, controls hint and credits at the bottom.
2. **Endless** → drive, hit walls / traffic, watch `[haptic]` events in DevTools console.
3. **Lap** → race three laps (`]` 30× speedruns it in dev) → finish screen shows total time + best lap with retry / menu.
4. Lose focus on the tab for ~30 s, come back — no teleport / wall-clip on the first frame back (the `dt` clamp catches the resume).
5. `npm run build && npm run preview` → bundle runs cleanly, console shows only `[haptic]` debug lines.

## Credits

- **Course**: WP22 Advanced Topics in HCI, SS2026
- **Institution**: Berliner Hochschule für Technik (BHT Berlin)
- **Stack**: Vite 8 · TypeScript 5.9 (strict) · p5.js 1.11 · Biome 2.4 · Node 20.19

Iteration 2 (hardware integration) is where this project becomes interesting — iter 1 is the canvas it plugs into.
