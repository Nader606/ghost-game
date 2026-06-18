export const COLORS = {
  // World
  bg: '#1A1A2E',
  road1: '#2A2A3E',
  road2: '#252538',
  rumble1: '#E94560',
  rumble2: '#FFFFFF',
  grass1: '#0F3460',
  grass2: '#0D2D54',
  centerline: '#FFFFFF',
  startFinish: '#F5F5F8',
  wallLeft: '#D14860',
  wallRight: '#4060A0',
  wallBorder: '#F5F5F8',

  // Player car
  carBody: '#F5F5F8',
  carShadow: 'rgba(0,0,0,0.35)',
  playerWheel: '#1A1A20',
  playerWindshield: 'rgba(20, 22, 36, 0.55)',

  // Traffic
  trafficBody: '#88889A',
  trafficWheel: '#5C5C68',
  trafficWindow: '#3A3A48',
  trafficShadow: 'rgba(0, 0, 0, 0.35)',

  // HUD
  hudText: '#FFFFFF',
  hudMuted: '#A0A0B0',
  hudAccent: '#E94560',
  hudPanel: '#2A2A35',
  rpmLow: '#3FAA50',
  rpmMid: '#E5C75A',
  rpmHigh: '#E94560',

  // Finish screen
  finishOverlay: 'rgba(10, 10, 25, 0.72)',
} as const;

// Synthwave/vaporwave palette layered on top of COLORS for the NEON iteration.
// Additive: existing render paths keep using COLORS; new effects (sun, grid,
// bloom, particles, speed lines) reach for NEON. A future revert is one
// import change away.
export const NEON = {
  pink: '#FF006E', // sun mid-band, particle warm sparks, accent glow
  hotPink: '#FF4D9D', // bloom on rumble strips
  orange: '#FB5607', // sun bottom
  yellow: '#FFBE0B', // sun top, HUD active state, lap-complete accent
  cyan: '#3DDDFC', // grid lines, HUD digit bloom
  electricBlue: '#3A86FF', // grid alternation
  purple: '#8338EC', // sky upper gradient
  deepPurple: '#2A0944', // sky mid gradient
  black: '#0B0014', // sky horizon, bg replacement
  white: '#F0F0FF', // bloom core
} as const;
