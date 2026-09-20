<template>
  <view class="page-container">
    <view class="page-header">
      <view class="back" @tap="goBack">‹</view>
      <text class="title">基金详情</text>
      <view class="back-placeholder"></view>
    </view>

    <scroll-view class="content" scroll-y>
      <view v-if="loading" class="state">正在加载基金数据...</view>
      <view v-else-if="error" class="state">
        <text>{{ error }}</text>
        <view v-if="tradeable" class="error-actions">
          <text class="error-purchase" @tap="goPurchase">进入模拟申购</text>
        </view>
        <text class="action" @tap="load">重新加载</text>
      </view>
      <template v-else-if="detail">
        <view v-if="quote" class="quote-card">
          <view class="name-row">
            <view>
              <text class="name">{{ detail?.short_name || detail?.full_name || quote.name }}</text>
              <text class="code">{{ quote.code }}</text>
            </view>
            <text v-if="quote.source" class="source">{{ quote.source }}</text>
          </view>
          <view class="price-row">
            <text class="price">{{ formatNumber(quote.price, 3) }}</text>
            <view class="change-pill" :class="quote.change_pct >= 0 ? 'up-bg' : 'down-bg'">
              <text :class="quote.change_pct >= 0 ? 'up' : 'down'">{{ formatSignedPercent(quote.change_pct) }}</text>
            </view>
          </view>
          <text class="update">行情时间：{{ formatDateTime(quote.update_time) }}</text>
        </view>

        <view v-else class="quote-card nav-card">
          <view class="name-row">
            <view>
              <text class="name">{{ detail.short_name || detail.full_name || '场外基金' }}</text>
              <text class="code">{{ code }}</text>
            </view>
            <text class="source">场外净值</text>
          </view>
          <text class="nav-label">最新单位净值</text>
          <text class="nav-value">{{ latestNav }}</text>
          <text class="update">净值日期：{{ latestNavDate }}</text>
        </view>

        <view class="actions">
          <view class="secondary-btn" @tap="toggleWatchlist">{{ followed ? '取消自选' : '添加自选' }}</view>
          <view v-if="tradeable" class="primary-btn" @tap="goPurchase">模拟申购</view>
        </view>
        <view v-if="!tradeable" class="trade-hint">该标的仅支持行情与自选，场外模拟申购请选支持交易的基金。</view>

        <view v-if="quote" class="card">
          <view class="section-heading"><text class="section-title">日内行情</text><text class="muted">{{ quote.data_date || '--' }}</text></view>
          <view class="metric-grid">
            <view><text>{{ formatNumber(quote.open, 3) }}</text><text>今开</text></view>
            <view><text>{{ formatNumber(quote.high, 3) }}</text><text>最高</text></view>
            <view><text>{{ formatNumber(quote.low, 3) }}</text><text>最低</text></view>
            <view><text>{{ formatNumber(quote.prev_close, 3) }}</text><text>昨收</text></view>
          </view>
        </view>

        <view class="card chart-card">
          <view class="section-heading"><text class="section-title">历史走势</text><text class="muted">近 60 个交易日</text></view>
          <view v-if="klineLoading" class="chart-state">走势加载中...</view>
          <view v-else-if="klineItems.length === 0" class="chart-state">暂无历史走势数据</view>
          <canvas v-else canvas-id="etf-kline" id="etf-kline" class="chart" :width="chartWidth" :height="chartHeight"></canvas>
        </view>

        <view class="card">
          <text class="section-title">基金信息</text>
          <view v-for="field in infoFields" :key="field.label" v-show="field.value" class="info-row">
            <text class="muted">{{ field.label }}</text><text class="info-value">{{ field.value }}</text>
          </view>
          <view v-if="!infoFields.some(field => field.value)" class="muted">暂无更多基金信息</view>
        </view>

        <view class="card">
          <view class="section-heading"><text class="section-title">历史净值</text><text class="muted">最新净值 {{ latestNav }}</text></view>
          <view v-if="history.length === 0" class="muted empty-line">暂无历史净值数据</view>
          <view v-for="item in history.slice(-10).reverse()" :key="item.date" class="history-row">
            <text>{{ item.date }}</text>
            <text>{{ item.nav == null ? '暂无数据' : formatNumber(item.nav, 4) }}</text>
            <text v-if="item.daily_growth != null" :class="item.daily_growth >= 0 ? 'up' : 'down'">{{ formatSignedPercent(item.daily_growth) }}</text>
            <text v-else class="muted">暂无数据</text>
          </view>
        </view>
      </template>
    </scroll-view>
  </view>
