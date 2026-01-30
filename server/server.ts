import http from "http";
import { v4 as uuidv4 } from "uuid";
import { createWebSocketServer } from "./ws/index";
import { handleDisconnect } from "./sessions/cleanup";
import type { Request, Response } from "express";
import express from "express";

const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;

export function startServer(port = PORT) {
  const app = express();

  app.get("/", (req: Request, res: Response) => res.send("CodeX server running"));
  app.get("/health", (req: Request, res: Response) => res.status(200).json({ status: "ok" }));

  const server = http.createServer(app);

  const wss = createWebSocketServer(server);

  
  wss.on("connection", async (ws) => {
    const socketId = uuidv4();
    
    (ws as any).id = socketId;

    
    try {
      const { register, unregister } = await import("./ws/registry");
      register(socketId, ws);

      ws.send(JSON.stringify({ type: "welcome", socketId }));

      ws.on("close", () => {
        try {
          unregister(socketId);
        } catch (err) {
          console.warn("error unregistering socket", socketId, err);
        }

        try {
          handleDisconnect(socketId);
        } catch (err) {
          console.warn("error during disconnect cleanup", err);
        }
      });

      ws.on("error", (err) => {
        console.warn("websocket error for socket", socketId, err);
      });
    } catch (err) {
      
      console.warn("failed to register websocket", err);
    }
  });

  server.listen(port, () => {
    console.log(`Server listening on http://localhost:${port}`);
  });

  return server;
}


if (process.argv[1] && process.argv[1].endsWith("server.js") || require.main === module) {
  startServer();
}
