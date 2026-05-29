/**
 * ============================================
 * 聊天加载指示器组件
 * ============================================
 * 展示 AI 正在思考的加载状态
 */
<template>
  <view class="loading-wrapper">
    <view class="loading-dots">
      <view class="dot"></view>
      <view class="dot"></view>
      <view class="dot"></view>
    </view>
    <text class="loading-text">{{ text }}</text>
  </view>
</template>

<script setup lang="ts">
/**
 * 组件属性
 */
interface Props {
  /** 加载提示文本 */
  text?: string;
}

withDefaults(defineProps<Props>(), {
  text: '正在思考中...',
});
</script>

<style lang="scss" scoped>
.loading-wrapper {
  display: flex;
  align-items: center;
  gap: $spacing-sm;
  margin-bottom: $spacing-base;
  padding: 20rpx $spacing-base;
  background-color: $color-bg-secondary;
  border-radius: $radius-md;
  border: 2rpx solid $color-border;
  width: fit-content;
}

.loading-dots {
  display: flex;
  gap: $spacing-xs;
}

.dot {
  width: $loading-dot-size;
  height: $loading-dot-size;
  background-color: $color-text-secondary;
  border-radius: $radius-circle;
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
  font-size: $font-size-sm;
  color: $color-text-secondary;
}
</style>