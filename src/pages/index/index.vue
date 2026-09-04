/**
 * ============================================
 * 首页 - AI 投资聊天界面
 * ============================================
 * 应用主入口页面，提供 AI 投资助手对话功能
 * 设计稿参考：pencil/AIInvestmentChat.pen
 */
<template>
  <view class="page-root">
    <!-- 顶部 Header：固定，不滚动 -->
    <ChatTopBar
      @menu="handleMenuClick"
      @new-chat="handleNewChat"
      @phone="handlePhoneClick"
      @cast="handleCastClick"
    />

    <!-- 中间聊天区域：flex:1 + min-height:0，唯一可滚动 -->
    <view class="chat-body">
      <ChatMessageList
        ref="messageListRef"
        :messages="chatStore.messages"
        :is-loading="chatStore.sendingMessage"
        @scroll-to-upper="onScrollToUpper"
      />
    </view>

    <!-- 底部整体：输入框 + TabBar，固定不滚动 -->
    <view class="bottom-group">
      <ChatInputArea
        :disabled="chatStore.sendingMessage"
        @send="handleSend"
        @voice="handleVoiceClick"
        @plus="handlePlusClick"
      />
      <TabBar active="chat" />
    </view>

    <!-- 会话列表侧滑抽屉 -->
    <SessionDrawer
      :visible="showDrawer"
      @close="showDrawer = false"
      @select-chat="handleSelectChat"
      @new-chat="handleNewChat"
    />
  </view>
</template>

<script setup lang="ts">
import { ref, nextTick, onMounted } from 'vue';
import TabBar from '@/components/common/TabBar.vue';
import ChatTopBar from '@/components/chat/ChatTopBar.vue';
import ChatMessageList from '@/components/chat/ChatMessageList.vue';
import ChatInputArea from '@/components/chat/ChatInputArea.vue';
import SessionDrawer from '@/components/chat/SessionDrawer.vue';
import { useChatStore } from '@/stores/chat';
import { API_BASE } from '@/config';

const chatStore = useChatStore();

/** AI 首个有效 token 最长等待时间，避免上游异常时界面永久处于“正在思考”。 */
const AI_FIRST_TOKEN_TIMEOUT_MS = 65000;

/** AI 流式请求总超时，避免已经收到部分内容后连接仍长期不结束。 */
const AI_REQUEST_TIMEOUT_MS = 120000;

// ==================== 响应式状态 ====================

/** 消息列表组件引用（用于调用 scrollToBottom 方法） */
const messageListRef = ref<InstanceType<typeof ChatMessageList> | null>(null);

/** 侧滑抽屉是否打开 */
const showDrawer = ref(false);

// ==================== 初始化 ====================

/**
 * 页面加载时初始化
 * 1. 解析用户 ID
 * 2. 加载会话列表
 * 3. 如果有已有会话，自动加载最近一条会话的消息
 */
onMounted(async () => {
  // 加载会话列表
  await chatStore.fetchSessions();

  // 如果已有会话，加载最近一个会话的消息
  if (chatStore.hasSessions) {
    const latestChatId = chatStore.sessions[0].id;
    console.log('[IndexPage] 加载最近会话:', latestChatId);
    await chatStore.fetchMessages(latestChatId);
  }
});

// ==================== SSE 聊天 ====================

/**
 * 检测 fetch 响应是否为 401 未授权
 */
function checkFetchUnauthorized(response: Response): Response {
  if (response.status === 401) {
    console.log('[IndexPage] fetch 收到 401，token 已过期');
    uni.removeStorageSync('auth_token');
    uni.removeStorageSync('auth_user');
    uni.redirectTo({ url: '/pages/login/index' });
    throw new Error('登录已过期，请重新登录');
  }
  return response;
}

/**
 * SSE 流式聊天 API（平台自适应）
 *
 * - H5/浏览器：使用 fetch + ReadableStream
 * - 小程序：使用 uni.request + enableChunked
 *
 * @param question - 用户提问内容
 * @param onToken - 每个 token 的回调函数
 * @returns Promise<string> - 返回 chat_id
 */
