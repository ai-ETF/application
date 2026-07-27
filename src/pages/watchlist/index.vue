/**
 * ============================================
 * 自选页 - 关注/持仓列表
 * ============================================
 * 展示用户关注的 ETF 列表和持仓信息
 *
 * 页面结构：
 * - 顶部 Tab 切换：关注 | 持仓
 * - 关注 Tab：搜索框 + ETF 列表卡片
 * - 持仓 Tab：资产总览卡片 + 持仓列表
 * - 底部导航：TabBar 组件
 *
 * 设计风格：
 * - 背景色：$color-bg-primary（温暖米色）
 * - 卡片背景：$color-bg-card
 * - 卡片边框：$color-border-card
 * - 涨：$color-up（红色）
 * - 跌：$color-down（绿色）
 */

<template>
  <view class="page-container">
    <!-- ==================== 顶部 Tab 切换 ==================== -->
    <view class="top-tab">
      <view
        class="tab-item"
        :class="{ 'tab-item--active': activeTab === 'follow' }"
        @tap="switchTab('follow')"
      >
        <text class="tab-text">关注</text>
        <view v-if="activeTab === 'follow'" class="tab-indicator"></view>
      </view>
      <view
        class="tab-item"
        :class="{ 'tab-item--active': activeTab === 'position' }"
        @tap="switchTab('position')"
      >
        <text class="tab-text">持仓</text>
        <view v-if="activeTab === 'position'" class="tab-indicator"></view>
      </view>
    </view>

    <!-- ==================== 关注列表内容 ==================== -->
    <view v-if="activeTab === 'follow'" class="content-area">
      <!-- 搜索框 -->
      <view class="search-section">
        <view class="search-bar">
          <SvgIcon name="search" size="36rpx" color="tertiary" />
          <input
            v-model="searchKeyword"
            class="search-input"
            type="text"
            placeholder="搜索 ETF 名称或代码"
            placeholder-class="search-placeholder"
          />
        </view>
      </view>

      <!-- 列表标题行 -->
      <view class="list-header">
        <text class="header-text header-name">标的</text>
        <text class="header-text header-trend">走势</text>
        <text class="header-text header-price">最新价</text>
        <text class="header-text header-ytd">涨跌幅</text>
      </view>

      <!-- ETF 列表（可滚动） -->
      <scroll-view class="list-scroll" scroll-y>
        <!-- 自选列表（无搜索关键词时） -->
        <view v-if="!hasKeyword" class="etf-list">
          <view
            v-for="item in followList"
            :key="item.etfCode"
            class="etf-item"
            @tap="handleEtfClick(item)"
            @longpress="handleLongPressRemove(item)"
          >
            <!-- 标的信息 -->
            <view class="etf-info">
              <text class="etf-name">{{ item.etfName }}</text>
              <view class="etf-meta">
                <view class="market-tag">{{ item.market }}</view>
                <text class="etf-code">{{ item.etfCode }}</text>
              </view>
            </view>

            <!-- 迷你走势图占位（待 P2 接入分时图） -->
            <view class="mini-chart">
              <text class="chart-placeholder">--</text>
            </view>

            <!-- 最新价格 -->
            <view class="price-section">
              <text class="etf-price">{{ formatPrice(item.latestPrice) }}</text>
            </view>

            <!-- 涨跌幅 -->
            <view class="ytd-section">
              <view class="ytd-badge" :class="item.changePercent >= 0 ? 'profit' : 'loss'">
                <text class="ytd-text">{{ formatChange(item.changePercent) }}</text>
              </view>
            </view>
          </view>
        </view>

        <!-- 搜索结果（有关键词时） -->
        <view v-else class="etf-list">
          <view
            v-for="item in searchResults"
            :key="item.code"
            class="etf-item"
          >
            <view class="etf-info">
              <text class="etf-name">{{ item.name }}</text>
              <view class="etf-meta">
                <view class="market-tag">{{ marketOf(item.code) }}</view>
                <text class="etf-code">{{ item.code }}</text>
              </view>
            </view>

            <view class="mini-chart">
              <text class="chart-placeholder">--</text>
            </view>

            <view class="price-section">
              <text class="etf-price">{{ formatPrice(item.price || 0) }}</text>
            </view>

            <view class="ytd-section">
              <!-- 未关注 → 显示添加按钮 -->
              <view
                v-if="!isFollowed(item.code)"
                class="add-btn"
                @tap="handleAdd(item)"
              >
                <text class="add-btn-text">+ 添加</text>
              </view>
              <!-- 已关注 → 置灰 -->
              <view v-else class="ytd-badge added-badge">
                <text class="ytd-text">已添加</text>
              </view>
            </view>
          </view>
        </view>

        <!-- 空状态 -->
        <view v-if="showEmpty" class="empty-state">
          <view class="empty-icon-box">
            <SvgIcon :name="hasKeyword ? 'search' : 'bookmark'" size="64rpx" color="tertiary" />
          </view>
          <text class="empty-text">{{ hasKeyword ? '未找到相关 ETF' : '暂无关注的 ETF' }}</text>
          <text class="empty-hint">{{ hasKeyword ? '换个关键词试试' : '搜索并添加您感兴趣的 ETF' }}</text>
        </view>

        <view class="scroll-bottom-placeholder"></view>
      </scroll-view>
    </view>

    <!-- ==================== 持仓列表内容 ==================== -->
    <view v-else class="content-area">
      <scroll-view class="list-scroll" scroll-y>
        <!-- 资产总览卡片 -->
        <view class="asset-card">
          <view class="card-header">
            <view class="card-title-row">
              <SvgIcon name="briefcase" size="36rpx" color="primary" />
              <text class="card-title">投资总金额</text>
            </view>
            <view class="header-actions">
              <view class="action-btn" @tap="handleAssetDiag">
                <SvgIcon name="thermometer" size="28rpx" color="secondary" />
                <text class="action-text">资产诊断</text>
              </view>
              <view class="action-btn" @tap="handleShare">
                <SvgIcon name="send" size="28rpx" color="secondary" />
                <text class="action-text">晒一晒</text>
              </view>
            </view>
          </view>

          <!-- 金额展示 -->
          <view class="amount-section">
            <text class="amount-value">¥ {{ totalAmount.toLocaleString() }}</text>
            <text class="amount-label">总资产</text>
          </view>

          <!-- 更新时间行 -->
          <view class="update-section">
            <SvgIcon name="clock" size="24rpx" color="tertiary" />
            <text class="update-text">数据更新于 {{ updateDate }}</text>
          </view>

          <!-- 收益统计行 -->
          <view class="earnings-row">
            <view class="earnings-item">
              <text class="earnings-value" :class="latestEarnings.amount >= 0 ? 'profit' : 'loss'">
                {{ latestEarnings.amount >= 0 ? '+' : '' }}{{ latestEarnings.amount.toLocaleString() }}
              </text>
              <text class="earnings-percent" :class="latestEarnings.percent >= 0 ? 'profit' : 'loss'">
                {{ latestEarnings.percent >= 0 ? '+' : '' }}{{ latestEarnings.percent }}%
              </text>
              <text class="earnings-label">最新收益</text>
            </view>
            <view class="earnings-divider"></view>
            <view class="earnings-item">
              <text class="earnings-value" :class="holdingEarnings.amount >= 0 ? 'profit' : 'loss'">
                {{ holdingEarnings.amount >= 0 ? '+' : '' }}{{ holdingEarnings.amount.toLocaleString() }}
              </text>
              <text class="earnings-percent" :class="holdingEarnings.percent >= 0 ? 'profit' : 'loss'">
                {{ holdingEarnings.percent >= 0 ? '+' : '' }}{{ holdingEarnings.percent }}%
              </text>
              <text class="earnings-label">持有收益</text>
            </view>
            <view class="earnings-divider"></view>
            <view class="earnings-item">
              <text class="earnings-value" :class="cumulativeEarnings.amount >= 0 ? 'profit' : 'loss'">
                {{ cumulativeEarnings.amount >= 0 ? '+' : '' }}{{ cumulativeEarnings.amount.toLocaleString() }}
              </text>
              <text class="earnings-percent" :class="cumulativeEarnings.percent >= 0 ? 'profit' : 'loss'">
                {{ cumulativeEarnings.percent >= 0 ? '+' : '' }}{{ cumulativeEarnings.percent }}%
              </text>
              <text class="earnings-label">累计收益</text>
            </view>
          </view>
        </view>

        <!-- 持仓列表标题 -->
        <view class="position-list-title">
          <SvgIcon name="clipboard" size="32rpx" color="primary" />
          <text class="title-text">持仓明细</text>
        </view>

        <!-- 持仓列表 -->
        <view class="position-list">
          <PositionItem
            v-for="item in positionList"
            :key="item.fundCode"
            :fund-name="item.fundName"
            :fund-code="item.fundCode"
            :holding-amount="item.holdingAmount"
            :holding-shares="item.holdingShares"
            :daily-profit="item.dailyProfit"
            :daily-profit-percent="item.dailyProfitPercent"
            :total-profit="item.totalProfit"
            :total-profit-percent="item.totalProfitPercent"
            :update-date="item.updateDate"
            @click="handlePositionClick"
          />
        </view>

        <!-- 空状态 -->
        <view v-if="positionList.length === 0" class="empty-state">
          <view class="empty-icon-box">
            <SvgIcon name="briefcase" size="64rpx" color="tertiary" />
          </view>
          <text class="empty-text">暂无持仓</text>
          <text class="empty-hint">开始您的 ETF 投资之旅</text>
        </view>

        <view class="scroll-bottom-placeholder"></view>
      </scroll-view>
    </view>

    <!-- ==================== 底部导航栏 ==================== -->
    <TabBar active="watchlist" />
  </view>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import TabBar from '@/components/common/TabBar.vue';
