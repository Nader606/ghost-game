// Terrain definitions — the single source of truth for how each surface looks,
// drives, and FEELS in the wheel. The renderer reads the palette, physics reads
// the grip/drag multipliers, and serialOut streams `wheelRumble`/`wheelResist`
// to the yoke firmware (which stays generic — it just renders whatever feel
// parameters arrive, so new terrains never require a firmware flash).

export type TerrainId = 'asphalt' | 'gravel' | 'sand' | 'ice';

export interface Terrain {
  id: TerrainId;
  name: string; // menu label
  subtitle: string; // menu hint at what it does
  // Palette — replaces COLORS.grass1/grass2 in the road renderer.
  grass1: string;
  grass2: string;
  // Full visual identity. Each terrain is its own environment, not a reskin of
  // the synthwave look — the NEON effects package (sun, grid, scanlines, road
  // bloom) belongs to Neon City alone via `neonFx`.
  sky: { top: string; mid: string; horizon: string; below: string };
  road1: string;
  road2: string;
  wallLeft: string;
  wallRight: string;
  neonFx: boolean;
  // Physics multipliers (1 = the asphalt baseline in physics.ts).
  offRoadDragMul: number; // scales OFF_ROAD_DRAG on the shoulder
  centripetalMul: number; // scales curve push-out — >1 feels slippery
  // Wheel feel, streamed to the yoke (0..1 each).
  wheelRumble: number; // continuous vibration amplitude; firmware scales by speed
  wheelResist: number; // baseline steering stiffness (stepper holding current)
}

export const TERRAINS: readonly Terrain[] = [
  {
    // The synthwave original — the only terrain with the NEON effects package.
    id: 'asphalt',
    name: 'NEON CITY',
    subtitle: 'smooth asphalt · clean wheel',
    grass1: '#0F3460',
    grass2: '#0D2D54',
    sky: { top: '#8338EC', mid: '#2A0944', horizon: '#0B0014', below: '#1A1A2E' },
    road1: '#2A2A3E',
    road2: '#252538',
    wallLeft: '#D14860',
    wallRight: '#4060A0',
    neonFx: true,
    offRoadDragMul: 1,
    centripetalMul: 1,
    wheelRumble: 0.05,
    wheelResist: 0.15,
  },
  {
    // Overcast forest rally stage — muted greens, earth-tone barriers.
    id: 'gravel',
    name: 'GRAVEL RUN',
    subtitle: 'loose surface · constant buzz',
    grass1: '#4A3B28',
    grass2: '#403322',
    sky: { top: '#55645C', mid: '#39463F', horizon: '#232E28', below: '#2A2218' },
    road1: '#35322B',
    road2: '#2E2B25',
    wallLeft: '#6B5B3E',
    wallRight: '#554831',
    neonFx: false,
    offRoadDragMul: 0.8,
    centripetalMul: 1.15,
    wheelRumble: 0.55,
    wheelResist: 0.3,
  },
  {
    // Warm dusk over open sand — ember sky, adobe walls.
    id: 'sand',
    name: 'DESERT DUSK',
    subtitle: 'deep sand · heavy wheel',
    grass1: '#7A4E23',
    grass2: '#6B421C',
    sky: { top: '#93402A', mid: '#5C2418', horizon: '#2C1009', below: '#4A2D13' },
    road1: '#3C3028',
    road2: '#342A22',
    wallLeft: '#B0603A',
    wallRight: '#8A4A2C',
    neonFx: false,
    offRoadDragMul: 1.3,
    centripetalMul: 0.9,
    wheelRumble: 0.25,
    wheelResist: 0.8,
  },
  {
    // Pale polar daylight — the one bright environment; ice-blue everything.
    id: 'ice',
    name: 'GLACIER',
    subtitle: 'ice · light wheel, slides out',
    grass1: '#7FA8C9',
    grass2: '#6E97B8',
    // Sky top kept deep enough that the white HUD text stays legible over it.
    sky: { top: '#4E7FA6', mid: '#9FC3D8', horizon: '#E8F2F7', below: '#5E88A8' },
    road1: '#3E4A58',
    road2: '#37424F',
    wallLeft: '#B9D4E4',
    wallRight: '#8FB2C9',
    neonFx: false,
    offRoadDragMul: 0.5,
    centripetalMul: 1.5,
    wheelRumble: 0.1,
    wheelResist: 0.05,
  },
] as const;

export function getTerrain(id: TerrainId): Terrain {
  const t = TERRAINS.find((x) => x.id === id);
  // TERRAINS covers every TerrainId, so this only guards future refactors.
  return t ?? TERRAINS[0] ?? panic();
}

function panic(): never {
  throw new Error('TERRAINS must not be empty');
}

// Cycle the menu selection left/right, wrapping at the ends.
export function cycleTerrain(id: TerrainId, dir: -1 | 1): TerrainId {
  const idx = TERRAINS.findIndex((x) => x.id === id);
  const next = (idx + dir + TERRAINS.length) % TERRAINS.length;
  const t = TERRAINS[next];
  return t ? t.id : id;
}
