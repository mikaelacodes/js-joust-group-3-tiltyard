import { defineConfig } from "vite";

export default defineConfig({
  server: {
    host: true, // expose on LAN so phones can reach the dev server
    proxy: {
      // Forward the WebSocket to the Node server during development.
      "/ws": {
        target: "ws://localhost:3000",
        ws: true,
      },
    },
  },
});