import SvgIcon from '@/components/common/SvgIcon.vue';
import PositionItem from '@/components/business/PositionItem.vue';
import { useWatchlistStore } from '@/stores/watchlist';
import type { WatchlistItem, HoldingItem } from '@/types/models.d';
import type { SearchResultRaw } from '@/api/types';

// ==================== Store ====================

const watchlistStore = useWatchlistStore();

// ==================== 状态定义 ====================

/** 当前激活的 Tab：follow(关注) | position(持仓) */
const activeTab = ref<'follow' | 'position'>('follow');

/** 搜索关键词（本地输入态，驱动 store 搜索） */
const searchKeyword = ref<string>('');

/** 持仓列表（模拟数据，待后续接入持仓接口） */
const positionList = ref<HoldingItem[]>([
  { fundName: '易方达科创50A (510300)', fundCode: '510300', holdingAmount: 50000, holdingShares: 45678.9, dailyProfit: 125, dailyProfitPercent: 0.25, totalProfit: 1250, totalProfitPercent: 2.5, updateDate: '2 月 27 日' },
  { fundName: '南方有色金属A (160526)', fundCode: '160526', holdingAmount: 30000, holdingShares: 28456.78, dailyProfit: -45, dailyProfitPercent: -0.15, totalProfit: 900, totalProfitPercent: 3.0, updateDate: '2 月 27 日' },
]);

