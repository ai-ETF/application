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
      @phone="handlePhoneClick"
      @cast="handleCastClick"
    />

    <!-- 聊天消息列表 -->
    <ChatMessageList
      ref="messageListRef"
      :messages="messages"
      :is-loading="isLoading"
      @scroll-to-upper="onScrollToUpper"
    />

    <!-- 输入区域 -->
    <ChatInputArea
      :disabled="isLoading"
      @send="handleSend"
      @voice="handleVoiceClick"
      @plus="handlePlusClick"
    />

    <!-- 底部导航栏 -->
    <TabBar active="chat" />
  </view>
</template>

<script setup lang="ts">
import { ref, nextTick } from 'vue';
import TabBar from '@/components/common/TabBar.vue';
import ChatTopBar from '@/components/chat/ChatTopBar.vue';
import ChatMessageList from '@/components/chat/ChatMessageList.vue';
import ChatInputArea from '@/components/chat/ChatInputArea.vue';
import { generateId } from '@/utils/format';
import type { ChatMessage } from '@/types/models.d';

// ==================== 响应式状态 ====================

/** 消息列表 */
const messages = ref<ChatMessage[]>([]);

/** 是否正在加载 */
const isLoading = ref<boolean>(false);

/** 消息列表组件引用（用于调用 scrollToBottom 方法） */
const messageListRef = ref<InstanceType<typeof ChatMessageList> | null>(null);

/** 滚动位置（用于触发滚动到底部） */
const scrollTop = ref<number>(0);

// ==================== 事件处理函数 ====================

/**
 * SSE 流式聊天 API
 * @description 调用后端 SSE 接口，实时返回 AI 回复
 * @param question - 用户提问内容
 * @param onToken - 每个 token 的回调函数
 * @returns Promise<void>
 */
async function streamChat(question: string, onToken: (token: string) => void): Promise<void> {
  const response = await fetch('http://47.113.220.182:8000/api/simple-chat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ question }),
  });

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('No response body');
  }

  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    // 解析 SSE 数据：每行格式为 "data: {...}"
    const lines = buffer.split('\n');
    buffer = lines.pop() || ''; // 保留未完成的行

    for (const line of lines) {
      const trimmedLine = line.trim();
      if (trimmedLine.startsWith('data:')) {
        try {
          const jsonStr = trimmedLine.slice(5).trim();
          const data = JSON.parse(jsonStr);
          if (data.type === 'token' && data.content) {
            onToken(data.content);
          }
        } catch (e) {
          // 解析失败，忽略该行
          console.warn('[SSE] Failed to parse line:', trimmedLine, e);
        }
      }
    }
  }
}

/**
 * 发送消息
 * @description 将用户消息添加到列表，并通过 SSE 流式获取 AI 回复
 */
async function handleSend(content: string) {
  if (!content || isLoading.value) return;

  console.log(`[IndexPage] 发送消息: ${content}`);

  // 添加用户消息
  const userMessage: ChatMessage = {
    id: generateId(),
    type: 'user',
    content,
    timestamp: Date.now(),
  };
  messages.value.push(userMessage);

  // 创建 AI 回复消息（内容为空，逐步填充）
  const botMessage: ChatMessage = {
    id: generateId(),
    type: 'bot',
    content: '',
    timestamp: Date.now(),
  };
  messages.value.push(botMessage);

  // 设置加载状态
  isLoading.value = true;

  try {
    // 调用 SSE 流式 API，实时更新消息内容
    await streamChat(content, (token: string) => {
      botMessage.content += token;
      scrollToBottom();
    });
  } catch (error) {
    console.error('[SSE] Error:', error);
    botMessage.content = '抱歉，网络出现问题，请稍后重试。';
  } finally {
    isLoading.value = false;
    scrollToBottom();
  }
}

/**
 * 菜单按钮点击
 */
function handleMenuClick() {
  console.log('[IndexPage] 点击菜单按钮');
  uni.showToast({ title: '菜单功能开发中', icon: 'none' });
}

/**
 * 电话按钮点击
 */
function handlePhoneClick() {
  console.log('[IndexPage] 点击电话按钮');
  uni.showToast({ title: '电话功能开发中', icon: 'none' });
}

/**
 * 投屏按钮点击
 */
function handleCastClick() {
  console.log('[IndexPage] 点击投屏按钮');
  uni.showToast({ title: '投屏功能开发中', icon: 'none' });
}

/**
 * 语音按钮点击
 */
function handleVoiceClick() {
  console.log('[IndexPage] 点击语音按钮');
  uni.showToast({ title: '语音功能开发中', icon: 'none' });
}

/**
 * 加号按钮点击
 */
function handlePlusClick() {
  console.log('[IndexPage] 点击加号按钮');
  uni.showToast({ title: '更多功能开发中', icon: 'none' });
}

/**
 * 滚动到顶部
 */
function onScrollToUpper() {
  console.log('[IndexPage] 滚动到顶部');
  // TODO: 加载更多历史消息
}

/**
 * 滚动到底部
 */
function scrollToBottom() {
  nextTick(() => {
    // 通过改变 scrollTop 值触发滚动
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