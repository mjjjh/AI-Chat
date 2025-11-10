const app = require('./main.js');
const { ChatOpenAI } = require("@langchain/openai");
const {
    createAgent,
    summarizationMiddleware,
    piiRedactionMiddleware,
    createMiddleware,
    dynamicSystemPromptMiddleware,
    ToolMessage,
} = require("langchain");

const { MemorySaver } = require("@langchain/langgraph");

const {
    addTool,
    multiplyTool,
    fetchData,
    getFutureWeather,
    searchTool,
} = require('./tools.js');

const { CHAT_API } = require('./config.js');


// 映射线程ID到用户名
/**
 * {
 *      userName ==> {
 *                             threadId,
 *                              systemMsg: "",  
 *                      }[],
 * }
 * 
 */
const mapThreadIdToUserName = new Map();

// 获取用户的所有线程ID
const getThreadIdList = (userName) => {
    return mapThreadIdToUserName.get(userName);
}

// 获取用户的特定线程ID信息
const getThreadId = (userName, threadId) => {
    return getThreadIdList(userName)?.find((item) => item.threadId === threadId);
}

// 检查用户是否存在线程ID
const hasThreadId = (userName, threadId) => {
    return getThreadIdList(userName)?.some((item) => item.threadId === threadId);
}

// 添加用户线程ID和系统消息
const addThreadId = (userName, threadId, systemMsg = "") => {
    const threadIdList = getThreadIdList(userName);
    if (!threadIdList) {
        mapThreadIdToUserName.set(userName, [{
            threadId,
            systemMsg,
        }]);
    } else if (!hasThreadId(userName, threadId)) {
        threadIdList.push({
            threadId,
            systemMsg,
        });
    } else if (systemMsg) {
        getThreadId(userName, threadId).systemMsg = systemMsg;
    }
}

// 移除用户线程ID
const removeThreadId = (userName, threadId) => {
    const threadIdList = getThreadIdList(userName);
    const index = threadIdList?.findIndex((item) => item.threadId === threadId);
    if (index !== -1) {
        threadIdList?.splice(index, 1);
    }
}


const createRetryMiddleware = (maxRetries = 3) => {
    return createMiddleware({
        name: "RetryMiddleware",
        wrapModelCall: (request, handler) => {
            for (let attempt = 0; attempt < maxRetries; attempt++) {
                try {
                    return handler(request);
                } catch (e) {
                    if (attempt === maxRetries - 1) {
                        throw e;
                    }
                    console.log(`Retry ${attempt + 1}/${maxRetries} after error: ${e}`);
                }
            }
            throw new Error("Unreachable");
        },
    });
};

// 定义模型
const model = new ChatOpenAI({
    apiKey: CHAT_API,
    modelName: "deepseek-ai/DeepSeek-V3.1-Terminus",
    temperature: 0.7,
    timeout: 60000,
    configuration: {
        baseURL: "https://api.siliconflow.cn/v1/",
    },
    streaming: true,
    maxTokens: 4096,
    frequencyPenalty: 0.5,
    n: 1,
});

// 定义总结模型
const summarizeModel = new ChatOpenAI({
    apiKey: CHAT_API,
    modelName: "deepseek-ai/DeepSeek-V3",
    temperature: 0.7,
    timeout: 60000,
    configuration: {
        baseURL: "https://api.siliconflow.cn/v1/",
    },
    streaming: false,
    maxTokens: 4096,
});

// 定义检查点
const checkpointer = new MemorySaver();

// 定义Agent
const Agent = createAgent({
    model: model,
    tools: [addTool, multiplyTool, fetchData, getFutureWeather, searchTool],
    middleware: [
        summarizationMiddleware({
            model: summarizeModel,
            maxTokensBeforeSummary: 1800, // 关键调整：从4000降至1800
            messagesToKeep: 10,
        }),
        piiRedactionMiddleware({
            rules: {
                phone:
                    /^(?:(?:\+|00)86)?1(?:(?:3[\d])|(?:4[5-79])|(?:5[0-35-9])|(?:6[5-7])|(?:7[0-8])|(?:8[\d])|(?:9[1589]))\d{8}$/g,
            },
        }),
        createRetryMiddleware(),
        dynamicSystemPromptMiddleware((state, runtime) => {
            const userName = runtime.context?.userName;
            const threadId = runtime.context?.thread_id;
            return getThreadId(userName, threadId)?.systemMsg || `你是一个智能助手. 称呼用户为${userName}.`
        },
        ),
    ],
    checkpointer: checkpointer,
});

