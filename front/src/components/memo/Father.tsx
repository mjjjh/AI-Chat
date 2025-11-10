import React, { useMemo, useState } from "react";
import { Children } from "./Cildren";
import { themeContext } from "./ThemContext";

export const Father: React.FC = () => {
  const [i, setI] = useState(0);
  useMemo(() => {
    console.log("memo");
    setI(i + 1);
  }, []);
  return (
    <div>
      <themeContext.Provider value={{ theme: "dark" }}>
        <Children />
      </themeContext.Provider>
    </div>
  );
};
