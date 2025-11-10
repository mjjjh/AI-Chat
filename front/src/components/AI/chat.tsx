import { useState, useRef, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
// import { RunnableSequence } from "@langchain/core/runnables";
import { ConfigProvider, Tabs, Modal, Input, Form, Button } from "antd";
import { SettingOutlined } from "@ant-design/icons";
import { v4 as uuidv4 } from "uuid";

import styles from "./style.module.css";

interface Message {
  role: "user" | "assistant";
  content: string;
}
type TargetKey = React.MouseEvent | React.KeyboardEvent | string;

interface MessageItem {
  content: string;
  id: string;
  metadata: any;
  role: "user" | "assistant";
  timestamp: string;
}

const DeepSeek: React.FC = () => {
  // 状态管理：分离用户输入和对话历史
  const [history, setHistory] = useState<Message[]>([]);
  const [userMsg, setUserMsg] = useState<string>("");
  const [isLoading, setIsLoading] = useState<boolean>(false); // 新增加载状态
  const [error, setError] = useState<string | null>(null); // 新增错误状态
  const [userName, setUserName] = useState<string>("");
  const [threadList, setThreadList] = useState<
    {
      thread_id: string;
      userName: string;
      systemMsg: string;
      closable?: boolean;
    }[]
  >([]);

  const [thread_id, setThreadId] = useState<string>("");
  // 调用工具提示
  const [toolTips, setToolTips] = useState<string>("");

  const abortControllerRef = useRef<AbortController | null>(null); // 用于中断请求

  //   删除功能
  const [deleteTargetKey, setDeleteTargetKey] = useState<TargetKey>("");
  const [isModalOpen, setIsModalOpen] = useState(false);

  //   设定功能
  const [showSet, setShowSet] = useState(false);
  const [systemMsg, setSystemMsg] = useState("");

  // 登录功能
  const [notLogin, setNotLogin] = useState(true);

  // 获取用户的会话
  useEffect(() => {
    const getSessions = async () => {
      const res = await fetch(`/api/session?userName=${userName}`);
      const data = await res.json();
      let threadIdList = [];
      if (data.threadIdList.length === 0) {
        // 默认一个会话
        threadIdList = [
          {
            thread_id: uuidv4(),
            userName,
            closable: false,
          },
        ];
      } else {
        threadIdList = data.threadIdList.map(
          (item: { threadId: string; systemMsg: string }, index: number) => ({
            thread_id: item.threadId,
            userName,
            systemMsg: item.systemMsg,
            closable: index !== 0,
          })
        );
      }
      setThreadList(threadIdList);
      setThreadId(threadIdList[0].thread_id);
    };
    if (!userName) return;
    getSessions();
  }, [userName]);

  useEffect(() => {
    const getThreadHistory = async () => {
      const searchParams = new URLSearchParams({
        thread_id: thread_id,
        userName,
      });
      try {
        // 请求获取历史记录
        const res = await fetch(`/api/history?${searchParams}`, {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
          },
        });
        const data = (await res.json()) as {
          messages: MessageItem[];
          threadInfo: {
            systemMsg: string;
          };
        };

        const { messages, threadInfo } = data;
        setSystemMsg(threadInfo?.systemMsg || "");
        setHistory(() => {
          if (!messages) return [];
          const history: Message[] = [];
          //   如果有toolMessage，则需要合并前后的aimessage
          for (const item of messages) {
            // 前一个和当前的item类型相同就合并
            const nowRole = item.role;
            if (
              history.length > 0 &&
              history[history.length - 1].role === nowRole
            ) {
              history[history.length - 1].content += item.content;
            } else {
              history.push({
                role: nowRole,
                content: item.content,
              });
            }
          }
          return history;
        });
      } catch (err) {
        setError(`错误：${(err as Error).message}`); // 设置错误状态
      }
    };
    if (!thread_id || !userName) return;
    getThreadHistory();
  }, [thread_id]);

  const chatContainerRef = useRef<HTMLDivElement>(null); // 对话容器 DOM 引用
  // 关键：自动滚动开关（默认开启）
  const [isAutoScrollEnabled, setIsAutoScrollEnabled] = useState(true);
  // 滚动阈值：距离底部 < 100px 视为「底部附近」（可调整）
  const SCROLL_THRESHOLD = 100;

  // 1. 监听滚动事件：判断用户是否手动偏离底部
  useEffect(() => {
    const chatContainer = chatContainerRef.current;
    if (!chatContainer) return;

    // 滚动事件处理函数
    const handleScroll = () => {
      // 容器内容总高度 - 当前滚动距离 - 容器可视高度 = 距离底部的距离
      const distanceToBottom =
        chatContainer.scrollHeight -
        chatContainer.scrollTop -
        chatContainer.clientHeight;

      // 距离底部 > 阈值：用户手动滚动远离底部 → 关闭自动滚动
      if (distanceToBottom > SCROLL_THRESHOLD) {
        setIsAutoScrollEnabled(false);
      } else {
        // 距离底部 ≤ 阈值：用户回到底部附近 → 开启自动滚动
        setIsAutoScrollEnabled(true);
      }
    };

    // 绑定滚动事件
    chatContainer.addEventListener("scroll", handleScroll);
    // 清理事件监听
    return () => chatContainer.removeEventListener("scroll", handleScroll);
  }, [chatContainerRef.current]); // 仅组件挂载时绑定一次

  // 2. 监听 messages 变化：仅当自动滚动开启时，才滚动到底部
  useEffect(() => {
    const chatContainer = chatContainerRef.current;
    if (chatContainer && isAutoScrollEnabled) {
      // 滚动到底部（用 requestAnimationFrame 优化流畅度）
      requestAnimationFrame(() => {
        chatContainer.scrollTop = chatContainer.scrollHeight;
      });
    }
  }, [history, isAutoScrollEnabled]); // 依赖 history 和自动滚动开关

  // 中断请求（组件卸载或重新请求时调用）
  const abortRequest = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort(); // 中断 Fetch 请求
      abortControllerRef.current = null;
    }
  };
  // 发送请求并建立 SSE 连接
  const sendMsg = async () => {
    // 边界条件检查
    if (!userMsg.trim() || isLoading) return;

    // 添加用户消息到历史记录
    setHistory([...(history || []), { role: "user", content: userMsg }]);
    // 清空用户输入
    setUserMsg("");

    // 重置状态
    setIsLoading(true);
    setError(null); // 重置错误状态
    abortRequest(); // 中断之前的请求

    try {
      const abortController = new AbortController();
      abortControllerRef.current = abortController;

      // 1. 发送 POST 请求（支持传递复杂 Body 数据）
      const res = await fetch(`/api/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "text/event-stream", // 告知服务端需要事件流
        },
        body: JSON.stringify({
          userName,
          thread_id,
          userMsg,
        }),
        signal: abortController.signal, // 用于中断请求
      });

      // 2. 校验响应状态
      if (!res.ok) throw new Error(`请求失败：${res.statusText}`);
      if (!res.body) throw new Error("后端未返回流式响应");

      // 3. 解析 ReadableStream（核心：逐块读取流数据）
      const reader = res.body.getReader();
      const decoder = new TextDecoder(); // 解码二进制数据为字符串
      let buffer = ""; // 缓存不完整的 Chunk（避免 JSON 被拆分）
      let msg = "";
      // 循环读取流
      while (true) {
        const { done, value } = await reader.read();

        if (done) break; // 流结束，退出循环

        // 4. 解码并处理每条数据
        buffer += decoder.decode(value, { stream: true }); // 流式解码，保留不完整数据
        const chunks = buffer.split("\n\n"); // 按 SSE 格式分割（每块以 \n\n 结束）
        buffer = chunks.pop() || ""; // 保留最后不完整的 Chunk，下次合并处理

        // 5. 处理每个完整的 Chunk
        for (const chunk of chunks) {
          //   console.log(chunk, "chunk");

          if (!chunk.startsWith("data: ")) continue; // 过滤非 SSE 格式数据
          const dataStr = chunk.slice(6); // 去掉前缀 "data: "
          if (dataStr === "[DONE]") continue; // 忽略结束标记

          // 解析 JSON 数据
          const data = JSON.parse(dataStr);
          switch (data.type) {
            case "messages":
              msg += data.content;
              setHistory((prev) => {
                // 如果历史最后一条已经是 AI 消息（流式中），直接更新 content
                if (prev.length > 0 && prev.at(-1)?.role === "assistant") {
                  return [
                    ...prev.slice(0, -1),
                    { role: "assistant", content: msg },
                  ];
                }
                // 若还没有 AI 消息（首次接收 chunk），直接添加新的 AIMessage
                return [...prev, { role: "assistant", content: msg }];
              });
              break;
            case "custom":
              setToolTips(data.content);
              break;
            case "complete":
              setToolTips("");
              break;
            case "error":
              throw new Error(data.content);
          }
        }
      }
    } catch (err) {
      // 忽略手动中断的错误
      if ((err as Error).name !== "AbortError") {
        setError(`错误：${(err as Error).message}`); // 设置错误状态
      } else {
        setError(null); // 取消请求时，清除错误状态
      }
    } finally {
      setIsLoading(false); // 无论成功或失败，都结束加载状态
    }
  };

  // 处理回车键发送消息
  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMsg();
    }
  };

  const saveSystemMsg = async () => {
    // 保存系统设定
    try {
      await fetch(`/api/setSystemMsg`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          userName,
          thread_id,
          systemMsg,
        }),
      });
    } catch (err) {
      setError(`错误：${(err as Error).message}`); // 设置错误状态
    }
  };

  const showSetModel = () => {
    setShowSet(true);
  };

  const closeSetModel = () => {
    setShowSet(false);
  };

  const setConfirm = async () => {
    if (systemMsg.trim()) {
      // 保存系统设定
      await saveSystemMsg();
    }
    closeSetModel();
  };

  const setSystem = () => {
    showSetModel();
  };

  // 渲染对话历史：区分用户和AI消息
  const renderHistory = history?.map((item, index) => (
    <div
      key={index}
      className={`${styles["chat-message"]} ${
        item.role === "user" ? styles["user-message"] : styles["ai-message"]
      }`}
    >
      <strong
        className={
          item.role === "user" ? styles["user-name"] : styles["ai-name"]
        }
      >
        {item.role === "user" ? "你" : "AI"}
      </strong>
      <ReactMarkdown remarkPlugins={[remarkGfm]}>
        {item.content.toString().trim()}
      </ReactMarkdown>
    </div>
  ));

  const getTabItem = () => (
    <div className={styles["chat-container"]}>
      <div className={styles["left"]}></div>
      {/* 错误提示 */}
      {error && <div className={styles["error-message"]}>{error}</div>}

      {/* 对话历史 */}
      <div className={styles["chat-history"]} ref={chatContainerRef}>
        {renderHistory}
        {!renderHistory.length && (
          <div className={styles["no-message"]}>
            {`您好！${userName}`.split("").map((char, index) => (
              <span key={index} style={{ animationDelay: `${index * 0.1}s` }}>
                {char}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* 加载状态 */}
      {isLoading && <div className={styles["loading"]}>AI正在思考...</div>}

      {/* 输入区域 */}
      <div className={styles["input-area"]}>
        {/* 工具提示 */}
        {toolTips && <div className={styles["tool-tips"]}>{toolTips}</div>}
        <Input
          type="text"
          value={userMsg}
          onChange={(e) => setUserMsg(e.target.value)}
          onKeyDown={handleKeyPress}
          placeholder="输入消息..."
          disabled={isLoading}
          suffix={
            <SettingOutlined
              onClick={setSystem}
              className={styles["setting-icon"]}
            />
          }
        />

        <button
          className={styles["send-btn"]}
          onClick={sendMsg}
          disabled={isLoading || !userMsg.trim()}
        >
          发送
        </button>
      </div>
      <Modal
        title="设定"
        open={showSet}
        onOk={setConfirm}
        onCancel={closeSetModel}
      >
        <Input.TextArea
          rows={4}
          value={systemMsg}
          onChange={(e) => setSystemMsg(e.target.value)}
          placeholder="请输入系统设定"
        />
      </Modal>
    </div>
  );

  const setActiveKey = async (threadId: string) => {
    setThreadId(threadId);
  };

  const addSession = () => {
    setThreadList((prev) => {
      prev[0].closable = true;
      return [
        ...prev,
        {
          thread_id: uuidv4(),
          userName: userName,
          systemMsg: "",
        },
      ];
    });
  };

  const removeSession = async (targetKey: TargetKey) => {
    // 移除当前会话后，设置新的 activeKey 为第一个会话
    if (targetKey === thread_id) {
      setActiveKey(threadList[0]?.thread_id);
    }

    setThreadList((prev) => {
      const result = prev.filter((item) => item.thread_id !== targetKey);
      if (result.length === 1) result[0].closable = false;
      return result;
    });
    // 删除请求
    try {
      await fetch(`/api/history?thread_id=${targetKey}&userName=${userName}`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
      });
    } catch (err) {
      setError(`错误：${(err as Error).message}`); // 设置错误状态
    }
  };

  const showModal = () => {
    setIsModalOpen(true);
  };

  const handleOk = () => {
    removeSession(deleteTargetKey);
    setIsModalOpen(false);
  };

  const handleCancel = () => {
    setIsModalOpen(false);
  };

  //   会话操作
  const onEdit = (targetKey: TargetKey, action: "add" | "remove") => {
    if (action === "add") {
      addSession();
    } else {
      setDeleteTargetKey(targetKey);
      showModal();
    }
  };

  return (
    <ConfigProvider
      theme={{
        components: {
          Tabs: {
            cardPadding: "3px",
          },
        },
      }}
    >
      {!userName && (
        <Modal
          key="loginModal"
          open={notLogin}
          cancelButtonProps={undefined}
          footer={null}
          closable={false}
          title="登录"
        >
          <Form
            name="basic"
            labelCol={{ span: 8 }}
            wrapperCol={{ span: 16 }}
            style={{
              maxWidth: 600,
            }}
            onFinish={(values) => {
              setUserName(values.username);
              setNotLogin(false);
            }}
            initialValues={{ remember: true }}
            autoComplete="off"
          >
            <Form.Item<{ username: string }>
              label="用户名"
              name="username"
              rules={[
                { required: true, message: "请输入用户名" },
                {
                  max: 4,
                  message: "最多4个字符",
                },
              ]}
            >
              <Input />
            </Form.Item>
            <Form.Item label={null}>
              <Button type="primary" htmlType="submit">
                确认
              </Button>
            </Form.Item>
          </Form>
        </Modal>
      )}
      <Tabs
        className={styles["tabs"]}
        defaultActiveKey={thread_id}
        tabPosition="left"
        style={{ padding: "10px" }}
        type="editable-card"
        items={threadList.map((item, index) => ({
          label: `会话${index + 1}`,
          key: item.thread_id,
          children: getTabItem(),
          closable: item.closable,
        }))}
        onChange={setActiveKey}
        onEdit={onEdit}
      />
      <Modal
        title="Basic Modal"
        closable={{ "aria-label": "Custom Close Button" }}
        open={isModalOpen}
        onOk={handleOk}
        onCancel={handleCancel}
      >
        <p>确定删除当前会话吗？</p>
      </Modal>
    </ConfigProvider>
  );
};

export default DeepSeek;
