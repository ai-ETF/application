/**
 * ============================================
 * 聊天顶部栏组件
 * ============================================
 * 聊天页面的顶部导航栏
 *
 * 结构：
 * - 左侧：菜单按钮 + 标题区域
 * - 右侧：操作按钮（电话、投屏）
 */
<template>
  <view class="top-bar">
    <!-- 左侧：菜单按钮 + 标题 -->
    <view class="left-area">
      <view class="menu-btn" @tap="handleMenuClick">
        <SvgIcon name="menu" size="48rpx" color="primary" />
      </view>
      <view class="title-area">
        <text class="main-title">{{ title }}</text>
        <text class="sub-title">{{ subtitle }}</text>
      </view>
    </view>

    <!-- 右侧：操作按钮 -->
    <view class="action-btn">
      <SvgIcon name="phone" size="40rpx" color="primary" @tap="handlePhoneClick" />
      <SvgIcon name="cast" size="40rpx" color="primary" @tap="handleCastClick" />
    </view>
  </view>
</template>

<script setup lang="ts">
import SvgIcon from '@/components/common/SvgIcon.vue';

/**
 * 组件属性
 */
interface Props {
  /** 主标题 */
  title?: string;
  /** 副标题 */
  subtitle?: string;
}

withDefaults(defineProps<Props>(), {
  title: '小E',
  subtitle: '您的ETF投资助手',
});

/**
 * 组件事件
 */
const emit = defineEmits<{
  (e: 'menu'): void;
  (e: 'phone'): void;
  (e: 'cast'): void;
}>();

function handleMenuClick() {
  emit('menu');
}

function handlePhoneClick() {
  emit('phone');
}

function handleCastClick() {
  emit('cast');
}
</script>

<style lang="scss" scoped>
.top-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: $spacing-base $spacing-lg;
  background-color: $color-bg-primary;
}

.left-area {
  display: flex;
  align-items: center;
  gap: $spacing-base;
}

.menu-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: $btn-icon-size;
  height: $btn-icon-size;
  background-color: $color-bg-secondary;
  border-radius: $radius-lg;
  border: 2rpx solid $color-border;

  &:active {
    opacity: 0.8;
    transform: scale(0.98);
  }
}

.title-area {
  display: flex;
  flex-direction: column;
  gap: $spacing-xs;
}

.main-title {
  font-size: $font-size-2xl;
  font-weight: $font-weight-bold;
  color: $color-text-primary;
  letter-spacing: 0.5rpx;
}

.sub-title {
  font-size: $font-size-base;
  color: $color-text-secondary;
}

.action-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: $spacing-md;
  height: $action-btn-height;
  padding: 0 $spacing-base;
  background-color: $color-bg-secondary;
  border-radius: $radius-full;
  border: 2rpx solid $color-border;

  &:active {
    opacity: 0.8;
  }
}
</style>