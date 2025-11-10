import { useState, useEffect, useRef } from "react";
import { io } from "socket.io-client";
import { Socket } from "socket.io-client";
import "./fiveAi.css";

type Stone = "black" | "white" | null;

const FiveAi = () => {
  const [board, setBoard] = useState<Stone[][]>(
    Array(15)
      .fill(null)
      .map(() => Array(15).fill(null))
  );
  const [currentPlayer, setCurrentPlayer] = useState<"black" | "white">(
    "black"
  );
  const [winner, setWinner] = useState<Stone>(null);
  const [roomId, setRoomId] = useState("");
  const [isHost, setIsHost] = useState(false);

  const checkWin = (row: number, col: number) => {
    // 检查水平、垂直、对角线方向是否五子连珠
    const directions = [
      [
        [0, 1],
        [0, -1],
      ], // 水平
      [
        [1, 0],
        [-1, 0],
      ], // 垂直
      [
        [1, 1],
        [-1, -1],
      ], // 主对角线
      [
        [1, -1],
        [-1, 1],
      ], // 副对角线
    ];

    return directions.some(([plus, minus]) => {
      let count = 1;
      count += countDirection(row, col, plus[0], plus[1]);
      count += countDirection(row, col, minus[0], minus[1]);
      return count >= 5;
    });
  };

  const countDirection = (row: number, col: number, dx: number, dy: number) => {
    let count = 0;
    let r = row + dx;
    let c = col + dy;

    while (
      r >= 0 &&
      r < 15 &&
      c >= 0 &&
      c < 15 &&
      board[r][c] === currentPlayer
    ) {
      count++;
      r += dx;
      c += dy;
    }
    return count;
  };

  const socketRef = useRef<Socket>(null);

  useEffect(() => {
    if (!socketRef.current) {
      socketRef.current = io("http://localhost:3001", {
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 3000,
      });
    }
    socketRef.current.on("connect", () => {
      console.log(socketRef.current?.id, "连接成功");
    });
    // 断开连接
    socketRef.current.on("disconnect", (reason) => {
      console.log("断开连接-disconnect", reason);
    });
    // 错误
    socketRef.current.on("error", (err) => {
      console.log("错误-error", err);
    });
  }, []);

  useEffect(() => {
    if (socketRef.current) {
      socketRef.current.on("move", (data) => {
        if (data.roomId === roomId) {
          const newBoard = [...board];
          newBoard[data.row][data.col] = data.player;
          setBoard(newBoard);
          if (checkWin(data.row, data.col)) {
            setWinner(data.player);
          } else {
            setCurrentPlayer(data.player === "black" ? "white" : "black");
          }
        }
      });
    }
  }, [roomId]);

  const createRoom = () => {
    socketRef.current?.emit("createRoom", (newRoomId: string) => {
      setRoomId(newRoomId);
      setIsHost(true);
      setCurrentPlayer("black");
    });
  };

  const joinRoom = () => {
    socketRef.current?.emit("joinRoom", roomId, () => {
      setCurrentPlayer("black");
      if (isHost) {
        return;
      }
      setIsHost(false);
    });
  };

  const handleClick = (row: number, col: number) => {
    if (
      board[row][col] ||
      winner ||
      (isHost && currentPlayer !== "black") ||
      (!isHost && currentPlayer !== "white")
    )
      return;

    const newBoard = [...board];
    newBoard[row][col] = currentPlayer;
    setBoard(newBoard);
    socketRef.current?.emit("move", {
      row,
      col,
      player: currentPlayer,
      roomId: roomId,
    });

    if (checkWin(row, col)) {
      setWinner(currentPlayer);
    } else {
      setCurrentPlayer(currentPlayer === "black" ? "white" : "black");
    }
  };

  return (
    <div className="game-container">
      <div className="room-controls">
        <input
          type="text"
          value={roomId}
          onChange={(e) => setRoomId(e.target.value)}
          placeholder="输入房间号"
        />
        <button onClick={createRoom}>创建房间</button>
        <button onClick={joinRoom}>加入房间</button>
      </div>
      <div className="status-container">
        <div className="my-piece">
          <span className="status-label">我方棋子：</span>
          <div className={`piece-indicator ${isHost ? "black" : "white"}`} />
        </div>

        <div className={`turn-indicator ${currentPlayer}`}>
          <div className={`pulse-piece ${currentPlayer}`} />
          <span className="status-text">
            {winner
              ? `${winner.toUpperCase()} 胜利!`
              : `${currentPlayer.toUpperCase()} 的回合`}
          </span>
        </div>
      </div>
      <div className="board">
        {board.map((row, i) => (
          <div key={i} className="row">
            {row.map((cell, j) => (
              <button
                key={j}
                className={`cell ${cell}`}
                onClick={() => handleClick(i, j)}
                disabled={!!winner}
              >
                {cell && <div className={`stone ${cell}`} />}
              </button>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
};

export default FiveAi;
