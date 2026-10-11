<template>
  <view class="page-container">
    <view class="page-header" :style="headerStyle">
      <button class="back" aria-label="返回上一页" @tap="goBack">‹</button>
      <view class="header-fund">
        <text class="header-name">{{ fundName }}</text>
      </view>
      <text class="status-tag">{{ followed ? '已自选' : '未自选' }}</text>
    </view>

    <scroll-view class="content" scroll-y :scroll-into-view="scrollTarget" scroll-with-animation>
      <view class="page-body">
      <view v-if="loading" class="state-card"><view class="loading-dot"></view><text>正在加载基金数据...</text></view>
      <view v-else-if="error" class="state-card">
        <text class="state-title">基金数据暂不可用</text>
        <text class="state-description">{{ error }}</text>
        <button class="retry-btn" @tap="load">重新加载</button>
      </view>
      <template v-else-if="detail">
        <view class="card summary-card">
          <view class="summary-heading">
            <view class="summary-identity"><text class="fund-name">{{ fundName }}</text><text class="fund-code">基金代码 {{ code }}</text></view>
          </view>
          <view class="fund-tags"><text class="tag">{{ detail.fund_type || '类型暂无数据' }}</text><text class="tag tag-muted">风险等级：暂无数据</text></view>
          <view class="summary-stats">
            <view class="summary-stat"><text class="stat-label">近1年涨跌幅</text><text class="summary-number" :class="[changeClass(yearChange), { 'number-empty': yearChange == null }]">{{ formatSignedPercent(yearChange) }}</text></view>
            <view class="summary-stat"><text class="stat-label">日涨跌幅</text><text class="summary-number" :class="[changeClass(dailyChange), { 'number-empty': dailyChange == null }]">{{ formatSignedPercent(dailyChange) }}</text></view>
            <view class="summary-stat"><text class="stat-label">单位净值</text><text class="summary-number" :class="{ 'number-empty': !latestNavItem }">{{ latestNav }}</text></view>
          </view>
          <text class="update">更新时间：{{ quote ? formatDateTime(quote.update_time || quote.data_date) : latestNavItem ? latestNavDate : latestKline?.date || '暂无数据' }}</text>
          <view v-if="quote || latestKline" class="market-price-row"><text class="stat-label">{{ quote ? '最新行情价格' : '最新收盘价（非单位净值）' }}</text><text>{{ formatNumber(quote ? quote.price : latestKline?.close, 3) }} 元</text></view>
          <view v-if="quote || latestKline" class="intraday-grid">
            <view v-for="field in quoteFields" :key="field.label"><text class="mini-value">{{ formatNumber(field.value, 3) }}</text><text class="stat-label">{{ field.label }}</text></view>
          </view>
        </view>

        <view class="card performance-card">
          <view class="section-heading"><text class="section-title">业绩表现</text><text class="section-note">{{ canLoadMarket ? '行情 / 净值' : '历史净值' }}</text></view>
          <view class="metric-tabs">
            <button v-for="item in metrics" :key="item.key" class="metric-tab" :class="{ active: metric === item.key }" :aria-label="item.label" @tap="metric = item.key">{{ item.label }}</button>
          </view>
          <text class="performance-subtitle">{{ selectedPeriodLabel }}{{ metric === 'growth' ? '涨跌幅' : '单位净值' }}</text>
          <view class="comparison-grid">
            <view><view class="comparison-label"><view class="legend-line"></view><text>本基金</text></view><text class="comparison-value" :class="[metric === 'growth' ? changeClass(intervalChange) : '', { 'muted-value': metric === 'growth' ? intervalChange == null : !latestNavItem }]">{{ metric === 'growth' ? formatSignedPercent(intervalChange) : latestNav }}</text></view>
            <view><view class="comparison-label"><view class="legend-line index-line"></view><text>对应指数</text></view><text class="comparison-value muted-value">暂无数据</text></view>
            <view><view class="comparison-label"><view class="legend-line peer-line"></view><text>同类平均</text></view><text class="comparison-value muted-value">暂无数据</text></view>
          </view>
          <text v-if="detail.tracking_target" class="index-description">对应指数：{{ detail.tracking_target }}（暂无对比走势）</text>
          <view v-if="klineLoading && canLoadMarket && metric === 'growth'" class="chart-state">走势加载中...</view>
          <view v-else-if="chartPoints.length < 2" class="chart-state"><view class="empty-chart-icon"><view></view><view></view><view></view></view><text>暂无数据</text><text class="empty-sub">{{ chartPoints.length === 1 ? '仅有一个数据点，暂无法展示走势' : '当前区间暂无可展示的历史数据' }}</text></view>
          <canvas v-else canvas-id="etf-kline" id="etf-kline" class="chart" :style="{ height: `${chartHeight}px` }" :width="chartWidth" :height="chartHeight"></canvas>
          <view v-if="chartPoints.length > 1" class="chart-dates"><text>{{ chartPoints[0].date }}</text><text>{{ chartPoints[chartPoints.length - 1].date }}</text></view>
          <view class="period-tabs"><button v-for="item in periods" :key="item.months" class="period-tab" :class="{ selected: periodMonths === item.months }" @tap="periodMonths = item.months">{{ item.label }}</button></view>
          <text class="data-note">{{ chartNote }}</text>
          <button class="history-link" @tap="showHistory">查看历史净值 <text>›</text></button>
        </view>

        <view class="card">
          <view class="section-heading"><text class="section-title">基金档案</text><text class="section-note">基本信息</text></view>
          <view class="profile-grid"><view><text class="stat-label">成立时间</text><text class="highlight-value">{{ establishmentDate }}</text></view><view><text class="stat-label">基金规模</text><text class="highlight-value">{{ fundScale }}</text></view><view><text class="stat-label">持有人数</text><text class="highlight-value">暂无数据</text></view></view>
          <text v-if="scaleDate" class="data-note">基金规模截至 {{ scaleDate }}</text>
          <text class="sub-heading">基金经理</text>
          <view v-for="manager in managers" :key="manager" class="manager-card">
            <view class="manager-heading"><text class="manager-name">{{ manager }}</text><text class="tag tag-muted">从业时间：暂无数据</text></view>
            <view class="manager-grid"><view><text class="stat-label">年均回报</text><text class="highlight-value">暂无数据</text></view><view><text class="stat-label">任职区间</text><text class="highlight-value">暂无数据</text></view><view><text class="stat-label">任职回报</text><text class="highlight-value">暂无数据</text></view></view>
          </view>
          <view class="company-row"><text class="info-label">基金公司</text><text class="company-name">{{ detail.manager_company || '暂无数据' }}</text></view>
          <view v-for="field in infoFields" :key="field.label" class="info-row"><text class="info-label">{{ field.label }}</text><text class="info-value">{{ field.value || '暂无数据' }}</text></view>
        </view>

        <view class="card">
          <view class="section-heading"><text class="section-title">持仓分布</text><text class="section-note">基金组合</text></view>
          <view class="allocation-section"><view class="allocation-placeholder"><text>资产配置</text><text>暂无数据</text></view><view class="allocation-list"><view v-for="(asset, index) in assetLabels" :key="asset" class="allocation-row"><view class="asset-swatch" :class="`asset-${index}`"></view><text>{{ asset }}</text><text class="allocation-value">暂无数据</text></view></view></view>
          <text class="sub-heading">重点持仓 ETF</text>
          <view class="holding-table-head"><text class="holding-name-col">名称 / 代码</text><text>占净值比</text></view><view class="holding-table-empty">暂无数据</view>
          <text class="sub-heading">前五大持仓个股</text>
          <view class="holding-table-head"><text class="holding-name-col">名称 / 代码</text><text class="holding-change-col">涨跌幅</text><text>占净值比</text></view><view class="holding-table-empty">暂无数据</view>
          <text class="data-note">当前基金接口未提供资产配置和底层持仓数据。</text>
        </view>

        <view class="card">
          <view class="section-heading"><text class="section-title">交易规则</text><text class="section-note">{{ tradeable ? '场外模拟交易' : '交易说明' }}</text></view>
          <view class="buy-flow"><view v-for="step in buySteps" :key="step.title" class="flow-step"><view class="step-dot"></view><text class="step-title">{{ step.title }}</text><text class="step-date">{{ step.date }}</text></view></view>
          <text class="rule-description">{{ buyTimingLabel }}</text>
          <text class="fee-title">买入费率</text>
          <view class="fee-table"><view class="fee-row fee-head"><text>项目</text><text>内容</text></view><view class="fee-row"><text>起购金额</text><text>10 元（支持定投）</text></view><view class="fee-row"><text>买入手续费</text><view class="fee-content"><text>0.06%</text><text class="fee-original">原费率 0.60%，一折</text></view></view></view>
          <text class="fee-title">赎回费率</text>
          <view class="fee-table"><view class="fee-row fee-head"><text>持有期限</text><text>赎回费率</text></view><view v-for="fee in redemptionFees" :key="fee.period" class="fee-row"><text>{{ fee.period }}</text><text>{{ fee.rate }}</text></view></view>
          <text class="data-note">以上为页面展示规则，实际模拟交易费用及确认结果以后台订单为准。日期按北京时间、15:00 截止及周末顺延计算；法定休市日以实际确认结果为准。</text>
          <text v-if="!tradeable" class="data-note">场内 ETF 仅支持行情与自选，不提供模拟申购入口。</text>
        </view>

        <view class="card">
          <view class="section-heading"><text class="section-title">常见问答</text><text class="section-note">共 3 条</text></view>
          <view v-for="(faq, index) in faqs" :key="faq.question" class="faq-item"><button class="faq-question" :aria-expanded="faqOpen[index]" @tap="faqOpen[index] = !faqOpen[index]"><text>{{ faq.question }}</text><text class="faq-sign">{{ faqOpen[index] ? '−' : '+' }}</text></button><text v-if="faqOpen[index]" class="faq-answer">{{ faq.answer }}</text></view>
        </view>
        <view class="card risk-note"><text class="risk-title">风险提示</text><text>基金净值与市场价格会随市场波动。历史表现不代表未来收益，模拟交易结果不构成投资建议。</text></view>
        <view v-if="historyOpen" id="nav-history" class="card">
          <view class="section-heading"><text class="section-title">历史净值</text><text class="section-note">最近 10 条</text></view>
          <view class="history-row table-heading"><text>日期</text><text>单位净值</text><text>日涨跌幅</text></view>
          <view v-if="!recentHistory.length" class="history-empty">暂无数据</view>
          <view v-for="item in recentHistory" :key="item.date" class="history-row"><text>{{ item.date }}</text><text>{{ formatNumber(item.nav, 4) }}</text><text :class="changeClass(item.daily_growth)">{{ formatSignedPercent(item.daily_growth) }}</text></view>
        </view>
      </template>
      </view>
    </scroll-view>

    <view class="actionbar">
      <button class="favorite-btn" :class="{ 'favorite-only': !tradeable, followed }" :disabled="!code || loading || favoriteLoading" @tap="toggleWatchlist"><text class="favorite-star">{{ followed ? '★' : '☆' }}</text><text>{{ favoriteLoading ? '处理中...' : followed ? '取消自选' : '添加自选' }}</text></button>
      <button v-if="tradeable" class="purchase-btn" :disabled="!code || loading" @tap="goPurchase">模拟申购 <text>›</text></button>
    </view>
  </view>
