/**
 * ============================================
 * 设置页 - 个人中心
 * ============================================
 * 用户个人信息展示、持仓总览、功能菜单入口
 *
 * 页面结构：
 * - 顶部：用户头像 + 昵称 + 操作按钮（通知、更多）
 * - 我的持仓卡片：持仓金额展示
 * - 功能菜单列表：新闻订阅、风险画像测评、意见反馈
 * - 底部导航：TabBar 组件
 *
 * 设计风格：
 * - 背景色：$color-bg-primary（温暖米色）
 * - 卡片背景：$color-bg-card，边框 $color-border-card
 * - 头像背景：$color-brand-bg（浅琥珀色）
 * - 强调色：$color-brand-primary（琥珀棕）
 */

<template>
  <view class="page-container">
    <scroll-view class="page-scroll" scroll-y>
      <!-- ==================== 用户信息头部 ==================== -->
      <view class="user-header">
        <view class="header-content">
          <!-- 左侧：头像 + 昵称 -->
          <view class="user-info-section">
            <!-- 头像：圆形，浅琥珀色背景，昵称首字 -->
            <view class="avatar">
              <text class="avatar-text">{{ userStore.userInfo.nickname.charAt(0) }}</text>
            </view>
            <!-- 用户名 + 欢迎文案 -->
            <view class="user-text-group">
              <text class="username">{{ userStore.userInfo.nickname }}</text>
              <text class="welcome-text">欢迎回来</text>
            </view>
          </view>
          <!-- 右侧：操作图标 -->
          <view class="header-actions">
            <!-- 通知按钮 -->
            <view class="action-icon-wrap" @tap="handleNotification">
              <SvgIcon name="bell" size="44rpx" color="primary" />
            </view>
            <!-- 更多按钮 -->
            <view class="action-icon-wrap" @tap="handleMore">
              <SvgIcon name="more-horizontal" size="44rpx" color="primary" />
            </view>
          </view>
        </view>
      </view>

      <!-- ==================== 主要内容区域 ==================== -->
      <view class="main-content">
        <!-- 我的持仓卡片 -->
        <view class="holdings-card" @tap="handleHoldingsClick">
          <view class="card-title-row">
            <SvgIcon name="briefcase" size="36rpx" color="primary" />
            <text class="card-title">我的持仓</text>
          </view>
          <view class="amount-section">
            <text class="amount-value">{{ holdingsAmount }}</text>
            <text class="amount-unit">元</text>
          </view>
        </view>

        <!-- 菜单列表 -->
        <view class="menu-group">
          <!-- 新闻订阅菜单项 -->
          <view class="menu-card" @tap="handleNewsClick">
            <view class="menu-left">
              <view class="menu-icon-box">
                <SvgIcon name="file-text" size="36rpx" color="brand" />
              </view>
              <text class="menu-text">新闻订阅</text>
            </view>
            <view class="menu-right">
              <SvgIcon name="chevron-right" size="32rpx" color="tertiary" />
            </view>
          </view>

          <!-- 分割线 -->
          <view class="menu-divider"></view>

          <!-- 风险画像测评菜单项 -->
          <view class="menu-card" @tap="handleRiskClick">
            <view class="menu-left">
              <view class="menu-icon-box">
                <SvgIcon name="clipboard" size="36rpx" color="brand" />
              </view>
              <text class="menu-text">风险画像测评</text>
            </view>
            <view class="menu-right">
              <text v-if="!userStore.userInfo.hasRiskAssessment" class="menu-tag">去测评</text>
              <text v-else class="menu-tag menu-tag--done">已测评</text>
              <SvgIcon name="chevron-right" size="32rpx" color="tertiary" />
            </view>
          </view>

          <!-- 分割线 -->
          <view class="menu-divider"></view>

          <!-- 意见反馈菜单项 -->
          <view class="menu-card" @tap="handleFeedbackClick">
            <view class="menu-left">
              <view class="menu-icon-box">
                <SvgIcon name="message-square" size="36rpx" color="brand" />
              </view>
              <text class="menu-text">意见反馈</text>
            </view>
            <view class="menu-right">
              <SvgIcon name="chevron-right" size="32rpx" color="tertiary" />
            </view>
          </view>
        </view>
      </view>

      <!-- 底部占位，防止内容被 TabBar 遮挡 -->
      <view class="scroll-placeholder"></view>
    </scroll-view>

    <!-- ==================== 底部导航栏 ==================== -->
    <TabBar active="settings" />
  </view>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import TabBar from '@/components/common/TabBar.vue';
import SvgIcon from '@/components/common/SvgIcon.vue';
import { useUserStore } from '@/stores/user';

// ==================== Store ====================

/** 用户状态 Store */
const userStore = useUserStore();

// ==================== 状态定义 ====================

/** 持仓金额（模拟数据，实际从 API 获取） */
const holdingsAmountValue = ref<number>(186500);

