/**
 * ============================================
 * 首页 - AI 投资聊天界面
 * ============================================
 * 应用主入口页面，提供 AI 投资助手对话功能
 * 设计稿参考：pencil/AIInvestmentChat.pen
 *
 * 页面结构：
 * - 顶部栏：菜单按钮 + 标题区域 + 操作按钮
 * - 聊天区域：对话消息展示
 * - 输入区域：文本输入 + 语音 + 发送按钮
 * - 底部导航：TabBar 组件
 *
 * 设计风格：
 * - 背景色：#F9F6F0（温暖米色）
 * - 卡片/按钮背景：#FFFFFF
 * - 边框色：#E0E0E0
 * - 主文字：#000000
 * - 次要文字：#666666
 * - 发送按钮：#333333
 */
<template>
  <view class="page-container">
    <!-- ==================== 顶部栏 ==================== -->
    <view class="top-bar">
      <!-- 左侧：菜单按钮 -->
      <view class="left-area">
        <!-- 菜单按钮：60x60pt，白色背景，圆角16pt -->
        <view class="menu-btn" @tap="handleMenuClick">
          <text class="menu-icon">☰</text>
        </view>
        <!-- 标题区域 -->
        <view class="title-area">
          <text class="main-title">小E</text>
          <text class="sub-title">您的ETF投资助手</text>
        </view>
      </view>

      <!-- 右侧：操作按钮（电话+投屏） -->
      <view class="action-btn">
        <text class="action-icon">📞</text>
        <text class="action-icon">📡</text>
      </view>
    </view>

    <!-- ==================== 聊天区域 ==================== -->
    <scroll-view
      class="chat-area"
      scroll-y
      :scroll-top="scrollTop"
      @scrolltoupper="onScrollToUpper"
    >
      <!-- 欢迎消息（AI 助手首发） -->
      <view class="message-wrapper message-wrapper--bot">
        <view class="message-bubble message-bubble--bot">
          <text class="message-text">您好！我是小E，您的ETF投资助手。请问有什么可以帮助您的？</text>
        </view>
      </view>

      <!-- 消息列表：循环渲染用户和 AI 消息 -->
      <view
        v-for="msg in messages"
        :key="msg.id"
        class="message-wrapper"
        :class="msg.type === 'user' ? 'message-wrapper--user' : 'message-wrapper--bot'"
      >
        <view
          class="message-bubble"
          :class="msg.type === 'user' ? 'message-bubble--user' : 'message-bubble--bot'"
        >
          <text class="message-text">{{ msg.content }}</text>
        </view>
      </view>

      <!-- 加载中提示：等待 AI 回复时显示 -->
      <view v-if="isLoading" class="loading-wrapper">
        <view class="loading-dots">
          <view class="dot"></view>
          <view class="dot"></view>
          <view class="dot"></view>
        </view>
        <text class="loading-text">正在思考中...</text>
      </view>

      <!-- 底部占位，防止内容被输入框遮挡 -->
      <view class="chat-bottom-placeholder"></view>
    </scroll-view>

    <!-- ==================== 输入区域 ==================== -->
    <view class="input-area">
      <!-- 语音按钮 -->
      <view class="voice-btn" @tap="handleVoiceClick">
        <text class="input-icon">🎤</text>
      </view>

      <!-- 文本输入框：胶囊形状，高度 56pt -->
      <view class="input-field-wrapper">
        <input
          v-model="inputText"
          class="text-input"
          type="text"
          placeholder="发消息或按住说话..."
          placeholder-class="input-placeholder"
          :adjust-position="true"
          confirm-type="send"
          @confirm="handleSend"
          @focus="onInputFocus"
          @blur="onInputBlur"
        />
        <!-- 加号按钮 -->
        <view class="plus-btn" @tap="handlePlusClick">
          <text class="input-icon-small">+</text>
        </view>
      </view>

      <!-- 发送按钮：深色圆形，56x56pt -->
      <view
        class="send-btn"
        :class="{ 'send-btn--active': canSend }"
        @tap="handleSend"
      >
        <text class="send-icon">➤</text>
      </view>
    </view>

    <!-- ==================== 底部导航栏 ==================== -->
    <TabBar active="chat" />
  </view>
</template>

<script setup lang="ts">
import { ref, computed, nextTick } from 'vue';
import TabBar from '@/components/common/TabBar.vue';
import { generateId } from '@/utils/format';
import type { ChatMessage } from '@/types/models.d';