</template>

<!-- 数据与交易操作仍使用原有接口和用户 Store。 -->

<script setup lang="ts">
import { computed, nextTick, ref, watch, getCurrentInstance } from 'vue';
import { onLoad, onShow, onHide, onUnload } from '@dcloudio/uni-app';
import { getEtfDetail, getEtfKline, getSpot } from '@/api/modules/market';
import type { EtfDetailRaw, KlineItemRaw, SpotQuoteRaw } from '@/api/types';
import { useWatchlistStore } from '@/stores/watchlist';
import { useAuthStore } from '@/stores/auth';
import { TRADEABLE_FUND_CODES } from '@/config/portfolio';

const code = ref('');
const detail = ref<EtfDetailRaw | null>(null);
const spotQuote = ref<SpotQuoteRaw | null>(null);
// 白名单基金是场外交易标的，不把后端偶尔返回的行情字段当作场外申购净值。
// 场内基金可独立读取行情和K线，不以详情中的realtime是否存在作为前提。
const tradeable = computed(() => TRADEABLE_FUND_CODES.has(code.value));
const quote = computed<SpotQuoteRaw | null>(() => {
  if (tradeable.value) return null;
  return detail.value?.realtime || spotQuote.value || null;
});
// 已有详情行情或交易所基金代码才读取场内接口；场外白名单始终排除。
const canLoadMarket = computed(() => !tradeable.value && Boolean(quote.value || /^(?:5\d{5}|1[568]\d{4})$/.test(code.value)));
const history = computed(() => detail.value?.nav_history || []);
const klineItems = ref<KlineItemRaw[]>([]);
const loading = ref(true);
const klineLoading = ref(false);
const error = ref('');
const watchlistStore = useWatchlistStore();
const authStore = useAuthStore();
const followed = computed(() => Boolean(code.value && watchlistStore.isFollowed(code.value)));
const instance = getCurrentInstance();
const chartWidth = ref(300);
const chartHeight = 210;
const favoriteLoading = ref(false);
const scrollTarget = ref('');
const historyOpen = ref(false);
const metric = ref<'growth' | 'nav'>('growth');
const metrics = [{ key: 'growth' as const, label: '涨跌幅' }, { key: 'nav' as const, label: '单位净值' }];
const periods = [{ months: 1, label: '近1月' }, { months: 3, label: '近3月' }, { months: 6, label: '近6月' }, { months: 12, label: '近1年' }, { months: 24, label: '近2年' }];
const periodMonths = ref(12);
const selectedPeriodLabel = computed(() => periods.find(item => item.months === periodMonths.value)?.label || '');
const assetLabels = ['基金', '现金', '债券', '股票'];
const redemptionFees = [{ period: '7 日内', rate: '1.50%' }, { period: '7～29 日', rate: '0.50%' }, { period: '30～179 日', rate: '0.10%' }, { period: '180 日以上', rate: '免费' }];
const faqs = [
  { question: '买入后什么时候确认份额？', answer: '交易日15:00前提交的申请按当日净值确认，T+1日可查询份额；15:00后提交顺延至下一交易日。节假日顺延。' },
  { question: '赎回资金多久到账？', answer: '赎回确认后T+2个交易日到账银行卡，具体到账时间以银行处理进度为准。持有满180日赎回免费。' },
  { question: '联接基金和ETF有什么区别？', answer: '联接基金主要投资于目标ETF，通常通过基金销售渠道按净值申赎；ETF通过证券账户在交易所买卖，成交价格随市场波动。' },
];
const faqOpen = ref([true, false, false]);
const nowTimestamp = ref(Date.now());
let clockTimer: ReturnType<typeof setInterval> | undefined;
const buySteps = computed(() => calculateBuySteps(nowTimestamp.value));
const buyTimingLabel = computed(() => {
  const now = new Date(nowTimestamp.value + 8 * 60 * 60 * 1000);
  if (now.getUTCDay() === 0 || now.getUTCDay() === 6) return '周末提交顺延至下一交易日，T+1确认份额，T+2查看盈亏。';
  return now.getUTCHours() >= 15 ? '15:00后提交顺延一个交易日，T+1确认份额，T+2查看盈亏。' : '交易日15:00前当天提交，T+1确认份额，T+2查看盈亏。';
});
const systemInfo = uni.getSystemInfoSync();
const headerStyle = ref({ paddingTop: `${(systemInfo.statusBarHeight || 0) + 10}px`, paddingRight: '24rpx', minHeight: '52px' });
// 微信胶囊由系统绘制，给它预留空间，不复制原型的系统状态栏。
// #ifdef MP-WEIXIN
const capsule = uni.getMenuButtonBoundingClientRect();
if (capsule?.width) {
  headerStyle.value = { paddingTop: `${capsule.top}px`, paddingRight: `${systemInfo.windowWidth - capsule.left + 12}px`, minHeight: `${capsule.height + 12}px` };
}
// #endif
const fundName = computed(() => detail.value?.short_name || detail.value?.full_name || quote.value?.name || '基金详情');
const sortedHistory = computed(() => [...history.value].filter(item => dateTimestamp(item.date) != null).sort((a, b) => dateTimestamp(a.date)! - dateTimestamp(b.date)!));
const recentHistory = computed(() => sortedHistory.value.slice(-10).reverse());
const latestNavItem = computed(() => [...sortedHistory.value].reverse().find(item => finiteNumber(item.nav) != null));
const latestKline = computed(() => [...klineItems.value].filter(item => dateTimestamp(item.date) != null).sort((a, b) => dateTimestamp(a.date)! - dateTimestamp(b.date)!).pop());
const dailyChange = computed(() => finiteNumber(quote.value?.change_pct) ?? finiteNumber(latestNavItem.value?.daily_growth) ?? (canLoadMarket.value ? finiteNumber(latestKline.value?.change_pct) : null));
const establishmentDate = computed(() => detail.value?.establish_date?.split('/')[0].trim() || '暂无数据');
const fundScale = computed(() => detail.value?.net_asset_scale?.split(/[（(]/)[0].trim() || '暂无数据');
const scaleDate = computed(() => detail.value?.net_asset_scale?.match(/截止至[：:]\s*([^）)]+)/)?.[1] || '');
const managers = computed(() => {
  const names = detail.value?.fund_manager?.split(/[、,，;；]/).map(name => name.trim()).filter(Boolean) || [];
  return names.length ? names : ['暂无数据'];
});
const quoteFields = computed(() => [
  { label: quote.value ? '今开' : '开盘', value: quote.value?.open ?? latestKline.value?.open }, { label: '最高', value: quote.value?.high ?? latestKline.value?.high },
  { label: '最低', value: quote.value?.low ?? latestKline.value?.low }, { label: quote.value ? '昨收' : '收盘', value: quote.value?.prev_close ?? latestKline.value?.close },
]);