async function streamChat(question: string, onToken: (token: string) => void): Promise<string> {
  // user_id 由后端从 JWT 中获取，请求体只传接口定义的字段。
  const requestBody: { question: string; chat_id?: string } = { question };

  // 已有会话 ID 则带上，延续对话
  if (chatStore.currentChatId) {
    requestBody.chat_id = chatStore.currentChatId;
  }

  console.log('[SSE] 发送请求:', requestBody);

  const token = uni.getStorageSync('auth_token') || '';
  if (!token) {
    uni.redirectTo({ url: '/pages/login/index' });
    throw new Error('登录状态已失效，请重新登录');
  }

  // 小程序环境：使用 uni.request + enableChunked 实现流式接收
  // #ifdef MP-WEIXIN
  return streamChatMp(requestBody, token, onToken);
  // #endif

  // H5/浏览器环境：使用 fetch + ReadableStream
  // #ifndef MP-WEIXIN
  return streamChatH5(requestBody, token, onToken);
  // #endif
}

/**
 * 小程序端流式聊天：uni.request + enableChunked
 * @description 微信小程序基础库 2.20.1+ 支持 enableChunked 分块传输
 */
function streamChatMp(
  requestBody: { question: string; chat_id?: string },
  token: string,
  onToken: (token: string) => void,
): Promise<string> {
  return new Promise((resolve, reject) => {
    let buffer = '';
    let newChatId = '';
    let receivedToken = false;
    let receivedChunk = false;
    let streamError = '';
    let firstTokenTimedOut = false;
    const decoder = createUtf8StreamDecoder();
    let requestTask: UniApp.RequestTask & {
      onChunkReceived(callback: (chunk: { data: ArrayBuffer }) => void): void;
    };

    const firstTokenTimer = setTimeout(() => {
      if (!receivedToken) {
        firstTokenTimedOut = true;
        console.error('[SSE-MP] 等待首个 AI token 超时');
        requestTask?.abort();
      }
    }, AI_FIRST_TOKEN_TIMEOUT_MS);

    function handleParsedEvent(parsed: ParsedSSELine | null) {
      if (!parsed) return;
      if (parsed.type === 'token') {
        clearTimeout(firstTokenTimer);
        receivedToken = true;
        onToken(parsed.content);
      } else if (parsed.type === 'done') {
        newChatId = parsed.chatId;
        console.log('[SSE-MP] 会话完成，chat_id:', newChatId);
      } else {
        streamError = parsed.message;
        console.error('[SSE-MP] 服务端 AI 错误:', streamError);
      }
    }

    function processBuffer(flush = false) {
      const lines = buffer.split(/\r?\n/);
      const tail = lines.pop() || '';
      buffer = flush ? '' : tail;
      for (const line of lines) {
        handleParsedEvent(parseSSELine(line));
      }

      // 请求结束时处理没有换行符的最后一个 SSE 事件。
      if (flush && tail.trim()) {
        handleParsedEvent(parseSSELine(tail.trim()));
      }
    }

    // uni-app 当前类型定义未暴露微信小程序的分块监听 API，运行时由 RequestTask 提供。
    requestTask = uni.request({
      url: `${API_BASE}/api/secure-chat`,
      method: 'POST',
      header: {
        'Content-Type': 'application/json',
        'Accept': 'text/event-stream',
        'Authorization': `Bearer ${token}`,
      },
      data: requestBody,
      enableChunked: true,
      responseType: 'text',
      timeout: AI_REQUEST_TIMEOUT_MS,
      success: (res) => {
        clearTimeout(firstTokenTimer);
        if (res.statusCode === 401) {
          uni.removeStorageSync('auth_token');
          uni.removeStorageSync('auth_user');
          uni.redirectTo({ url: '/pages/login/index' });
          reject(new Error('登录已过期，请重新登录'));
          return;
        }

        if (res.statusCode < 200 || res.statusCode >= 300) {
          console.error('[SSE-MP] 服务端返回异常:', res.statusCode, res.data);
          reject(new Error(`AI 请求失败（HTTP ${res.statusCode}）`));
          return;
        }

        // 部分基础库不触发分块回调，兼容从完整响应中解析 SSE。
        if (!receivedChunk && typeof res.data === 'string') {
          buffer += res.data;
        }
        buffer += decoder.flush();
        processBuffer(true);

        if (streamError) {
          reject(new Error(streamError));
          return;
        }

        if (!receivedToken) {
          reject(new Error('AI 服务未返回有效回复'));
          return;
        }
        resolve(newChatId);
      },
      fail: (err) => {
        clearTimeout(firstTokenTimer);
        console.error('[SSE-MP] 请求失败:', err);
        if (firstTokenTimedOut) {
          reject(new Error('AI 响应超时，请稍后重试'));
          return;
        }
        // 检查 401
        if (err.errMsg?.includes('401')) {
          uni.removeStorageSync('auth_token');
          uni.removeStorageSync('auth_user');
          uni.redirectTo({ url: '/pages/login/index' });
          reject(new Error('登录已过期，请重新登录'));
          return;
        }
        reject(new Error(err.errMsg || '网络请求失败'));
      },
    }) as typeof requestTask;

    // 监听分块数据
    requestTask.onChunkReceived((chunk: { data: ArrayBuffer }) => {
      receivedChunk = true;
      // 使用持久化解码器，避免中文字符被拆到两个分块时解码失败。
      buffer += decoder.decode(chunk.data);
      processBuffer();
    });
  });
}