// ==================== 响应式状态 ====================

/** 输入框文本内容 */
const inputText = ref<string>('');

/** 消息列表：存储所有聊天消息 */
const messages = ref<ChatMessage[]>([]);

/** 是否正在加载（等待 AI 回复） */
const isLoading = ref<boolean>(false);

/** 滚动位置：用于控制滚动到底部 */
const scrollTop = ref<number>(0);

/** 输入框是否获得焦点 */
const isInputFocused = ref<boolean>(false);

// ==================== 计算属性 ====================

/**
 * 是否可以发送消息
 * @description 输入框有内容且不在加载状态时才能发送
 */
const canSend = computed(() => {
  return inputText.value.trim().length > 0 && !isLoading.value;
});

// ==================== 事件处理函数 ====================

/**
 * 发送消息
 * @description 将用户消息添加到列表，并模拟 AI 回复
 */
async function handleSend() {
  const content = inputText.value.trim();
  // 防止空消息或重复发送
  if (!content || isLoading.value) return;

  console.log(`[IndexPage] 发送消息: ${content}`);

  // 添加用户消息到列表
  const userMessage: ChatMessage = {
    id: generateId(),
    type: 'user',
    content,
    timestamp: Date.now(),
  };
  messages.value.push(userMessage);

  // 清空输入框
  inputText.value = '';

  // 滚动到底部显示最新消息
  scrollToBottom();

  // 设置加载状态，显示等待提示
  isLoading.value = true;

  // 模拟 AI 回复（实际项目中应调用后端 API）
  setTimeout(() => {
    const botMessage: ChatMessage = {
      id: generateId(),
      type: 'bot',
      content: getSimulatedReply(content),
      timestamp: Date.now(),
    };
    messages.value.push(botMessage);
    isLoading.value = false;
    scrollToBottom();
  }, 1500);
}

/**
 * 菜单按钮点击
 * @description 打开侧边栏菜单（功能待开发）
 */
function handleMenuClick() {
  console.log('[IndexPage] 点击菜单按钮');
  uni.showToast({ title: '菜单功能开发中', icon: 'none' });
}

/**
 * 语音按钮点击
 * @description 启动语音输入（功能待开发）
 */
function handleVoiceClick() {
  console.log('[IndexPage] 点击语音按钮');
  uni.showToast({ title: '语音功能开发中', icon: 'none' });
}

/**
 * 加号按钮点击
 * @description 打开更多功能面板（功能待开发）
 */
function handlePlusClick() {
  console.log('[IndexPage] 点击加号按钮');
  uni.showToast({ title: '更多功能开发中', icon: 'none' });
}

/**
 * 滚动到顶部时触发
 * @description 可用于加载历史消息
 */
function onScrollToUpper() {
  console.log('[IndexPage] 滚动到顶部');
  // TODO: 加载更多历史消息
}

/**
 * 输入框获得焦点
 */
function onInputFocus() {
  isInputFocused.value = true;
}

/**
 * 输入框失去焦点
 */
function onInputBlur() {
  isInputFocused.value = false;
}

/**
 * 滚动到底部
 * @description 显示最新的聊天消息
 */
function scrollToBottom() {
  nextTick(() => {
    // 通过改变 scrollTop 值触发滚动
    scrollTop.value = scrollTop.value + 1000;
  });
}

/**
 * 获取模拟的 AI 回复
 * @description 实际项目中应替换为真实的 API 调用
 * @param question - 用户提问内容
 * @returns 模拟的回复文本
 */
function getSimulatedReply(question: string): string {
  // 简单的关键词匹配回复
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
/* ==================== 页面容器 ==================== */
.page-container {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background-color: #F9F6F0;
}

/* ==================== 顶部栏样式 ==================== */
.top-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 32rpx 40rpx;
  background-color: #F9F6F0;
}

/* 左侧区域：菜单按钮 + 标题 */
.left-area {
  display: flex;
  align-items: center;
  gap: 32rpx;
}

/* 菜单按钮：60x60pt，白色背景，16pt圆角 */
.menu-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 120rpx;
  height: 120rpx;
  background-color: #FFFFFF;
  border-radius: 32rpx;
  border: 2rpx solid #E0E0E0;

  &:active {
    opacity: 0.8;
    transform: scale(0.98);
  }
}

.menu-icon {
  font-size: 48rpx;
  color: #333333;
}

/* 标题区域 */
.title-area {
  display: flex;
  flex-direction: column;
  gap: 8rpx;
}

