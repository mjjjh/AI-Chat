import express from "express";
import { ChatOpenAI } from "@langchain/openai";
import {
  createAgent,
  summarizationMiddleware,
  piiRedactionMiddleware,
  createMiddleware,
  dynamicSystemPromptMiddleware,
  ToolMessage,
  BaseMessage,
} from "langchain";

import { MemorySaver } from "@langchain/langgraph";

import {
  addTool,
  multiplyTool,
  fetchData,
  getFutureWeather,
  searchTool,
} from "./tools.js";

import { CHAT_API } from "./config.js";

// 1. 初始化存储工具
import { ChatStorage, initThreadIdToUserNameMap, type ChatMessage } from "./storage.js";

const chatStorage = new ChatStorage();

interface IAgentState {
  parentConfig?: any;
  createdAt?: Date;
  values: {
    messages: BaseMessage[];
  };
}

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

interface IThreadIdInfo {
  threadId: string;
  systemMsg: string;
}

// 获取初始化线程ID到用户名的映射
const mapThreadIdToUserName = await initThreadIdToUserNameMap();

// 获取用户的所有线程ID
const getThreadIdList = (userName: string): IThreadIdInfo[] | undefined => {
  return mapThreadIdToUserName.get(userName);
};

// 获取用户的特定线程ID信息
const getThreadId = (userName: string, threadId: string) => {
  return getThreadIdList(userName)?.find((item) => item.threadId === threadId);
};

// 检查用户是否存在线程ID
const hasThreadId = (userName: string, threadId: string) => {
  return getThreadIdList(userName)?.some((item) => item.threadId === threadId);
};

// 添加用户线程ID和系统消息
const addThreadId = (
  userName: string,
  threadId: string,
  systemMsg: string = ""
) => {
  const threadIdList = getThreadIdList(userName);
  if (!threadIdList) {
    mapThreadIdToUserName.set(userName, [
      {
        threadId,
        systemMsg,
      },
    ]);
  } else if (!hasThreadId(userName, threadId)) {
    threadIdList.push({
      threadId,
      systemMsg,
    });
  } else if (systemMsg) {
    getThreadId(userName, threadId)!.systemMsg = systemMsg;
  }
};

// 移除用户线程ID
const removeThreadId = (userName: string, threadId: string) => {
  const threadIdList = getThreadIdList(userName);
  const index = threadIdList?.findIndex(
    (item) => item.threadId === threadId
  ) as number;
  if (index !== -1) {
    threadIdList?.splice(index, 1);
  }
};

