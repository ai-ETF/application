/**
 * ============================================
 * 首页 - AI 投资聊天界面
 * ============================================
 * 应用主入口页面，提供 AI 投资助手对话功能
 * 设计稿参考：pencil/AIInvestmentChat.pen
 */
<template>
  <view class="page-container">
    <!-- 顶部栏 -->
    <ChatTopBar
      @menu="handleMenuClick"
      @new-chat="handleNewChat"
      @phone="handlePhoneClick"
      @cast="handleCastClick"
    />

    <!-- 聊天消息列表 -->
    <ChatMessageList
      ref="messageListRef"
      :messages="chatStore.messages"
      :is-loading="chatStore.sendingMessage"
      @scroll-to-upper="onScrollToUpper"
    />

    <!-- 输入区域 -->
    <ChatInputArea
      :disabled="chatStore.sendingMessage"
      @send="handleSend"
      @voice="handleVoiceClick"
      @plus="handlePlusClick"
    />

    <!-- 底部导航栏 -->
    <TabBar active="chat" />

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

// ==================== 响应式状态 ====================

/** 消息列表组件引用（用于调用 scrollToBottom 方法） */
const messageListRef = ref<InstanceType<typeof ChatMessageList> | null>(null);

/** 滚动位置（用于触发滚动到底部） */
const scrollTop = ref<number>(0);

/** 当前用户 ID（从 JWT 解析） */
const userId = ref<string>('');

/** 侧滑抽屉是否打开 */
const showDrawer = ref(false);

// ==================== 初始化 ====================

/**
 * 从 JWT token 解析用户 ID
 */
function initUserId() {
  const token = uni.getStorageSync('auth_token');
  if (token) {
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      userId.value = payload.sub || payload.user_id || '';
      console.log('[IndexPage] 用户 ID:', userId.value);
    } catch (e) {
      console.error('[IndexPage] token 解析失败:', e);
    }
  }
}

/**
 * 页面加载时初始化
 * 1. 解析用户 ID
 * 2. 加载会话列表
 * 3. 如果有已有会话，自动加载最近一条会话的消息
 */
onMounted(async () => {
  initUserId();

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
 * SSE 流式聊天 API
 * @param question - 用户提问内容
 * @param onToken - 每个 token 的回调函数
 * @returns Promise<string> - 返回 chat_id
 */
async function streamChat(question: string, onToken: (token: string) => void): Promise<string> {
  const requestBody: Record<string, string> = {
    user_id: userId.value,
    question,
  };

  // 已有会话 ID 则带上，延续对话
  if (chatStore.currentChatId) {
    requestBody.chat_id = chatStore.currentChatId;
  }

  console.log('[SSE] 发送请求:', requestBody);

  const token = uni.getStorageSync('auth_token') || '';

  const response = await fetch(`${API_BASE}/api/secure-chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify(requestBody),
  });

  checkFetchUnauthorized(response);

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('No response body');
  }

  const decoder = new TextDecoder();
  let buffer = '';
  let newChatId = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmedLine = line.trim();
      if (trimmedLine.startsWith('data:')) {
        try {
          const jsonStr = trimmedLine.slice(5).trim();
          const data = JSON.parse(jsonStr);

          if (data.type === 'token' && data.content) {
            onToken(data.content);
          }
          if (data.type === 'done' && data.chat_id) {
            newChatId = data.chat_id;
            console.log('[SSE] 会话完成，chat_id:', newChatId);
          }
        } catch (e) {
          console.warn('[SSE] 解析失败:', trimmedLine, e);
        }
      } else if (trimmedLine.startsWith('{') || trimmedLine.startsWith('[')) {
        try {
          const data = JSON.parse(trimmedLine);
          if (data.type === 'token' && data.content) {
            onToken(data.content);
          }
          if (data.type === 'done' && data.chat_id) {
            newChatId = data.chat_id;
            console.log('[SSE] 会话完成，chat_id:', newChatId);
          }
        } catch (_) { /* ignore */ }
      }
    }
  }

  return newChatId;
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
    chatStore.setBotMessage(botIndex, '抱歉，网络出现问题，请稍后重试。');
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
    scrollTop.value += 1000;
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
    scrollTop.value = scrollTop.value + 1000;
  });
}
</script>

<style lang="scss" scoped>
.page-container {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background-color: $color-bg-primary;
}
</style>