type ChartPoint = { date: string; timestamp: number; value: number };
const usesKline = computed(() => canLoadMarket.value && metric.value === 'growth');
const allChartPoints = computed<ChartPoint[]>(() => {
  const source = usesKline.value
    ? klineItems.value.map(item => ({ date: item.date, value: item.close }))
    : sortedHistory.value.map(item => ({ date: item.date, value: item.nav }));
  return source.reduce<ChartPoint[]>((points, item) => {
    const timestamp = dateTimestamp(item.date);
    const value = finiteNumber(item.value);
    if (timestamp != null && value != null && value > 0) points.push({ date: item.date.slice(0, 10), timestamp, value });
    return points;
  }, []).sort((a, b) => a.timestamp - b.timestamp);
});
const chartPoints = computed<ChartPoint[]>(() => {
  const valid = allChartPoints.value;
  // 按最新可用数据日期向前选区间，不补造缺失日期。
  if (!valid.length) return [];
  const last = new Date(valid[valid.length - 1].timestamp);
  const day = last.getDate();
  last.setDate(1);
  last.setMonth(last.getMonth() - periodMonths.value);
  const lastDay = new Date(last.getFullYear(), last.getMonth() + 1, 0).getDate();
  last.setDate(Math.min(day, lastDay));
  return valid.filter(item => item.timestamp >= last.getTime());
});
const yearChange = computed(() => {
  const source = canLoadMarket.value ? klineItems.value.map(item => ({ date: item.date, value: item.close })) : sortedHistory.value.map(item => ({ date: item.date, value: item.nav }));
  const valid = source.filter(item => dateTimestamp(item.date) != null && (finiteNumber(item.value) ?? 0) > 0).sort((a, b) => dateTimestamp(a.date)! - dateTimestamp(b.date)!);
  if (valid.length < 2) return null;
  const latest = valid[valid.length - 1];
  const boundary = new Date(dateTimestamp(latest.date)!);
  boundary.setFullYear(boundary.getFullYear() - 1);
  const base = [...valid].reverse().find(item => dateTimestamp(item.date)! <= boundary.getTime());
  return base ? (Number(latest.value) / Number(base.value) - 1) * 100 : null;
});
const intervalChange = computed(() => {
  const points = chartPoints.value;
  return points.length < 2 ? null : (points[points.length - 1].value / points[0].value - 1) * 100;
});
const chartNote = computed(() => {
  const source = usesKline.value ? '使用K线接口返回的真实收盘价，非单位净值。' : '使用详情接口返回的历史净值。';
  const coverage = chartPoints.value.length > 1 ? `实际覆盖 ${chartPoints.value[0].date} 至 ${chartPoints.value[chartPoints.value.length - 1].date}。` : '';
  return `${source}${coverage}${metric.value === 'growth' ? '涨跌幅按区间首末数据计算，未复权，不代表含分红收益。' : ''}`;
});

