<template>
  <view class="page">
    <view class="header"><view class="back" @tap="back">‹</view><text>模拟申购</text><view class="spacer"></view></view>
    <view v-if="loading" class="state">正在读取基金与账户信息...</view>
    <view v-else class="card">
      <text class="name">{{ fundName || '基金' }}</text>
      <text class="code">{{ fundCode || '--' }}</text>
      <view class="row"><text>当前参考净值</text><text>{{ referenceNav }}</text></view>
      <view class="row"><text>可用模拟现金</text><text>{{ cash == null ? '--' : `${cash.toFixed(2)} 元` }}</text></view>
      <text class="hint">实际确认净值与份额以后台交易规则为准，场内 ETF 不支持此操作。</text>
      <input v-model="amountText" type="digit" class="input" placeholder="请输入申购金额" />
      <text v-if="message" class="message">{{ message }}</text>
      <view class="submit" :class="{ disabled: submitting || !canSubmit }" @tap="submit">{{ submitting ? '提交中...' : '确认申购' }}</view>
      <view v-if="order" class="order-result">
        <view class="result-title">{{ statusLabel(order.status) }}</view>
        <text>订单金额：{{ formatMoney(order.amount) }} 元</text>
        <text>申购费：{{ formatMoney(order.fee) }} 元</text>
        <text v-if="order.confirm_date">确认日期：{{ order.confirm_date }}</text>
        <text v-if="order.cash_remaining != null">提交后可用现金：{{ formatMoney(order.cash_remaining) }} 元</text>
        <view class="result-actions">
          <view class="result-btn" @tap="goPortfolio">查看持仓</view>
          <view class="result-btn" @tap="goTrades">交易记录</view>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { onLoad, onShow } from '@dcloudio/uni-app';
import { getEtfDetail } from '@/api/modules/market';
import { applyPurchase, getAccountSummary, type OrderResult } from '@/api/modules/portfolio';
import { TRADEABLE_FUND_CODES } from '@/config/portfolio';
import { decodeRouteParam } from '@/utils/route';
import { useAuthStore } from '@/stores/auth';

const fundCode = ref('');
const fundName = ref('');
const referenceNav = ref('--');
const cash = ref<number | null>(null);
const amountText = ref('');
const message = ref('');
const order = ref<OrderResult | null>(null);
const loading = ref(true);
const submitting = ref(false);
const authStore = useAuthStore();
const canSubmit = computed(() => Boolean(fundCode.value && TRADEABLE_FUND_CODES.has(fundCode.value) && cash.value != null));

onLoad((query) => {
  fundCode.value = decodeRouteParam(query?.code).trim();
  fundName.value = decodeRouteParam(query?.name);
  void loadReference(query?.price ? Number(query.price) : null);
});

onShow(() => { void loadAccount(); });

async function loadReference(queryPrice: number | null) {
  if (queryPrice != null && Number.isFinite(queryPrice) && queryPrice > 0) referenceNav.value = queryPrice.toFixed(4);
  if (!fundCode.value) {
    message.value = '缺少基金代码';
    loading.value = false;
    return;
  }
  try {
    const detail = await getEtfDetail(fundCode.value);
    if (!fundName.value) fundName.value = detail.short_name || detail.full_name || detail.realtime?.name || '';
    if (referenceNav.value === '--') {
      const nav = [...(detail.nav_history || [])].reverse().find(item => item.nav != null)?.nav;
      if (nav != null) referenceNav.value = Number(nav).toFixed(4);
    }
  } catch (error) {
    console.warn('[Purchase] 读取参考净值失败:', error);
  } finally {
    loading.value = false;
  }
}

async function loadAccount() {
  authStore.restoreSession();
  if (!authStore.isAuthenticated) {
    cash.value = null;
    message.value = '请先登录';
    loading.value = false;
    return;
  }
  try {
    const account = await getAccountSummary();
    cash.value = Number(account.cash);
  } catch (error) {
    console.error('[Purchase] 获取账户失败:', error);
    cash.value = null;
    message.value = '无法获取可用模拟现金，请稍后重试';
  }
}

