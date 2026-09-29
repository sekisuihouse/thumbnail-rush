import { createServer } from "node:http";
import next from "next";
import { Server } from "socket.io";
import { GameManager } from "./src/server/game-manager";
import type { ClientToServerEvents, ServerToClientEvents } from "./src/types/game";

const dev = process.env.NODE_ENV !== "production";
const port = Number(process.env.PORT ?? 3000);
const hostname = process.env.HOST ?? "0.0.0.0";
const app = next({ dev, hostname, port });
const handler = app.getRequestHandler();

await app.prepare();
const httpServer = createServer((request, response) => handler(request, response));
const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
  cors: { origin: dev ? true : false },
  transports: ["websocket", "polling"],
  pingInterval: 10_000,
  pingTimeout: 20_000
});
const manager = new GameManager(io);
io.on("connection", (socket) => manager.attach(socket));

httpServer.listen(port, hostname, () => {
  console.log(`Thumbnail Rush ready on http://${hostname}:${port}`);
});