const createRetryMiddleware = (maxRetries = 3) => {
  return createMiddleware({
    name: "RetryMiddleware",
    wrapModelCall: (request: any, handler: any) => {
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

const modelName = "deepseek-ai/DeepSeek-V3.1-Terminus";

// 定义模型
const model = new ChatOpenAI({
  apiKey: CHAT_API,
  modelName: modelName,
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

interface IContext {
  userName: string;
  thread_id: string;
}


const chatRouter = express.Router();

// 定义Agent
const Agent = createAgent({
  model: model,
  tools: [addTool, multiplyTool, fetchData, getFutureWeather, searchTool],
  middleware: [
    // summarizationMiddleware({
    //     model: summarizeModel,
    //     maxTokensBeforeSummary: 100, // 关键调整：从4000降至1800
    //     messagesToKeep: 10,
    //     summaryPrefix: "## 会话总结:"
    // }),
    piiRedactionMiddleware({
      rules: {
        phone:
          /^(?:(?:\+|00)86)?1(?:(?:3[\d])|(?:4[5-79])|(?:5[0-35-9])|(?:6[5-7])|(?:7[0-8])|(?:8[\d])|(?:9[1589]))\d{8}$/g,
      },
    }),
    createRetryMiddleware(),
    dynamicSystemPromptMiddleware((state, runtime: { context: IContext }) => {
      const userName = runtime.context?.userName;
      const threadId = runtime.context?.thread_id;
      return (
        getThreadId(userName, threadId)?.systemMsg ||
        `你是一个智能助手. 称呼用户为${userName}.`
      );
    }),
  ],
  checkpointer: checkpointer,
});

// 获取用户的所有线程ID
chatRouter.get("/session", (req, res) => {
  const userName = req.query.userName as string;
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
});
// 设定系统消息
chatRouter.post("/setSystemMsg", async (req, res) => {
  const systemMsg = req.body.systemMsg;
  const userName = req.body.userName;
  const threadId = req.body.thread_id;
  // 添加线程ID和系统消息
  addThreadId(userName, threadId, systemMsg);
  // 保存线程ID和系统消息
  await chatStorage.updateThreadMeta(userName, threadId, { systemMsg });
  // 获取用户的所有线程ID
  const thisUserAlreadyThreadId = getThreadIdList(
    userName
  ) as IThreadIdInfo[];
  res.json({
    message: "系统消息设定成功",
    threadIdList: Array.from(thisUserAlreadyThreadId),
  });
});

chatRouter.post("/chat", async (req, res) => {
  const userMessage = req.body.userMsg;
  const userName = req.body.userName;
  // 历史消息标识
  const thread_id = req.body.thread_id;
  console.log(userMessage, userName, thread_id);

  // 2. 设置 SSE 响应头（关键）
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache", // 禁用缓存，避免流被浏览器缓存中断
    Connection: "keep-alive", // 维持长连接
    "X-Accel-Buffering": "no", // 禁用 Nginx 缓冲（若用 Nginx 反向代理）
  });
  try {
    await chatStorage.saveMessage(userName, thread_id, {
      role: "user",
      content: userMessage,
      metadata: { view: "web" },
    });
    const history = await chatStorage.readAllMessages(userName, thread_id);
    //
    const aiResponse = await Agent.stream(
      {
        messages: history as unknown as BaseMessage[],
      },
      {
        configurable: { thread_id: thread_id },
        streamMode: ["updates", "messages", "custom"],
        context: { userName: userName, thread_id: thread_id },
      }
    );
    let allMessages = "";
    for await (const [streamMode, chunk] of aiResponse) {
      if (streamMode === "messages" && !(chunk[0] instanceof ToolMessage)) {
        // 用 SSE 格式包装（data: 内容\n\n），前端可直接解析
        res.write(
          `data: ${JSON.stringify({
            type: "messages",
            content: chunk[0].content,
          })}\n\n`
        );
        // 强制刷新缓冲区（避免 Chunk 堆积）
      } else if (streamMode === "custom") {
        res.write(
          `data: ${JSON.stringify({ type: "custom", content: chunk })}\n\n`
        );
      } else if (streamMode === "updates") {
        if (chunk["model_request"]) {
          allMessages = chunk["model_request"].messages[0].content;
        }
      }
    }
    // 流结束，推送完成标识
    // 保存ai消息
    await chatStorage.saveMessage(userName, thread_id, {
      role: "assistant",
      content: allMessages,
      metadata: { model: modelName },
    });
    // 用户对应线程ID集合
    addThreadId(userName, thread_id);
    res.write(
      `data: ${JSON.stringify({ type: "complete", content: "" })}\n\n`
    );
    res.end(); // 关闭连接
  } catch (err) {
    // 错误处理
    console.error("发送消息失败:", err);
    res.status(500).json({
      error: err instanceof Error ? err.message : "发送消息时发生错误",
    });
  }
});

// 获取历史消息
chatRouter.get("/history", async (req, res) => {
  const thread_id = req.query.thread_id as string;
  const userName = req.query.userName as string;
  console.log("获取历史消息:", thread_id);
  try {
    //   // 从状态存储中获取历史消息
    //   const history = (await Agent.getState({
    //     configurable: { thread_id: thread_id },
    //   })) as IAgentState;

    // 从存储中获取历史消息
    const history = await chatStorage.readAllMessages(userName, thread_id);
    res.json({
      msg: "历史消息获取成功",
      messages: history,
      threadInfo: getThreadId(userName, thread_id),
    });
  } catch (err) {
    console.error("获取历史消息失败:", err);
    res.status(500).json({
      error: err instanceof Error ? err.message : "获取历史消息时发生错误",
    });
  }
});

// 移除会话
chatRouter.delete("/history", async (req, res) => {
  const thread_id = req.query.thread_id as string;
  const userName = req.query.userName as string;
  console.log("移除会话:", thread_id);
  try {
    //   // 从状态存储中移除会话
    //   await checkpointer.deleteThread(thread_id);
    //   // 从用户线程ID集合中移除
    //   removeThreadId(userName, thread_id);
    await chatStorage.deleteThread(userName, thread_id);
    // 从用户线程ID集合中移除
    removeThreadId(userName, thread_id);
    res.json({
      message: "会话移除成功",
    });
  } catch (err) {
    console.error("移除会话失败:", err);
    res.status(500).json({
      error: err instanceof Error ? err.message : "移除会话时发生错误",
    });
  }
});


// 屏蔽Langchain警告
function suppressLangchainWarnings() {
  const rawWarinigFunction = console.warn;
  console.warn = (...args) => {
    if (
      args[0].includes("field[total_tokens]") ||
      args[0].includes("field[completion_tokens]")
    ) {
      return;
    }
    return rawWarinigFunction(...args);
  };
}
suppressLangchainWarnings();

export default chatRouter;
