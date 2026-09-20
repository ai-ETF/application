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
    <!-- AI 头像（仅 AI 消息显示） -->
    <view v-if="!isUser" class="avatar">
      <SvgIcon name="bot" size="40rpx" color="white" />
    </view>

    <view class="bubble-content">
      <view
        class="message-bubble"
        :class="isUser ? 'message-bubble--user' : 'message-bubble--bot'"
      >
        <!-- 用户消息：纯文本 -->
        <text v-if="isUser" class="message-text">{{ message.content }}</text>
        <!-- AI 消息：markdown 渲染 -->
        <rich-text v-else :nodes="renderedContent" class="message-markdown" />
      </view>
      <!-- 时间戳 -->
      <text class="message-time" :class="isUser ? 'message-time--right' : 'message-time--left'">
        {{ formattedTime }}
      </text>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import SvgIcon from '@/components/common/SvgIcon.vue';
import { renderMarkdown } from '@/utils/markdown';
import type { ChatMessage } from '@/types/models.d';

interface Props {
  message: ChatMessage;
}

const props = defineProps<Props>();

const isUser = computed(() => props.message.type === 'user');

/**
 * 将 markdown 转为 HTML 字符串，供 rich-text 组件渲染
 * rich-text 的 nodes 支持 HTML 字符串或节点数组
 */
const renderedContent = computed(() => {
  if (isUser.value) return '';
  return renderMarkdown(props.message.content);
});

/** 格式化时间 */
const formattedTime = computed(() => {
  if (props.message.timestamp === 0) return '';
  const date = new Date(props.message.timestamp);
  const h = date.getHours().toString().padStart(2, '0');
  const m = date.getMinutes().toString().padStart(2, '0');
  return `${h}:${m}`;
});
</script>

<style lang="scss" scoped>
.message-wrapper {
  display: flex;
  align-items: flex-start;
  gap: $spacing-sm;
  margin-bottom: $spacing-md;
}

.message-wrapper--user {
  flex-direction: row-reverse;
}

.message-wrapper--bot {
  flex-direction: row;
}

/* AI 头像 */
.avatar {
  @include flex-center;
  flex-shrink: 0;
  width: 72rpx;
  height: 72rpx;
  background: linear-gradient(135deg, $color-brand-primary, $color-brand-hover);
  border-radius: $radius-circle;
  box-shadow: 0 2rpx 8rpx rgba($color-brand-primary, 0.3);
}

.bubble-content {
  @include flex(column, flex-start, stretch);
  gap: $spacing-xs;
  max-width: 70%;
}

.message-bubble {
  padding: $spacing-md $spacing-base;
  border-radius: $radius-md;
  box-shadow: $shadow-sm;
}

.message-bubble--user {
  background: linear-gradient(135deg, $color-brand-primary, $color-brand-hover);
  border-bottom-right-radius: $radius-sm;
}

.message-bubble--bot {
  background-color: $color-bg-card;
  border: 2rpx solid $color-border;
  border-bottom-left-radius: $radius-sm;
}

/* 用户消息文本 */
.message-text {
  font-size: $font-size-base;
  line-height: 1.7;
  white-space: pre-wrap;
  word-break: break-word;
}

.message-bubble--user .message-text {
  color: $color-text-white;
}

.message-bubble--bot .message-text {
  color: $color-text-primary;
}

/* Markdown 渲染容器 */
.message-markdown {
  width: 100%;
}

.message-time {
  font-size: $font-size-xs;
  color: $color-text-tertiary;
}

.message-time--right {
  text-align: right;
}

.message-time--left {
  text-align: left;
}
</style>