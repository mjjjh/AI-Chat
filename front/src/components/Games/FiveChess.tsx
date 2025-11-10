import React, { useState, useEffect, useRef } from "react";
import { io } from "socket.io-client";
import { Socket } from "socket.io-client";
import "./FiveChess.css";
function BtnCell(props: { value: string; onClick: () => void }) {
  return (
    <div className="cell" onClick={props.onClick}>
      <div className="horizontal-line" />
      <div className="vertical-line" />
      <div className={`chess ${props.value}`} />
    </div>
  );
}

function Chess({
  currentPlayer,
  chessTable,
  changeStatus,
  isHost,
}: {
  currentPlayer: string;
  chessTable: string[];
  changeStatus: (nextChessTable: string[]) => void;
  isHost: boolean;
}) {
  const onClick = (index: number) => {
    // 棋盘有棋子
    if (
      chessTable[index] ||
      win(chessTable) ||
      (isHost && currentPlayer !== "black") ||
      (!isHost && currentPlayer !== "white")
    )
      return;
    const nextChessTable = [...chessTable];
    nextChessTable[index] = currentPlayer;
    changeStatus(nextChessTable);
  };

  return chessTable.map((item, index) => (
    <BtnCell key={index} value={item} onClick={() => onClick(index)} />
  ));
}

const FiveChess: React.FC = () => {
  const [History, setHistory] = useState([Array(15 * 15).fill("")]);
  const [step, setStep] = useState(0);
  const [winRole, setWinRole] = useState("");
  const [roomId, setRoomId] = useState("");

  const [isHost, setIsHost] = useState(false);

  const currentPlayer = step % 2 === 0 ? "black" : "white";

  const chessTable = History[step];

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
      alert(err);
    });
  }, []);

  useEffect(() => {
    if (socketRef.current) {
      // 接收其他玩家的移动
      socketRef.current.on("move", (data) => {
        if (data.roomId === roomId) {
          const newChessTable = data.nextChessTable;
          const newStep = data.step;
          setHistory([...History.slice(0, newStep), newChessTable]);
          setStep(newStep);
          if (win(newChessTable)) {
            setWinRole(data.player);
          }
        }
      });
      // 接收悔棋事件
      socketRef.current.on("undo", (data) => {
        if (data.roomId === roomId) {
          // 询问是否同意悔棋
          const agree = window.confirm("是否同意悔棋？");
          if (agree) {
            setHistory((prev) => prev.slice(0, -2));
            setStep((prev) => prev - 2);
            // 发送move
            socketRef.current?.emit("move", {
              roomId: roomId,
              step: step - 2,
              nextChessTable: History[step - 2],
            });
          } else {
            // 拒绝悔棋
            socketRef.current?.emit("diaAgree", {
              player: currentPlayer,
              roomId: roomId,
            });
          }
        }
      });
      // 接收新局事件
      socketRef.current.on("restart", (data) => {
        if (data.roomId === roomId) {
          // 询问是否同意新局
          const agree = window.confirm("是否同意重新开始？");
          if (agree) {
            setHistory([History[0]]);
            setStep(0);
            setWinRole("");
            // 发送move
            socketRef.current?.emit("move", {
              roomId: roomId,
              step: 0,
              nextChessTable: History[0],
            });
          }
        }
      });
    }
    return () => {
      socketRef.current?.off("move");
      socketRef.current?.off("undo");
      socketRef.current?.off("restart");
    };
  }, [roomId, History]);

  const createRoom = () => {
    socketRef.current?.emit("createRoom", (newRoomId: string) => {
      setRoomId(newRoomId);
      setIsHost(true);
    });
  };

  const joinRoom = () => {
    socketRef.current?.emit("joinRoom", roomId, (success: boolean) => {
      if (success) {
        if (isHost) {
          return;
        }
        setIsHost(false);
      } else {
        alert("加入房间失败");
      }
    });
  };

  // 改变状态
  const changeStatus = (nextChessTable: string[]) => {
    console.log(nextChessTable, "棋盘");
    setHistory([...History, nextChessTable]);
    const nextStep = step + 1;
    setStep(nextStep);
    // 发送新的棋盘
    socketRef.current?.emit("move", {
      step: nextStep,
      nextChessTable: nextChessTable,
      history: History,
      player: currentPlayer,
      roomId: roomId,
    });
    if (win(nextChessTable)) {
      getWin(currentPlayer);
    }
  };

  const getWin = (role: string) => {
    setWinRole(role);
  };

  // 悔棋
  const handleUndo = () => {
    if (History.length > 1) {
      // 发送悔棋事件
      socketRef.current?.emit("undo", {
        player: currentPlayer,
        roomId: roomId,
      });
    }
  };

  // 新局
  const handleNewGame = () => {
    socketRef.current?.emit("restart", {
      player: currentPlayer,
      roomId: roomId,
    });
  };

  return (
    <>
      {/* 房间控制 */}
      <div className="controls-container">
        <div className="room-controls">
          <input
            className="room-input"
            type="text"
            value={roomId}
            onChange={(e) => setRoomId(e.target.value)}
            placeholder="输入房间号"
          />
          <button className="control-btn primary" onClick={createRoom}>
            🏠 创建房间
          </button>
          <button className="control-btn primary" onClick={joinRoom}>
            🔗 加入房间
          </button>
        </div>
        <div className="game-controls">
          <button className="control-btn secondary" onClick={handleNewGame}>
            🔄 新局
          </button>
          <button
            className={`control-btn secondary ${step <= 1 ? "disabled" : ""}`}
            onClick={handleUndo}
            disabled={
              step <= 1 ||
              !!winRole ||
              (isHost && currentPlayer !== "black") ||
              (!isHost && currentPlayer !== "white")
            }
          >
            ⮌ 悔棋
          </button>
        </div>
      </div>
      {/* 游戏状态 */}
      <div className="status-container">
        <div className="my-piece">
          <span className="status-text">我方棋子：</span>
          <div className={`piece-indicator ${isHost ? "black" : "white"}`} />
        </div>

        <div className={`turn-indicator ${currentPlayer}`}>
          <div className={`pulse-piece ${currentPlayer}`} />
          <span className="status-text">
            {winRole
              ? `${winRole.toUpperCase()} 胜利!`
              : `${currentPlayer.toUpperCase()} 的回合`}
          </span>
        </div>
      </div>
      <div className="winner-text">{winRole && `获胜方：${winRole}`}</div>

      {/* 棋盘 */}
      <div className="board-container">
        <Chess
          currentPlayer={currentPlayer}
          chessTable={chessTable}
          changeStatus={changeStatus}
          isHost={isHost}
        />
      </div>
    </>
  );
};