.main-title {
  font-size: 40rpx;
  font-weight: 700;
  color: #000000;
  letter-spacing: 0.5rpx;
}

.sub-title {
  font-size: 28rpx;
  color: #666666;
}

/* 操作按钮区域：电话 + 投屏 */
.action-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 24rpx;
  height: 130rpx;
  padding: 0 32rpx;
  background-color: #FFFFFF;
  border-radius: 80rpx;
  border: 2rpx solid #E0E0E0;

  &:active {
    opacity: 0.8;
  }
}

.action-icon {
  font-size: 40rpx;
}

/* ==================== 聊天区域样式 ==================== */
.chat-area {
  flex: 1;
  padding: 0 32rpx;
  overflow: hidden;
}

/* 消息包装器 */
.message-wrapper {
  display: flex;
  margin-bottom: 32rpx;
}

/* 用户消息靠右 */
.message-wrapper--user {
  justify-content: flex-end;
}

/* AI 消息靠左 */
.message-wrapper--bot {
  justify-content: flex-start;
}

/* 消息气泡 */
.message-bubble {
  max-width: 80%;
  padding: 24rpx 32rpx;
  border-radius: 32rpx;
}

/* 用户消息气泡：深色背景 */
.message-bubble--user {
  background-color: #333333;
}

/* AI 消息气泡：白色背景，带边框 */
.message-bubble--bot {
  background-color: #FFFFFF;
  border: 2rpx solid #E0E0E0;
}

.message-text {
  font-size: 28rpx;
  line-height: 1.6;
}

.message-bubble--user .message-text {
  color: #FFFFFF;
}

.message-bubble--bot .message-text {
  color: #2D1E16;
}

/* 加载中状态 */
.loading-wrapper {
  display: flex;
  align-items: center;
  gap: 16rpx;
  margin-bottom: 32rpx;
  padding: 20rpx 32rpx;
  background-color: #FFFFFF;
  border-radius: 32rpx;
  border: 2rpx solid #E0E0E0;
  width: fit-content;
}

/* 加载动画：三个跳动的点 */
.loading-dots {
  display: flex;
  gap: 8rpx;
}

.dot {
  width: 12rpx;
  height: 12rpx;
  background-color: #999999;
  border-radius: 50%;
  animation: bounce 1.4s infinite ease-in-out both;

  &:nth-child(1) {
    animation-delay: -0.32s;
  }
  &:nth-child(2) {
    animation-delay: -0.16s;
  }
}

@keyframes bounce {
  0%, 80%, 100% {
    transform: scale(0.6);
    opacity: 0.5;
  }
  40% {
    transform: scale(1);
    opacity: 1;
  }
}

.loading-text {
  font-size: 24rpx;
  color: #999999;
}

.chat-bottom-placeholder {
  height: 32rpx;
}

/* ==================== 输入区域样式 ==================== */
.input-area {
  display: flex;
  align-items: center;
  gap: 24rpx;
  padding: 32rpx;
  background-color: #F9F6F0;
}

/* 语音按钮 */
.voice-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 80rpx;
  height: 80rpx;

  &:active {
    opacity: 0.7;
    transform: scale(0.95);
  }
}

.input-icon {
  font-size: 48rpx;
}

/* 输入框包装器 */
.input-field-wrapper {
  flex: 1;
  display: flex;
  align-items: center;
  height: 112rpx;
  padding: 0 32rpx;
  background-color: #FFFFFF;
  border-radius: 80rpx;
  border: 2rpx solid #E0E0E0;
}

/* 文本输入框 */
.text-input {
  flex: 1;
  height: 100%;
  font-size: 32rpx;
  color: #2D1E16;
  background-color: transparent;
}

.input-placeholder {
  color: #999999;
}

/* 加号按钮 */
.plus-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 56rpx;
  height: 56rpx;

  &:active {
    opacity: 0.7;
  }
}

.input-icon-small {
  font-size: 44rpx;
  color: #999999;
  font-weight: 300;
}

/* 发送按钮 */
.send-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 112rpx;
  height: 112rpx;
  background-color: #CCCCCC;
  border-radius: 56rpx;
  transition: all 0.2s ease;

  &:active {
    opacity: 0.8;
    transform: scale(0.95);
  }
}

/* 发送按钮激活状态：有内容时可发送 */
.send-btn--active {
  background-color: #333333;
}

.send-icon {
  font-size: 44rpx;
  color: #FFFFFF;
}
</style>
