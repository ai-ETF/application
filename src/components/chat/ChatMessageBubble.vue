/**
 * ============================================
 * 聊天消息气泡组件
 * ============================================
 * 展示单条聊天消息，支持用户和 AI 两种样式
 */
<template>
  <view
    class="message-wrapper"
    :class="isUser ? 'message-wrapper--user' : 'message-wrapper--bot'"
  >
    <view
      class="message-bubble"
      :class="isUser ? 'message-bubble--user' : 'message-bubble--bot'"
    >
      <text class="message-text">{{ message.content }}</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { ChatMessage } from '@/types/models.d';

/**
 * 组件属性
 */
interface Props {
  /** 消息对象 */
  message: ChatMessage;
}

const props = defineProps<Props>();

/** 是否为用户消息 */
const isUser = computed(() => props.message.type === 'user');
</script>

<style lang="scss" scoped>
.message-wrapper {
  display: flex;
  margin-bottom: $spacing-base;
}

.message-wrapper--user {
  justify-content: flex-end;
}

.message-wrapper--bot {
  justify-content: flex-start;
}

.message-bubble {
  max-width: 80%;
  padding: $spacing-md $spacing-base;
  border-radius: $radius-md;
}

.message-bubble--user {
  background-color: $color-brand-primary;
}

.message-bubble--bot {
  background-color: $color-bg-secondary;
  border: 2rpx solid $color-border;
}

.message-text {
  font-size: $font-size-base;
  line-height: 1.6;
}

.message-bubble--user .message-text {
  color: $color-text-white;
}

.message-bubble--bot .message-text {
  color: $color-text-primary;
}
</style>