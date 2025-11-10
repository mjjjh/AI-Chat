import { createContext } from "react";

export const themeContext = createContext<{ theme: string }>({
  theme: "light",
});
