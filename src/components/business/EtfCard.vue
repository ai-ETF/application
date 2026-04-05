/**
 * ============================================
 * ETF 卡片组件 EtfCard.vue
 * ============================================
 * 自选列表中展示 ETF 信息的卡片组件
 * 设计稿参考：followPage.pen 中的 watchItem
 */
<template>
  <view class="etf-card" @tap="handleClick">
    <!-- 左侧：名称和代码 -->
    <view class="etf-info">
      <text class="etf-name">{{ etfName }}</text>
      <view class="etf-meta">
        <view class="market-tag">
          <text class="market-text">{{ market }}</text>
        </view>
        <text class="etf-code">{{ etfCode }}</text>
      </view>
    </view>

    <!-- 中间：迷你走势图占位 -->
    <view class="mini-chart">
      <!-- TODO: 后续接入真实的走势图组件 -->
      <text class="chart-placeholder">{{ chartData || '--' }}</text>
    </view>

    <!-- 右侧：价格和涨跌幅 -->
    <view class="price-info">
      <text class="latest-price">{{ formatPrice }}</text>
    </view>

    <!-- 年初至今涨跌幅 -->
    <view class="ytd-change">
      <view class="ytd-label" :class="changeClass">
        <text class="ytd-text">{{ formatYtd }}</text>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { formatMoney, formatPercent, getChangeType } from '@/utils/format';

/**
 * 组件属性
 */
interface Props {
  /** ETF 名称 */
  etfName: string;
  /** ETF 代码 */
  etfCode: string;
  /** 市场标签 */
  market?: string;
  /** 最新价格 */
  latestPrice: number;
  /** 年初至今涨跌幅（百分比） */
  ytdChange: number;
  /** 走势图数据（暂用占位） */
  chartData?: string;
}

const props = withDefaults(defineProps<Props>(), {
  market: 'SH',
  chartData: '',
});

/**
 * 组件事件
 */
const emit = defineEmits<{
  (e: 'click', code: string): void;
}>();

/**
 * 格式化价格显示
 */
const formatPrice = computed(() => {
  return formatMoney(props.latestPrice, 3, false);
});

/**
 * 格式化年初至今涨跌幅
 */
const formatYtd = computed(() => {
  return formatPercent(props.ytdChange, true, 2);
});

/**
 * 涨跌样式类名
 */
const changeClass = computed(() => {
  const type = getChangeType(props.ytdChange);
  return type === 'profit' ? 'ytd-label--profit' : 'ytd-label--loss';
});

/**
 * 卡片点击处理
 */
function handleClick() {
  console.log(`[EtfCard] 点击 ETF: ${props.etfCode}`);
  emit('click', props.etfCode);
}
</script>

<style lang="scss" scoped>
.etf-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background-color: #FFFFFF;
  border-radius: 24rpx;
  padding: 0 24rpx;
  height: 144rpx; // 72pt
  gap: 24rpx;

  &:active {
    opacity: 0.9;
  }
}

.etf-info {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 8rpx;
  width: 240rpx;
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
}

.market-tag {
  background-color: #EFEAE2;
  border-radius: 8rpx;
  padding: 4rpx 12rpx;
}

.market-text {
  font-size: 24rpx;
  color: #999999;
}

.etf-code {
  font-size: 24rpx;
  color: #999999;
}

.mini-chart {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 160rpx;
  height: 80rpx;
}

.chart-placeholder {
  font-size: 24rpx;
  color: #CCCCCC;
}

.price-info {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  width: 120rpx;
}

.latest-price {
  font-size: 32rpx;
  font-weight: 600;
  color: #2D1E16;
}

.ytd-change {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  width: 160rpx;
}

.ytd-label {
  border-radius: 24rpx;
  padding: 8rpx 16rpx;
}

.ytd-label--profit {
  background-color: #FDECEC;

  .ytd-text {
    color: #D94C4C;
  }
}

.ytd-label--loss {
  background-color: #E8F8EE;

  .ytd-text {
    color: #00AA44;
  }
}

.ytd-text {
  font-size: 24rpx;
  font-weight: 600;
}
</style>