import { useDebugValue, useState, useEffect } from "react";

// 自定义 Hooks：获取窗口宽度
function useWindowWidth() {
  const [width, setWidth] = useState(window.innerWidth);

  useEffect(() => {
    const handleResize = () => setWidth(window.innerWidth);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // 给自定义 Hooks 添加调试标签（DevTools 中显示 "Window Width: [当前宽度]"）
  useDebugValue(`Window Width: ${width}`);

  return width;
}

export default useWindowWidth;
