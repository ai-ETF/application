/**
 * ============================================
 * 自选页 - 关注/持仓列表
 * ============================================
 * 展示用户关注的 ETF 列表和持仓信息
 * 设计稿参考：
 * - 关注 Tab: pencil/followPage.pen
 * - 持仓 Tab: pencil/positionCheck.pen
 *
 * 页面结构：
 * - 顶部 Tab 切换：关注 | 持仓
 * - 关注 Tab：搜索框 + ETF 列表卡片
 * - 持仓 Tab：资产总览卡片 + 持仓列表
 * - 底部导航：TabBar 组件
 *
 * 设计风格：
 * - 背景色：#F9F6F0（温暖米色）
 * - 卡片背景：#FFFFFF
 * - 卡片边框：#E8E3DA
 * - 涨：#FF4444 / #D94C4C（红色）
 * - 跌：#00AA44（绿色）
 */
<template>
  <view class="page-container">
    <!-- ==================== 顶部 Tab 切换 ==================== -->
    <view class="top-tab">
      <!-- 关注 Tab -->
      <view
        class="tab-item"
        :class="{ 'tab-item--active': activeTab === 'follow' }"
        @tap="switchTab('follow')"
      >
        <text class="tab-text">关注</text>
        <view v-if="activeTab === 'follow'" class="tab-indicator"></view>
      </view>
      <!-- 持仓 Tab -->
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
          <text class="search-icon">🔍</text>
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
        <text class="header-text">走势</text>
        <text class="header-text header-price">最新价</text>
        <text class="header-text header-ytd">年初至今</text>
      </view>

      <!-- ETF 列表（可滚动） -->
      <scroll-view class="list-scroll" scroll-y>
        <view class="etf-list">
          <!-- ETF 列表项：循环渲染 -->
          <view
            v-for="item in filteredEtfList"
            :key="item.etfCode"
            class="etf-item"
            @tap="handleEtfClick(item)"
          >
            <!-- 标的信息：名称 + 市场标签 + 代码 -->
            <view class="etf-info">
              <text class="etf-name">{{ item.etfName }}</text>
              <view class="etf-meta">
                <!-- 市场标签：沪/深 -->
                <view class="market-tag">{{ item.market }}</view>
                <text class="etf-code">{{ item.etfCode }}</text>
              </view>
            </view>

            <!-- 迷你走势图占位 -->
            <view class="mini-chart">
              <text class="chart-placeholder">--</text>
            </view>

            <!-- 最新价格 -->
            <view class="price-section">
              <text class="etf-price">{{ formatPrice(item.latestPrice) }}</text>
            </view>

            <!-- 年初至今涨跌幅 -->
            <view class="ytd-section">
              <view class="ytd-badge" :class="item.ytdChange >= 0 ? 'profit' : 'loss'">
                <text class="ytd-text">{{ formatYtd(item.ytdChange) }}</text>
              </view>
            </view>
          </view>
        </view>

        <!-- 空状态提示 -->
        <view v-if="filteredEtfList.length === 0" class="empty-state">
          <text class="empty-icon">📭</text>
          <text class="empty-text">暂无关注的 ETF</text>
          <text class="empty-hint">搜索并添加您感兴趣的 ETF</text>
        </view>

        <!-- 底部占位，防止内容被 TabBar 遮挡 -->
        <view class="scroll-bottom-placeholder"></view>
      </scroll-view>
    </view>

    <!-- ==================== 持仓列表内容 ==================== -->
    <view v-else class="content-area">
      <scroll-view class="list-scroll" scroll-y>
        <!-- 资产总览卡片 -->
        <view class="asset-card">
          <!-- 标题行：投资总金额 + 操作按钮 -->
          <view class="card-header">
            <text class="card-title">投资总金额</text>
            <view class="header-actions">
              <view class="action-btn" @tap="handleAssetDiag">
                <text class="action-text">资产诊断</text>
              </view>
              <view class="action-btn" @tap="handleShare">
                <text class="action-text">晒一晒</text>
              </view>
            </view>
          </view>

          <!-- 金额展示区域 -->
          <view class="amount-section">
            <text class="amount-value">¥ {{ totalAmount.toLocaleString() }}</text>
            <text class="amount-label">总资产</text>
          </view>

          <!-- 更新时间行 -->
          <view class="update-section">
            <text class="update-text">数据更新于 {{ updateDate }}</text>
            <text class="update-icon">⚠️</text>
          </view>

          <!-- 收益统计行：三列布局 -->
          <view class="earnings-row">
            <!-- 最新收益 -->
            <view class="earnings-item">
              <text class="earnings-value" :class="latestEarnings.amount >= 0 ? 'profit' : 'loss'">
                {{ latestEarnings.amount >= 0 ? '+' : '' }}{{ latestEarnings.amount.toLocaleString() }}
              </text>
              <text class="earnings-percent" :class="latestEarnings.percent >= 0 ? 'profit' : 'loss'">
                {{ latestEarnings.percent >= 0 ? '+' : '' }}{{ latestEarnings.percent }}%
              </text>
              <text class="earnings-label">最新收益</text>
            </view>
            <!-- 持有收益 -->
            <view class="earnings-item">
              <text class="earnings-value" :class="holdingEarnings.amount >= 0 ? 'profit' : 'loss'">
                {{ holdingEarnings.amount >= 0 ? '+' : '' }}{{ holdingEarnings.amount.toLocaleString() }}
              </text>
              <text class="earnings-percent" :class="holdingEarnings.percent >= 0 ? 'profit' : 'loss'">
                {{ holdingEarnings.percent >= 0 ? '+' : '' }}{{ holdingEarnings.percent }}%
              </text>
              <text class="earnings-label">持有收益</text>
            </view>
            <!-- 累计收益 -->
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

        <!-- 空状态提示 -->
        <view v-if="positionList.length === 0" class="empty-state">
          <text class="empty-icon">📊</text>
          <text class="empty-text">暂无持仓</text>
          <text class="empty-hint">开始您的 ETF 投资之旅</text>
        </view>

        <!-- 底部占位 -->
        <view class="scroll-bottom-placeholder"></view>
      </scroll-view>
    </view>

    <!-- ==================== 底部导航栏 ==================== -->
    <TabBar active="watchlist" />
  </view>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import TabBar from '@/components/common/TabBar.vue';
