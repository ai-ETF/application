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
import { ref } from 'vue';
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

// ==================== 事件处理函数 ====================

/**
 * 发送消息
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

  // 设置加载状态
  isLoading.value = true;

  // 模拟 AI 回复
  setTimeout(() => {
    const botMessage: ChatMessage = {
      id: generateId(),
      type: 'bot',
      content: getSimulatedReply(content),
      timestamp: Date.now(),
    };
    messages.value.push(botMessage);
    isLoading.value = false;
  }, 1500);
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
 * 获取模拟的 AI 回复
 */
function getSimulatedReply(question: string): string {
  if (question.includes('ETF')) {
    return 'ETF（交易型开放式指数基金）是一种跟踪指数、可以在交易所买卖的基金产品。请问您想了解哪方面的信息？';
  }
  if (question.includes('收益') || question.includes('赚')) {
    return 'ETF的收益主要来源于所跟踪指数的涨跌。建议您关注长期投资，分散风险。需要我为您分析具体的ETF产品吗？';
  }
  if (question.includes('推荐')) {
    return '根据您的风险偏好，我可以为您推荐一些宽基ETF产品，如沪深300ETF、中证500ETF等。请问您的投资偏好是什么？';
  }
  if (question.includes('风险')) {
    return '投资ETF主要面临市场风险、流动性风险和跟踪误差风险。建议您根据自身风险承受能力选择合适的产品。';
  }
  if (question.includes('沪深300') || question.includes('510300')) {
    return '沪深300ETF（510300）是跟踪沪深300指数的ETF产品，覆盖A股市场300只优质大盘股，是宽基指数基金的典型代表。';
  }
  return '感谢您的提问！我正在持续学习中，目前可以帮您解答ETF基础知识、市场行情等问题。请问还有什么可以帮助您的？';
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