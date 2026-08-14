import {
  C2S,
  S2C,
  msg,
  parseMessage,
  ROOM_CODE_ALPHABET,
  ROOM_CODE_LENGTH,
} from "@joust/shared";
import { Player } from "./Player.js";
import { Room } from "./Room.js";

/**
 * Owns all rooms and routes WebSocket messages to the right room.
 * Attach it to a `ws` WebSocketServer with `attach(wss)`.
 */
export class GameServer {
  constructor() {
    /** @type {Map<string, Room>} */
    this.rooms = new Map();
  }

  /** @param {import("ws").WebSocketServer} wss */
  attach(wss) {
    wss.on("connection", (socket) => this.onConnection(socket));
  }

  generateRoomCode() {
    let code;
    do {
      code = Array.from(
        { length: ROOM_CODE_LENGTH },
        () => ROOM_CODE_ALPHABET[Math.floor(Math.random() * ROOM_CODE_ALPHABET.length)]
      ).join("");
    } while (this.rooms.has(code));
    return code;
  }

  /**
   * @param {Player} member
   * @param {Room} room
   */
  sendJoined(member, room) {
    member.send(
      msg(S2C.ROOM_JOINED, {
        code: room.code,
        playerId: member.id,
        role: member.role,
        isHost: member.isHost,
        players: room.memberViews(),
      })
    );
  }

  /** @param {import("ws").WebSocket} socket */
  onConnection(socket) {
    /** @type {{ room: Room, member: Player } | null} */
    let session = null;

    const fail = (message) => socket.send(JSON.stringify(msg(S2C.ERROR, { message })));

    socket.on("message", (raw) => {
      const data = parseMessage(raw);
      if (!data) return;

      switch (data.type) {
        case C2S.PING:
          socket.send(JSON.stringify(msg(S2C.PONG)));
          break;

        case C2S.CREATE_ROOM: {
          if (session) return;
          const code = this.generateRoomCode();
          const room = new Room(code, (c) => this.rooms.delete(c));
          this.rooms.set(code, room);
          const member = new Player(socket, String(data.name ?? ""), "conductor");
          room.addMember(member);
          session = { room, member };
          this.sendJoined(member, room);
          break;
        }

        case C2S.JOIN_ROOM: {
          if (session) return;
          const code = String(data.code ?? "").toUpperCase();
          const room = this.rooms.get(code);
          if (!room) return fail("Room not found.");
          if (room.phase !== "lobby") return fail("That match already started.");
          const member = new Player(socket, String(data.name ?? ""), "player");
          room.addMember(member);
          session = { room, member };
          this.sendJoined(member, room);
          break;
        }

        case C2S.START_GAME:
          session?.room.startGame(session.member.id);
          break;

        case C2S.ELIMINATED:
          session?.room.eliminate(session.member.id);
          break;

        case C2S.PLAY_AGAIN:
          session?.room.playAgain(session.member.id);
          break;

        default:
          break;
      }
    });

    socket.on("close", () => {
      if (session) session.room.removeMember(session.member.id);
    });
  }
}
