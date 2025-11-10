import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import postCssPxtorem from "postcss-pxtorem";

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react({
      tsDecorators: true,
    }),
  ],
  base: "./",
  resolve: {
    alias: {
      "@": "/src",
    },
  },
  css: {
    postcss: {
      plugins: [
        postCssPxtorem({
          rootValue: 37.5,
          propList: ["*", "!font-size", "!text-shadow"],
          replace: true, // 直接替换 px 值
          mediaQuery: false, // 是否转换媒体查询中的 px
          minPixelValue: 1, // 最小转换像素
        }),
      ],
    },
  },
  server: {
    proxy: {
      "/api": {
        target: "http://81.68.241.10:3000",
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/api/, ""),
      },
    },
  },
});
