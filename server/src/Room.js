import {
  S2C,
  msg,
  TICK_MS,
  COUNTDOWN_MS,
  RAMP_SECONDS,
  WOBBLE_AMPLITUDE,
  WOBBLE_SECONDS,
  PLAYER_COLORS,
  intensityToBpm,
  intensityToAllowedMagnitude,
  intensityToPhase,
  MIN_PLAYERS_TO_START,
} from "@joust/shared";

const clamp01 = (t) => Math.min(1, Math.max(0, t));

/**
 * @typedef {"lobby" | "countdown" | "playing" | "ended"} RoomPhase
 */

/**
 * A single game room. Owns the authoritative game state and the tempo loop.
 * Players (torches) play on phones; the conductor is a shared display and is
 * never eliminated or counted toward the winner. No cap on player count.
 */
export class Room {
  /**
   * @param {string} code
   * @param {(code: string) => void} onEmpty  called when the last member leaves
   */
  constructor(code, onEmpty) {
    this.code = code;
    this.onEmpty = onEmpty;
    /** @type {Map<string, import("./Player.js").Player>} */
    this.members = new Map();
    /** @type {RoomPhase} */
    this.phase = "lobby";
    /** @type {NodeJS.Timeout | null} */
    this.tickTimer = null;
    /** @type {NodeJS.Timeout | null} */
    this.countdownTimer = null;
    this.roundStartedAt = 0;
    /** Running counter so torch colors stay stable per player. */
    this.colorCounter = 0;
  }

  get hostId() {
    for (const p of this.members.values()) if (p.isHost) return p.id;
    return null;
  }

  /** Only playing torches (excludes the conductor). */
  playerList() {
    return [...this.members.values()].filter((p) => p.role === "player");
  }

  /** @param {import("./Player.js").Player} member */
  addMember(member) {
    if (member.role === "player") {
      member.color = PLAYER_COLORS[this.colorCounter % PLAYER_COLORS.length];
      this.colorCounter++;
    }
    // First arrival hosts (normally the conductor who created the room).
    if (this.members.size === 0) member.isHost = true;
    this.members.set(member.id, member);
    this.broadcastPlayers();
  }

  /** @param {string} memberId */
  removeMember(memberId) {
    const member = this.members.get(memberId);
    if (!member) return;
    const wasHost = member.isHost;
    this.members.delete(memberId);

    if (this.members.size === 0) {
      this.stopLoops();
      this.onEmpty(this.code);
      return;
    }

    // Promote a new host if the host left (prefer the conductor, else anyone).
    if (wasHost) {
      const next =
        [...this.members.values()].find((p) => p.role === "conductor") ??
        this.members.values().next().value;
      if (next) next.isHost = true;
    }

    this.broadcastPlayers();
    if (this.phase === "playing") this.checkForWinner();
  }

  /** Host (conductor) requested the round to begin. */
  startGame(requesterId) {
    if (this.phase !== "lobby") return;
    if (requesterId !== this.hostId) return;
    const players = this.playerList();
    if (players.length < MIN_PLAYERS_TO_START) {
      this.members
        .get(requesterId)
        ?.send(msg(S2C.ERROR, { message: `Need at least ${MIN_PLAYERS_TO_START} torches.` }));
      return;
    }

    for (const p of players) p.alive = true;
    this.phase = "countdown";
    this.broadcast(msg(S2C.GAME_STARTING, { countdownMs: COUNTDOWN_MS }));
    this.countdownTimer = setTimeout(() => this.beginPlaying(), COUNTDOWN_MS);
  }

  beginPlaying() {
    this.phase = "playing";
    this.roundStartedAt = Date.now();
    this.broadcast(msg(S2C.GAME_STARTED));
    this.tickTimer = setInterval(() => this.tick(), TICK_MS);
    this.tick(); // send an immediate first frame
  }

  /** Advance intensity and broadcast tempo/sensitivity/phase. */
  tick() {
    const t = (Date.now() - this.roundStartedAt) / 1000;
    const base = clamp01(t / RAMP_SECONDS);
    // Wobble fades out as we approach full intensity so the ending stays brutal.
    const wobble = Math.sin((t / WOBBLE_SECONDS) * Math.PI * 2) * WOBBLE_AMPLITUDE;
    const intensity = clamp01(base + wobble * (1 - base));

    const bpm = intensityToBpm(intensity);
    const allowedMagnitude = intensityToAllowedMagnitude(intensity);
    const phase = intensityToPhase(intensity);

    this.broadcast(msg(S2C.TEMPO, { intensity, bpm, allowedMagnitude, phase }));
  }

  /** A player self-reported that their motion exceeded the limit. */
  eliminate(playerId) {
    if (this.phase !== "playing") return;
    const player = this.members.get(playerId);
    if (!player || player.role !== "player" || !player.alive) return;
    player.alive = false;
    this.broadcast(msg(S2C.PLAYER_ELIMINATED, { playerId }));
    this.checkForWinner();
  }

  checkForWinner() {
    const alive = this.playerList().filter((p) => p.alive);
    if (alive.length > 1) return;
    this.endGame(alive[0] ?? null);
  }

  /** @param {import("./Player.js").Player | null} winner */
  endGame(winner) {
    this.stopLoops();
    this.phase = "ended";
    this.broadcast(
      msg(S2C.GAME_OVER, {
        winnerId: winner?.id ?? null,
        winnerName: winner?.name ?? null,
        winnerColor: winner?.color ?? null,
      })
    );
  }

  /** Host resets everyone back to the lobby for another round. */
  playAgain(requesterId) {
    if (requesterId !== this.hostId) return;
    this.stopLoops();
    this.phase = "lobby";
    for (const p of this.playerList()) p.alive = true;
    this.broadcast(msg(S2C.LOBBY_RESET, { players: this.memberViews() }));
  }

  stopLoops() {
    if (this.tickTimer) clearInterval(this.tickTimer);
    if (this.countdownTimer) clearTimeout(this.countdownTimer);
    this.tickTimer = null;
    this.countdownTimer = null;
  }

  memberViews() {
    return [...this.members.values()].map((p) => p.toView());
  }

  broadcastPlayers() {
    this.broadcast(msg(S2C.PLAYERS_UPDATE, { players: this.memberViews() }));
  }

  /** @param {Record<string, unknown>} message */
  broadcast(message) {
    for (const p of this.members.values()) p.send(message);
  }
}
