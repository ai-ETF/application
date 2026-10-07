<template>
  <view class="page">
    <view class="header"><view class="back" @tap="back">‹</view><text>模拟赎回</text><view class="spacer"></view></view>
    <view v-if="loading" class="state">正在读取持仓...</view>
    <view v-else-if="!position" class="state"><text>{{ message || '当前没有可赎回持仓' }}</text></view>
    <view v-else class="card">
      <text class="name">{{ fundName }}</text><text class="code">{{ fundCode }}</text>
      <view class="row"><text>可赎回份额</text><text>{{ formatQuantity(available) }} 份</text></view>
      <view class="row"><text>参考净值</text><text>{{ price == null ? '--' : price.toFixed(4) }}</text></view>
      <view class="row"><text>预计赎回金额</text><text>{{ estimatedAmount }}</text></view>
      <text class="hint">预计金额仅作参考；确认净值、赎回费及实际到账金额以后台确认结果为准。</text>
      <input id="sell-quantity" v-model="quantityText" type="digit" class="input" placeholder="请输入赎回份额" />
      <view class="quick" @tap="quantityText = String(available)">全部赎回</view>
      <text v-if="message" class="message">{{ message }}</text>
      <view id="sell-submit" class="submit" :class="{ disabled: submitting }" @tap="submit">{{ submitting ? '提交中...' : '确认赎回' }}</view>
      <view v-if="order" class="order-result">
        <view class="result-title">{{ order.status === 'pending' ? '赎回待确认' : '赎回结果' }}</view>
        <text v-if="order.amount > 0">确认金额：{{ order.amount.toFixed(2) }} 元</text>
        <text v-if="order.fee > 0">赎回费：{{ order.fee.toFixed(2) }} 元</text>
        <text v-if="order.settle_date">预计到账日期：{{ order.settle_date }}</text>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import { applyRedeem, getPositions, type OrderResult, type PositionSummary } from '@/api/modules/portfolio';
import { decodeRouteParam } from '@/utils/route';
import { useAuthStore } from '@/stores/auth';

const fundCode = ref('');
const fundName = ref('');
const available = ref(0);
const price = ref<number | null>(null);
const quantityText = ref('');
const message = ref('');
const order = ref<OrderResult | null>(null);
const position = ref<PositionSummary | null>(null);
const loading = ref(true);
const submitting = ref(false);
const authStore = useAuthStore();

const estimatedAmount = computed(() => {
  const quantity = Number(quantityText.value);
  if (!Number.isFinite(quantity) || quantity <= 0 || price.value == null) return '--';
  return `${(quantity * price.value).toFixed(2)} 元（未含实际费用）`;
});

onLoad((query) => {
  fundCode.value = decodeRouteParam(query?.code).trim();
  fundName.value = decodeRouteParam(query?.name);
  void loadPosition();
});

async function loadPosition() {
  authStore.restoreSession();
  if (!authStore.isAuthenticated) {
    message.value = '请先登录';
    loading.value = false;
    return;
  }
  try {
    const result = await getPositions();
    const found = (result.items || []).find(item => item.fund_code === fundCode.value);
    position.value = found || null;
    if (found) {
      fundName.value = found.fund_name || fundName.value;
      available.value = Number(found.quantity);
      price.value = found.market_price == null ? null : Number(found.market_price);
    } else {
      message.value = '当前没有可赎回持仓';
    }
  } catch (error: any) {
    console.error('[Redeem] 获取持仓失败:', error);
    message.value = error?.message || '无法获取持仓，请稍后重试';
  } finally {
    loading.value = false;
  }
}

async function submit() {
  if (submitting.value) return;
  authStore.restoreSession();
  if (!authStore.isAuthenticated) { message.value = '请先登录'; return; }
  const quantity = Number(quantityText.value);
  if (!Number.isFinite(quantity) || quantity <= 0) { message.value = '赎回份额必须大于 0'; return; }
  if (quantity > available.value) { message.value = '赎回份额不能超过可赎回份额'; return; }
  if (!fundCode.value || !position.value) { message.value = '未找到可赎回持仓'; return; }

  submitting.value = true;
  message.value = '';
  order.value = null;
  try {
    // 不提交 price：后端负责按确认日净值和持有天数计算真实赎回金额与费用。
    const result = await applyRedeem(fundCode.value, quantity);
    if (!result.success) { message.value = result.message || '赎回失败'; return; }
    order.value = result.data || null;
    message.value = result.message || '赎回申请已提交';
    quantityText.value = '';
    // positions 接口只返回已确认持仓，不扣除 pending 赎回份额；本地同步本页的可用份额，
    // 防止用户在待确认期间重复提交同一份额。
    available.value = Math.max(0, available.value - quantity);
  } catch (error: any) {
    message.value = error?.message || '赎回失败，请稍后重试';
  } finally {
    submitting.value = false;
  }
}

function formatQuantity(value: number) { return Number(value).toFixed(4); }
function back() { uni.navigateBack({ delta: 1 }); }
</script>

<style lang="scss" scoped>
.page { min-height: 100vh; background: $color-bg-primary; padding: 0 32rpx; }.header { display: flex; justify-content: space-between; align-items: center; padding: 24rpx 0; font-size: 36rpx; font-weight: 600; }.back, .spacer { width: 56rpx; text-align: center; }.back { font-size: 56rpx; font-weight: 400; }
.state { padding: 100rpx 0; text-align: center; color: $color-text-tertiary; }.card { padding: 32rpx; background: #fff; border-radius: 24rpx; }.name { display: block; font-size: 34rpx; font-weight: 700; }.code { display: block; margin-top: 12rpx; color: $color-text-tertiary; }.row { display: flex; justify-content: space-between; padding: 24rpx 0; border-bottom: 1rpx solid $color-border-light; }.hint { display: block; margin-top: 20rpx; color: $color-text-tertiary; font-size: 24rpx; line-height: 1.6; }.input { height: 96rpx; margin-top: 28rpx; padding: 0 24rpx; background: $color-bg-primary; border-radius: 16rpx; }.quick { margin-top: 18rpx; color: $color-brand-primary; }.message { display: block; margin-top: 20rpx; color: #b24d3f; line-height: 1.5; }.submit { margin-top: 28rpx; padding: 26rpx; text-align: center; border-radius: 18rpx; color: #fff; background: $color-brand-primary; }.submit.disabled { opacity: .55; }.order-result { margin-top: 28rpx; padding: 24rpx; background: $color-brand-bg; border-radius: 16rpx; }.result-title { color: $color-brand-primary; font-size: 30rpx; font-weight: 700; }.order-result text { display: block; margin-top: 10rpx; color: $color-text-secondary; font-size: 24rpx; }
</style>
