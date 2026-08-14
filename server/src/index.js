import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import path from "node:path";
import express from "express";
import { WebSocketServer } from "ws";
import { GameServer } from "./GameServer.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;

const app = express();

// Health check (Render pings this).
app.get("/healthz", (_req, res) => res.send("ok"));

// In production, serve the built client from Vite's output.
const clientDist = path.resolve(__dirname, "../../client/dist");
app.use(express.static(clientDist));
// SPA fallback: send index.html for any non-file route.
app.get("*", (_req, res) => {
  res.sendFile(path.join(clientDist, "index.html"), (err) => {
    if (err) res.status(404).send("Client not built. Run `npm run build`.");
  });
});

const httpServer = createServer(app);

// WebSocket lives on the same server/port at /ws.
const wss = new WebSocketServer({ server: httpServer, path: "/ws" });
const game = new GameServer();
game.attach(wss);

httpServer.listen(PORT, () => {
  console.log(`JS Joust server listening on http://localhost:${PORT}`);
  console.log(`WebSocket endpoint: ws://localhost:${PORT}/ws`);
});