watch([chartPoints, metric, loading, klineLoading], async () => {
  await nextTick();
  if (loading.value || (usesKline.value && klineLoading.value)) return;
  drawChart();
});

const latestNav = computed(() => {
  return latestNavItem.value == null ? '暂无数据' : formatNumber(latestNavItem.value.nav, 4);
});

const latestNavDate = computed(() => {
  return latestNavItem.value?.date || '暂无数据';
});

const infoFields = computed(() => [
  { label: '托管人', value: detail.value?.custodian || '' },
  { label: '跟踪标的', value: detail.value?.tracking_target || detail.value?.benchmark || '' },
  { label: '发行日期', value: detail.value?.issue_date || '' },
  { label: '份额规模', value: detail.value?.share_scale || '' },
  { label: '管理费', value: detail.value?.management_fee || '' },
  { label: '托管费', value: detail.value?.custody_fee || '' },
  { label: '分红记录', value: detail.value?.dividend_history || '' },
]);

onLoad((query) => {
  // 兼容上一版搜索回退曾传入的“110020（前端）”等展示用代码。
  const rawCode = String(query?.code || '').trim();
  code.value = rawCode.match(/^\d{6}/)?.[0] || rawCode;
  load();
});

onShow(() => {
  authStore.restoreSession();
  if (authStore.isAuthenticated) void watchlistStore.fetchFollowList();
  nowTimestamp.value = Date.now();
  if (!clockTimer) clockTimer = setInterval(() => { nowTimestamp.value = Date.now(); }, 1000);
});
function stopClock() { if (clockTimer) clearInterval(clockTimer); clockTimer = undefined; }
onHide(stopClock);
onUnload(stopClock);