</template>

<script setup lang="ts">
import { computed, nextTick, ref } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import { getEtfDetail, getEtfKline } from '@/api/modules/market';
import type { EtfDetailRaw, KlineItemRaw, SpotQuoteRaw } from '@/api/types';
import { useWatchlistStore } from '@/stores/watchlist';
import { useAuthStore } from '@/stores/auth';
import { TRADEABLE_FUND_CODES } from '@/config/portfolio';

const code = ref('');
const detail = ref<EtfDetailRaw | null>(null);
// 白名单基金是场外交易标的，不把后端偶尔返回的行情字段当作场外申购净值。
// 其他基金只有在确实拿到 realtime 时才按场内 ETF 展示行情。
const tradeable = computed(() => TRADEABLE_FUND_CODES.has(code.value));
const quote = computed<SpotQuoteRaw | null>(() => {
  if (tradeable.value) return null;
  return detail.value?.realtime || null;
});
const history = computed(() => detail.value?.nav_history || []);
const klineItems = ref<KlineItemRaw[]>([]);
const loading = ref(true);
const klineLoading = ref(false);
const error = ref('');
const watchlistStore = useWatchlistStore();
const authStore = useAuthStore();
const followed = computed(() => Boolean(code.value && watchlistStore.isFollowed(code.value)));
const chartWidth = 690;
const chartHeight = 300;

const latestNav = computed(() => {
  const nav = [...history.value].reverse().find(item => item.nav != null)?.nav;
  return nav == null ? '暂无数据' : formatNumber(nav, 4);
});

const latestNavDate = computed(() => {
  return [...history.value].reverse().find(item => item.nav != null)?.date || '暂无数据';
});

const infoFields = computed(() => [
  { label: '基金类型', value: detail.value?.fund_type || '' },
  { label: '基金管理人', value: detail.value?.manager_company || '' },
  { label: '基金经理', value: detail.value?.fund_manager || '' },
  { label: '托管人', value: detail.value?.custodian || '' },
  { label: '跟踪标的', value: detail.value?.tracking_target || detail.value?.benchmark || '' },
  { label: '成立日期', value: detail.value?.establish_date || '' },
  { label: '发行日期', value: detail.value?.issue_date || '' },
  { label: '资产规模', value: detail.value?.net_asset_scale || '' },
  { label: '份额规模', value: detail.value?.share_scale || '' },
  { label: '管理费', value: detail.value?.management_fee || '' },
  { label: '托管费', value: detail.value?.custody_fee || '' },
  { label: '申购费', value: detail.value?.subscription_fee || detail.value?.purchase_fee || '' },
  { label: '赎回费', value: detail.value?.redemption_fee || '' },
  { label: '分红记录', value: detail.value?.dividend_history || '' },
]);

onLoad((query) => {
  // 兼容上一版搜索回退曾传入的“110020（前端）”等展示用代码。
  const rawCode = String(query?.code || '').trim();
  code.value = rawCode.match(/^\d{6}/)?.[0] || rawCode;
  load();
});