/** 资产总金额 */
const totalAmount = ref<number>(245000);
/** 数据更新日期 */
const updateDate = ref<string>('2 月 27 日 15:30');
/** 最新收益 */
const latestEarnings = ref({ amount: 1235, percent: 0.52 });
/** 持有收益 */
const holdingEarnings = ref({ amount: 2456, percent: 1.08 });
/** 累计收益 */
const cumulativeEarnings = ref({ amount: 5678, percent: 2.34 });

// ==================== 计算属性 ====================

/** 自选列表（来自 store） */
const followList = computed(() => watchlistStore.followList);

/** 搜索结果（来自 store） */
const searchResults = computed(() => watchlistStore.searchResults);

/** 是否处于搜索态（有关键词） */
const hasKeyword = computed(() => searchKeyword.value.trim().length > 0);

/** 空状态展示条件 */
const showEmpty = computed(() => {
  if (hasKeyword.value) {
    // 搜索态：无结果且不在搜索中
    return searchResults.value.length === 0 && !watchlistStore.searching;
  }
  return followList.value.length === 0;
});

// ==================== 搜索（防抖 400ms） ====================

let searchTimer: ReturnType<typeof setTimeout> | null = null;

watch(searchKeyword, (kw) => {
  if (searchTimer) clearTimeout(searchTimer);

  // 关键词清空 → 退出搜索态，回到自选列表
  if (!kw.trim()) {
    watchlistStore.clearSearch();
    return;
  }

  // 防抖，避免每输入一个字符就请求
  searchTimer = setTimeout(() => {
    watchlistStore.searchEtf(kw.trim());
  }, 400);
});

