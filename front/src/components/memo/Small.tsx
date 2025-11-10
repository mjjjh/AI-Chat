import React from "react";
import { themeContext } from "./ThemContext";
import { useContext } from "react";
import useWindowWidth from "@/composables/useWidth";
export const Small: React.FC = () => {
  const { theme } = useContext(themeContext);
  const width = useWindowWidth();
  return (
    <div>
      <h1>{theme}</h1>
      <h1>{width}</h1>
    </div>
  );
};
