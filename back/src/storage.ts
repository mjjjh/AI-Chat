import fs from "fs/promises";
import path from "path";
import { v4 as uuidv4 } from "uuid"; // 生成唯一消息ID（需安装：npm install uuid）
import { fileURLToPath } from "url"; // ESM 内置模块，无需安装
import { formatDate } from "./utils/tools.js";

// 1. 计算当前文件路径（等效于 __filename）
const __filename = fileURLToPath(import.meta.url);

// 2. 计算当前文件目录（等效于 __dirname）
const __dirname = path.dirname(__filename);

// 配置项（可根据需求调整）
const CONFIG = {
  STORAGE_ROOT: path.resolve(__dirname, "../chat-storage"), // 存储根目录
  MAX_MESSAGES_PER_FILE: 100, // 每个文件最多消息数
  MAX_FILE_SIZE_MB: 5, // 每个文件最大体积（MB）
  MAX_FILE_SIZE_BYTES: 5 * 1024 * 1024, // 转换为字节
};

// 消息结构定义
export interface ChatMessage {
  id?: string; // 消息唯一ID
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: string;
  metadata?: Record<string, any>; // 附加信息（可选）
}

// Thread 元信息结构
interface ThreadMeta {
  threadId: string;
  userId: string;
  currentFileIndex: number; // 当前最新文件序号（如 1、2、3）
  totalMessages: number; // 该 thread 总消息数
  lastUpdated: string; // 最后更新时间
  systemMsg: string; // 系统消息
}

/**
 * 对话存储工具类：支持按用户/threadId 分文件夹、自动切分大文件
 */
export class ChatStorage {
  private rootDir: string;

  constructor() {
    this.rootDir = CONFIG.STORAGE_ROOT;
    this.initRootDir(); // 初始化根目录
  }

  // 初始化根目录（不存在则创建）
  private async initRootDir() {
    try {
      await fs.access(this.rootDir);
    } catch {
      await fs.mkdir(this.rootDir, { recursive: true });
      console.log(`创建存储根目录：${this.rootDir}`);
    }
  }

  // 获取用户目录路径
  private getUserDir(userId: string): string {
    return path.join(this.rootDir, userId);
  }

  // 获取 Thread 目录路径
  private getThreadDir(userId: string, threadId: string): string {
    return path.join(this.getUserDir(userId), threadId);
  }

  // 获取 Thread 元信息文件路径
  private getThreadMetaPath(userId: string, threadId: string): string {
    return path.join(this.getThreadDir(userId, threadId), "meta.json");
  }

  // 获取当前对话文件路径（根据元信息的 currentFileIndex）
  private getCurrentChatFilePath(
    userId: string,
    threadId: string,
    fileIndex: number
  ): string {
    return path.join(
      this.getThreadDir(userId, threadId),
      `chatLog-${fileIndex}.json`
    );
  }

  // 初始化 Thread（创建用户/thread 目录 + 元信息文件）
  private async initThread(
    userId: string,
    threadId: string
  ): Promise<ThreadMeta> {
    const threadDir = this.getThreadDir(userId, threadId);
    const metaPath = this.getThreadMetaPath(userId, threadId);

    // 创建用户和 thread 目录
    await fs.mkdir(threadDir, { recursive: true });

    // 初始化元信息（如果元信息文件不存在）
    try {
      await fs.access(metaPath);
      const metaContent = await fs.readFile(metaPath, "utf-8");
      return JSON.parse(metaContent) as ThreadMeta;
    } catch {
      const initialMeta: ThreadMeta = {
        threadId,
        userId,
        currentFileIndex: 1, // 从第1个文件开始
        totalMessages: 0,
        lastUpdated: formatDate(new Date()),
        systemMsg: "", // 系统消息
      };
      await fs.writeFile(
        metaPath,
        JSON.stringify(initialMeta, null, 2),
        "utf-8"
      );
      return initialMeta;
    }
  }

  // 更新 Thread 元信息
  public async updateThreadMeta(
    userId: string,
    threadId: string,
    meta: Partial<ThreadMeta>
  ) {
    const metaPath = this.getThreadMetaPath(userId, threadId);
    const currentMeta = await this.getThreadMeta(userId, threadId);
    const updatedMeta = {
      ...currentMeta,
      ...meta,
      lastUpdated: formatDate(new Date()),
    };
    await fs.writeFile(metaPath, JSON.stringify(updatedMeta, null, 2), "utf-8");
    return updatedMeta;
  }

