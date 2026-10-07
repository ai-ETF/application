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
  <view class="page-container" :style="{ minHeight: windowHeight + 'px' }">
    <!-- ==================== 顶部 Tab 切换 ==================== -->
    <view class="top-tab" :style="{ paddingTop: statusBarHeight + 'px' }">
      <view
        id="wl-tab-follow"
        class="tab-item"
        :class="{ 'tab-item--active': activeTab === 'follow' }"
        @tap="switchTab('follow')"
      >
        <text class="tab-text">关注</text>
        <view v-if="activeTab === 'follow'" class="tab-indicator"></view>
      </view>
      <view
        id="wl-tab-position"
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
        <view class="search-bar" :class="{ 'search-bar--focused': searchFocused }">
          <SvgIcon name="search" size="36rpx" color="tertiary" />
          <input
            id="wl-search-input"
            v-model="searchKeyword"
            class="search-input"
            type="text"
            placeholder="搜索 ETF 名称或代码"
            placeholder-class="search-placeholder"
            @focus="searchFocused = true"
            @blur="searchFocused = false"
          />
        </view>
      </view>

      <!-- 列表标题行 -->
      <view class="list-header">
        <text class="header-text header-name">标的</text>
        <text class="header-text header-price">最新价</text>
        <text class="header-text header-ytd">涨跌幅</text>
      </view>

      <!-- ETF 列表（可滚动） -->
      <scroll-view class="list-scroll" scroll-y>
        <!-- 自选列表（无搜索关键词时） -->
        <view v-if="!hasKeyword" id="wl-follow-list" class="etf-list">
          <view
            id="wl-follow-item"
            v-for="item in followList"
            :key="item.etfCode"
            class="swipe-row"
            @touchstart="handleSwipeStart($event, item.etfCode)"
            @touchmove="handleSwipeMove($event, item.etfCode)"
            @touchend="handleSwipeEnd(item.etfCode)"
          >
            <!-- 左滑后露出的删除操作区，默认完全隐藏在卡片后方 -->
            <view class="swipe-delete" @tap.stop="handleRemove(item)">
              <SvgIcon name="trash-2" size="34rpx" color="white" />
              <text class="swipe-delete-text">删除</text>
            </view>

            <view
              class="etf-item"
              :style="{ transform: `translateX(${swipeOffset(item.etfCode)}px)` }"
              @tap.stop="handleEtfClick(item)"
            >
              <!-- 标的信息 -->
              <view class="etf-info">
                <text class="etf-name">{{ item.etfName }}</text>
                <view class="etf-meta">
                  <view class="market-tag">{{ item.market }}</view>
                  <text class="etf-code">{{ item.etfCode }}</text>
                </view>
              </view>

              <!-- 最新价格 -->
              <view class="price-section">
                <text class="etf-price">{{ item.hasQuote ? formatPrice(item.latestPrice) : '--' }}</text>
              </view>

              <!-- 涨跌幅 -->
              <view class="ytd-section">
                <view v-if="item.hasQuote" class="ytd-badge" :class="item.changePercent >= 0 ? 'profit' : 'loss'">
                  <text class="ytd-text">{{ formatChange(item.changePercent) }}</text>
                </view>
                <text v-else class="ytd-text muted-value">--</text>
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
            @tap="goToDetail(item.code)"
          >
            <view class="etf-info">
              <text class="etf-name">{{ item.name }}</text>
                <view class="etf-meta">
                  <view class="market-tag">{{ channelOf(item) }}</view>
                  <text class="etf-code">{{ item.code }}</text>
                  <text v-if="item.tradeable" class="tradeable-label">支持申购</text>
                </view>
            </view>

            <view class="price-section">
              <text class="etf-price">{{ formatSearchPrice(item) }}</text>
            </view>

            <view class="ytd-section">
              <!-- 未关注 → 显示添加按钮 -->
              <view
                v-if="!isFollowed(item.code)"
                class="add-btn"
                @tap.stop="handleAdd(item)"
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

        <view v-if="hasKeyword && watchlistStore.searching" class="search-state">正在搜索基金...</view>

        <view v-if="hasKeyword && watchlistStore.searchError" class="search-state search-error">
          <text>{{ watchlistStore.searchError }}</text>
          <text class="retry" @tap="retrySearch">重新搜索</text>
        </view>

        <!-- 空状态 -->
        <view v-if="showEmpty" class="empty-state">
          <view class="empty-icon-box">
            <SvgIcon :name="hasKeyword ? 'search' : 'bookmark'" size="64rpx" color="tertiary" />
          </view>
          <text class="empty-text">{{ hasKeyword ? '未找到相关基金' : '暂无关注的 ETF' }}</text>
          <text class="empty-hint">{{ hasKeyword ? '换个关键词试试' : '搜索并添加您感兴趣的 ETF' }}</text>
        </view>

        <!-- 清空自选按钮（非搜索态且有数据时显示） -->
        <view v-if="!hasKeyword && followList.length > 0" class="clear-section">
          <view id="wl-clear" class="clear-btn" @tap="handleClearAll">
            <SvgIcon name="trash-2" size="32rpx" color="tertiary" />
            <text class="clear-btn-text">清空自选</text>
          </view>
        </view>
        <view class="scroll-bottom-placeholder"></view>
      </scroll-view>
    </view>

    <!-- ==================== 持仓列表内容 ==================== -->
    <view v-else class="content-area">
      <scroll-view class="list-scroll" scroll-y>
        <view v-if="positionLoading" class="portfolio-state">正在加载账户和持仓...</view>
        <view v-else-if="positionError" class="portfolio-state">
          <text>{{ positionError }}</text>
          <text v-if="authStore.isAuthenticated" class="retry" @tap="fetchPortfolio">重试</text>
          <text v-else class="retry" @tap="goToLogin">去登录</text>
        </view>
        <template v-else>
        <!-- 资产总览卡片 -->
        <view class="asset-card">
          <view class="card-header">
            <view class="card-title-row">
              <SvgIcon name="briefcase" size="36rpx" color="primary" />
              <text class="card-title">账户资产</text>
            </view>
            <view class="header-actions">
            <view class="action-btn" @tap="goTrades">
              <text class="action-text">交易记录</text>
            </view>
            </view>
          </view>

          <!-- 金额展示 -->
          <view class="amount-section">
            <text class="amount-value">¥ {{ totalAmount.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }}</text>
            <text class="amount-label">总资产</text>
          </view>

          <view class="asset-grid">
            <view><text>{{ cashAmount.toFixed(2) }}</text><text>可用现金</text></view>
            <view><text>{{ frozenAmount.toFixed(2) }}</text><text>冻结资金</text></view>
            <view><text>{{ positionAmount.toFixed(2) }}</text><text>持仓市值</text></view>
          </view>

          <!-- 更新时间行 -->
          <view class="update-section">
            <SvgIcon name="clock" size="24rpx" color="tertiary" />
            <text class="update-text">数据更新于 {{ updateDate }}</text>
          </view>

          <!-- 后端只提供总盈亏与总收益率，不把同一字段重复冒充为不同口径。 -->
          <view class="earnings-row">
            <view class="earnings-item">
              <text class="earnings-value" :class="totalPnl >= 0 ? 'profit' : 'loss'">
                {{ totalPnl >= 0 ? '+' : '' }}{{ totalPnl.toFixed(2) }}
              </text>
              <text class="earnings-label">总盈亏（元）</text>
            </view>
            <view class="earnings-divider"></view>
            <view class="earnings-item">
              <text class="earnings-value" :class="totalReturnRate >= 0 ? 'profit' : 'loss'">
                {{ totalReturnRate >= 0 ? '+' : '' }}{{ totalReturnRate.toFixed(2) }}%
              </text>
              <text class="earnings-label">总收益率</text>
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
            :market-value-available="item.marketValueAvailable"
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
        </template>
      </scroll-view>
    </view>

    <!-- ==================== 底部导航栏 ==================== -->
    <TabBar active="watchlist" />
  </view>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { onLoad, onShow } from '@dcloudio/uni-app';
