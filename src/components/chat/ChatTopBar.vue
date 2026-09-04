/**
 * ============================================
 * 聊天顶部栏组件 — 重构版
 * ============================================
 * 暖琥珀色系，呼应品牌调性
 * 左侧菜单+标题，右侧快捷操作
 */

<template>
  <view class="top-bar" :style="{ paddingTop: statusBarHeight + 'px' }">
    <!-- 左侧：菜单按钮 + 品牌区域 -->
    <view class="left-area">
      <!-- 菜单按钮 — 毛玻璃卡牌风格 -->
      <view class="menu-btn" @tap="handleMenuClick">
        <view class="menu-btn__inner">
          <view class="menu-icon-bar" />
          <view class="menu-icon-bar menu-icon-bar--short" />
          <view class="menu-icon-bar menu-icon-bar--shortest" />
        </view>
      </view>

      <!-- 品牌区：Logo + 文字 -->
      <view class="brand-area">
        <!-- AI 图标点缀 -->
        <view class="brand-icon-wrap">
          <SvgIcon name="bot" size="36rpx" color="white" />
        </view>
        <view class="brand-text-area">
          <view class="brand-title-row">
            <text class="brand-title">小E</text>
            <view class="brand-badge">AI</view>
          </view>
          <view class="status-row">
            <view class="status-dot" />
            <text class="status-text">在线 · 投资助手</text>
          </view>
        </view>
      </view>
    </view>

    <!-- 右侧：操作按钮组 -->
    <view class="right-actions">
      <!-- 新会话（脑洞/灵感） -->
      <view class="action-btn" @tap="handleNewChatClick">
        <SvgIcon name="plus" size="36rpx" color="primary" />
      </view>

      <!-- 电话 -->
      <view class="action-btn" @tap="handlePhoneClick">
        <SvgIcon name="phone" size="36rpx" color="primary" />
      </view>

      <!-- 投屏 -->
      <view class="action-btn" @tap="handleCastClick">
        <SvgIcon name="cast" size="36rpx" color="primary" />
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import SvgIcon from '@/components/common/SvgIcon.vue';
import { useSystemInfo } from '@/composables/useSystemInfo';

/** 状态栏高度，用于自定义导航栏的顶部 padding */
const { statusBarHeight } = useSystemInfo();

defineProps<{
  /** 当前会话标题（可选） */
  title?: string;
}>();

const emit = defineEmits<{
  (e: 'menu'): void;
  (e: 'new-chat'): void;
  (e: 'phone'): void;
  (e: 'cast'): void;
}>();

function handleMenuClick() { emit('menu'); }
function handleNewChatClick() { emit('new-chat'); }
function handlePhoneClick() { emit('phone'); }
function handleCastClick() { emit('cast'); }
</script>

<style lang="scss" scoped>
/* ============================================
 * 顶部栏容器 — 暖琥珀渐变底
 * ============================================ */
.top-bar {
  flex-shrink: 0;
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  max-width: 100%;
  min-width: 0;
  padding-bottom: $spacing-sm;
  padding-left: $spacing-base;
  padding-right: $spacing-base;
  position: relative;
  z-index: 10;
  box-sizing: border-box;

  /* 纯色背景，与页面一致 */
  background-color: $color-bg-primary;

  /* 注意：底部精细分隔线（渐隐效果）已移除，小程序不支持 ::after 伪元素 */
}

/* ============================================
 * 左侧区域
 * ============================================ */
.left-area {
  display: flex;
  flex-direction: row;
  align-items: center;
  flex-shrink: 1;
  min-width: 0;
  .menu-btn + .brand-area { margin-left: $spacing-md; }
}

/* ============================================
 * 菜单按钮 — 琥珀暖调卡片
 * ============================================ */
.menu-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 88rpx;
  height: 88rpx;
  background: linear-gradient(135deg, $color-bg-card, $color-bg-primary);
  border-radius: 24rpx;
  border: 2rpx solid rgba($color-border, 0.6);
  box-shadow:
    0 2rpx 8rpx rgba($color-brand-primary, 0.06),
    inset 0 1rpx 0 rgba(255, 255, 255, 0.6);
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);

  /* 注意：&:active 点击反馈已移除，小程序不支持该伪类 */
}

.menu-btn__inner {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: 40rpx;
  height: 40rpx;
}

/* 三条横线 — 非对称设计 */
.menu-icon-bar {
  width: 100%;
  height: 4rpx;
  background: linear-gradient(90deg, $color-brand-primary, $color-brand-light);
  border-radius: 4rpx;
  transition: all 0.2s ease;
}

.menu-icon-bar--short {
  width: 66%;
  align-self: flex-start;
}

.menu-icon-bar--shortest {
  width: 80%;
  align-self: flex-end;
}

.menu-icon-bar + .menu-icon-bar { margin-top: 7rpx; }

/* ============================================
 * 品牌区域 — Logo + 小E文字
 * ============================================ */
.brand-area {
  display: flex;
  flex-direction: row;
  align-items: center;
  .brand-icon-wrap + .brand-text-area { margin-left: $spacing-sm; }
}

/* AI 图标外圈 — 琥珀渐变圆 */
.brand-icon-wrap {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 64rpx;
  height: 64rpx;
  background: linear-gradient(135deg, $color-brand-primary, $color-brand-hover);
  border-radius: 18rpx;
  box-shadow: 0 4rpx 12rpx rgba($color-brand-primary, 0.25);
  /* 注意：发光光晕（::after 伪元素）已移除，小程序不支持 */
}

.brand-text-area {
  display: flex;
  flex-direction: column;
  .brand-title-row + .status-row { margin-top: 4rpx; }
}

.brand-title-row {
  display: flex;
  flex-direction: row;
  align-items: center;
  .brand-title + .brand-badge { margin-left: $spacing-xs; }
}

.brand-title {
  font-size: $font-size-2xl;
  font-weight: $font-weight-bold;
  color: $color-text-primary;
  letter-spacing: 1rpx;
  line-height: 1.2;
}

.brand-badge {
  font-size: 18rpx;
  font-weight: $font-weight-semibold;
  color: $color-brand-primary;
  background: rgba($color-brand-primary, 0.1);
  padding: 2rpx 10rpx;
  border-radius: 8rpx;
  letter-spacing: 0.5rpx;
  line-height: 1.4;
}

.status-row {
  display: flex;
  flex-direction: row;
  align-items: center;
  .status-dot + .status-text { margin-left: $spacing-xs; }
}

.status-dot {
  width: 10rpx;
  height: 10rpx;
  background: linear-gradient(135deg, #22C55E, #16A34A);
  border-radius: 50%;
  box-shadow: 0 0 8rpx rgba(#22C55E, 0.5);
  /* 动画已移除，小程序对 keyframes 支持有限，使用静态透明度 */
  opacity: 1;
}

.status-text {
  font-size: $font-size-xs;
  color: $color-text-tertiary;
  letter-spacing: 0.5rpx;
}

/* ============================================
 * 右侧操作按钮组
 * ============================================ */
.right-actions {
  flex-shrink: 0;
  display: flex;
  flex-direction: row;
  align-items: center;
  .action-btn + .action-btn { margin-left: $spacing-xs; }
}

.action-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 80rpx;
  height: 80rpx;
  border-radius: 20rpx;
  background: $color-bg-card;
  border: 2rpx solid rgba($color-border, 0.4);
  box-shadow: 0 2rpx 6rpx rgba($color-brand-primary, 0.04);
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);

  /* 注意：&:active 点击反馈已移除，小程序不支持该伪类 */
}
</style>