import PositionItem from '@/components/business/PositionItem.vue';
import type { WatchlistItem, HoldingItem } from '@/types/models.d';

// ==================== 状态定义 ====================

/** 当前激活的 Tab：follow(关注) | position(持仓) */
const activeTab = ref<'follow' | 'position'>('follow');

/** 搜索关键词 */
const searchKeyword = ref<string>('');

/**
 * 关注列表（模拟数据）
 * @description 实际项目中应从 API 获取或从 Store 读取
 */
const etfList = ref<WatchlistItem[]>([
  {
    etfName: '沪深300ETF',
    etfCode: '510300',
    market: '沪',
    latestPrice: 5.128,
    changePercent: 0.45,
    ytdChange: 12.45,
  },
  {
    etfName: '中证500ETF',
    etfCode: '510500',
    market: '沪',
    latestPrice: 6.842,
    changePercent: 0.92,
    ytdChange: 8.92,
  },
  {
    etfName: '科创50ETF',
    etfCode: '588000',
    market: '沪',
    latestPrice: 1.235,
    changePercent: -0.32,
    ytdChange: -5.67,
  },
  {
    etfName: '创业板ETF',
    etfCode: '159915',
    market: '深',
    latestPrice: 2.156,
    changePercent: 1.25,
    ytdChange: 15.32,
  },
]);

/**
 * 持仓列表（模拟数据）
 * @description 实际项目中应从 API 获取
 */