import TabBar from '@/components/common/TabBar.vue';
import SvgIcon from '@/components/common/SvgIcon.vue';
import PositionItem from '@/components/business/PositionItem.vue';
import { useWatchlistStore } from '@/stores/watchlist';
import { useAuthStore } from '@/stores/auth';
import { getAccountSummary, getPositions } from '@/api/modules/portfolio';
import { useSystemInfo } from '@/composables/useSystemInfo';

const { statusBarHeight, windowHeight } = useSystemInfo();
import type { WatchlistItem, HoldingItem } from '@/types/models.d';
import type { SearchResultRaw } from '@/api/types';

// ==================== Store ====================

const watchlistStore = useWatchlistStore();

// ==================== 状态定义 ====================

/** 当前激活的 Tab：follow(关注) | position(持仓) */
const activeTab = ref<'follow' | 'position'>('follow');

/** 搜索关键词（本地输入态，驱动 store 搜索） */
const searchKeyword = ref<string>('');

/** 搜索框是否聚焦（小程序不支持 :focus-within，使用 JS 状态替代） */
const searchFocused = ref<boolean>(false);

/** 左滑删除状态：同一时间只打开一条，避免多个操作区同时露出 */
const swipeCode = ref<string | null>(null);
const swipeOffsetPx = ref(0);
const swipeStartX = ref(0);
const swipeStartY = ref(0);
const swipeInitialOffsetPx = ref(0);
const swipeDragging = ref(false);
const suppressItemTap = ref(false);
const SWIPE_ACTION_WIDTH_RPX = 176;
const swipeActionWidthPx = uni.getSystemInfoSync().windowWidth * SWIPE_ACTION_WIDTH_RPX / 750;