async function load() {
  if (!code.value) {
    error.value = '缺少基金代码';
    loading.value = false;
    return;
  }
  loading.value = true;
  error.value = '';
  detail.value = null;
  klineItems.value = [];
  authStore.restoreSession();
  if (authStore.isAuthenticated) void watchlistStore.fetchFollowList();

  try {
    const detailResult = await getEtfDetail(code.value);
    detail.value = detailResult;
    if (!detailResult?.realtime && !detailResult?.nav_history?.length && !detailResult?.short_name && !detailResult?.full_name) {
      error.value = '基金详情接口未返回有效数据';
      return;
    }
  } catch (e) {
    const statusCode = getHttpStatus(e);
    console.error(`[EtfDetail] 加载详情失败: HTTP ${statusCode ?? 'network'}`, e);
    error.value = getDetailErrorMessage(statusCode);
    return;
  } finally {
    loading.value = false;
  }

  // K 线接口是场内 ETF 行情接口；场外基金只展示后端返回的净值历史，
  // 不把场内价格或 K 线数据当作场外申购净值。
  if (!quote.value) return;

  klineLoading.value = true;
  try {
    const result = await getEtfKline(code.value, 'daily', 60);
    klineItems.value = result?.items || [];
  } catch (e) {
    console.warn('[EtfDetail] 加载走势失败:', e);
    klineItems.value = [];
  } finally {
    klineLoading.value = false;
    if (klineItems.value.length) {
      await nextTick();
      drawChart();
    }
  }
}

function drawChart() {
  if (!klineItems.value.length) return;
  const ctx = uni.createCanvasContext('etf-kline');
  const closes = klineItems.value.map(item => Number(item.close)).filter(Number.isFinite);
  if (!closes.length) return;
  const padding = 28;
  const min = Math.min(...closes);
  const max = Math.max(...closes);
  const range = max - min || 1;
  ctx.clearRect(0, 0, chartWidth, chartHeight);
  ctx.setStrokeStyle('#E8E0D5');
  ctx.setLineWidth(1);
  ctx.beginPath();
  ctx.moveTo(padding, chartHeight - padding);
  ctx.lineTo(chartWidth - padding, chartHeight - padding);
  ctx.stroke();
  ctx.setStrokeStyle('#B77725');
  ctx.setLineWidth(3);
  ctx.beginPath();
  closes.forEach((value, index) => {
    const x = padding + (chartWidth - padding * 2) * index / Math.max(closes.length - 1, 1);
    const y = chartHeight - padding - (value - min) / range * (chartHeight - padding * 2);
    if (index === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  });
  ctx.stroke();
  ctx.draw();
}

async function toggleWatchlist() {
  authStore.restoreSession();
  if (!authStore.isAuthenticated) {
    uni.reLaunch({ url: '/pages/login/index' });
    return;
  }
  const name = quote.value?.name || detail.value?.short_name || detail.value?.full_name;
  const wasFollowed = followed.value;
  const ok = wasFollowed
    ? await watchlistStore.removeFromFollow(code.value)
    : await watchlistStore.addToFollow(code.value, name || undefined);
  if (ok) uni.showToast({ title: wasFollowed ? '已取消自选' : '已添加自选', icon: 'success' });
}

function goPurchase() {
  const name = quote.value?.name || detail.value?.short_name || detail.value?.full_name || '';
  uni.navigateTo({
    url: `/pages/purchase/index?code=${encodeURIComponent(code.value)}&name=${encodeURIComponent(name)}`,
  });
}

function formatNumber(value: number | null | undefined, digits: number): string {
  return value == null || !Number.isFinite(Number(value)) ? '--' : Number(value).toFixed(digits);
}

function formatSignedPercent(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(Number(value))) return '--';
  return `${Number(value) >= 0 ? '+' : ''}${Number(value).toFixed(2)}%`;
}

function formatDateTime(value?: string) {
  return value ? value.replace('T', ' ').replace('+08:00', '') : '--';
}

function getHttpStatus(errorValue: unknown): number | null {
  if (!errorValue || typeof errorValue !== 'object') return null;
  const statusCode = (errorValue as { statusCode?: unknown }).statusCode;
  return typeof statusCode === 'number' ? statusCode : null;
}