  // 获取 Thread 元信息
  public async getThreadMeta(
    userId: string,
    threadId: string
  ): Promise<ThreadMeta | null> {
    const metaPath = this.getThreadMetaPath(userId, threadId);
    try {
      const metaContent = await fs.readFile(metaPath, "utf-8");
      return JSON.parse(metaContent) as ThreadMeta;
    } catch {
      console.log(`${userId}-${threadId}元信息不存在`);
      return null;

    }
  }

  // 检查当前文件是否需要切分（达到消息数或体积阈值）
  private async needSplitFile(
    userId: string,
    threadId: string,
    currentFileIndex: number,
    newMessage: ChatMessage
  ): Promise<boolean> {
    const filePath = this.getCurrentChatFilePath(
      userId,
      threadId,
      currentFileIndex
    );

    try {
      // 1. 读取当前文件的消息数
      const fileContent = await fs.readFile(filePath, "utf-8");
      const messages: ChatMessage[] = fileContent
        ? JSON.parse(fileContent)
        : [];

      // 2. 检查消息数阈值：当前消息数 + 1 条新消息 > 最大限制
      if (messages[0].content.length > CONFIG.MAX_MESSAGES_PER_FILE) {
        return true;
      }

      // 3. 检查文件体积阈值：计算添加新消息后的体积
      const updatedMessages = [...messages, newMessage];
      const updatedContent = JSON.stringify(updatedMessages, null, 2);
      const updatedSize = Buffer.byteLength(updatedContent, "utf-8");

      return updatedSize > CONFIG.MAX_FILE_SIZE_BYTES;
    } catch {
      // 文件不存在（如刚创建 thread），无需切分
      return false;
    }
  }

  /**
   * 保存单条对话消息（自动切分文件）
   * @param userId 用户名
   * @param threadId 会话ID
   * @param message 消息内容（无需传 id 和 timestamp，自动生成）
   */
  public async saveMessage(
    userId: string,
    threadId: string,
    message: Omit<ChatMessage, "id" | "timestamp">
  ): Promise<ChatMessage> {
    // 补全消息的 id 和 timestamp
    const fullMessage: ChatMessage = {
      id: `msg_${Date.now()}_${uuidv4().slice(-8)}`, // 时间戳+短UUID，确保唯一
      timestamp: new Date().toISOString(),
      ...message,
    };

    // 初始化 thread（创建目录和元信息）
    let meta = await this.initThread(userId, threadId);
    let currentFileIndex = meta.currentFileIndex;

    // 检查是否需要切分文件：需要则递增文件序号
    const needSplit = await this.needSplitFile(
      userId,
      threadId,
      currentFileIndex,
      fullMessage
    );
    console.log(needSplit, "是否需要切分文件");

    if (needSplit) {
      currentFileIndex = meta.currentFileIndex + 1;
      // 更新元信息中的当前文件序号
      await this.updateThreadMeta(userId, threadId, { currentFileIndex });
    }

    // 写入当前文件（追加新消息）
    const targetFilePath = this.getCurrentChatFilePath(
      userId,
      threadId,
      currentFileIndex
    );
    try {
      // 读取现有消息（文件不存在则为空数组）
      let existingMessages: ChatMessage[] = [];
      try {
        const fileContent = await fs.readFile(targetFilePath, "utf-8");
        existingMessages = fileContent ? JSON.parse(fileContent) : [];
      } catch { }
      // 追加新消息并写入文件
      const updatedMessages = [...existingMessages, fullMessage];
      await fs.writeFile(
        targetFilePath,
        JSON.stringify(updatedMessages, null, 2),
        "utf-8"
      );

      // 更新元信息：总消息数+1
      await this.updateThreadMeta(userId, threadId, {
        totalMessages: meta.totalMessages + 1,
      });

      console.log(
        `消息保存成功：${targetFilePath} (消息ID: ${fullMessage.id})`
      );
      return fullMessage;
    } catch (error) {
      console.error(`消息保存失败：`, error);
      throw new Error(`保存消息失败：${(error as Error).message}`);
    }
  }

  /**
   * 读取某个 thread 的所有对话消息（按时间排序）
   * @param userId 用户名
   * @param threadId 会话ID
   * @returns 按时间戳升序排列的所有消息
   */
  public async readAllMessages(
    userId: string,
    threadId: string
  ): Promise<ChatMessage[] | null> {
    const meta = await this.getThreadMeta(userId, threadId);
    const threadDir = this.getThreadDir(userId, threadId);
    const allMessages: ChatMessage[] = [];
    if (!meta) return null;

    // 遍历所有 chatLog 文件（从 1 到 currentFileIndex）
    for (let i = 1; i <= meta.currentFileIndex; i++) {
      const filePath = this.getCurrentChatFilePath(userId, threadId, i);
      try {
        const fileContent = await fs.readFile(filePath, "utf-8");
        const messages: ChatMessage[] = fileContent
          ? JSON.parse(fileContent)
          : [];
        allMessages.push(...messages);
      } catch {
        console.warn(`跳过不存在的文件：${filePath}`);
        continue;
      }
    }

    // 按时间戳升序排序（确保消息顺序正确）
    allMessages.sort(
      (a, b) =>
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );
    return allMessages;
  }

