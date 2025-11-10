import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

const rooms = new Map();

io.on("connection", (socket) => {
  console.log(socket.id);

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
    // // 保存当前房间的数据
    // const room = rooms.get(data.roomId);
    // if (room) {
    //   room.currentPlayer = data.player;
    //   room.history = data.history;
    //   room.step = data.step;
    //   room.nowChessTable = data.nextChessTable;
    // }
    socket.to(data.roomId).emit("move", data);
  });

  // 悔棋
  socket.on("undo", (data) => {
    socket.to(data.roomId).emit("undo", data);
  });

  // 同意悔棋
  socket.on("diaAgree", (data) => {
    socket.to(data.roomId).emit("error", "对方不同意悔棋");
  });

  // 新局
  socket.on("restart", (data) => {
    socket.to(data.roomId).emit("restart", data);
  });

  socket.on("disconnect", () => {
    console.log("disconnect");
    // 房间清除
    for (const [roomId, room] of rooms) {
      if (room.players.has(socket.id)) {
        room.players.delete(socket.id);
        if (room.players.size === 0) {
          rooms.delete(roomId);
        }
      }
    }
  });
});

httpServer.listen(3001, () => {
  console.log("Server running on port 3001");
});
