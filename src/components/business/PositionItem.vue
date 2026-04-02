/**
 * ============================================
 * 持仓项组件 PositionItem.vue
 * ============================================
 * 持仓列表中展示单个基金持仓信息的组件
 * 设计稿参考：positionCheck.pen 中的 Holding_Item
 *
 * 组件属性：
 * - fundName: 基金名称
 * - holdingAmount: 持仓金额
 * - holdingShares: 持有份额
 * - dailyProfit: 昨日收益
 * - dailyProfitPercent: 昨日收益率
 * - totalProfit: 持仓累计收益
 * - totalProfitPercent: 持仓累计收益率
 * - updateDate: 数据更新日期
 */
<template>
  <view class="position-item" @tap="handleClick">
    <!-- 顶部：基金名称 + 更新日期 -->
    <view class="item-header">
      <text class="fund-name">{{ fundName }}</text>
      <text class="update-date">{{ updateDate }}</text>
    </view>

    <!-- 数据区域：三列布局 -->
    <view class="item-data">
      <!-- 持仓金额/份额 -->
      <view class="data-section">
        <text class="data-value">{{ formatHoldingAmount }}</text>
        <text class="data-sub">{{ formatHoldingShares }}</text>
        <text class="data-label">持仓金额/份额</text>
      </view>

      <!-- 昨日收益 -->
      <view class="data-section">
        <text class="data-value" :class="dailyColorClass">{{ formatDailyProfit }}</text>
        <text class="data-sub" :class="dailyColorClass">{{ formatDailyPercent }}</text>
        <text class="data-label">昨日收益</text>
      </view>

      <!-- 持仓收益 -->
      <view class="data-section">
        <text class="data-value" :class="cumulativeColorClass">{{ formatCumulativeProfit }}</text>
        <text class="data-sub" :class="cumulativeColorClass">{{ formatCumulativePercent }}</text>
        <text class="data-label">持仓收益</text>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { formatMoney, formatPercent, getChangeType } from '@/utils/format';

/**
 * 组件属性定义
 */
interface Props {
  /** 基金全称，如 "易方达科创50A (510300)" */
  fundName: string;
  /** 持仓金额（元） */
  holdingAmount: number;
  /** 持有份额（份） */
  holdingShares: number;
  /** 昨日收益金额（元） */
  dailyProfit: number;
  /** 昨日收益率（百分比） */
  dailyProfitPercent: number;
  /** 持仓累计收益金额（元） */
  totalProfit: number;
  /** 持仓累计收益率（百分比） */
  totalProfitPercent: number;
  /** 数据更新日期 */
  updateDate: string;
}

const props = defineProps<Props>();

/**
 * 组件事件
 */
const emit = defineEmits<{
  (e: 'click', fundName: string): void;
}>();

// ==================== 计算属性 ====================

/** 格式化持仓金额：¥ 50,000 */
const formatHoldingAmount = computed(() => {
  return `¥ ${formatMoney(props.holdingAmount, 0, false)}`;
});

/** 格式化持有份额：45,678.90 份 */
const formatHoldingShares = computed(() => {
  return `${formatMoney(props.holdingShares, 2, false)} 份`;
});

/** 格式化昨日收益金额（带正负号） */
const formatDailyProfit = computed(() => {
  const sign = props.dailyProfit > 0 ? '+' : '';
  return `${sign}${formatMoney(Math.abs(props.dailyProfit), 0, false)}`;
});

/** 格式化昨日收益率 */
const formatDailyPercent = computed(() => {
  return formatPercent(props.dailyProfitPercent, true, 2);
});

/** 格式化累计收益金额（带正负号） */
const formatCumulativeProfit = computed(() => {
  const sign = props.totalProfit > 0 ? '+' : '';
  return `${sign}${formatMoney(Math.abs(props.totalProfit), 1, false)}`;
});

/** 格式化累计收益率 */
const formatCumulativePercent = computed(() => {
  return formatPercent(props.totalProfitPercent, true, 2);
});

/** 昨日收益颜色类名 */
const dailyColorClass = computed(() => {
  const type = getChangeType(props.dailyProfit);
  return type === 'profit' ? 'profit' : type === 'loss' ? 'loss' : '';
});

/** 累计收益颜色类名 */
const cumulativeColorClass = computed(() => {
  const type = getChangeType(props.totalProfit);
  return type === 'profit' ? 'profit' : type === 'loss' ? 'loss' : '';
});

// ==================== 方法 ====================
/**
 * 点击处理
 */
function handleClick() {
  console.log(`[PositionItem] 点击持仓: ${props.fundName}`);
  emit('click', props.fundName);
}
</script>

<style lang="scss" scoped>
.position-item {
  display: flex;
  flex-direction: column;
  gap: 24rpx;
  background-color: #FFFFFF;
  border-radius: 24rpx;
  padding: 32rpx;
  transition: all 0.2s ease;

  &:active {
    opacity: 0.9;
    transform: scale(1.01);
  }
}

.item-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.fund-name {
  font-size: 30rpx;
  font-weight: 700;
  color: #000000;
}

.update-date {
  font-size: 24rpx;
  color: #999999;
}

.item-data {
  display: flex;
  justify-content: space-around;
  align-items: flex-start;
  margin-top: 16rpx;
}

.data-section {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12rpx;
  flex: 1;
}

.data-value {
  font-size: 28rpx;
  font-weight: 700;
  color: #2D1E16;
}

.data-sub {
  font-size: 24rpx;
  color: #2D1E16;
}

.data-label {
  font-size: 20rpx;
  color: #999999;
}

/* 涨跌颜色 */
.profit {
  color: #FF4444;
}

.loss {
  color: #00AA44;
}
</style>
