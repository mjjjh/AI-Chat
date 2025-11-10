import React, { useState } from "react";
function BtnCell(props: { value: string; onClick: () => void }) {
  return <button onClick={props.onClick}>{props.value}</button>;
}

function Chess({
  currentPlayer,
  chessTable,
  changeStatus,
}: {
  currentPlayer: string;
  chessTable: string[];
  changeStatus: (nextChessTable: string[]) => void;
}) {
  const onClick = (index: number) => {
    if (chessTable[index] || win(chessTable)) return;
    const nextChessTable = [...chessTable];
    nextChessTable[index] = currentPlayer;
    changeStatus(nextChessTable);
  };

  return chessTable.map((item, index) => (
    <BtnCell key={index} value={item} onClick={() => onClick(index)} />
  ));
}

const WellChess: React.FC = () => {
  const [History, setHistory] = useState([Array(9).fill("")]);
  const [step, setStep] = useState(0);
  const currentPlayer = step % 2 === 0 ? "X" : "O";
  const chessTable = History[step];

  const changeStatus = (nextChessTable: string[]) => {
    setHistory([...History.slice(0, step + 1), nextChessTable]);
    setStep(step + 1);
  };
  const back = (step: number) => {
    setStep(step);
  };

  const history = Array.from({ length: step }, (_, index) => (
    <div key={index} onClick={() => back(index)}>
      step: {index}
    </div>
  ));

  return (
    <>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)" }}>
        <Chess
          currentPlayer={currentPlayer}
          chessTable={chessTable}
          changeStatus={changeStatus}
        />
      </div>
      {history}
    </>
  );
};

function win(chessTable: string[]): string {
  const winConditions = [
    [0, 1, 2],
    [3, 4, 5],
    [6, 7, 8],
    [0, 3, 6],
    [1, 4, 7],
    [2, 5, 8],
    [0, 4, 8],
    [2, 4, 6],
  ];
  for (const condition of winConditions) {
    const [a, b, c] = condition;
    if (
      chessTable[a] &&
      chessTable[a] === chessTable[b] &&
      chessTable[a] === chessTable[c]
    ) {
      return chessTable[a];
    }
  }
  return "";
}

export default WellChess;