app.get('/api/session', (req, res) => {
    const userName = req.query.userName;
    const thisUserAlreadyThreadId = getThreadIdList(userName);
    if (thisUserAlreadyThreadId) {
        res.json({
            message: "会话获取成功",
            threadIdList: Array.from(thisUserAlreadyThreadId),
        });
    } else {
        res.json({
            message: "用户无会话",
            threadIdList: [],
        });
    }
})

// 设定系统消息
app.post('/api/setSystemMsg', (req, res) => {
    const systemMsg = req.body.systemMsg;
    const userName = req.body.userName;
    const threadId = req.body.thread_id;
    // 添加线程ID和系统消息
    addThreadId(userName, threadId, systemMsg);
    // 获取用户的所有线程ID
    const thisUserAlreadyThreadId = getThreadIdList(userName);
    res.json({
        message: "系统消息设定成功",
        threadIdList: Array.from(thisUserAlreadyThreadId),
    });
})



app.post('/api/chat', async (req, res) => {
    const userMessage = req.body.userMsg;
    const userName = req.body.userName;
    // 历史消息标识
    const thread_id = req.body.thread_id;
    // 用户对应线程ID集合
    addThreadId(userName, thread_id);

    console.log(userMessage, userName, thread_id);
    // 2. 设置 SSE 响应头（关键）
    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache', // 禁用缓存，避免流被浏览器缓存中断
        'Connection': 'keep-alive', // 维持长连接
        'X-Accel-Buffering': 'no', // 禁用 Nginx 缓冲（若用 Nginx 反向代理）
    });
    try {
        const aiResponse = await Agent.stream(
            {
                messages: userMessage,
            },
            {
                configurable: { thread_id: thread_id },
                streamMode: ["updates", "messages", "custom"],
                context: { userName: userName, thread_id: thread_id },
            }
        );
        for await (const [streamMode, chunk] of aiResponse) {
            if (streamMode === "messages" && !(chunk[0] instanceof ToolMessage)) {
                // 用 SSE 格式包装（data: 内容\n\n），前端可直接解析
                res.write(`data: ${JSON.stringify({ type: 'messages', content: chunk[0].content })}\n\n`);
                // 强制刷新缓冲区（避免 Chunk 堆积）
            } else if (streamMode === "custom") {
                res.write(`data: ${JSON.stringify({ type: 'custom', content: chunk })}\n\n`);
            }
        }
        // 流结束，推送完成标识
        res.write(`data: ${JSON.stringify({ type: 'complete', content: '' })}\n\n`);
        res.end(); // 关闭连接
    } catch (err) {
        // 错误处理
        console.error("发送消息失败:", err);
        res.status(500).json({ error: err instanceof Error ? err.message : "发送消息时发生错误" });
    }
})


// 获取历史消息
app.get('/api/history', async (req, res) => {
    const thread_id = req.query.thread_id;
    const userName = req.query.userName;
    console.log("获取历史消息:", thread_id);
    try {
        // 从状态存储中获取历史消息
        const history = await Agent.getState({
            configurable: { thread_id: thread_id },
        })

        res.json({
            message: "历史消息获取成功",
            parentConfig: history.parentConfig,
            createdAt: history.createdAt,
            messages: history.values.messages,
            threadInfo: getThreadId(userName, thread_id),
        });
    } catch (err) {
        console.error("获取历史消息失败:", err);
        res.status(500).json({ error: err instanceof Error ? err.message : "获取历史消息时发生错误" });
    }
})

// 移除会话
app.delete('/api/history', async (req, res) => {
    const thread_id = req.query.thread_id;
    const userName = req.query.userName;
    console.log("移除会话:", thread_id);
    try {
        // 从状态存储中移除会话
        await checkpointer.deleteThread(thread_id);
        // 从用户线程ID集合中移除
        removeThreadId(userName, thread_id);
        res.json({
            message: "会话移除成功",
        });
    } catch (err) {
        console.error("移除会话失败:", err);
        res.status(500).json({ error: err instanceof Error ? err.message : "移除会话时发生错误" });
    }
})



// 屏蔽Langchain警告
function suppressLangchainWarnings() {
    const rawWarinigFunction = console.warn;
    console.warn = (...args) => {
        if (
            args[0].includes('field[total_tokens]') ||
            args[0].includes('field[completion_tokens]')
        ) {
            return;
        }
        return rawWarinigFunction(...args);
    };
}
suppressLangchainWarnings() 