function getDetailErrorMessage(statusCode: number | null): string {
  if (statusCode === 400) return '基金代码格式无效';
  if (statusCode === 404) return '基金不存在或详情接口未收录';
  if (statusCode != null && statusCode >= 500) return '基金详情服务暂时不可用，请稍后重试';
  if (statusCode != null) return `基金详情加载失败（HTTP ${statusCode}）`;
  return '基金详情暂时无法获取，请检查网络后重试';
}

function goBack() { uni.navigateBack({ delta: 1 }); }
</script>

<style lang="scss" scoped>
.page-container { min-height: 100vh; background: $color-bg-primary; }
.page-header { display: flex; justify-content: space-between; align-items: center; padding: 24rpx 32rpx; }
.back, .back-placeholder { width: 56rpx; font-size: 56rpx; color: $color-text-primary; text-align: center; }
.title { font-size: 36rpx; font-weight: 600; }
.content { height: calc(100vh - 112rpx); padding: 0 32rpx; box-sizing: border-box; }
.state, .chart-state { padding: 80rpx 0; text-align: center; color: $color-text-tertiary; }
.action { display: block; margin-top: 24rpx; color: $color-brand-primary; }
.error-actions { margin-top: 28rpx; }
.error-purchase { display: inline-block; padding: 20rpx 28rpx; color: #fff; background: $color-brand-primary; border-radius: 16rpx; }
.quote-card, .card { margin-bottom: 24rpx; padding: 32rpx; background: #fff; border-radius: 24rpx; }
.name-row, .section-heading, .price-row, .info-row, .history-row { display: flex; justify-content: space-between; align-items: center; }
.name { display: block; font-size: 36rpx; font-weight: 700; }
.code, .update, .muted, .source { display: block; margin-top: 12rpx; color: $color-text-tertiary; font-size: 24rpx; }
.source { margin-top: 0; padding: 6rpx 12rpx; background: $color-brand-bg; border-radius: 8rpx; }
.nav-label { display: block; margin-top: 32rpx; color: $color-text-tertiary; font-size: 24rpx; }
.nav-value { display: block; margin-top: 10rpx; font-size: 64rpx; font-weight: 700; }
.price-row { justify-content: flex-start; align-items: baseline; margin-top: 28rpx; }
.price { font-size: 64rpx; font-weight: 700; }
.change-pill { margin-left: 24rpx; padding: 10rpx 16rpx; border-radius: 14rpx; }
.up { color: #d94c4c; }.down { color: #00aa44; }.up-bg { background: #fdecec; }.down-bg { background: #e8f8ee; }
.actions { display: flex; gap: 24rpx; margin-bottom: 16rpx; }
.primary-btn, .secondary-btn { flex: 1; padding: 24rpx; text-align: center; border-radius: 18rpx; }
.primary-btn { color: #fff; background: $color-brand-primary; }.secondary-btn { color: $color-brand-primary; background: $color-brand-bg; }
.trade-hint { margin: 0 8rpx 24rpx; color: $color-text-tertiary; font-size: 24rpx; }
.section-title { font-size: 30rpx; font-weight: 600; }.section-heading .muted { margin-top: 0; }
.metric-grid { display: flex; margin-top: 24rpx; padding-top: 24rpx; border-top: 1rpx solid $color-border-light; }
.metric-grid view { flex: 1; text-align: center; }.metric-grid view + view { border-left: 1rpx solid $color-border-light; }
.metric-grid view text:first-child { display: block; font-size: 28rpx; font-weight: 600; }.metric-grid view text:last-child { display: block; margin-top: 8rpx; color: $color-text-tertiary; font-size: 22rpx; }
.chart { display: block; width: 100%; height: 300px; margin-top: 20rpx; }
.info-row { padding: 18rpx 0; border-bottom: 1rpx solid $color-border-light; }.info-row .muted { margin-top: 0; }.info-value { max-width: 70%; text-align: right; color: $color-text-primary; font-size: 26rpx; }
.history-row { padding: 16rpx 0; border-bottom: 1rpx solid $color-border-light; font-size: 24rpx; }.history-row .muted { margin-top: 0; }.empty-line { padding-top: 24rpx; }
</style>
