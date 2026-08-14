# Group 3 - TILTYARD

A browser-based take on **Johann Sebastian Joust** — a phone-motion party
elimination game with a neon "attract mode" skin. No app to install: everyone
plays in their phone's browser.

**How it plays:** the music's tempo rises and falls, and how much you can move
tracks it. When the beat is **slow**, your torch is razor-sensitive — freeze.
When it **speeds up**, you're free to lunge and dash at rivals to nudge their
hand. Move too much for the *current* beat and you're out. As the round wears on,
the slow troughs get slower and arrive more often, so rounds resolve. Last knight
standing wins. Phases follow the tempo: **Hold Still** (slow) → **Skirmish**
(mid) → **Charge!** (fast).

## Two roles, one app

- **Conductor** — created the room. The big shared screen (laptop/TV): an
  attract-mode lobby with a **QR code to join**, then a live tempo display with
  every knight's avatar. Starts rounds. Does **not** play.
- **Player** — scanned the QR (or typed the code) on their phone. Gets the "Stay
  Still" controller and reads *their own* accelerometer.

## Architecture

A single Node service serves the client **and** the WebSocket, so it deploys as
one free web service.

```
shared/   protocol + tempo/phase tuning imported by both sides
server/   Node + Express + ws — authoritative state (rooms, tempo loop, eliminations)
client/   Vanilla JS + Vite — attract/conductor screen, player controller, motion, QR
```

**Why it scales to any number of players:** the server broadcasts the current
tempo/sensitivity; each phone reads its own accelerometer and only sends a
message when *it* gets knocked out. No per-player motion stream to the server.

Key files:

- Tempo/phase model: [`shared/src/config.js`](shared/src/config.js)
- Message protocol: [`shared/src/protocol.js`](shared/src/protocol.js)
- Game state machine: [`server/src/Room.js`](server/src/Room.js)
- Client (both views) & loop: [`client/src/main.js`](client/src/main.js)
- Motion sensing: [`client/src/motion.js`](client/src/motion.js)
- QR join code: [`client/src/qr.js`](client/src/qr.js)

## Run it locally

```bash
npm install
npm run dev
```

- Client (Vite): http://localhost:5173
- Server (WebSocket + API): http://localhost:3000 — Vite proxies `/ws` to it.

Open http://localhost:5173, click **Host a game** on a laptop, then scan the QR
(or **Join** with the shown code) on each phone.

**Test with real phones on your WiFi:** Vite is exposed on your LAN
(`host: true`). Run `npm run dev`, then open the "Network" URL Vite prints
(e.g. `http://192.168.x.x:5173`) on each phone.

> ⚠️ Phone motion sensors (`DeviceMotionEvent`) require a **secure context**.
> `localhost` counts, but a raw `http://192.168.x.x` LAN address does **not** on
> iOS — motion will be blocked. For real-phone testing use the deployed HTTPS
> URL, or put an HTTPS tunnel (e.g. `ngrok`) in front of the dev server. iOS
> also requires a tap to grant motion access — that happens on **Join**.

## Message protocol (quick reference)

Client → server: `create_room` (become conductor), `join_room` (become player),
`start_game`, `eliminated`, `play_again`, `ping`.
Server → client: `room_joined`, `players_update`, `game_starting`,
`game_started`, `tempo`, `player_eliminated`, `game_over`, `lobby_reset`,
`error`, `pong`.

See [`shared/src/protocol.js`](shared/src/protocol.js) for payloads.

## Ideas / TODO

- ~~Real music playback on the conductor, tempo-locked to the broadcast BPM.~~
  Done — a synthesized soundtrack ([`client/src/audio.js`](client/src/audio.js))
  locks to the broadcast BPM and escalates with each phase. Mute it from the
  conductor screen.
- Reconnect handling (a dropped socket currently just leaves the room).
- Per-phone sensitivity calibration (different sensors read differently).
- Split `client/src/main.js` into `screens/*.js` as it grows.
