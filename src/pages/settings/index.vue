/**
 * ============================================
 * 设置页 - 个人中心
 * ============================================
 * 用户个人信息展示、持仓总览、功能菜单入口
 * 设计稿参考：pencil/center.pen
 *
 * 页面结构：
 * - 顶部：用户头像 + 昵称 + 操作按钮（通知、更多）
 * - 我的持仓卡片：持仓金额展示
 * - 功能菜单列表：新闻订阅、风险画像测评、意见反馈
 * - 底部导航：TabBar 组件
 *
 * 设计风格：
 * - 背景色：#F9F6F0（温暖米色）
 * - 卡片背景：#FFFFFF，边框 #E8E3DA
 * - 头像背景：#EFEAE2，图标色 #C07A4A
 * - 强调色：#C07A4A（橙棕色）
 * - 箭头色：#BFB7AC
 */
<template>
  <view class="page-container">
    <scroll-view class="page-scroll" scroll-y>
      <!-- ==================== 用户信息头部 ==================== -->
      <view class="user-header">
        <view class="header-content">
          <!-- 左侧：头像 + 昵称 -->
          <view class="user-info-section">
            <!-- 头像：60x60pt，圆形，浅米色背景 -->
            <view class="avatar">
              <text class="avatar-icon">👤</text>
            </view>
            <!-- 用户昵称 -->
            <text class="username">{{ userStore.userInfo.nickname }}</text>
          </view>
          <!-- 右侧：操作图标 -->
          <view class="header-actions">
            <!-- 通知按钮 -->
            <text class="action-icon" @tap="handleNotification">🔔</text>
            <!-- 更多按钮 -->
            <text class="action-icon" @tap="handleMore">⋯</text>
          </view>
        </view>
      </view>

      <!-- ==================== 主要内容区域 ==================== -->
      <view class="main-content">
        <!-- 我的持仓卡片 -->
        <view class="holdings-card" @tap="handleHoldingsClick">
          <text class="card-title">我的持仓</text>
          <view class="amount-section">
            <text class="amount-value">{{ holdingsAmount }}</text>
            <text class="amount-unit">元</text>
          </view>
        </view>

        <!-- 新闻订阅菜单项 -->
        <view class="menu-card" @tap="handleNewsClick">
          <view class="menu-left">
            <text class="menu-icon">📊</text>
            <text class="menu-text">新闻订阅</text>
          </view>
          <text class="menu-arrow">→</text>
        </view>

        <!-- 风险画像测评菜单项 -->
        <view class="menu-card" @tap="handleRiskClick">
          <view class="menu-left">
            <text class="menu-icon">📝</text>
            <text class="menu-text">风险画像测评</text>
          </view>
          <view class="menu-right">
            <text class="menu-action">去测评</text>
            <text class="menu-action-arrow">→</text>
          </view>
        </view>

        <!-- 意见反馈菜单项 -->
        <view class="menu-card" @tap="handleFeedbackClick">
          <view class="menu-left">
            <text class="menu-icon">💬</text>
            <text class="menu-text">意见反馈</text>
          </view>
          <text class="menu-arrow">→</text>
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
import { useUserStore } from '@/stores/user';

// ==================== Store ====================

/** 用户状态 Store */
const userStore = useUserStore();

// ==================== 状态定义 ====================

/** 持仓金额（模拟数据，实际从 API 获取） */
const holdingsAmountValue = ref<number>(0);

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

  // TODO: 实际项目中从 API 获取持仓金额
  // fetchHoldingsAmount();
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
 * @description 进入风险测评页面或显示已完成提示
 */
function handleRiskClick() {
  console.log('[SettingsPage] 点击风险画像测评');
  if (userStore.userInfo.hasRiskAssessment) {
    uni.showToast({ title: '您已完成风险测评', icon: 'none' });
  } else {
    uni.showToast({ title: '风险测评功能开发中', icon: 'none' });
  }
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
  background-color: #F9F6F0;
}

.page-scroll {
  flex: 1;
  overflow: hidden;
}

/* ==================== 用户信息头部 ==================== */
.user-header {
  padding: 48rpx 32rpx;
}

.header-content {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.user-info-section {
  display: flex;
  align-items: center;
  gap: 32rpx;
}

/* 头像：60x60pt，圆形，浅米色背景，橙棕色图标 */
.avatar {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 120rpx;
  height: 120rpx;
  background-color: #EFEAE2;
  border-radius: 50%;
}

.avatar-icon {
  font-size: 48rpx;
  text-align: center;
}

/* 用户昵称 */
.username {
  font-size: 48rpx;
  font-weight: 600;
  color: #1A1A1A;
  letter-spacing: 0.5rpx;
}

/* 操作图标区域 */
.header-actions {
  display: flex;
  align-items: center;
  gap: 32rpx;
}

.action-icon {
  font-size: 48rpx;
  color: #1A1A1A;

  &:active {
    opacity: 0.7;
  }
}

/* ==================== 主要内容区域 ==================== */
.main-content {
  display: flex;
  flex-direction: column;
  gap: 32rpx;
  padding: 0 32rpx;
}

/* ==================== 持仓卡片 ==================== */
.holdings-card {
  display: flex;
  flex-direction: column;
  gap: 32rpx;
  background-color: #FFFFFF;
  border-radius: 32rpx;
  padding: 40rpx;
  border: 2rpx solid #E8E3DA;
  transition: all 0.2s ease;

  &:active {
    opacity: 0.9;
    transform: scale(1.01);
  }
}

.card-title {
  font-size: 40rpx;
  font-weight: 500;
  color: #1A1A1A;
}

/* 金额区域：数字 + 单位 */
.amount-section {
  display: flex;
  justify-content: flex-end;
  align-items: baseline;
  gap: 16rpx;
}

.amount-value {
  font-size: 72rpx;
  font-weight: 700;
  color: #1A1A1A;
  letter-spacing: 1rpx;
}

.amount-unit {
  font-size: 36rpx;
  color: #8C857A;
}

/* ==================== 菜单卡片 ==================== */
.menu-card {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background-color: #FFFFFF;
  border-radius: 32rpx;
  padding: 40rpx;
  border: 2rpx solid #E8E3DA;
  transition: all 0.2s ease;

  &:active {
    opacity: 0.9;
    transform: scale(1.01);
  }
}

.menu-left {
  display: flex;
  align-items: center;
  gap: 32rpx;
}

/* 菜单图标：橙棕色 */
.menu-icon {
  font-size: 48rpx;
}

.menu-text {
  font-size: 36rpx;
  font-weight: 500;
  color: #1A1A1A;
}

.menu-right {
  display: flex;
  align-items: center;
  gap: 16rpx;
}

/* 操作文字：橙棕色强调 */
.menu-action {
  font-size: 32rpx;
  color: #C07A4A;
}

/* 操作箭头：橙棕色 */
.menu-action-arrow {
  font-size: 36rpx;
  color: #C07A4A;
}

/* 普通箭头：灰色 */
.menu-arrow {
  font-size: 36rpx;
  color: #BFB7AC;
}

/* ==================== 底部占位 ==================== */
.scroll-placeholder {
  height: 240rpx;
}
</style>
