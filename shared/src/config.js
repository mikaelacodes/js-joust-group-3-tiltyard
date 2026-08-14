/**
 * Game tuning constants shared by client and server (TILTYARD).
 *
 * The core mechanic: a round escalates from calm to chaos. As "intensity" rises,
 * the music tempo (BPM) climbs and the amount of movement you're allowed SHRINKS.
 * Warm-Up is merciful; Sudden Death eliminates you on a twitch.
 *
 * The server owns the tempo loop and broadcasts the current `allowedMagnitude`.
 * Each phone reads ITS OWN accelerometer and self-reports when it moves too much
 * — so per-player traffic stays tiny and a room holds any number of players.
 */

/** How often the server advances the tempo and broadcasts sensitivity (ms). */
export const TICK_MS = 200;

/** Countdown shown before a round actually starts (ms). */
export const COUNTDOWN_MS = 3000;

/** Seconds for a round to ramp from Warm-Up (0) to full Sudden Death (1). */
export const RAMP_SECONDS = 75;

/** Small oscillation on the way up so there are brief reprieves. */
export const WOBBLE_AMPLITUDE = 0.12;
export const WOBBLE_SECONDS = 7;

/** Music tempo range, in beats per minute, mapped across intensity 0..1. */
export const BPM = { MIN: 66, MAX: 172 };

/** Allowed jerk magnitude (m/s²) at intensity 0 (generous) and 1 (brutal). */
export const ALLOWED = { MAX: 9.0, MIN: 1.4 };

/**
 * Named phases, thresholded on intensity. Copy mirrors the TILTYARD concept.
 * @typedef {Object} Phase
 * @property {string} id
 * @property {string} name
 * @property {number} minIntensity
 * @property {string} className   CSS class applied to the conductor screen
 * @property {string} caption
 * @property {string} hint
 */

/** @type {Phase[]} */
export const PHASES = [
  {
    id: "warmup",
    name: "Warm-Up",
    minIntensity: 0,
    className: "",
    caption: "Ease in. Small moves only — the beat is slow and forgiving for now.",
    hint: "WARM-UP · THE BEAT WILL SPEED UP WITHOUT WARNING",
  },
  {
    id: "danger",
    name: "Danger",
    minIntensity: 0.4,
    className: "phase-danger",
    caption: "Tempo's climbing. Whatever knocked out the last knight — don't do that.",
    hint: "DANGER · STAY LOOSE, STAY LOW",
  },
  {
    id: "sudden",
    name: "Sudden Death",
    minIntensity: 0.75,
    className: "phase-sudden",
    caption: "Anything goes. One twitch ends it — this is where rounds are won.",
    hint: "SUDDEN DEATH · LAST KNIGHT STANDING WINS",
  },
];

const lerp = (a, b, t) => a + (b - a) * t;
const clamp01 = (t) => Math.min(1, Math.max(0, t));

/** @param {number} intensity @returns {number} */
export function intensityToBpm(intensity) {
  return Math.round(lerp(BPM.MIN, BPM.MAX, clamp01(intensity)));
}

/** @param {number} intensity @returns {number} */
export function intensityToAllowedMagnitude(intensity) {
  return lerp(ALLOWED.MAX, ALLOWED.MIN, clamp01(intensity));
}

/** @param {number} intensity @returns {Phase} */
export function intensityToPhase(intensity) {
  const c = clamp01(intensity);
  let phase = PHASES[0];
  for (const p of PHASES) if (c >= p.minIntensity) phase = p;
  return phase;
}

/** Room codes: short, unambiguous (no 0/O/1/I). */
export const ROOM_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const ROOM_CODE_LENGTH = 4;

/** Minimum players (knights) required before the conductor can start. */
export const MIN_PLAYERS_TO_START = 2;

/** Neon avatar colors assigned to players in join order (cycled). */
export const PLAYER_COLORS = ["pink", "cyan", "yellow", "violet", "lime", "orange"];