/** 当前登录用户的真实持仓列表。 */
const positionList = ref<HoldingItem[]>([]);
const positionLoading = ref(false);
const positionError = ref('');
const authStore = useAuthStore();
let portfolioRequestId = 0;

/** 资产总金额 */
const totalAmount = ref<number>(0);
const cashAmount = ref(0);
const frozenAmount = ref(0);
const positionAmount = ref(0);
/** 数据更新日期 */
const updateDate = ref<string>('--');
/** 后端账户概况返回的总盈亏与总收益率。 */
const totalPnl = ref(0);
const totalReturnRate = ref(0);

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
    return searchResults.value.length === 0 && !watchlistStore.searching && !watchlistStore.searchError;
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

onLoad((query) => {
  if (query?.tab === 'position') activeTab.value = 'position';
});

/**
 * 页面每次显示时刷新自选列表
 * @description 用 onShow 而非 onLoad，确保从详情页返回能拿到最新自选
 */
onShow(() => {
  authStore.restoreSession();
  if (activeTab.value === 'follow') {
    if (authStore.isAuthenticated) watchlistStore.fetchFollowList();
    else watchlistStore.resetForAuthChange();
  } else {
    fetchPortfolio();
  }
});

// ==================== 方法 ====================

/**
 * 切换 Tab，切到关注时刷新列表
 */