// ==================== 生命周期 ====================

/**
 * 页面每次显示时刷新自选列表
 * @description 用 onShow 而非 onLoad，确保从详情页返回能拿到最新自选
 */
onShow(() => {
  if (activeTab.value === 'follow') {
    watchlistStore.fetchFollowList();
  }
});

// ==================== 方法 ====================

/**
 * 切换 Tab，切到关注时刷新列表
 */
function switchTab(tab: 'follow' | 'position') {
  activeTab.value = tab;
  if (tab === 'follow') {
    watchlistStore.fetchFollowList();
  }
  console.log(`[WatchlistPage] 切换 Tab: ${tab}`);
}

/** 格式化价格，缺失时显示 -- */
function formatPrice(price: number): string {
  return price ? price.toFixed(3) : '--';
}

/** 格式化涨跌幅，带正负号 */
function formatChange(value: number): string {
  const sign = value >= 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}%`;
}

/** 由代码推断市场标签（与 store 内 deriveMarket 一致） */
function marketOf(code: string): string {
  const c = code.trim();
  if (/^[56]/.test(c)) return '沪';
  if (/^[01]/.test(c)) return '深';
  return '';
}

/** 是否已关注（搜索结果用） */
function isFollowed(code: string): boolean {
  return watchlistStore.isFollowed(code);
}

/**
 * 点击搜索结果中的「添加」
 */
async function handleAdd(item: SearchResultRaw) {
  const ok = await watchlistStore.addToFollow(item.code);
  if (ok) {
    uni.showToast({ title: '已添加', icon: 'success' });
  }
}

/**
 * 点击自选项（详情页待 P2 接入）
 */
function handleEtfClick(item: WatchlistItem) {
  console.log(`[WatchlistPage] 点击 ETF: ${item.etfName} (${item.etfCode})`);
  uni.showToast({ title: `${item.etfName} 详情页开发中`, icon: 'none' });
}

/**
 * 长按自选项 → 确认移除
 */
function handleLongPressRemove(item: WatchlistItem) {
  uni.showModal({
    title: '移除自选',
    content: `确定移除「${item.etfName}」吗？`,
    confirmColor: '#DC2626',
    success: async (res) => {
      if (res.confirm) {
        const ok = await watchlistStore.removeFromFollow(item.etfCode);
        if (ok) {
          uni.showToast({ title: '已移除', icon: 'none' });
        }
      }
    },
  });
}

function handleAssetDiag() {
  console.log('[WatchlistPage] 点击资产诊断');
  uni.showToast({ title: '资产诊断功能开发中', icon: 'none' });
}

function handleShare() {
  console.log('[WatchlistPage] 点击晒一晒');
  uni.showToast({ title: '分享功能开发中', icon: 'none' });
}

function handlePositionClick(fundName: string) {
  console.log(`[WatchlistPage] 点击持仓: ${fundName}`);
}
</script>

<style lang="scss" scoped>
/* ==================== 页面容器 ==================== */
.page-container {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background-color: $color-bg-primary;
}

/* ==================== 顶部 Tab 样式 ==================== */
.top-tab {
  display: flex;
  height: 96rpx;
  background-color: $color-bg-primary;
  padding: 0 $spacing-xl;
  gap: $spacing-xl;
}

.tab-item {
  flex: 1;
  @include flex(column, center, center);
  position: relative;
  transition: all $transition-fast $ease-in-out;
}

.tab-text {
  font-size: $font-size-lg;
  font-weight: $font-weight-normal;
  color: $color-text-tertiary;
  transition: all $transition-fast $ease-in-out;
}

.tab-item--active .tab-text {
  font-weight: $font-weight-semibold;
  color: $color-text-primary;
}

.tab-indicator {
  position: absolute;
  bottom: 0;
  width: 48rpx;
  height: 4rpx;
  background-color: $color-text-primary;
  border-radius: 2rpx;
}

/* ==================== 内容区域 ==================== */
.content-area {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* ==================== 搜索框样式 ==================== */
.search-section {
  padding: $spacing-md $spacing-base $spacing-sm;
}

.search-bar {
  @include pill-button;
  gap: $spacing-sm;
  padding: 0 $spacing-base;
  border: 2rpx solid $color-border;
  box-shadow: $shadow-sm;
  transition: all $transition-fast $ease-in-out;

  &:focus-within {
    border-color: $color-brand-primary;
    box-shadow: 0 0 0 4rpx rgba($color-brand-primary, 0.1);
  }
}

.search-input {
  flex: 1;
  font-size: $font-size-base;
  color: $color-text-primary;
}

.search-placeholder {
  color: $color-text-tertiary;
}

/* ==================== 列表标题行 ==================== */
.list-header {
  @include flex(row, flex-start, center);
  padding: $spacing-sm $spacing-base;
  gap: 0;
}

.header-text {
  font-size: $font-size-xs;
  color: $color-text-tertiary;
  font-weight: $font-weight-medium;
}

.header-name {
  width: 200rpx;
}

.header-trend {
  width: 120rpx;
  text-align: center;
}

.header-price {
  width: 120rpx;
  text-align: right;
}

.header-ytd {
  width: 140rpx;
  text-align: right;
}

/* ==================== ETF 列表样式 ==================== */
.list-scroll {
  flex: 1;
  padding: 0 $spacing-base;
}

.etf-list {
  display: flex;
  flex-direction: column;
  gap: $spacing-sm;
}

.etf-item {
  @include flex(row, flex-start, center);
  padding: $spacing-md $spacing-base;
  @include card($radius: $radius-md);
  box-shadow: $shadow-sm;
  transition: all $transition-fast $ease-in-out;

  &:active {
    opacity: 0.9;
    transform: scale(0.99);
  }
}

.etf-info {
  width: 200rpx;
}

.etf-name {
  font-size: $font-size-base;
  font-weight: $font-weight-semibold;
  color: $color-text-primary;
}

.etf-meta {
  @include flex(row, flex-start, center);
  gap: $spacing-xs;
  margin-top: $spacing-xs;
}

.market-tag {
  @include flex-center;
  min-width: 32rpx;
  height: 36rpx;
  padding: 0 $spacing-sm;
  background-color: $color-brand-bg;
  border-radius: $radius-sm;
  font-size: $font-size-xs;
  color: $color-brand-primary;
  font-weight: $font-weight-medium;
}

.etf-code {
  font-size: $font-size-xs;
  color: $color-text-tertiary;
}

.mini-chart {
  width: 120rpx;
  height: 60rpx;
  @include flex-center;
}

.chart-placeholder {
  font-size: $font-size-sm;
  color: $color-border;
}

.price-section {
  width: 120rpx;
  text-align: right;
}

.etf-price {
  font-size: $font-size-base;
  font-weight: $font-weight-semibold;
  color: $color-text-primary;
}

.ytd-section {
  width: 140rpx;
  @include flex(row, flex-end, center);
}

.ytd-badge {
  padding: $spacing-xs $spacing-sm;
  border-radius: $radius-full;
}

.ytd-badge.profit {
  background-color: $color-up-bg;
}

.ytd-badge.loss {
  background-color: $color-down-bg;
}

.ytd-text {
  font-size: $font-size-xs;
  font-weight: $font-weight-semibold;
}

.ytd-badge.profit .ytd-text {
  color: $color-up;
}

.ytd-badge.loss .ytd-text {
  color: $color-down;
}

/* ==================== 添加按钮（搜索结果） ==================== */
.add-btn {
  @include flex-center;
  padding: $spacing-xs $spacing-sm;
  border-radius: $radius-full;
  background-color: $color-brand-bg;
  transition: all $transition-fast $ease-in-out;

  &:active {
    opacity: 0.7;
    transform: scale(0.96);
  }
}

.add-btn-text {
  font-size: $font-size-xs;
  font-weight: $font-weight-semibold;
  color: $color-brand-primary;
}

/* 已添加置灰态 */
.ytd-badge.added-badge {
  background-color: $color-border-light;
}

.ytd-badge.added-badge .ytd-text {
  color: $color-text-tertiary;
}

/* ==================== 资产卡片样式 ==================== */
.asset-card {
  @include card;
  padding: $card-padding;
  margin: $spacing-md 0;
  box-shadow: $shadow-base;
}

.card-header {
  @include flex(row, space-between, center);
}

.card-title-row {
  @include flex(row, flex-start, center);
  gap: $spacing-sm;
}

.card-title {
  font-size: $font-size-2xl;
  font-weight: $font-weight-semibold;
  color: $color-text-primary;
}

.header-actions {
  @include flex(row, flex-end, center);
  gap: $spacing-sm;
}

.action-btn {
  @include flex(row, center, center);
  gap: $spacing-xs;
  padding: $spacing-sm $spacing-md;
  border: 2rpx solid $color-border;
  border-radius: $radius-base;
  transition: all $transition-fast $ease-in-out;

  &:active {
    opacity: 0.8;
    background-color: $color-border-light;
  }
}

.action-text {
  font-size: $font-size-sm;
  color: $color-text-secondary;
}

/* 金额展示区域 */
.amount-section {
  margin-top: $spacing-base;
  text-align: center;
}

.amount-value {
  font-size: $font-size-4xl;
  font-weight: $font-weight-bold;
  color: $color-text-primary;
}

.amount-label {
  display: block;
  font-size: $font-size-base;
  color: $color-text-tertiary;
  margin-top: $spacing-xs;
}

/* 更新时间行 */
.update-section {
  @include flex(row, center, center);
  gap: $spacing-xs;
  margin-top: $spacing-sm;
}

.update-text {
  font-size: $font-size-sm;
  color: $color-text-tertiary;
}

/* 收益统计行 */
.earnings-row {
  @include flex(row, space-around, stretch);
  margin-top: $spacing-base;
  padding-top: $spacing-base;
  border-top: 2rpx solid $color-border-light;
}

.earnings-item {
  @include flex(column, center, center);
  gap: $spacing-xs;
  flex: 1;
}

.earnings-divider {
  width: 2rpx;
  background-color: $color-border-light;
  margin: $spacing-xs 0;
}

.earnings-value {
  font-size: $font-size-lg;
  font-weight: $font-weight-bold;
}

.earnings-percent {
  font-size: $font-size-sm;
}

.earnings-value.profit,
.earnings-percent.profit {
  color: $color-up;
}

.earnings-value.loss,
.earnings-percent.loss {
  color: $color-down;
}

.earnings-label {
  font-size: $font-size-xs;
  color: $color-text-tertiary;
}

/* ==================== 持仓列表样式 ==================== */
.position-list-title {
  @include flex(row, flex-start, center);
  gap: $spacing-sm;
  padding: $spacing-md 0 $spacing-sm;
}

.title-text {
  font-size: $font-size-lg;
  font-weight: $font-weight-semibold;
  color: $color-text-primary;
}

.position-list {
  display: flex;
  flex-direction: column;
  gap: $spacing-md;
}

/* ==================== 空状态样式 ==================== */
.empty-state {
  @include flex(column, center, center);
  padding: 160rpx 0;
}

.empty-icon-box {
  @include flex-center;
  width: 120rpx;
  height: 120rpx;
  background-color: $color-brand-bg;
  border-radius: $radius-circle;
  margin-bottom: $spacing-md;
}

.empty-text {
  font-size: $font-size-lg;
  font-weight: $font-weight-medium;
  color: $color-text-secondary;
  margin-bottom: $spacing-sm;
}

.empty-hint {
  font-size: $font-size-base;
  color: $color-text-tertiary;
}

/* ==================== 底部占位 ==================== */
.scroll-bottom-placeholder {
  height: 200rpx;
}
</style>