  /**
   * 读取某个 thread 的最新 N 条消息（用于智能体上下文回溯）
   * @param userId 用户名
   * @param threadId 会话ID
   * @param limit 最多读取条数
   * @returns 最新的 N 条消息（按时间降序）
   */
  public async readRecentMessages(
    userId: string,
    threadId: string,
    limit: number = 20
  ): Promise<ChatMessage[] | undefined> {
    const allMessages = await this.readAllMessages(userId, threadId);
    // 取最后 N 条，按时间降序排列
    return allMessages?.slice(-limit).reverse();
  }

  /**
   * 删除某个 thread 的所有对话（含目录和文件）
   * @param userId 用户名
   * @param threadId 会话ID
   */
  public async deleteThread(
    userId: string,
    threadId: string
  ): Promise<boolean> {
    const threadDir = this.getThreadDir(userId, threadId);
    try {
      await fs.rm(threadDir, { recursive: true, force: true });
      console.log(`删除 thread 成功：${threadDir}`);
      return true;
    } catch (error) {
      console.error(`删除 thread 失败：`, error);
      return false;
    }
  }
}

interface IThreadIdInfo {
  threadId: string;
  systemMsg: string;
}

/**
 * 初始化加载已有文件到 threadId-用户名 映射
 * @returns Map<string, IThreadIdInfo[]>  key: threadId, value: 关联的用户信息数组（理论上一个 threadId 对应一个用户）
 */
export async function initThreadIdToUserNameMap(): Promise<
  Map<string, IThreadIdInfo[]>
> {
  const mapThreadIdToUserName = new Map<string, IThreadIdInfo[]>();
  try {
    // 1. 检查存储根目录是否存在，不存在则直接返回空映射
    try {
      await fs.access(CONFIG.STORAGE_ROOT);
    } catch {
      console.log(`存储根目录 ${CONFIG.STORAGE_ROOT} 不存在，初始化空映射`);
      return mapThreadIdToUserName;
    }

    // 2. 遍历所有用户目录（chat-storage/用户名）
    const userDirs = await fs.readdir(CONFIG.STORAGE_ROOT, {
      withFileTypes: true,
    });
    for (const userDir of userDirs) {
      // 只处理目录（排除文件）
      if (!userDir.isDirectory()) continue;

      const userName = userDir.name; // 用户名 = 目录名
      const userDirPath = path.join(CONFIG.STORAGE_ROOT, userName);

      // 3. 遍历当前用户目录下的所有 thread 目录（chat-storage/用户名/threadId）
      const threadDirs = await fs.readdir(userDirPath, { withFileTypes: true });
      for (const threadDir of threadDirs) {
        // 只处理目录（排除文件如 meta.json）
        if (!threadDir.isDirectory()) continue;

        const threadId = threadDir.name; // threadId = 目录名
        const threadDirPath = path.join(userDirPath, threadId);
        const metaPath = path.join(threadDirPath, "meta.json"); // thread 元信息文件
        // 4. 读取 meta.json（可选，提取更多信息）
        let threadMeta: Partial<IThreadIdInfo> = {};
        try {
          const metaContent = await fs.readFile(metaPath, "utf-8");
          const meta = JSON.parse(metaContent);
          threadMeta = {
            systemMsg: meta.systemMsg || "",
          };
        } catch (error) {
          console.warn(
            `thread ${threadId} 的 meta.json 不存在或损坏，跳过元信息读取`
          );
        }

        // 6. 构建关联信息
        const threadInfo: IThreadIdInfo = {
          threadId,
          systemMsg: threadMeta.systemMsg || "",
        };
        if (mapThreadIdToUserName.has(userName)) {
          mapThreadIdToUserName.get(userName)?.push(threadInfo);
        } else {
          mapThreadIdToUserName.set(userName, [threadInfo]);
        }
      }
    }
    console.log(
      `初始化完成：共加载 ${mapThreadIdToUserName.size} 个 threadId 映射`
    );
    return mapThreadIdToUserName;
  } catch (error) {
    console.error("初始化 threadId-用户名 映射失败：", error);
    return mapThreadIdToUserName; // 失败时返回空映射
  }
}
