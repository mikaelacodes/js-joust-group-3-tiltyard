/**
 * WebSocket message protocol shared by client and server.
 *
 * Every message is JSON: `{ type: string, ...payload }`. Use the `C2S` / `S2C`
 * constants below instead of raw strings so a typo fails loudly and both sides
 * stay in sync.
 */

/** Client -> Server message types. */
export const C2S = {
  /** Create a room as the Conductor (shared screen, doesn't play). `{}` */
  CREATE_ROOM: "create_room",
  /** Join an existing room as a Player (phone). `{ code, name }` */
  JOIN_ROOM: "join_room",
  /** Host starts the round. `{}` */
  START_GAME: "start_game",
  /** This player detected its own motion over the limit. `{}` */
  ELIMINATED: "eliminated",
  /** Host resets the room back to the lobby for another round. `{}` */
  PLAY_AGAIN: "play_again",
  /** Keepalive. `{}` */
  PING: "ping",
};

/** Server -> Client message types. */
export const S2C = {
  /** Sent once after create/join succeeds. `{ code, playerId, isHost, players }` */
  ROOM_JOINED: "room_joined",
  /** Something went wrong. `{ message }` */
  ERROR: "error",
  /** Roster changed (someone joined/left). `{ players }` */
  PLAYERS_UPDATE: "players_update",
  /** Countdown before play begins. `{ countdownMs }` */
  GAME_STARTING: "game_starting",
  /** Round is live. `{}` */
  GAME_STARTED: "game_started",
  /** Periodic broadcast during play. `{ intensity, bpm, allowedMagnitude, phase }` */
  TEMPO: "tempo",
  /** A player was eliminated. `{ playerId }` */
  PLAYER_ELIMINATED: "player_eliminated",
  /** Round finished. `{ winnerId, winnerName }` */
  GAME_OVER: "game_over",
  /** Room was reset to the lobby. `{ players }` */
  LOBBY_RESET: "lobby_reset",
  /** Host left / room destroyed. `{}` */
  ROOM_CLOSED: "room_closed",
  /** Keepalive reply. `{}` */
  PONG: "pong",
};

/**
 * @typedef {Object} PlayerView
 * @property {string} id
 * @property {string} name
 * @property {boolean} alive
 * @property {boolean} isHost
 * @property {"player" | "conductor"} role
 * @property {string} color   torch color id (see TORCH_COLORS)
 */

/**
 * Build a message object. Thin helper so call sites read clearly.
 * @param {string} type
 * @param {Record<string, unknown>} [payload]
 */
export function msg(type, payload = {}) {
  return { type, ...payload };
}

/**
 * Safely parse an incoming raw WebSocket message.
 * @param {string | Buffer} raw
 * @returns {{ type: string, [k: string]: unknown } | null}
 */
export function parseMessage(raw) {
  try {
    const data = JSON.parse(raw.toString());
    if (data && typeof data.type === "string") return data;
    return null;
  } catch {
    return null;
  }
}
