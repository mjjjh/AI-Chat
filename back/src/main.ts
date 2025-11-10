// 服务器端代码（Express）
import express from "express";
import chatRoutes from "./modelChat.js";
const app: express.Express = express();

// 2. 配置 JSON 请求体解析中间件（关键！必须在路由前配置）
app.use(express.json());


// 根目录/api
app.use("/api", chatRoutes);


app.listen(3000, () => {
  console.log("服务器运行在 http://localhost:3000");
});
