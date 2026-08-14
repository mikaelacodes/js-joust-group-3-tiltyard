/**
 * Game tuning constants shared by client and server (TILTYARD).
 *
 * The core mechanic (faithful to Johann Sebastian Joust): the music's tempo
 * rises and falls, and how much you're allowed to move tracks the tempo.
 *   - SLOW music  -> the torches are razor-sensitive: freeze, barely breathe.
 *   - FAST music  -> you're free to lunge and dash at rivals to nudge them out.
 * Move too much for the *current* tempo and your torch goes out.
 *
 * The tension is the slow troughs — especially the sudden drops from a fast
 * charge into a dead-slow freeze. As the round goes on those troughs get slower
 * (more sensitive) and arrive more often, so rounds resolve.
 *
 * The server owns the tempo loop and broadcasts the current `allowedMagnitude`.
 * Each phone reads ITS OWN accelerometer and self-reports when it moves too much
 * — so per-player traffic stays tiny and a room holds any number of players.
 */

/** How often the server advances the tempo and broadcasts sensitivity (ms). */
export const TICK_MS = 200;

/** Countdown shown before a round actually starts (ms). */
export const COUNTDOWN_MS = 3000;

/** Seconds for the round to escalate from gentle swings to full chaos. */
export const ROUND_ESCALATE_SECONDS = 60;

/**
 * Tempo oscillation speed, in cycles/second, at the start of the round vs. at
 * full chaos. A cycle is one full slow -> fast -> slow swing; faster late-round
 * oscillation means freezes hit more often and with less warning.
 */
export const OSC_HZ = { START: 1 / 14, END: 1 / 5 };

/**
 * The slow trough of the tempo swing (0 = dead slow, 1 = full speed), at round
 * start vs. full chaos. Early troughs stay merciful; late ones drop near 0 for
 * brutal freezes.
 */
export const TEMPO_FLOOR = { START: 0.5, END: 0.0 };

/** Music tempo range, in beats per minute, mapped across tempo 0..1. */
export const BPM = { MIN: 66, MAX: 172 };

/**
 * Allowed jerk magnitude (m/s²) at the tempo extremes. SLOW is brutal (a twitch
 * ends you); FAST is generous (lunge freely). Allowance rises WITH tempo.
 */
export const ALLOWED = { SLOW: 1.4, FAST: 9.0 };

/**
 * Named phases, thresholded on the current tempo (0 = slow, 1 = fast).
 * @typedef {Object} Phase
 * @property {string} id
 * @property {string} name
 * @property {number} minTempo
 * @property {string} className   CSS class applied to the conductor screen
 * @property {string} caption
 * @property {string} hint
 */

/** @type {Phase[]} */
export const PHASES = [
  {
    id: "freeze",
    name: "Hold Still",
    minTempo: 0,
    className: "phase-sudden",
    caption: "The music's crawling — the torches are razor-sensitive. Barely breathe.",
    hint: "SLOW BEAT · A TWITCH ENDS YOU — FREEZE",
  },
  {
    id: "skirmish",
    name: "Skirmish",
    minTempo: 0.34,
    className: "phase-danger",
    caption: "Tempo's middling — a little room to shift, but don't overcommit.",
    hint: "MID BEAT · MOVE WITH CARE",
  },
  {
    id: "charge",
    name: "Charge!",
    minTempo: 0.67,
    className: "",
    caption: "Music's flying — you're free to lunge. Go nudge a rival off the beat.",
    hint: "FAST BEAT · LUNGE — KNOCK THEM OUT",
  },
];

const lerp = (a, b, t) => a + (b - a) * t;
const clamp01 = (t) => Math.min(1, Math.max(0, t));

/** @param {number} tempo 0..1 @returns {number} */
export function tempoToBpm(tempo) {
  return Math.round(lerp(BPM.MIN, BPM.MAX, clamp01(tempo)));
}

/** @param {number} tempo 0..1 @returns {number} Allowed jerk; grows with tempo. */
export function tempoToAllowedMagnitude(tempo) {
  return lerp(ALLOWED.SLOW, ALLOWED.FAST, clamp01(tempo));
}

/** @param {number} tempo 0..1 @returns {Phase} */
export function tempoToPhase(tempo) {
  const c = clamp01(tempo);
  let phase = PHASES[0];
  for (const p of PHASES) if (c >= p.minTempo) phase = p;
  return phase;
}

/** Room codes: short, unambiguous (no 0/O/1/I). */
export const ROOM_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const ROOM_CODE_LENGTH = 4;

/** Minimum players (knights) required before the conductor can start. */
export const MIN_PLAYERS_TO_START = 2;

/** Neon avatar colors assigned to players in join order (cycled). */
export const PLAYER_COLORS = ["pink", "cyan", "yellow", "violet", "lime", "orange"];