/**
 *
 * 0  1   2  3  4  5  6  7  8  9 10 11 12 13 14
 * 15 16 17 18 19 20 21 22 23 24 25 26 27 28 29
 * 30 31 32 33 34 35 36 37 38 39 40 41 42 43 44
 * 45 46 47 48 49 50 51 52 53 54 55 56 57 58 59
 */
// 右边界值
const rightBorder = Array.from(
  { length: 15 },
  (_, index) => (index + 1) * 15 - 1
);
// 左边界值
const leftBorder = Array.from({ length: 15 }, (_, index) => index * 15);

// 右 下 右下 左下
const dir = [1, 15, 16, -14];
function win(chessTable: string[]): string {
  function check(
    direction: number,
    chessTable: string[],
    chess: string,
    prePox: number,
    count: number
  ): boolean {
    if (count === 5) {
      return true;
    }
    // console.log("数量：", count);

    // 右边界值
    if (
      direction === 0 &&
      rightBorder[Math.floor(prePox / 15)] - prePox < 5 - count
    ) {
      return false;
    }
    // 右下边界值
    if (direction === 2 && rightBorder[Math.floor(prePox / 15)] === prePox) {
      return false;
    }
    // 左下边界值
    if (direction === 3 && leftBorder[Math.floor(prePox / 15)] === prePox) {
      return false;
    }
    const nextPox = prePox + dir[direction];
    if (nextPox >= chessTable.length || chessTable[nextPox] !== chess) {
      return false;
    }
    return check(direction, chessTable, chess, nextPox, count + 1);
  }

  // 整个棋盘遍历
  for (let i = 0; i < chessTable.length; i++) {
    if (!chessTable[i]) {
      continue;
    }
    // console.log("从", i, "开始遍历");
    for (let j = 0; j < dir.length; j++) {
      //   console.log(`${j === 0 ? "右" : j === 1 ? "下" : "右下"}方向`);
      if (check(j, chessTable, chessTable[i], i, 1)) {
        return chessTable[i];
      }
    }
  }
  return "";
}

export default FiveChess;
