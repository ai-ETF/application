/**
 * ============================================
 * 底部导航栏组件 TabBar.vue
 * ============================================
 * 固定在页面底部的导航栏， * 设计稿参考：各页面的 NavBar 组件
 *
 * Tab 列表：
 * - 问小E（search 图标）
 * - 自选（bookmark 图标）
 * - 温度（thermometer 图标）
 * - 我的（users 图标）
 *
 * 设计风格：
 * - 背景色： #F9F6F0（与页面背景一致）
 * - 激活状态：图标有灰色圆形背景 (#E8E8E8)
 * - 文字颜色：激活 #000000，未激活 #999999
 */
<template>
  <view class="tab-bar">
    <!-- 问小E Tab -->
    <view
      class="tab-item"
      :class="{ 'tab-item--active': activeKey === 'chat' }"
      @tap="handleTabClick('chat')"
    >
      <view class="tab-icon" :class="{ 'tab-icon--active': activeKey === 'chat' }">
        <SvgIcon name="search" size="40rpx" :color="activeKey === 'chat' ? 'active' : 'secondary'" />
      </view>
      <text class="tab-label">问小E</text>
    </view>

    <!-- 自选 Tab -->
    <view
      class="tab-item"
      :class="{ 'tab-item--active': activeKey === 'watchlist' }"
      @tap="handleTabClick('watchlist')"
    >
      <view class="tab-icon-bg" :class="{ 'tab-icon-bg--active': activeKey === 'watchlist' }">
        <SvgIcon name="bookmark" size="40rpx" :color="activeKey === 'watchlist' ? 'active' : 'secondary'" />
      </view>
      <text class="tab-label">自选</text>
    </view>

    <!-- 温度 Tab -->
    <view
      class="tab-item"
      :class="{ 'tab-item--active': activeKey === 'temperature' }"
      @tap="handleTabClick('temperature')"
    >
      <view class="tab-icon" :class="{ 'tab-icon--active': activeKey === 'temperature' }">
        <SvgIcon name="thermometer" size="40rpx" :color="activeKey === 'temperature' ? 'active' : 'secondary'" />
      </view>
      <text class="tab-label">温度</text>
    </view>

    <!-- 我的 Tab -->
    <view
      class="tab-item"
      :class="{ 'tab-item--active': activeKey === 'settings' }"
      @tap="handleTabClick('settings')"
    >
      <view class="tab-icon-bg" :class="{ 'tab-icon-bg--active': activeKey === 'settings' }">
        <SvgIcon name="user" size="40rpx" :color="activeKey === 'settings' ? 'active' : 'secondary'" />
      </view>
      <text class="tab-label">我的</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import SvgIcon from './SvgIcon.vue';
import type { ActiveTab } from '@/types/models.d';

/**
 * 组件属性
 * @property {ActiveTab} active - 当前激活的 Tab 标识
 */
interface Props {
  active: ActiveTab;
}

const props = defineProps<Props>();

/**
 * 组件事件
 * @event change - Tab 切换时触发，返回新的 Tab 标识
 */
const emit = defineEmits<{
  (e: 'change', tab: ActiveTab): void;
}>();

/**
 * 计算当前激活的 Tab Key
 */
const activeKey = computed(() => props.active);

/**
 * Tab 点击处理
 * @description 处理 Tab 切换逻辑，触发路由跳转
 * @param {ActiveTab} tab - 被点击的 Tab 标识
 */
function handleTabClick(tab: ActiveTab) {
  console.log(`[TabBar] Tab 点击: ${tab}`);

  // 如果点击的是当前激活的 Tab，不做处理
  if (tab === activeKey.value) {
    console.log(`[TabBar] 当前已在此 Tab，跳过切换`);
    return;
  }

  // 触发 change 事件
  emit('change', tab);

  // 根据不同的 Tab 进行页面跳转
  switch (tab) {
    case 'chat':
      uni.redirectTo({ url: '/pages/index/index' });
      break;
    case 'watchlist':
      uni.redirectTo({ url: '/pages/watchlist/index' });
      break;
    case 'temperature':
      // 温度页面暂未实现
      uni.showToast({
        title: '温度功能开发中',
        icon: 'none',
      });
      break;
    case 'settings':
      uni.redirectTo({ url: '/pages/settings/index' });
      break;
  }
}
</script>

<style lang="scss" scoped>
/* ==================== 导航栏容器 ==================== */
.tab-bar {
  flex-shrink: 0;
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  align-items: center;
  width: 100%;
  max-width: 100%;
  height: 120rpx;
  background-color: $color-bg-primary;
  box-sizing: border-box;
}

/* ==================== Tab 项 ==================== */
.tab-item {
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all $transition-fast ease;
}

/* 小程序不支持 gap，使用相邻选择器实现图标与文字的间距 */
.tab-icon + .tab-label,
.tab-icon-bg + .tab-label {
  margin-top: $spacing-sm;
}

/* Tab 标签文字 */
.tab-label {
  font-size: $font-size-sm;
  font-weight: $font-weight-normal;
  color: $color-text-tertiary;
  text-align: center;
}

/* 激活状态下的 Tab 标签 */
.tab-item--active {
  .tab-label {
    color: $color-text-primary;
    font-weight: $font-weight-medium;
  }
}

/* ==================== Tab 图标 ==================== */
/* 所有图标统一固定尺寸容器，保证四个 Tab 图标中心对齐 */
.tab-icon,
.tab-icon-bg {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 80rpx;
  height: 80rpx;
  flex-shrink: 0;
}

/* 带圆形背景的图标 */
.tab-icon-bg {
  border-radius: $radius-circle;
  background-color: transparent;
}

/* 激活状态下的图标背景 */
.tab-icon-bg--active {
  background-color: $color-brand-bg;
}
</style>
