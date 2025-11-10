import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "http://localhost:5173",
    methods: ["GET", "POST"],
  },
});

const rooms = new Map();

io.on("connection", (socket) => {
  socket.on("createRoom", (callback) => {
    const roomId = Math.random().toString(36).substr(2, 9);
    rooms.set(roomId, {
      players: new Set([socket.id]),
      currentPlayer: 0,
    });
    socket.join(roomId);
    callback(roomId);
  });

  socket.on("joinRoom", (roomId, callback) => {
    const room = rooms.get(roomId);
    if (!room) {
      socket.emit("error", "房间不存在");
      return;
    }

    if (room && room.players.size < 2) {
      room.players.add(socket.id);
      socket.join(roomId);
      callback(true);
    } else {
      callback(false);
    }
  });

  socket.on("move", (data) => {
    socket.to(data.roomId).emit("move", data);
  });

  socket.on("disconnect", () => {
    console.log("disconnect");
  });
});

httpServer.listen(3001, () => {
  console.log("Server running on port 3001");
});
