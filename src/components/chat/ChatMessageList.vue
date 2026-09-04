/**
 * ============================================
 * 聊天消息列表组件 — 虚拟滚动优化
 * ============================================
 *
 * 性能优化：
 * 1. 虚拟滚动：只渲染可视区域内的消息 + 上下缓冲
 * 2. 流式消息独立渲染：正在接收 token 的 AI 消息不与列表一起 diff
 * 3. 恒定渲染节点数（ITEM_HEIGHT * VISIBLE_COUNT），不受消息总量影响
 */
<template>
  <scroll-view
    ref="scrollViewRef"
    class="chat-area"
    scroll-y
    :scroll-top="scrollTop"
    :scroll-with-animation="false"
    @scroll="onScroll"
    @scrolltoupper="onScrollToUpper"
  >
    <!-- 欢迎消息 — 仅当无消息时显示 -->
    <ChatMessageBubble
      v-if="showWelcome && messages.length === 0"
      :message="welcomeMessage"
    />

    <!-- 顶部占位：撑起隐藏消息的高度，保持滚动条正确 -->
    <view :style="{ height: topPlaceholderHeight + 'px' }" />

    <!-- 可视区消息（含上下缓冲区） -->
    <view
      v-for="msg in visibleMessages"
      :key="msg.id"
      :data-msg-id="msg.id"
    >
      <ChatMessageBubble :message="msg" />
    </view>

    <!-- 流式消息（正在接收 token 的 AI 消息，单独渲染避免全量 diff） -->
    <ChatMessageBubble
      v-if="streamingMessage"
      :key="'streaming-' + streamingMessage.id"
      :message="streamingMessage"
    />

    <!-- 加载指示器 -->
    <ChatLoadingIndicator v-if="isLoading && !streamingMessage" />

    <!-- 底部占位 -->
    <view
      v-if="topPlaceholderHeight > 0"
      :style="{ height: bottomPlaceholderHeight + 'px' }"
    />
    <view v-else class="chat-bottom-placeholder"></view>
  </scroll-view>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue';
import ChatMessageBubble from './ChatMessageBubble.vue';
import ChatLoadingIndicator from './ChatLoadingIndicator.vue';
import type { ChatMessage } from '@/types/models.d';

// ==================== 常量 ====================

/** 每条消息的预估高度（px），用于虚拟滚动位置计算 */
const ITEM_HEIGHT = 160;

/** 可见区域渲染的消息数 */
const VISIBLE_COUNT = 15;

/** 上下缓冲消息数 */
const BUFFER_COUNT = 5;

// ==================== Props / Emit ====================

interface Props {
  messages: ChatMessage[];
  isLoading?: boolean;
  showWelcome?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  isLoading: false,
  showWelcome: true,
});

const emit = defineEmits<{
  (e: 'scroll-to-upper'): void;
}>();

// ==================== 响应式状态 ====================

/** 滚动位置 */
const scrollTop = ref<number>(0);

/** 当前滚动偏移（px） */
const scrollOffset = ref(0);

/** 列表容器引用 */
const scrollViewRef = ref<any>(null);

/** 欢迎消息 */
const welcomeMessage: ChatMessage = {
  id: 'welcome',
  type: 'bot',
  content: '您好！我是小E，您的ETF投资助手。请问有什么可以帮助您的？',
  timestamp: 0,
};

// ==================== 虚拟滚动 ====================

/**
 * 已稳定的历史消息（排除正在流式输出的最后一条 AI 消息）
 */
const settledMessages = computed(() => {
  const msgs = props.messages;
  if (msgs.length === 0) return msgs;
  const last = msgs[msgs.length - 1];
  if (last.type === 'bot' && props.isLoading) {
    return msgs.slice(0, -1);
  }
  return msgs;
});

/**
 * 正在流式输出的消息（最后一条正在接收 token 的 AI 回复）
 */
const streamingMessage = computed(() => {
  if (!props.isLoading) return null;
  const msgs = props.messages;
  if (msgs.length === 0) return null;
  const last = msgs[msgs.length - 1];
  if (last.type === 'bot') return last;
  return null;
});

/**
 * 总列表高度（px）
 */
const totalHeight = computed(() => {
  return settledMessages.value.length * ITEM_HEIGHT;
});

/**
 * 当前可见范围的起始索引
 */
const startIndex = computed(() => {
  const idx = Math.floor(scrollOffset.value / ITEM_HEIGHT) - BUFFER_COUNT;
  return Math.max(0, idx);
});

/**
 * 当前可见范围的结束索引
 */
const endIndex = computed(() => {
  const idx = startIndex.value + VISIBLE_COUNT + BUFFER_COUNT * 2;
  return Math.min(settledMessages.value.length, idx);
});

/**
 * 可视区消息切片
 */
const visibleMessages = computed(() => {
  return settledMessages.value.slice(startIndex.value, endIndex.value);
});

/**
 * 顶部占位高度（隐藏的起始部分）
 */
const topPlaceholderHeight = computed(() => {
  return startIndex.value * ITEM_HEIGHT;
});

/**
 * 底部占位高度（隐藏的结束部分）
 */
const bottomPlaceholderHeight = computed(() => {
  const hiddenCount = settledMessages.value.length - endIndex.value;
  return Math.max(0, hiddenCount * ITEM_HEIGHT);
});

// ==================== 事件处理 ====================

function onScrollToUpper() {
  emit('scroll-to-upper');
}

/**
 * 滚动事件 — 更新虚拟滚动位置
 */
function onScroll(e: any) {
  const detail = e.detail;
  if (detail && typeof detail.scrollTop === 'number') {
    scrollOffset.value = detail.scrollTop;
  }
}

/**
 * 滚动到底部
 */
function scrollToBottom() {
  nextTick(() => {
    // 使用固定大值，scroll-view 会自动 clamp 到最大滚动位置，避免累积递增
    scrollTop.value = 999999;
  });
}

// ==================== 侦听器 ====================

/** 监听消息长度变化（新消息追加时），自动滚动到底部 */
watch(
  () => props.messages.length,
  () => {
    scrollToBottom();
  }
);

/** 监听加载状态变化（开始加载时），滚动到底部 */
watch(
  () => props.isLoading,
  (newVal) => {
    if (newVal) {
      scrollToBottom();
    }
  }
);

// ==================== 暴露 ====================

defineExpose({
  scrollToBottom,
});
</script>

<style lang="scss" scoped>
.chat-area {
  width: 100%;
  max-width: 100%;
  min-width: 0;
  height: 100%;
  padding: 0 $spacing-base;
  overflow: hidden;
  box-sizing: border-box;
}

.chat-bottom-placeholder {
  height: $spacing-base;
}
</style>