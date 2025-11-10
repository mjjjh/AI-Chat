// 工具函数
const z = require("zod");
const { tool } = require("@langchain/core/tools");
const { SEARCH_API } = require('./config.js');
const addTool = tool(
    // 显式指定泛型类型
    async ({ a, b }, config) => {
        config.writer?.("正在执行add工具...");
        // 明确参数类型
        return a + b;
    },
    {
        name: "add",
        schema: z.object({
            a: z.number(),
            b: z.number(),
        }),
        description: "两个数相加",
    }
);
const multiplyTool = tool(
    async ({ a, b }, config) => {
        config.writer?.("正在执行multiply工具...");
        return a * b;
    },
    {
        name: "multiply",
        schema: z.object({
            a: z.number(),
            b: z.number(),
        }),
        description: "两个数相乘",
    }
);

// 获取csdn文章内容
const fetchData = tool(
    async (_, config) => {
        config.writer?.("正在从CSDN论坛获取最新文章的相关数据内容...");
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
                    链接: item.url,
                    // 用户名: item.username,
                    // 昵称: item.nickname,
                    博客链接: item.blogUrl,
                    来源: "CSDN",
                };
            }
        );
        config.writer?.("CSDN论坛最新文章数据获取成功");
        return JSON.stringify(allInfos);
    },
    {
        name: "fetchData",
        description: "从CSDN论坛获取最新文章的相关数据内容",
    }
);


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

// 获取天气情况
const getFutureWeather = tool(
    async ({ city }, config) => {
        config.writer?.(`正在获取${city}的天气状况...`);
        const subUrl = await getSubUrl(city);
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
            config.writer?.(`${city}的天气状况获取成功`);
            return JSON.stringify({
                msg: "天气信息获取成功",
                data: data.data.slice(0, 7),
            });
        } else {
            config.writer?.(`${city}的天气状况获取失败`);
            return JSON.stringify({
                msg: "未匹配到天气信息内容",
            });
        }
    },
    {
        name: "getFutureWeather",
        schema: z.object({
            city: z.string().describe("城市中文名称"),
        }),
        description: "获取指定城市的天气状况",
    }
);

// 搜索引擎
const searchTool = tool(
    async ({ keyword }, config) => {
        config.writer?.(`正在搜索${keyword}...`);
        try {
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
                        edition: "standard",
                        search_source: "baidu_search_v2",
                        search_recency_filter: "week",
                    }),
                }
            );
            const data = await res.json();
            config.writer?.(`${keyword}的搜索结果获取成功`);
            return JSON.stringify(data);
        } catch (e) {
            config.writer?.(`${keyword}的搜索结果获取失败: ${e}`);
            return JSON.stringify({
                msg: "搜索结果获取失败",
            });
        }
    },
    {
        name: "searchTool",
        schema: z.object({
            keyword: z.string().describe("搜索关键词"),
        }),
        description: `当需要调用搜索功能时使用。搜索结果需要在文中标注来源。
      通用搜索引擎工具，用于获取互联网实时信息、最新数据、新闻资讯、行业动态等，核心能力：
      - 支持模糊查询和场景化需求（如「今天金价」「最新新闻」「实时天气」「近期政策」）；
      - 能解析时间限定词（今天/昨天/最近一周/2025年11月）、领域限定词（国内/国际/A股/科技）；
      - 适用于以下场景：
        1. 查询实时数据（金价、油价、汇率、股票行情）；
        2. 获取最新新闻（热点事件、行业资讯、政策公告）；
        3. 查找时效性强的信息（天气、交通、赛事结果）；
        4. 其他需要联网获取的动态信息；
      调用条件：当用户问题涉及「实时性」「最新动态」「需要联网确认」的内容时。
    `,
    }
);

module.exports = {
    addTool,
    multiplyTool,
    fetchData,
    getFutureWeather,
    searchTool,
}
