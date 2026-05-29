/**
 * ============================================
 * 聊天消息列表组件
 * ============================================
 * 展示聊天消息列表，支持滚动和加载状态
 *
 * 功能：
 * - 消息列表渲染
 * - 自动滚动到底部
 * - 加载状态展示
 * - 滚动到顶部事件（加载历史消息）
 */
<template>
  <scroll-view
    class="chat-area"
    scroll-y
    :scroll-top="scrollTop"
    @scrolltoupper="onScrollToUpper"
  >
    <!-- 欢迎消息 -->
    <ChatMessageBubble
      v-if="showWelcome"
      :message="welcomeMessage"
    />

    <!-- 消息列表 -->
    <ChatMessageBubble
      v-for="msg in messages"
      :key="msg.id"
      :message="msg"
    />

    <!-- 加载指示器 -->
    <ChatLoadingIndicator v-if="isLoading" />

    <!-- 底部占位 -->
    <view class="chat-bottom-placeholder"></view>
  </scroll-view>
</template>

<script setup lang="ts">
import { ref, watch, nextTick } from 'vue';
import ChatMessageBubble from './ChatMessageBubble.vue';
import ChatLoadingIndicator from './ChatLoadingIndicator.vue';
import type { ChatMessage } from '@/types/models.d';

/**
 * 组件属性
 */
interface Props {
  /** 消息列表 */
  messages: ChatMessage[];
  /** 是否正在加载 */
  isLoading?: boolean;
  /** 是否显示欢迎消息 */
  showWelcome?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  isLoading: false,
  showWelcome: true,
});

/**
 * 组件事件
 */
const emit = defineEmits<{
  (e: 'scroll-to-upper'): void;
}>();

/** 滚动位置 */
const scrollTop = ref<number>(0);

/** 欢迎消息 */
const welcomeMessage: ChatMessage = {
  id: 'welcome',
  type: 'bot',
  content: '您好！我是小E，您的ETF投资助手。请问有什么可以帮助您的？',
  timestamp: 0,
};

/** 滚动到顶部事件 */
function onScrollToUpper() {
  emit('scroll-to-upper');
}

/** 滚动到底部 */
function scrollToBottom() {
  nextTick(() => {
    scrollTop.value = scrollTop.value + 1000;
  });
}

/** 监听消息变化，自动滚动到底部 */
watch(
  () => props.messages.length,
  () => {
    scrollToBottom();
  }
);

/** 监听加载状态变化 */
watch(
  () => props.isLoading,
  (newVal) => {
    if (newVal) {
      scrollToBottom();
    }
  }
);

/** 暴露方法给父组件 */
defineExpose({
  scrollToBottom,
});
</script>

<style lang="scss" scoped>
.chat-area {
  flex: 1;
  padding: 0 $spacing-base;
  overflow: hidden;
}

.chat-bottom-placeholder {
  height: $spacing-base;
}
</style>