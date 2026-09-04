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
  margin-bottom: $spacing-md;
  /* 小程序适配：gap 替换为 margin */
  .avatar + .loading-card {
    margin-left: $spacing-sm;
  }
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
  padding: $spacing-md $spacing-base;
  background-color: $color-bg-card;
  border-radius: $radius-md;
  border: 2rpx solid $color-border;
  border-bottom-left-radius: $radius-sm;
  box-shadow: $shadow-sm;
  /* 小程序适配：gap 替换为 margin */
  .loading-dots + .loading-text {
    margin-left: $spacing-sm;
  }
}

.loading-dots {
  @include flex(row, center, center);
  /* 小程序适配：gap 替换为 margin */
  .dot + .dot {
    margin-left: $spacing-xs;
  }
}

.dot {
  width: $loading-dot-size;
  height: $loading-dot-size;
  background: linear-gradient(135deg, $color-brand-primary, $color-brand-light);
  border-radius: $radius-circle;
  /* 小程序适配：简化为静态透明度渐变，不使用 @keyframes（兼容性问题） */
  &:nth-child(1) { opacity: 0.5; }
  &:nth-child(2) { opacity: 0.75; }
  &:nth-child(3) { opacity: 1; }
}

.loading-text {
  font-size: $font-size-sm;
  color: $color-text-secondary;
}
</style>