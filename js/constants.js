export const G_CONST = 6.67430e-11;
export const AU = 1.495978707e11;
export const DAY = 86400;
export const PI = Math.PI;
export const TWO_PI = 2 * PI;
export const DEG = PI / 180;
export const J2000 = Date.UTC(2000, 0, 1, 12, 0, 0);

// One Julian century = 36525 days (used by JPL ephemeris rates).
export const CENTURY_SEC = 36525 * DAY;

// Real inclinations are 0-7°; ×8 makes them 0-56° — dramatic but keeps relative order.
export const INCL_EXAGGERATION = 8;

// Sun barycentric wobble physical amplitude is ~0.005 AU; this scales it for visibility.
export const SUN_WOBBLE_EXAGGERATION = 50;

export const MOON_ORBIT_SCALE = 0.12;

export const LEG_COLORS = [0xff9800, 0x00d4ff, 0xd36bff, 0x00e676, 0xffeb3b, 0xff5a3c];

export const MAX_TRAIL_POINTS = 500;

// Gravitational-field FX layer parameters.
export const FIELD_EXTENT = 35;
export const FIELD_GRID = 120;
export const FIELD_DEPTH = 3.2;
export const FIELD_R_MIN = 0.04;