async function load() {
  if (!code.value) {
    error.value = '缺少基金代码';
    loading.value = false;
    return;
  }
  loading.value = true;
  error.value = '';
  detail.value = null;
  spotQuote.value = null;
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

  // 实测详情可能没有实时行情，但独立K线接口仍有历史数据，不能以quote为空提前退出。
  if (!canLoadMarket.value) return;

  klineLoading.value = true;
  try {
    const [spot, kline] = await Promise.allSettled([
      quote.value ? Promise.resolve({ data: quote.value, error: null }) : getSpot(code.value),
      getEtfKline(code.value, 'daily', 600),
    ]);
    if (spot.status === 'fulfilled') spotQuote.value = spot.value.data || null;
    else console.warn('[EtfDetail] 独立行情不可用:', spot.reason);
    if (kline.status === 'fulfilled') klineItems.value = kline.value.items || [];
    else console.warn('[EtfDetail] 加载走势失败:', kline.reason);
  } finally {
    klineLoading.value = false;
  }
}

function drawChart() {
  if (chartPoints.value.length < 2) return;
  // 使用实际渲染宽度，解决原图固定690px在手机上被裁切的问题。
  const query = uni.createSelectorQuery();
  if (instance) query.in(instance.proxy);
  query.select('#etf-kline').boundingClientRect(async (result) => {
    if (!result || Array.isArray(result) || !result.width) return;
    chartWidth.value = result.width;
    await nextTick();
    const points = chartPoints.value;
    if (points.length < 2) return;
    const values = points.map(item => metric.value === 'growth' ? (item.value / points[0].value - 1) * 100 : item.value);
    const low = Math.min(...values);
    const high = Math.max(...values);
    const padding = (high - low) * 0.12 || Math.max(Math.abs(high) * 0.01, 0.01);
    const min = low - padding;
    const max = high + padding;
    const width = chartWidth.value;
    const left = 54, right = width - 8, top = 16, bottom = chartHeight - 18;
    const ctx = uni.createCanvasContext('etf-kline', instance?.proxy);
    ctx.clearRect(0, 0, width, chartHeight);
    ctx.setFontSize(10);
    ctx.setTextAlign('left');
    for (let index = 0; index < 5; index++) {
      const y = top + (bottom - top) * index / 4;
      const tick = max - (max - min) * index / 4;
      ctx.setFillStyle('#96908A');
      ctx.fillText(metric.value === 'growth' ? `${tick.toFixed(1)}%` : tick.toFixed(4), 0, y + 4);
      ctx.setStrokeStyle('#EEEAE3');
      ctx.setLineWidth(0.5);
      ctx.beginPath(); ctx.moveTo(left, y); ctx.lineTo(right, y); ctx.stroke();
    }
    ctx.setStrokeStyle('#BC7C24');
    ctx.setLineWidth(2);
    ctx.beginPath();
    const timeSpan = points[points.length - 1].timestamp - points[0].timestamp;
    values.forEach((value, index) => {
      const fraction = timeSpan > 0 ? (points[index].timestamp - points[0].timestamp) / timeSpan : index / (points.length - 1);
      const x = left + (right - left) * fraction;
      const y = bottom - (value - min) / (max - min) * (bottom - top);
      if (index === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.stroke(); ctx.draw();
  }).exec();
}

async function toggleWatchlist() {
  if (favoriteLoading.value || !code.value) return;
  authStore.restoreSession();
  if (!authStore.isAuthenticated) {
    uni.reLaunch({ url: '/pages/login/index' });
    return;
  }
  const name = quote.value?.name || detail.value?.short_name || detail.value?.full_name;
  const wasFollowed = followed.value;
  favoriteLoading.value = true;
  try {
    const ok = wasFollowed
      ? await watchlistStore.removeFromFollow(code.value)
      : await watchlistStore.addToFollow(code.value, name || undefined);
    if (ok) uni.showToast({ title: wasFollowed ? '已取消自选' : '已添加自选', icon: 'success' });
  } finally {
    favoriteLoading.value = false;
  }
}

function goPurchase() {
  if (!tradeable.value || !code.value) return;
  const name = quote.value?.name || detail.value?.short_name || detail.value?.full_name || '';
  uni.navigateTo({
    url: `/pages/purchase/index?code=${encodeURIComponent(code.value)}&name=${encodeURIComponent(name)}`,
  });
}

function finiteNumber(value: unknown): number | null {
  if (value == null || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function dateTimestamp(value: string): number | null {
  const matched = /^(\d{4})[-/](\d{2})[-/](\d{2})/.exec(value);
  if (!matched) return null;
  const [, year, month, day] = matched;
  const date = new Date(Number(year), Number(month) - 1, Number(day));
  return date.getFullYear() === Number(year) && date.getMonth() === Number(month) - 1 && date.getDate() === Number(day) ? date.getTime() : null;
}

function changeClass(value: unknown) {
  const number = finiteNumber(value);
  return number == null || number === 0 ? '' : number > 0 ? 'up' : 'down';
}

async function showHistory() {
  historyOpen.value = true;
  scrollTarget.value = '';
  await nextTick();
  scrollTarget.value = 'nav-history';
}

/** 仅处理北京时间15:00截止及周末；无交易日历接口，法定休市日不猜测。 */
function calculateBuySteps(timestamp: number) {
  const now = new Date(timestamp + 8 * 60 * 60 * 1000);
  const submission = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const isWeekend = (date: Date) => date.getUTCDay() === 0 || date.getUTCDay() === 6;
  const nextTradingDay = (date: Date) => {
    const next = new Date(date.getTime());
    do { next.setUTCDate(next.getUTCDate() + 1); } while (isWeekend(next));
    return next;
  };
  let effective = submission;
  if (isWeekend(effective)) { while (isWeekend(effective)) effective.setUTCDate(effective.getUTCDate() + 1); }
  else if (now.getUTCHours() >= 15) effective = nextTradingDay(effective);
  const confirmed = nextTradingDay(effective);
  const visible = nextTradingDay(confirmed);
  const format = (date: Date) => `${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
  return [{ title: '现在买入', date: format(effective) }, { title: '确认份额', date: format(confirmed) }, { title: '查看盈亏', date: format(visible) }];
}

function formatNumber(value: number | null | undefined, digits: number): string {
  return finiteNumber(value) == null ? '暂无数据' : Number(value).toFixed(digits);
}

function formatSignedPercent(value: number | null | undefined): string {
  if (finiteNumber(value) == null) return '暂无数据';
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
.page-container { display: flex; flex-direction: column; height: 100vh; overflow: hidden; background: #F7F4ED; color: #29251F; font-size: 26rpx; }
button { margin: 0; padding: 0; border-radius: 0; background: transparent; color: inherit; font-size: inherit; line-height: 1.4; }
button::after { border: 0; }
button[disabled] { opacity: .45; background: transparent; color: inherit; }
.page-header { flex-shrink: 0; display: flex; align-items: center; padding: 0 24rpx 16rpx; background: #F7F4ED; }
.back { flex-shrink: 0; width: 72rpx; height: 80rpx; line-height: 72rpx; text-align: left; font-size: 64rpx; font-weight: 300; }
.header-fund { flex: 1; min-width: 0; }
.header-name { display: block; font-size: 28rpx; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.status-tag { flex-shrink: 0; margin-left: 12rpx; padding: 7rpx 12rpx; border: 1rpx solid #E8D9BE; border-radius: 24rpx; color: #9D712D; font-size: 20rpx; }
.content { flex: 1; height: 0; min-height: 0; }
.page-body { padding: 12rpx 24rpx 28rpx; }
.card { padding: 32rpx; margin-bottom: 24rpx; background: #fff; border-radius: 28rpx; border: 1rpx solid #F0EBE2; }
.summary-card { padding-top: 36rpx; box-shadow: 0 8rpx 28rpx rgba(69, 51, 23, .025); }
.summary-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 16rpx; }
.summary-identity { flex: 1; min-width: 0; }
.fund-name { display: block; font-size: 36rpx; line-height: 1.45; font-weight: 650; word-break: break-all; }
.fund-code { display: block; margin-top: 8rpx; color: #989083; font-size: 23rpx; letter-spacing: 1rpx; }
.fund-tags { display: flex; flex-wrap: wrap; gap: 10rpx; margin-top: 24rpx; }
.tag { padding: 6rpx 14rpx; border-radius: 8rpx; background: #F7F1E7; color: #9B722F; font-size: 20rpx; }
.tag-muted { color: #8A8379; background: #F6F5F2; }
.summary-stats { display: flex; align-items: flex-start; margin-top: 28rpx; padding-top: 28rpx; border-top: 1rpx solid #F1EEE8; gap: 16rpx; }
.summary-stat { flex: 1; min-width: 0; }
.stat-label { display: block; color: #918A7F; font-size: 22rpx; line-height: 1.5; }
.summary-number { display: block; margin-top: 12rpx; font-size: 36rpx; line-height: 1.5; font-weight: 600; font-variant-numeric: tabular-nums; }
.number-empty { font-size: 24rpx; color: #9A9286; line-height: 2.25; font-weight: 400; }
.up { color: #D6554D; }.down { color: #329474; }
.update { display: block; margin-top: 22rpx; color: #A0988C; font-size: 21rpx; }
.market-price-row { display: flex; justify-content: space-between; align-items: center; gap: 12rpx; margin-top: 24rpx; padding-top: 22rpx; border-top: 1rpx solid #F1EEE8; font-size: 26rpx; font-variant-numeric: tabular-nums; }
.intraday-grid { display: flex; margin-top: 28rpx; padding-top: 24rpx; border-top: 1rpx solid #F1EEE8; }
.intraday-grid > view { flex: 1; text-align: center; }
.intraday-grid > view + view { border-left: 1rpx solid #F1EEE8; }
.mini-value { display: block; font-size: 26rpx; font-weight: 500; margin-bottom: 6rpx; }
.section-heading { display: flex; align-items: center; justify-content: space-between; gap: 12rpx; margin-bottom: 24rpx; }
.section-title { font-size: 32rpx; font-weight: 650; }
.section-note { color: #A29A8D; font-size: 20rpx; }
.metric-tabs { display: flex; gap: 36rpx; border-bottom: 1rpx solid #F0EDE7; }
.metric-tab { position: relative; padding: 0 0 20rpx; font-size: 26rpx; color: #948C81; text-align: left; min-height: 64rpx; }
.metric-tab.active { color: #B47A24; font-weight: 600; }
.metric-tab.active::before { content: ''; position: absolute; bottom: 0; left: 0; width: 36rpx; height: 5rpx; border-radius: 4rpx; background: #BC812D; }
.performance-subtitle { display: block; margin-top: 24rpx; font-size: 24rpx; font-weight: 500; }
.comparison-grid { display: flex; gap: 12rpx; margin: 22rpx 0; }
.comparison-grid > view { flex: 1; min-width: 0; }
.comparison-label { display: flex; align-items: center; gap: 8rpx; color: #968D81; font-size: 21rpx; }
.legend-line { width: 24rpx; border-top: 4rpx solid #BC7C24; }
.index-line { border-color: #B7A488; border-top-style: dashed; }
.peer-line { border-color: #BFC3BF; border-top-style: dotted; }
.comparison-value { display: block; margin-top: 12rpx; font-size: 30rpx; font-weight: 600; font-variant-numeric: tabular-nums; }
.muted-value { color: #A39B8F; font-size: 23rpx; line-height: 1.8; font-weight: 400; }
.index-description { display: block; margin-bottom: 12rpx; color: #A39B8F; font-size: 20rpx; line-height: 1.6; }
.chart { width: 100%; display: block; }
.chart-dates { display: flex; justify-content: space-between; padding-left: 108rpx; margin-top: 8rpx; color: #9A938A; font-size: 19rpx; }
.chart-state { height: 350rpx; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 16rpx; color: #918A80; font-size: 26rpx; }
.empty-sub { display: block; font-size: 21rpx; color: #AEA69A; }
.empty-chart-icon { display: flex; align-items: flex-end; gap: 8rpx; width: 60rpx; height: 52rpx; margin-bottom: 8rpx; }
.empty-chart-icon view { width: 12rpx; height: 28rpx; background: #E9E2D6; border-radius: 4rpx; }
.empty-chart-icon view:nth-child(2) { height: 48rpx; }.empty-chart-icon view:nth-child(3) { height: 36rpx; }
.period-tabs { display: flex; gap: 6rpx; margin-top: 28rpx; padding: 6rpx; border-radius: 14rpx; background: #F7F5F0; }
.period-tab { flex: 1; min-width: 0; padding: 16rpx 0; font-size: 22rpx; color: #928A7F; border-radius: 10rpx; }
.period-tab.selected { color: #A66B18; background: #F5E8CA; font-weight: 600; }
.data-note { display: block; margin-top: 18rpx; color: #A39B8F; font-size: 20rpx; line-height: 1.65; }
.history-link { display: flex; align-items: center; justify-content: center; gap: 12rpx; margin-top: 22rpx; padding-top: 22rpx; min-height: 52rpx; border-top: 1rpx solid #F0EDE7; color: #A97A32; font-size: 23rpx; }
.history-link text { font-size: 32rpx; }
.profile-grid, .manager-grid { display: flex; gap: 16rpx; }
.profile-grid > view, .manager-grid > view { flex: 1; min-width: 0; }
.profile-grid { padding-bottom: 20rpx; border-bottom: 1rpx solid #F1EEE8; }
.highlight-value { display: block; margin-top: 10rpx; line-height: 1.5; font-size: 25rpx; font-weight: 500; word-break: break-all; }
.sub-heading { display: block; margin: 28rpx 0 20rpx; font-size: 25rpx; font-weight: 600; }
.manager-card { padding: 24rpx; margin-top: 16rpx; background: #FAF8F4; border: 1rpx solid #F0EAE0; border-radius: 18rpx; }
.manager-heading { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12rpx; padding-bottom: 24rpx; }
.manager-name { font-size: 28rpx; font-weight: 600; }
.manager-grid .highlight-value { color: #968D81; font-size: 22rpx; font-weight: 400; }
.company-row { display: flex; align-items: center; justify-content: space-between; gap: 20rpx; margin-top: 28rpx; padding: 24rpx 0; border-bottom: 1rpx solid #F1EEE8; }
.company-name { flex: 1; text-align: right; font-size: 27rpx; font-weight: 500; }
.info-row { display: flex; justify-content: space-between; align-items: flex-start; gap: 24rpx; padding: 24rpx 0; border-bottom: 1rpx solid #F1EEE8; }
.info-row:last-child { border: 0; padding-bottom: 4rpx; }
.info-label { flex-shrink: 0; width: 132rpx; font-size: 24rpx; color: #968D81; line-height: 1.6; }
.info-value { flex: 1; min-width: 0; text-align: right; font-size: 25rpx; line-height: 1.6; word-break: break-all; }
.allocation-section { display: flex; align-items: center; gap: 32rpx; padding: 16rpx 0 12rpx; }
.allocation-placeholder { flex-shrink: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10rpx; width: 208rpx; height: 208rpx; border: 16rpx solid #F0EBE2; border-radius: 50%; box-sizing: border-box; color: #A39B8F; font-size: 21rpx; }
.allocation-list { flex: 1; min-width: 0; }
.allocation-row { display: flex; align-items: center; gap: 10rpx; padding: 12rpx 0; font-size: 22rpx; }
.asset-swatch { width: 10rpx; height: 10rpx; flex-shrink: 0; border-radius: 2rpx; background: #B7A488; }
.asset-1 { background: #D0C2AC; }.asset-2 { background: #BFC3BF; }.asset-3 { background: #D9D5CB; }
.allocation-value { flex: 1; text-align: right; color: #A39B8F; font-size: 21rpx; }
.holding-table-head { display: flex; gap: 12rpx; padding: 18rpx 0; border-bottom: 1rpx solid #F1EEE8; color: #A39B8F; font-size: 21rpx; }
.holding-name-col { flex: 1; }.holding-change-col { width: 114rpx; text-align: right; }
.holding-table-empty { padding: 32rpx 0; text-align: center; color: #A39B8F; font-size: 24rpx; border-bottom: 1rpx solid #F1EEE8; }
.buy-flow { position: relative; display: flex; padding: 8rpx 0 24rpx; }
.buy-flow::before { content: ''; position: absolute; top: 19rpx; left: 16%; right: 16%; height: 2rpx; background: #EBDFC6; }
.flow-step { flex: 1; min-width: 0; text-align: center; z-index: 1; }
.step-dot { width: 16rpx; height: 16rpx; margin: 0 auto 18rpx; background: #C7974B; border: 4rpx solid #FFF; border-radius: 50%; box-sizing: content-box; }
.step-title { display: block; font-size: 24rpx; font-weight: 500; }.step-date { display: block; margin-top: 10rpx; color: #A47932; font-size: 30rpx; font-variant-numeric: tabular-nums; }
.rule-description { display: block; color: #968D80; font-size: 23rpx; line-height: 1.8; }
.fee-title { display: block; margin: 28rpx 0 16rpx; font-size: 25rpx; font-weight: 600; }
.fee-table { overflow: hidden; border: 1rpx solid #EEE9E0; border-radius: 16rpx; }
.fee-row { display: flex; align-items: center; justify-content: space-between; gap: 18rpx; padding: 22rpx; border-bottom: 1rpx solid #F0ECE5; font-size: 24rpx; }
.fee-row:last-child { border: 0; }.fee-row > text:first-child { color: #928A7E; }.fee-row > text:last-child { text-align: right; }
.fee-head { background: #FAF8F3; font-size: 21rpx; color: #928A7E; }
.fee-content { display: flex; flex-direction: column; gap: 6rpx; text-align: right; color: #AD7729; font-weight: 600; }
.fee-original { color: #A39B8F; font-size: 20rpx; font-weight: 400; }
.faq-item { border-bottom: 1rpx solid #F0ECE5; }.faq-item:last-child { border: 0; }
.faq-question { display: flex; align-items: center; justify-content: space-between; gap: 12rpx; width: 100%; min-height: 88rpx; padding: 18rpx 0; box-sizing: border-box; text-align: left; font-size: 25rpx; }
.faq-sign { flex-shrink: 0; width: 36rpx; text-align: center; color: #B68A45; font-size: 32rpx; }
.faq-answer { display: block; padding: 0 0 24rpx; color: #978D80; font-size: 23rpx; line-height: 1.9; }
.history-row { display: flex; align-items: center; padding: 22rpx 0; border-bottom: 1rpx solid #F1EEE8; font-size: 23rpx; font-variant-numeric: tabular-nums; }
.history-row text { flex: 1; text-align: right; }.history-row text:first-child { text-align: left; flex: 1.3; }
.table-heading { color: #A0998D; font-size: 21rpx; padding-top: 4rpx; }.history-row:last-child { border: 0; }
.history-empty { text-align: center; padding: 40rpx 0; color: #9C9387; }
.risk-note { color: #A49B8F; font-size: 21rpx; line-height: 1.8; }.risk-title { display: block; color: #8D8171; font-size: 23rpx; margin-bottom: 10rpx; }
.actionbar { flex-shrink: 0; display: flex; align-items: center; gap: 20rpx; padding: 18rpx 28rpx; padding-bottom: calc(18rpx + env(safe-area-inset-bottom)); border-top: 1rpx solid #ECE6DB; background: #fff; box-shadow: 0 -4rpx 20rpx rgba(64, 46, 22, .025); }
.favorite-btn { flex: 1; display: flex; justify-content: center; align-items: center; gap: 10rpx; min-height: 88rpx; border-radius: 18rpx; color: #A2722B; font-size: 26rpx; background: #FCF5E6; }
.favorite-star { font-size: 36rpx; }.favorite-only { background: #F6E8CB; }
.purchase-btn { flex: 1.6; min-height: 88rpx; line-height: 88rpx; border-radius: 18rpx; color: #fff; background: #BB7F28; font-size: 28rpx; font-weight: 600; }.purchase-btn text { margin-left: 16rpx; font-size: 32rpx; }
.purchase-btn[disabled] { background: #BB7F28; color: #fff; }
.state-card { margin-top: 24rpx; padding: 72rpx 36rpx; display: flex; flex-direction: column; align-items: center; gap: 24rpx; background: #fff; border-radius: 28rpx; color: #978D7F; text-align: center; }
.state-title { font-size: 30rpx; color: #5D5142; }.state-description { font-size: 25rpx; line-height: 1.7; }
.retry-btn { padding: 18rpx 40rpx; background: #F7EACF; color: #A36D20; border-radius: 14rpx; }
.loading-dot { width: 44rpx; height: 44rpx; border: 4rpx solid #F1E6CF; border-top-color: #BC812D; border-radius: 50%; animation: spin 1s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
</style>