function switchTab(tab: 'follow' | 'position') {
  activeTab.value = tab;
  authStore.restoreSession();
  if (tab === 'follow') {
    if (authStore.isAuthenticated) watchlistStore.fetchFollowList();
    else watchlistStore.resetForAuthChange();
  } else {
    fetchPortfolio();
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

function channelOf(item: SearchResultRaw): string {
  if (item.data_source === 'fund_detail' || item.tradeable) return '场外';
  return marketOf(item.code);
}

function formatSearchPrice(item: SearchResultRaw): string {
  const value = item.price != null && item.price > 0 ? item.price : item.nav;
  return value == null ? '--' : formatPrice(value);
}

function retrySearch() {
  if (searchKeyword.value.trim()) void watchlistStore.searchEtf(searchKeyword.value.trim());
}

/** 是否已关注（搜索结果用） */
function isFollowed(code: string): boolean {
  return watchlistStore.isFollowed(code);
}

/** 返回指定条目的横向位移，供卡片跟手滑动和回弹动画使用 */
function swipeOffset(code: string): number {
  return swipeCode.value === code ? swipeOffsetPx.value : 0;
}

/** 开始记录水平手势；若另一条已打开，先收起它 */
function handleSwipeStart(event: TouchEvent, code: string) {
  const touch = event.touches[0];
  if (!touch) return;
  if (swipeCode.value !== code) {
    swipeCode.value = code;
    swipeOffsetPx.value = 0;
  }
  swipeStartX.value = touch.clientX;
  swipeStartY.value = touch.clientY;
  swipeInitialOffsetPx.value = swipeOffsetPx.value;
  swipeDragging.value = false;
}

/** 只响应明显的水平滑动，避免影响列表上下滚动 */
function handleSwipeMove(event: TouchEvent, code: string) {
  if (swipeCode.value !== code) return;
  const touch = event.touches[0];
  if (!touch) return;
  const deltaX = touch.clientX - swipeStartX.value;
  const deltaY = touch.clientY - swipeStartY.value;
  if (!swipeDragging.value && Math.abs(deltaX) < 8) return;
  if (!swipeDragging.value && Math.abs(deltaY) > Math.abs(deltaX)) return;

  swipeDragging.value = true;
  // 打开状态允许向右回收，关闭状态只允许向左展开；位移基于本次手势起点计算
  swipeOffsetPx.value = Math.max(-swipeActionWidthPx, Math.min(0, swipeInitialOffsetPx.value + deltaX));
}

/** 松手后根据滑动距离决定打开或收起删除区 */
function handleSwipeEnd(code: string) {
  if (swipeCode.value !== code) return;
  if (swipeDragging.value) {
    suppressItemTap.value = true;
    swipeOffsetPx.value = swipeOffsetPx.value <= -swipeActionWidthPx * 0.35 ? -swipeActionWidthPx : 0;
    if (swipeOffsetPx.value === 0) swipeCode.value = null;
    setTimeout(() => { suppressItemTap.value = false; }, 0);
  }
  swipeDragging.value = false;
}

/**
 * 点击搜索结果中的「添加」
 */
async function handleAdd(item: SearchResultRaw) {
  authStore.restoreSession();
  if (!authStore.isAuthenticated) { goToLogin(); return; }
  const ok = await watchlistStore.addToFollow(item.code, item.name);
  if (ok) {
    uni.showToast({ title: '已添加', icon: 'success' });
  }
}

/**
 * 点击自选项（详情页待 P2 接入）
 */
function handleEtfClick(item: WatchlistItem) {
  if (suppressItemTap.value) return;
  if (swipeOffsetPx.value < 0) {
    swipeOffsetPx.value = 0;
    swipeCode.value = null;
    return;
  }
  console.log(`[WatchlistPage] 点击 ETF: ${item.etfName} (${item.etfCode})`);
  uni.navigateTo({ url: `/pages/etf-detail/index?code=${encodeURIComponent(item.etfCode)}` });
}

function goToDetail(code: string) {
  uni.navigateTo({ url: `/pages/etf-detail/index?code=${encodeURIComponent(code)}` });
}

function goToLogin() {
  uni.reLaunch({ url: '/pages/login/index' });
}

/**
 */
/**
 * 点击删除按钮 → 确认移除单条自选
 */
function handleRemove(item: WatchlistItem) {
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

/**
 * 清空全部自选 → 二次确认
 */
function handleClearAll() {
  uni.showModal({
    title: '清空自选',
    content: '确定清空所有自选股吗？此操作不可恢复。',
    confirmColor: '#DC2626',
    success: async (res) => {
      if (res.confirm) {
        await watchlistStore.clearFollow();
        uni.showToast({ title: '已清空', icon: 'none' });
      }
    },
  });
}

function goTrades() {
  uni.navigateTo({ url: '/pages/trades/index' });
}

function handlePositionClick(fundCode: string) {
  const item = positionList.value.find(position => position.fundCode === fundCode);
  if (!item) return;
  const quantity = item.availableShares ?? item.holdingShares;
  const price = item.marketPrice ?? '';
  uni.navigateTo({
    url: `/pages/redeem/index?code=${encodeURIComponent(item.fundCode)}&name=${encodeURIComponent(item.fundName)}&quantity=${encodeURIComponent(String(quantity))}&price=${encodeURIComponent(String(price))}`,
  });
}

async function fetchPortfolio() {
  const requestId = ++portfolioRequestId;
  authStore.restoreSession();
  if (!authStore.isAuthenticated) {
    positionList.value = [];
    totalAmount.value = cashAmount.value = frozenAmount.value = positionAmount.value = 0;
    totalPnl.value = totalReturnRate.value = 0;
    positionError.value = '登录后查看持仓';
    return;
  }
  const userId = authStore.user?.id;
  positionLoading.value = true; positionError.value = '';
  try {
    const [account, positions] = await Promise.all([getAccountSummary(), getPositions()]);
    if (requestId !== portfolioRequestId || !authStore.isAuthenticated || authStore.user?.id !== userId) return;
    cashAmount.value = Number(account.cash || 0);
    frozenAmount.value = Number(account.frozen_cash || 0);
    positionAmount.value = Number(account.position_value || 0);
    totalAmount.value = Number(account.total_assets || 0);
    totalPnl.value = Number(account.total_pnl || 0);
    totalReturnRate.value = Number(account.total_return_rate || 0) * 100;
    positionList.value = (positions.items || []).map(item => ({
      fundName: item.fund_name,
      fundCode: item.fund_code,
      holdingAmount: Number(item.market_value || 0),
      holdingShares: Number(item.quantity || 0),
      availableShares: Number(item.quantity || 0),
      marketPrice: item.market_price,
      marketValueAvailable: item.market_value != null,
      costPrice: Number(item.cost_price || 0),
      dailyProfit: Number(item.pnl || 0),
      dailyProfitPercent: Number(item.pnl_pct || 0),
      totalProfit: Number(item.pnl || 0),
      totalProfitPercent: Number(item.pnl_pct || 0),
      updateDate: item.updated_at || '--',
    }));
    updateDate.value = new Date().toLocaleString('zh-CN');
  } catch (e) {
    if (requestId !== portfolioRequestId) return;
    console.error('[WatchlistPage] 加载持仓失败:', e);
    positionList.value = [];
    totalAmount.value = cashAmount.value = frozenAmount.value = positionAmount.value = 0;
    totalPnl.value = totalReturnRate.value = 0;
    positionError.value = '持仓数据暂时无法获取';
  } finally { positionLoading.value = false; }
}
</script>

<style lang="scss" scoped>
/* ==================== 页面容器 ==================== */
.page-container {
  display: flex;
  flex-direction: column;
  background-color: $color-bg-primary;
}

/* ==================== 顶部 Tab 样式 ==================== */
.top-tab {
  display: flex;
  height: 96rpx;
  background-color: $color-bg-primary;
  padding: 0 $spacing-base;
  .tab-item + .tab-item {
    margin-left: $spacing-xl;
  }
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
  min-height: 0;
  padding: 0 $spacing-base;
}

/* ==================== 搜索框样式 ==================== */
.search-section {
  padding-top: $spacing-md;
  padding-bottom: $spacing-sm;
}

.search-bar {
  @include pill-button;
  padding: 0 $spacing-base;
  border: 2rpx solid $color-border;
  box-shadow: $shadow-sm;
  transition: all $transition-fast $ease-in-out;
  /* 小程序适配：gap 替换为 margin */
  .svg-icon + .search-input {
    margin-left: $spacing-sm;
  }
}

/* 小程序适配：:focus-within 替换为 JS 控制类 */
.search-bar--focused {
  border-color: $color-brand-primary;
  box-shadow: 0 0 0 4rpx rgba($color-brand-primary, 0.1);
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
  padding-top: $spacing-sm;
  padding-bottom: $spacing-sm;
}

.header-text {
  font-size: $font-size-xs;
  color: $color-text-tertiary;
  font-weight: $font-weight-medium;
}

.header-name {
  flex: 3;
}

.header-price {
  flex: 1;
  text-align: right;
}

.header-ytd {
  flex: 1;
  text-align: right;
}

/* ==================== ETF 列表样式 ==================== */
.list-scroll {
  flex: 1;
}

.etf-list {
  display: flex;
  flex-direction: column;
  .swipe-row + .swipe-row {
    margin-top: $spacing-sm;
  }
}

.swipe-row {
  position: relative;
  overflow: hidden;
  border-radius: $radius-md;
}

.etf-item {
  position: relative;
  z-index: 1;
  @include flex(row, flex-start, center);
  padding: $spacing-md $spacing-base;
  @include card($radius: $radius-md);
  box-shadow: $shadow-sm;
  transition: transform $transition-fast $ease-in-out;
  /* 列间距：防止价格和涨跌幅紧贴 */
  .etf-info + .price-section,
  .price-section + .ytd-section {
    margin-left: $spacing-md;
  }
}

/* 左侧名称：权重 3 */
.etf-info {
  flex: 3;
  min-width: 0;
}

.etf-name {
  font-size: $font-size-base;
  font-weight: $font-weight-semibold;
  color: $color-text-primary;
  @include text-ellipsis(1);
}

.etf-meta {
  @include flex(row, flex-start, center);
  margin-top: $spacing-xs;
  .market-tag + .etf-code {
    margin-left: $spacing-xs;
  }
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

.tradeable-label {
  margin-left: $spacing-xs;
  color: $color-brand-primary;
  font-size: 20rpx;
}

/* 最新价格：权重 1，右对齐 */
.price-section {
  flex: 1;
  text-align: right;
}

.etf-price {
  font-size: $font-size-base;
  font-weight: $font-weight-semibold;
  color: $color-text-primary;
}

/* 涨跌幅：权重 1，右对齐 */
.ytd-section {
  flex: 1;
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

/* ==================== 左滑删除操作区 ==================== */
.swipe-delete {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  width: 176rpx;
  @include flex(column, center, center);
  background-color: $color-up;
  border-radius: $radius-md;
}

.swipe-delete-text {
  margin-top: $spacing-xs;
  color: $color-text-white;
  font-size: $font-size-xs;
  font-weight: $font-weight-semibold;
}

/* ==================== 清空自选按钮 ==================== */
.clear-section {
  padding: $spacing-lg $spacing-base;
  @include flex-center;
}

.clear-btn {
  @include flex(row, center, center);
  padding: $spacing-sm $spacing-lg;
  border: 2rpx solid $color-border;
  border-radius: $radius-full;
  transition: all $transition-fast $ease-in-out;
  /* 小程序适配：gap 替换为 margin */
  .svg-icon + .clear-btn-text {
    margin-left: $spacing-xs;
  }

}

.clear-btn-text {
  font-size: $font-size-sm;
  color: $color-text-tertiary;
}

/* ==================== 添加按钮（搜索结果） ==================== */
.add-btn {
  @include flex-center;
  padding: $spacing-xs $spacing-sm;
  border-radius: $radius-full;
  background-color: $color-brand-bg;
  transition: all $transition-fast $ease-in-out;
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
  /* 小程序适配：gap 替换为 margin */
  .svg-icon + .card-title {
    margin-left: $spacing-sm;
  }
}

.card-title {
  font-size: $font-size-2xl;
  font-weight: $font-weight-semibold;
  color: $color-text-primary;
}

.header-actions {
  @include flex(row, flex-end, center);
  /* 小程序适配：gap 替换为 margin */
  .action-btn + .action-btn {
    margin-left: $spacing-sm;
  }
}

.action-btn {
  @include flex(row, center, center);
  padding: $spacing-sm $spacing-md;
  border: 2rpx solid $color-border;
  border-radius: $radius-base;
  transition: all $transition-fast $ease-in-out;
  /* 小程序适配：gap 替换为 margin */
  .svg-icon + .action-text {
    margin-left: $spacing-xs;
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

.asset-grid { display:flex; margin-top:$spacing-base; padding-top:$spacing-base; border-top:2rpx solid $color-border-light; }
.asset-grid view { flex:1; display:flex; flex-direction:column; align-items:center; }
.asset-grid view + view { border-left:2rpx solid $color-border-light; }
.asset-grid text:first-child { font-size:$font-size-base; font-weight:$font-weight-semibold; color:$color-text-primary; }
.asset-grid text:last-child { margin-top:$spacing-xs; font-size:$font-size-xs; color:$color-text-tertiary; }
.portfolio-state { padding:100rpx 0; text-align:center; color:$color-text-tertiary; }
.retry { display:block; margin-top:24rpx; color:$color-brand-primary; }
.search-state { padding: 64rpx 0; text-align: center; color: $color-text-tertiary; font-size: $font-size-sm; }
.search-error { color: $color-up; }
.muted-value { color: $color-text-tertiary; }

/* 更新时间行 */
.update-section {
  @include flex(row, center, center);
  margin-top: $spacing-sm;
  /* 小程序适配：gap 替换为 margin */
  .svg-icon + .update-text {
    margin-left: $spacing-xs;
  }
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
  flex: 1;
  /* 小程序适配：gap 替换为 margin */
  .earnings-value + .earnings-percent,
  .earnings-percent + .earnings-label {
    margin-top: $spacing-xs;
  }
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
  padding: $spacing-md 0 $spacing-sm;
  /* 小程序适配：gap 替换为 margin */
  .svg-icon + .title-text {
    margin-left: $spacing-sm;
  }
}

.title-text {
  font-size: $font-size-lg;
  font-weight: $font-weight-semibold;
  color: $color-text-primary;
}

.position-list {
  display: flex;
  flex-direction: column;
  /* 小程序适配：gap 替换为 margin */
  .position-item + .position-item {
    margin-top: $spacing-md;
  }
}

/* ==================== 空状态样式 ==================== */
.empty-state {
  @include flex(column, center, center);
  padding: $spacing-2xl 0;
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
  height: $spacing-xl;
}
</style>