const positionList = ref<HoldingItem[]>([
  {
    fundName: '易方达科创50A (510300)',
    fundCode: '510300',
    holdingAmount: 50000,
    holdingShares: 45678.9,
    dailyProfit: 125,
    dailyProfitPercent: 0.25,
    totalProfit: 1250,
    totalProfitPercent: 2.5,
    updateDate: '2 月 27 日',
  },
  {
    fundName: '南方有色金属A (160526)',
    fundCode: '160526',
    holdingAmount: 30000,
    holdingShares: 28456.78,
    dailyProfit: -45,
    dailyProfitPercent: -0.15,
    totalProfit: 900,
    totalProfitPercent: 3.0,
    updateDate: '2 月 27 日',
  },
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

/**
 * 根据搜索关键词过滤的 ETF 列表
 * @description 支持按名称或代码搜索
 */
const filteredEtfList = computed(() => {
  if (!searchKeyword.value.trim()) {
    return etfList.value;
  }
  const keyword = searchKeyword.value.toLowerCase();
  return etfList.value.filter(
    item =>
      item.etfName.toLowerCase().includes(keyword) ||
      item.etfCode.includes(keyword)
  );
});

// ==================== 方法 ====================

/**
 * 格式化价格
 * @param price - 原始价格
 * @returns 格式化后的价格字符串（保留3位小数）
 */
function formatPrice(price: number): string {
  return price.toFixed(3);
}

/**
 * 格式化年初至今涨跌幅
 * @param value - 涨跌数值（百分比）
 * @returns 格式化后的涨跌幅字符串
 */
function formatYtd(value: number): string {
  const sign = value >= 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}%`;
}

/**
 * 切换 Tab
 * @param tab - 目标 Tab 标识
 */
function switchTab(tab: 'follow' | 'position') {
  activeTab.value = tab;
  console.log(`[WatchlistPage] 切换 Tab: ${tab}`);
}

/**
 * ETF 项点击
 * @param item - 点击的 ETF 数据
 */
function handleEtfClick(item: WatchlistItem) {
  console.log(`[WatchlistPage] 点击 ETF: ${item.etfName} (${item.etfCode})`);
  // TODO: 跳转到 ETF 详情页
  uni.showToast({ title: `${item.etfName} 详情页开发中`, icon: 'none' });
}

/**
 * 资产诊断按钮点击
 */
function handleAssetDiag() {
  console.log('[WatchlistPage] 点击资产诊断');
  uni.showToast({ title: '资产诊断功能开发中', icon: 'none' });
}

/**
 * 晒一晒按钮点击
 */
function handleShare() {
  console.log('[WatchlistPage] 点击晒一晒');
  uni.showToast({ title: '分享功能开发中', icon: 'none' });
}

/**
 * 持仓项点击
 * @param fundName - 基金名称
 */
function handlePositionClick(fundName: string) {
  console.log(`[WatchlistPage] 点击持仓: ${fundName}`);
  // TODO: 跳转到持仓详情页
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

/* ==================== 顶部 Tab 样式 ==================== */
.top-tab {
  display: flex;
  height: 96rpx;
  background-color: #F9F6F0;
}

.tab-item {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  position: relative;
  transition: all 0.2s ease;
}

.tab-text {
  font-size: 32rpx;
  font-weight: 400;
  color: #999999;
  transition: all 0.2s ease;
}

/* Tab 激活状态 */
.tab-item--active .tab-text {
  font-weight: 600;
  color: #2D1E16;
}

/* Tab 指示器：激活时显示的底部横线 */
.tab-indicator {
  position: absolute;
  bottom: 0;
  width: 48rpx;
  height: 4rpx;
  background-color: #2D1E16;
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
  padding: 24rpx 32rpx 16rpx;
}

.search-bar {
  display: flex;
  align-items: center;
  height: 88rpx;
  padding: 0 32rpx;
  background-color: #FFFFFF;
  border-radius: 44rpx;
  border: 2rpx solid #E0E0E0;
}

.search-icon {
  font-size: 32rpx;
  margin-right: 16rpx;
}

.search-input {
  flex: 1;
  font-size: 28rpx;
  color: #2D1E16;
}

.search-placeholder {
  color: #999999;
}

/* ==================== 列表标题行 ==================== */
.list-header {
  display: flex;
  align-items: center;
  padding: 16rpx 32rpx;
}

.header-text {
  font-size: 24rpx;
  color: #999999;
}

.header-name {
  width: 200rpx;
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
  padding: 0 32rpx;
}

.etf-list {
  display: flex;
  flex-direction: column;
  gap: 16rpx;
}

/* ETF 列表项：白色卡片样式 */
.etf-item {
  display: flex;
  align-items: center;
  padding: 24rpx;
  background-color: #FFFFFF;
  border-radius: 24rpx;
  transition: all 0.2s ease;

  &:active {
    opacity: 0.9;
    transform: scale(0.99);
  }
}

/* ETF 信息区域 */
.etf-info {
  width: 200rpx;
}

.etf-name {
  font-size: 28rpx;
  font-weight: 600;
  color: #2D1E16;
}

.etf-meta {
  display: flex;
  align-items: center;
  gap: 8rpx;
  margin-top: 8rpx;
}

/* 市场标签：沪/深 */
.market-tag {
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 32rpx;
  height: 36rpx;
  padding: 0 12rpx;
  background-color: #EFEAE2;
  border-radius: 8rpx;
  font-size: 20rpx;
  color: #000000;
}

.etf-code {
  font-size: 22rpx;
  color: #999999;
}

/* 迷你走势图占位 */
.mini-chart {
  width: 120rpx;
  height: 60rpx;
  display: flex;
  align-items: center;
  justify-content: center;
}

.chart-placeholder {
  font-size: 24rpx;
  color: #CCCCCC;
}

/* 价格区域 */
.price-section {
  width: 120rpx;
  text-align: right;
}

.etf-price {
  font-size: 28rpx;
  font-weight: 600;
  color: #2D1E16;
}

/* 年初至今涨跌幅区域 */
.ytd-section {
  width: 140rpx;
  display: flex;
  justify-content: flex-end;
}

/* 涨跌幅标签 */
.ytd-badge {
  padding: 8rpx 16rpx;
  border-radius: 24rpx;
}

.ytd-badge.profit {
  background-color: #FDECEC;
}

.ytd-badge.loss {
  background-color: #E8F8EE;
}

.ytd-text {
  font-size: 24rpx;
  font-weight: 600;
}

.ytd-badge.profit .ytd-text {
  color: #D94C4C;
}

.ytd-badge.loss .ytd-text {
  color: #00AA44;
}

/* ==================== 资产卡片样式 ==================== */
.asset-card {
  background-color: #FFFFFF;
  border-radius: 32rpx;
  padding: 40rpx;
  margin: 24rpx 0;
  border: 2rpx solid #E8E3DA;
}

/* 卡片标题行 */
.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.card-title {
  font-size: 36rpx;
  font-weight: 600;
  color: #000000;
}

.header-actions {
  display: flex;
  gap: 16rpx;
}

/* 操作按钮 */
.action-btn {
  padding: 12rpx 24rpx;
  border: 2rpx solid #CCCCCC;
  border-radius: 16rpx;
  transition: all 0.2s ease;

  &:active {
    opacity: 0.8;
    background-color: #F5F5F5;
  }
}

.action-text {
  font-size: 24rpx;
  color: #666666;
}

/* 金额展示区域 */
.amount-section {
  margin-top: 32rpx;
  text-align: center;
}

.amount-value {
  font-size: 72rpx;
  font-weight: 700;
  color: #000000;
}

.amount-label {
  display: block;
  font-size: 28rpx;
  color: #999999;
  margin-top: 8rpx;
}

/* 更新时间行 */
.update-section {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 8rpx;
  margin-top: 16rpx;
}

.update-text {
  font-size: 24rpx;
  color: #999999;
}

.update-icon {
  font-size: 24rpx;
}

/* 收益统计行 */
.earnings-row {
  display: flex;
  justify-content: space-around;
  margin-top: 32rpx;
  padding-top: 32rpx;
  border-top: 2rpx solid #F0F0F0;
}

.earnings-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8rpx;
}

.earnings-value {
  font-size: 32rpx;
  font-weight: 700;
}

.earnings-percent {
  font-size: 24rpx;
}

.earnings-value.profit,
.earnings-percent.profit {
  color: #FF4444;
}

.earnings-value.loss,
.earnings-percent.loss {
  color: #00AA44;
}

.earnings-label {
  font-size: 22rpx;
  color: #999999;
}

/* ==================== 持仓列表样式 ==================== */
.position-list-title {
  padding: 24rpx 0 16rpx;
}

.title-text {
  font-size: 32rpx;
  font-weight: 600;
  color: #2D1E16;
}

.position-list {
  display: flex;
  flex-direction: column;
  gap: 24rpx;
}

/* ==================== 空状态样式 ==================== */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 120rpx 0;
}

.empty-icon {
  font-size: 80rpx;
  margin-bottom: 24rpx;
}

.empty-text {
  font-size: 32rpx;
  font-weight: 500;
  color: #666666;
  margin-bottom: 12rpx;
}

.empty-hint {
  font-size: 26rpx;
  color: #999999;
}

/* ==================== 底部占位 ==================== */
.scroll-bottom-placeholder {
  height: 200rpx;
}
</style>