async function submit() {
  if (submitting.value) return;
  authStore.restoreSession();
  if (!authStore.isAuthenticated) { message.value = '请先登录'; return; }
  const amount = Number(amountText.value);
  if (!Number.isFinite(amount) || amount <= 0) { message.value = '申购金额必须大于 0'; return; }
  if (!TRADEABLE_FUND_CODES.has(fundCode.value)) { message.value = '该基金暂不支持模拟交易'; return; }
  if (cash.value == null) { message.value = '可用模拟现金暂不可用'; return; }
  if (amount > cash.value) { message.value = '可用模拟现金不足'; return; }

  submitting.value = true;
  message.value = '';
  order.value = null;
  try {
    // 不提交 price：后端负责读取场外基金净值，避免把场内价格当作申购净值。
    const result = await applyPurchase(fundCode.value, amount);
    if (!result.success) { message.value = result.message || '申购失败'; return; }
    order.value = result.data || null;
    message.value = result.message || '申购申请已提交';
    if (result.data?.cash_remaining != null) cash.value = result.data.cash_remaining;
    amountText.value = '';
  } catch (error: any) {
    message.value = error?.message || '申购失败，请稍后重试';
  } finally {
    submitting.value = false;
  }
}

function statusLabel(status: string) {
  return status === 'pending' ? '申购申请已提交，等待确认' : status === 'completed' ? '申购已确认' : `订单状态：${status || '--'}`;
}
function formatMoney(value: number | null | undefined) { return value == null ? '--' : Number(value).toFixed(2); }
function goPortfolio() { uni.reLaunch({ url: '/pages/watchlist/index?tab=position' }); }
function goTrades() { uni.navigateTo({ url: '/pages/trades/index' }); }
function back() { uni.navigateBack({ delta: 1 }); }
</script>

<style lang="scss" scoped>
.page { min-height: 100vh; background: $color-bg-primary; padding: 0 32rpx; }
.header { display: flex; align-items: center; justify-content: space-between; padding: 24rpx 0; font-size: 36rpx; font-weight: 600; }
.back, .spacer { width: 56rpx; text-align: center; }.back { font-size: 56rpx; font-weight: 400; }
.state { padding: 100rpx 0; text-align: center; color: $color-text-tertiary; }
.card { padding: 32rpx; background: #fff; border-radius: 24rpx; }.name { display: block; font-size: 34rpx; font-weight: 700; }.code { display: block; margin-top: 12rpx; color: $color-text-tertiary; }
.row { display: flex; justify-content: space-between; padding: 24rpx 0; border-bottom: 1rpx solid $color-border-light; }.hint { display: block; margin-top: 20rpx; color: $color-text-tertiary; font-size: 24rpx; line-height: 1.6; }
.input { height: 96rpx; margin-top: 28rpx; padding: 0 24rpx; background: $color-bg-primary; border-radius: 16rpx; }.message { display: block; margin-top: 20rpx; color: #b24d3f; line-height: 1.5; }
.submit { margin-top: 28rpx; padding: 26rpx; text-align: center; border-radius: 18rpx; color: #fff; background: $color-brand-primary; }.submit.disabled { opacity: .55; }
.order-result { margin-top: 28rpx; padding: 24rpx; background: $color-brand-bg; border-radius: 16rpx; }.order-result text { display: block; margin-top: 10rpx; color: $color-text-secondary; font-size: 24rpx; }.result-title { color: $color-brand-primary; font-size: 30rpx; font-weight: 700; }
.result-actions { display: flex; gap: 16rpx; margin-top: 22rpx; }.result-btn { flex: 1; padding: 16rpx; text-align: center; color: $color-brand-primary; border: 1rpx solid $color-brand-primary; border-radius: 14rpx; font-size: 24rpx; }
</style>
