<template>
  <view class="page">
    <view class="header"><view class="back" @tap="back">‹</view><text>交易记录</text><view class="spacer"></view></view>
    <view class="notice">这里只展示后端已确认并写入交易流水的记录；待确认订单需以后端提供查询接口后展示。</view>
    <scroll-view class="list" scroll-y>
      <view v-if="loading" class="state">正在加载交易记录...</view>
      <view v-else-if="error" class="state"><text>{{ error }}</text><text class="retry" @tap="load">重新加载</text></view>
      <view v-else-if="items.length === 0" class="state">暂无已确认交易记录</view>
      <view v-for="item in items" :key="item.id" class="card">
        <view class="top"><text>{{ item.fund_name }}</text><text :class="item.direction === 'buy' ? 'buy' : 'sell'">{{ item.direction === 'buy' ? '申购' : '赎回' }}</text></view>
        <text class="code">{{ item.fund_code }}</text>
        <view class="row"><text>金额 {{ format(item.amount) }} 元</text><text>份额 {{ Number(item.quantity).toFixed(4) }}</text></view>
        <view class="row muted"><text>净值 {{ Number(item.price).toFixed(4) }} · 费用 {{ format(item.fee) }}</text><text>{{ formatDate(item.trade_time) }}</text></view>
        <text class="confirmed">已确认</text>
      </view>
    </scroll-view>
  </view>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import { getTradeFlow, type TradeFlowItem } from '@/api/modules/portfolio';
import { useAuthStore } from '@/stores/auth';

const items = ref<TradeFlowItem[]>([]);
const loading = ref(true);
const error = ref('');
const authStore = useAuthStore();

onShow(() => { void load(); });

async function load() {
  authStore.restoreSession();
  if (!authStore.isAuthenticated) {
    items.value = [];
    error.value = '登录后查看交易记录';
    loading.value = false;
    return;
  }
  loading.value = true;
  error.value = '';
  try {
    const result = await getTradeFlow();
    items.value = result.items || [];
  } catch (e: any) {
    console.error('[Trades] 加载失败:', e);
    error.value = e?.message || '交易记录暂时无法获取';
    items.value = [];
  } finally {
    loading.value = false;
  }
}

function format(value: number) { return Number(value).toFixed(2); }
function formatDate(value: string) { return value ? value.replace('T', ' ').replace('+08:00', '') : '--'; }
function back() { uni.navigateBack({ delta: 1 }); }
</script>

<style lang="scss" scoped>
.page { min-height: 100vh; background: $color-bg-primary; padding: 0 32rpx; }.header { display: flex; justify-content: space-between; align-items: center; padding: 24rpx 0; font-size: 36rpx; font-weight: 600; }.back, .spacer { width: 56rpx; text-align: center; }.back { font-size: 56rpx; font-weight: 400; }.notice { margin-bottom: 20rpx; padding: 20rpx 24rpx; color: $color-text-tertiary; background: $color-brand-bg; border-radius: 16rpx; font-size: 24rpx; line-height: 1.5; }.list { height: calc(100vh - 220rpx); }.state { padding: 80rpx 0; text-align: center; color: $color-text-tertiary; }.retry { display: block; margin-top: 24rpx; color: $color-brand-primary; }.card { position: relative; margin-bottom: 20rpx; padding: 28rpx; background: #fff; border-radius: 20rpx; }.top, .row { display: flex; justify-content: space-between; }.top { font-size: 30rpx; font-weight: 600; }.code, .muted { display: block; margin-top: 12rpx; font-size: 24rpx; color: $color-text-tertiary; }.row { margin-top: 18rpx; font-size: 24rpx; }.buy { color: #d94c4c; }.sell { color: #00aa44; }.confirmed { display: block; margin-top: 16rpx; color: $color-brand-primary; font-size: 22rpx; }
</style>
