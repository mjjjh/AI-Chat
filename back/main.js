// 服务器端代码（Express）
const express = require("express");
const fs = require('fs');
const path = require('path');
const app = express();

module.exports = app;

// 2. 配置 JSON 请求体解析中间件（关键！必须在路由前配置）
app.use(express.json());

require('./modelChat.js')
require('./functionCall.js');


app.listen(3000, () => {
    console.log("服务器运行在 http://localhost:3000");
});
