/**
 * ============================================
 * 聊天加载指示器组件
 * ============================================
 * 展示 AI 正在思考的加载状态
 */

<template>
  <view class="loading-wrapper">
    <view class="avatar">
      <SvgIcon name="bot" size="32rpx" color="white" />
    </view>
    <view class="loading-card">
      <view class="loading-dots">
        <view class="dot"></view>
        <view class="dot"></view>
        <view class="dot"></view>
      </view>
      <text class="loading-text">{{ text }}</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import SvgIcon from '@/components/common/SvgIcon.vue';

interface Props {
  text?: string;
}

withDefaults(defineProps<Props>(), {
  text: '正在思考',
});
</script>

<style lang="scss" scoped>
.loading-wrapper {
  @include flex(row, flex-start, center);
  gap: $spacing-sm;
  margin-bottom: $spacing-md;
}

.avatar {
  @include flex-center;
  flex-shrink: 0;
  width: 72rpx;
  height: 72rpx;
  background: linear-gradient(135deg, $color-brand-primary, $color-brand-hover);
  border-radius: $radius-circle;
  box-shadow: 0 2rpx 8rpx rgba($color-brand-primary, 0.3);
}

.loading-card {
  @include flex(row, flex-start, center);
  gap: $spacing-sm;
  padding: $spacing-md $spacing-base;
  background-color: $color-bg-card;
  border-radius: $radius-md;
  border: 2rpx solid $color-border;
  border-bottom-left-radius: $radius-sm;
  box-shadow: $shadow-sm;
}

.loading-dots {
  @include flex(row, center, center);
  gap: $spacing-xs;
}

.dot {
  width: $loading-dot-size;
  height: $loading-dot-size;
  background: linear-gradient(135deg, $color-brand-primary, $color-brand-light);
  border-radius: $radius-circle;
  animation: bounce 1.4s infinite ease-in-out both;

  &:nth-child(1) { animation-delay: -0.32s; }
  &:nth-child(2) { animation-delay: -0.16s; }
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