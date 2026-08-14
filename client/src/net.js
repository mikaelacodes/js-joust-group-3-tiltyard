import { msg, parseMessage } from "@joust/shared";

/**
 * Thin WebSocket wrapper: connects, auto-parses messages, and dispatches to
 * handlers registered with `on(type, fn)`.
 */
export class Net {
  constructor() {
    /** @type {WebSocket | null} */
    this.socket = null;
    /** @type {Map<string, Set<(data: any) => void>>} */
    this.handlers = new Map();
  }

  connect() {
    const proto = location.protocol === "https:" ? "wss" : "ws";
    const url = `${proto}://${location.host}/ws`;
    this.socket = new WebSocket(url);

    this.socket.addEventListener("message", (event) => {
      const data = parseMessage(event.data);
      if (!data) return;
      const set = this.handlers.get(data.type);
      if (set) for (const fn of set) fn(data);
    });

    return new Promise((resolve, reject) => {
      if (!this.socket) return reject(new Error("no socket"));
      this.socket.addEventListener("open", () => resolve(), { once: true });
      this.socket.addEventListener("error", () => reject(new Error("connect failed")), {
        once: true,
      });
    });
  }

  /**
   * @param {string} type
   * @param {(data: any) => void} fn
   * @returns {() => void} unsubscribe
   */
  on(type, fn) {
    if (!this.handlers.has(type)) this.handlers.set(type, new Set());
    this.handlers.get(type).add(fn);
    return () => this.handlers.get(type)?.delete(fn);
  }

  /**
   * @param {string} type
   * @param {Record<string, unknown>} [payload]
   */
  send(type, payload) {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(msg(type, payload)));
    }
  }
}

export const net = new Net();