/** 格式化后的持仓金额 */
const holdingsAmount = computed(() => {
  return holdingsAmountValue.value.toLocaleString('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
});

// ==================== 生命周期 ====================

/**
 * 页面初始化
 * @description 恢复用户登录状态
 */
function init() {
  userStore.initAuth();
  console.log('[SettingsPage] 页面初始化，用户:', userStore.userInfo.nickname);
}

// 页面创建时初始化
init();

// ==================== 事件处理函数 ====================

/**
 * 通知按钮点击
 * @description 打开通知中心（功能待开发）
 */
function handleNotification() {
  console.log('[SettingsPage] 点击通知');
  uni.showToast({ title: '暂无新通知', icon: 'none' });
}

/**
 * 更多操作按钮点击
 * @description 弹出操作菜单（功能待开发）
 */
function handleMore() {
  console.log('[SettingsPage] 点击更多操作');
  uni.showToast({ title: '更多功能开发中', icon: 'none' });
}

/**
 * 持仓卡片点击
 * @description 跳转到持仓详情（自选页-持仓Tab）
 */
function handleHoldingsClick() {
  console.log('[SettingsPage] 点击持仓卡片');
  uni.switchTab({ url: '/pages/watchlist/index' });
}

/**
 * 新闻订阅点击
 * @description 进入新闻订阅管理页面
 */
function handleNewsClick() {
  console.log('[SettingsPage] 点击新闻订阅');
  uni.showToast({ title: '新闻订阅功能开发中', icon: 'none' });
}

/**
 * 风险画像测评点击
 * @description 进入风险测评页面
 */
function handleRiskClick() {
  console.log('[SettingsPage] 点击风险画像测评');
  uni.navigateTo({ url: '/pages/risk-assessment/index' });
}

/**
 * 意见反馈点击
 * @description 进入意见反馈页面
 */
function handleFeedbackClick() {
  console.log('[SettingsPage] 点击意见反馈');
  uni.showToast({ title: '意见反馈功能开发中', icon: 'none' });
}
</script>

<style lang="scss" scoped>
/* ==================== 页面容器 ==================== */
.page-container {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background-color: $color-bg-primary;
  overflow: hidden;
}

.page-scroll {
  flex: 1;
  min-height: 0;
}

/* ==================== 用户信息头部 ==================== */
.user-header {
  padding: $spacing-xl $spacing-base $spacing-lg;
}

.header-content {
  @include flex(row, space-between, center);
}

.user-info-section {
  @include flex(row, flex-start, center);
  gap: $spacing-base;
}

/* 头像：圆形，浅琥珀色背景，白色昵称首字 */
.avatar {
  @include flex-center;
  width: 120rpx;
  height: 120rpx;
  background: linear-gradient(135deg, $color-brand-primary, $color-brand-hover);
  border-radius: $radius-circle;
  box-shadow: 0 4rpx 12rpx rgba($color-brand-primary, 0.3);
}

.avatar-text {
  font-size: $font-size-3xl;
  font-weight: $font-weight-bold;
  color: $color-text-white;
}

/* 用户文字组 */
.user-text-group {
  @include flex(column, center, flex-start);
  gap: $spacing-xs;
}

.username {
  font-size: $font-size-3xl;
  font-weight: $font-weight-semibold;
  color: $color-text-primary;
  letter-spacing: 0.5rpx;
}

.welcome-text {
  font-size: $font-size-sm;
  color: $color-text-tertiary;
}

/* 操作图标区域 */
.header-actions {
  @include flex(row, flex-end, center);
  gap: $spacing-sm;
}

.action-icon-wrap {
  @include flex-center;
  width: 80rpx;
  height: 80rpx;
  background-color: $color-bg-card;
  border-radius: $radius-circle;
  box-shadow: $shadow-sm;
  transition: all $transition-fast $ease-in-out;

  &:active {
    opacity: 0.7;
    transform: scale(0.92);
  }
}

/* ==================== 主要内容区域 ==================== */
.main-content {
  @include flex(column, flex-start, stretch);
  gap: $spacing-md;
  padding: 0 $spacing-base;
}

/* ==================== 持仓卡片 ==================== */
.holdings-card {
  @include card;
  padding: $card-padding;
  box-shadow: $shadow-base;
  transition: all $transition-base $ease-out;

  &:active {
    opacity: 0.9;
    transform: scale(1.01);
  }
}

.card-title-row {
  @include flex(row, flex-start, center);
  gap: $spacing-sm;
}

.card-title {
  font-size: $font-size-lg;
  font-weight: $font-weight-medium;
  color: $color-text-primary;
}

/* 金额区域：数字 + 单位 */
.amount-section {
  @include flex(row, flex-end, baseline);
  gap: $spacing-sm;
  margin-top: $spacing-sm;
}

.amount-value {
  font-size: $font-size-4xl;
  font-weight: $font-weight-bold;
  color: $color-text-primary;
  letter-spacing: 1rpx;
}

.amount-unit {
  font-size: $font-size-xl;
  color: $color-text-tertiary;
}

/* ==================== 菜单组 ==================== */
.menu-group {
  @include card;
  padding: 0;
  overflow: hidden;
}

/* 菜单卡片（紧凑型） */
.menu-card {
  @include flex(row, space-between, center);
  padding: $spacing-base $card-padding;
  transition: all $transition-fast $ease-in-out;

  &:active {
    opacity: 0.8;
    background-color: $color-bg-primary;
  }
}

.menu-left {
  @include flex(row, flex-start, center);
  gap: $spacing-base;
}

/* 菜单图标容器：圆角方形琥珀背景 */
.menu-icon-box {
  @include flex-center;
  width: 72rpx;
  height: 72rpx;
  background-color: $color-brand-bg;
  border-radius: $radius-base;
}

.menu-text {
  font-size: $font-size-lg;
  font-weight: $font-weight-medium;
  color: $color-text-primary;
}

.menu-right {
  @include flex(row, flex-end, center);
  gap: $spacing-sm;
}

/* 操作标签文字 */
.menu-tag {
  font-size: $font-size-sm;
  color: $color-brand-primary;
  font-weight: $font-weight-medium;
}

.menu-tag--done {
  color: $color-text-tertiary;
}

/* 分割线 */
.menu-divider {
  height: 2rpx;
  background-color: $color-border-light;
  margin: 0 $spacing-base;
}

/* ==================== 底部占位 ==================== */
.scroll-placeholder {
  height: 240rpx;
}
</style>
