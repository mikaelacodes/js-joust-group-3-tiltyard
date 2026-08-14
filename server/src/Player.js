import { randomUUID } from "node:crypto";

/** One connected participant: either a playing torch or the conductor. */
export class Player {
  /**
   * @param {import("ws").WebSocket} socket
   * @param {string} name
   * @param {"player" | "conductor"} role
   */
  constructor(socket, name, role) {
    this.id = randomUUID();
    this.socket = socket;
    this.role = role;
    this.name = name || (role === "conductor" ? "Conductor" : "Player");
    this.alive = role === "player";
    this.isHost = false;
    /** Neon avatar color id, assigned by the room for players. */
    this.color = "cyan";
  }

  /** Serializable view sent to clients (never leak the socket). */
  toView() {
    return {
      id: this.id,
      name: this.name,
      alive: this.alive,
      isHost: this.isHost,
      role: this.role,
      color: this.color,
    };
  }

  /**
   * Send a message object to this player.
   * @param {Record<string, unknown>} message
   */
  send(message) {
    if (this.socket.readyState === this.socket.OPEN) {
      this.socket.send(JSON.stringify(message));
    }
  }
}
