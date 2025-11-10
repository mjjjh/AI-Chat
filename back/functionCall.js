const app = require('./src/main.js');
const { SEARCH_API } =require('./src/config.js')
const getSubUrl = async (CityName) => {
    const res = await fetch("https://www.tianqi.com/chinacity.html");
    const html = await res.text();

    const reg = new RegExp(`<a\\s+href="(/[^"]+)"\\s*(title="[^"]+")?>${CityName}</a>`, "i");
    const match = reg.exec(html);

    if (match) {
        return match[1];
    }
    return null;
}

app.get('/getWeather', (req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    const CityName = req.query.CityName;

    const run = async () => {
        const subUrl = await getSubUrl(CityName);
        const baseUrl = "https://www.tianqi.com";
        let url = '';
        if (subUrl) {
            url = baseUrl + subUrl + '7/';
        } else {
            return null;
        }
        console.log(url);
        // 2. 发送请求获取天气信息页面 HTML
        const res2 = await fetch(url);
        const html = await res2.text();

        const reg = /var prov = '([^']+)';/i;
        const match2 = html.match(reg);

        if (match2) {
            console.log(match2[1]);
            const prov = match2[1];
            const moreWeather = await fetch(`https://www.tianqi.com/tianqi/tianqidata/${prov}`, {
                "headers": {
                    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36'
                }
            });
            const data = await moreWeather.json();
            return ({
                msg: "天气信息获取成功",
                data: data.data.slice(0, 7),
            });
        } else {
            return ({
                msg: "未匹配到天气信息内容",
            });
        }
    }

    run().then((data) => {
        res.json(data);
    })
})




// app.get('/getWeather/today', (req, res) => {
//   res.setHeader("Access-Control-Allow-Origin", "*");
//   const CityName = req.query.CityName;

//   const run = async () => {
//     const subUrl = await getSubUrl(CityName);
//     const baseUrl = "https://www.tianqi.com";
//     let url = '';
//     if (subUrl) {
//       url = baseUrl + subUrl;
//     } else {
//       return null;
//     }
//     console.log(url);
//     // 2. 发送请求获取天气信息页面 HTML
//     const res2 = await fetch(url);
//     const html = await res2.text();

//     const reg = /<div class="wrap1100"[^>]*>[\s\S]*?<\/div>/i;
//     const match2 = html.match(reg);

//     if (match2) {
//       // match[0] 是包含 weather_info 的完整 dl 标签（含内容）
//       const weatherInfoHtml = match2[0];
//       // 进一步提取纯文本（去除所有标签）
//       const weatherText = weatherInfoHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
//       return ({
//         msg: "天气信息获取成功",
//         data: weatherText,
//       });
//     } else {
//       return ({
//         msg: "未匹配到天气信息内容",
//       });
//     }
//   }

// run().then((data) => {
//   res.json(data);
// })

// })

app.get('/getCSDN', (req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");

    const getCSDN = async () => {
        // 从CSND论坛的url中提取最新新闻的相关信息
        const response = await fetch(
            "https://cms-api.csdn.net/v1/web_home/select_content?componentIds=www-info-list-new&channel=0"
        );
        const data = await response.json();

        const allInfos = data.data["www-info-list-new"].info.list?.map(
            (item) => {
                return {
                    标题: item.title,
                    摘要: item.summary,
                    // 封面: item.cover,
                    编辑时间: item.editTime,
                    // 阅读量: item.viewCount,
                    // 评论数: item.commentCount,
                    // 点赞数: item.diggCount,
                    // 收藏数: item.favoriteCount,
                    // 发布时间: item.publish,
                    // 链接: item.url,
                    // 用户名: item.username,
                    // 昵称: item.nickname,
                    博客链接: item.blogUrl,
                    来源: "CSDN",
                };
            }
        );
        return allInfos;
    }
    getCSDN().then((data) => {
        res.json({
            msg: "CSDN最新文章获取成功",
            data,
        });
    })
})


app.post('/search', (req, res) => {
    const keyword = req.body.keyword;
    const run = async () => {
        const res = await fetch(
            `https://qianfan.baidubce.com/v2/ai_search/web_search`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${SEARCH_API}`,
                },
                body: JSON.stringify({
                    messages: [
                        {
                            role: "user",
                            content: keyword,
                        },
                    ],
                    resource_type_filter: [
                        {
                            type: "web",
                            top_k: 5,
                        },
                    ],
                    edition: "standard",
                    search_source: "baidu_search_v2",
                    search_recency_filter: "week",
                }),
            }
        );
        const data = await res.json();
        return data;
    }
    run().then((data) => {
        res.json({
            msg: "搜索结果获取成功",
            data,
        });
    })
})


app.get("/stream", (req, res) => {
    // 设置SSE响应头
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("Access-Control-Allow-Origin", "*");

    // 初始消息
    res.write("data: 连接已建立，将发送5条消息后自动关闭\n\n");

    // 定时发送消息
    let count = 0;
    const intervalId = setInterval(() => {
        count++;
        res.write(`data: 第 ${count} 条消息\n\n`);

        // 条件1：发送5条后主动关闭（业务逻辑触发）
        if (count >= 5) {
            res.write("data: 消息发送完毕，服务端主动关闭连接\n\n");
            clearInterval(intervalId); // 清理定时器
            res.end(); // 结束响应流（关键）
            console.log("服务端已主动关闭连接");
        }
    }, 1000);

    // 条件2：客户端断开连接时清理（如用户关闭页面）
    req.on("close", () => {
        clearInterval(intervalId); // 停止发送
        console.log("客户端已断开，服务端清理资源");
        // 可选：此时无需调用 res.end()，因为连接已被客户端关闭
    });
});