/**
 * H5 端流式聊天：fetch + ReadableStream
 */
async function streamChatH5(
  requestBody: { question: string; chat_id?: string },
  token: string,
  onToken: (token: string) => void,
): Promise<string> {
  const controller = new AbortController();
  let receivedToken = false;
  let firstTokenTimedOut = false;
  let requestTimedOut = false;
  const firstTokenTimer = setTimeout(() => {
    if (!receivedToken) {
      firstTokenTimedOut = true;
      controller.abort();
    }
  }, AI_FIRST_TOKEN_TIMEOUT_MS);
  const requestTimer = setTimeout(() => {
    requestTimedOut = true;
    controller.abort();
  }, AI_REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(`${API_BASE}/api/secure-chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'text/event-stream',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    });

    checkFetchUnauthorized(response);

    if (!response.ok) {
      throw new Error(`AI 请求失败（HTTP ${response.status}）`);
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('AI 服务未返回响应内容');
    }

    const decoder = new TextDecoder();
    let buffer = '';
    let newChatId = '';

    function handleParsedEvent(parsed: ParsedSSELine | null) {
      if (!parsed) return;
      if (parsed.type === 'token') {
        clearTimeout(firstTokenTimer);
        receivedToken = true;
        onToken(parsed.content);
      } else if (parsed.type === 'done') {
        newChatId = parsed.chatId;
        console.log('[SSE-H5] 会话完成，chat_id:', newChatId);
      } else {
        throw new Error(parsed.message);
      }
    }

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() || '';

      for (const line of lines) {
        handleParsedEvent(parseSSELine(line));
      }
    }

    // 刷新解码器并处理流末尾没有换行符的事件。
    buffer += decoder.decode();
    if (buffer.trim()) {
      handleParsedEvent(parseSSELine(buffer.trim()));
    }

    if (!receivedToken) {
      throw new Error('AI 服务未返回有效回复');
    }
    return newChatId;
  } catch (error) {
    if (firstTokenTimedOut) {
      throw new Error('AI 响应超时，请稍后重试');
    }
    if (requestTimedOut) {
      throw new Error('AI 回复时间过长，请稍后重试');
    }
    throw error;
  } finally {
    clearTimeout(firstTokenTimer);
    clearTimeout(requestTimer);
  }
}

/**
 * 解析 SSE 行数据
 * @returns { type, content, chatId } 或 null
 */
type ParsedSSELine =
  | { type: 'token'; content: string }
  | { type: 'done'; chatId: string }
  | { type: 'error'; message: string };

function parseSSELine(line: string): ParsedSSELine | null {
  const trimmedLine = line.trim();
  if (!trimmedLine) return null;

  // data: {...} 格式
  if (trimmedLine.startsWith('data:')) {
    try {
      const jsonStr = trimmedLine.slice(5).trim();
      if (jsonStr === '[DONE]') return { type: 'done', chatId: '' };
      const data = JSON.parse(jsonStr);
      if (data.type === 'token' && data.content) {
        return { type: 'token', content: data.content };
      }
      if (data.type === 'done' && data.chat_id) {
        return { type: 'done', chatId: data.chat_id };
      }
      if (data.type === 'error') {
        return { type: 'error', message: data.message || 'AI 服务调用失败' };
      }
    } catch (error) {
      console.warn('[SSE] 解析 data 事件失败:', trimmedLine, error);
    }
    return null;
  }

  // 纯 JSON 格式（兼容)
  if (trimmedLine.startsWith('{') || trimmedLine.startsWith('[')) {
    try {
      const data = JSON.parse(trimmedLine);
      if (data.type === 'token' && data.content) {
        return { type: 'token', content: data.content };
      }
      if (data.type === 'done' && data.chat_id) {
        return { type: 'done', chatId: data.chat_id };
      }
      if (data.type === 'error') {
        return { type: 'error', message: data.message || 'AI 服务调用失败' };
      }
    } catch (error) {
      console.warn('[SSE] 解析 JSON 事件失败:', trimmedLine, error);
    }
  }

  return null;
}

/**
 * 创建支持跨分块的 UTF-8 解码器。
 * 微信真机可能没有 TextDecoder，因此提供等价的增量解码降级。
 */
function createUtf8StreamDecoder() {
  if (typeof TextDecoder !== 'undefined') {
    const nativeDecoder = new TextDecoder('utf-8');
    return {
      decode(buffer: ArrayBuffer) {
        return nativeDecoder.decode(new Uint8Array(buffer), { stream: true });
      },
      flush() {
        return nativeDecoder.decode();
      },
    };
  }

  let pendingBytes: number[] = [];

  function decodePending(flush: boolean) {
    let output = '';
    let index = 0;

    while (index < pendingBytes.length) {
      const first = pendingBytes[index];
      let size = 1;
      let codePoint = first;

      if ((first & 0xe0) === 0xc0) {
        size = 2;
        codePoint = first & 0x1f;
      } else if ((first & 0xf0) === 0xe0) {
        size = 3;
        codePoint = first & 0x0f;
      } else if ((first & 0xf8) === 0xf0) {
        size = 4;
        codePoint = first & 0x07;
      } else if (first >= 0x80) {
        output += '\ufffd';
        index += 1;
        continue;
      }

      if (index + size > pendingBytes.length) {
        if (!flush) break;
        output += '\ufffd';
        index += 1;
        continue;
      }

      let valid = true;
      for (let offset = 1; offset < size; offset += 1) {
        const next = pendingBytes[index + offset];
        if ((next & 0xc0) !== 0x80) {
          valid = false;
          break;
        }
        codePoint = (codePoint << 6) | (next & 0x3f);
      }

      if (!valid) {
        output += '\ufffd';
        index += 1;
        continue;
      }

      if (codePoint <= 0xffff) {
        output += String.fromCharCode(codePoint);
      } else {
        const adjusted = codePoint - 0x10000;
        output += String.fromCharCode(0xd800 + (adjusted >> 10), 0xdc00 + (adjusted & 0x3ff));
      }
      index += size;
    }

    pendingBytes = pendingBytes.slice(index);
    return output;
  }

  return {
    decode(buffer: ArrayBuffer) {
      pendingBytes.push(...Array.from(new Uint8Array(buffer)));
      return decodePending(false);
    },
    flush() {
      return decodePending(true);
    },
  };
}

/**
 * 发送消息
 */
async function handleSend(content: string) {
  if (!content || chatStore.sendingMessage) return;

  console.log(`[IndexPage] 发送消息: ${content}`);

  // 添加用户消息
  chatStore.addUserMessage(content);

  // 创建空 AI 消息
  const botIndex = chatStore.addEmptyBotMessage();

  // 设置加载状态（通过 store 属性）
  chatStore.sendingMessage = true;

  try {
    const newChatId = await streamChat(content, (token: string) => {
      chatStore.appendBotToken(botIndex, token);
      scrollToBottom();
    });

    // 保存会话 ID
    if (newChatId) {
      chatStore.setCurrentChatId(newChatId);
      // 刷新会话列表（新会话出现在列表首位）
      chatStore.fetchSessions();
    }
  } catch (error) {
    console.error('[SSE] Error:', error);
    const message = error instanceof Error ? error.message : '网络出现问题，请稍后重试';
    chatStore.setBotMessage(botIndex, `抱歉，${message}。`);
  } finally {
    chatStore.sendingMessage = false;
    scrollToBottom();
  }
}

// ==================== 会话管理 ====================

/**
 * 菜单按钮点击 → 打开会话列表侧滑面板
 */
function handleMenuClick() {
  console.log('[IndexPage] 打开会话列表');
  // 刷新一次会话列表再展示
  chatStore.fetchSessions();
  showDrawer.value = true;
}

/**
 * 选择历史会话
 */
async function handleSelectChat(chatId: string) {
  showDrawer.value = false;
  console.log('[IndexPage] 切换到会话:', chatId);

  // 切换到指定会话，加载其消息
  await chatStore.switchChat(chatId);

  // 滚动到底部
  nextTick(() => {
    messageListRef.value?.scrollToBottom();
  });
}

/**
 * 新建会话
 */
function handleNewChat() {
  showDrawer.value = false;
  console.log('[IndexPage] 新建会话');
  chatStore.startNewChat();
}

// ==================== 其他事件 ====================

function handlePhoneClick() {
  console.log('[IndexPage] 点击电话按钮');
  uni.showToast({ title: '电话功能开发中', icon: 'none' });
}

function handleCastClick() {
  console.log('[IndexPage] 点击投屏按钮');
  uni.showToast({ title: '投屏功能开发中', icon: 'none' });
}

function handleVoiceClick() {
  console.log('[IndexPage] 点击语音按钮');
  uni.showToast({ title: '语音功能开发中', icon: 'none' });
}

function handlePlusClick() {
  console.log('[IndexPage] 点击加号按钮');
  uni.showToast({ title: '更多功能开发中', icon: 'none' });
}

function onScrollToUpper() {
  console.log('[IndexPage] 滚动到顶部');
}

function scrollToBottom() {
  nextTick(() => {
    messageListRef.value?.scrollToBottom();
  });
}
</script>

<style lang="scss" scoped>
/* ==================== 聊天页三段式固定布局 ==================== */
.page-root {
  width: 100%;
  max-width: 100%;
  min-width: 0;
  height: 100vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-sizing: border-box;
  background-color: $color-bg-primary;
}

/* 中间聊天区域：flex:1 + min-height:0 强制撑满剩余空间 */
.chat-body {
  flex: 1;
  min-height: 0;
  min-width: 0;
  width: 100%;
  max-width: 100%;
  overflow: hidden;
  box-sizing: border-box;
}

/* 底部整体：固定，禁止压缩 */
.bottom-group {
  flex-shrink: 0;
  width: 100%;
  max-width: 100%;
  min-width: 0;
  box-sizing: border-box;
}
</style>
