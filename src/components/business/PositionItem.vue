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
    <!-- 顶部：基金名称（左） + 代码/更新时间（右上角，纵向排列） -->
    <view class="item-header">
      <text class="fund-name">{{ fundName }}</text>
      <view class="fund-meta">
        <text class="fund-code">{{ fundCode }}</text>
        <text class="update-date">{{ updateDate }}</text>
      </view>
    </view>

    <!-- 数据区：左列市值/份额，右列盈亏 -->
    <view class="item-body">
      <view class="body-left">
        <text class="market-value">{{ formatHoldingAmount }}</text>
        <text class="shares">{{ formatHoldingShares }}</text>
      </view>
      <!-- 后端返回的持仓盈亏；不把它重复标成“昨日收益”。 -->
      <view class="body-right">
        <text class="profit-value" :class="cumulativeColorClass">{{ formatCumulativeProfit }}</text>
        <text class="profit-percent" :class="cumulativeColorClass">{{ formatCumulativePercent }}</text>
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
  /** 基金代码 */
  fundCode: string;
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
  /** 是否有后端计算的市值/盈亏 */
  marketValueAvailable?: boolean;
}

const props = defineProps<Props>();

/**
 * 组件事件
 */
const emit = defineEmits<{
  (e: 'click', fundCode: string): void;
}>();

// ==================== 计算属性 ====================

/** 格式化持仓金额：¥ 59,538 */
const formatHoldingAmount = computed(() => {
  if (props.marketValueAvailable === false) return '--';
  return formatMoney(props.holdingAmount, 0, true);
});

/** 格式化持有份额：59,538.17 份 */
const formatHoldingShares = computed(() => {
  return `${formatMoney(props.holdingShares, 2, false)}份`;
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
  if (props.marketValueAvailable === false) return '--';
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
  emit('click', props.fundCode);
}
</script>

<style lang="scss" scoped>
.position-item {
  @include card($radius: $radius-md);
  padding: $spacing-base;
  box-shadow: $shadow-sm;
  transition: all $transition-fast $ease-in-out;

  &:active {
    opacity: 0.9;
  }
}

/* 顶部：基金名称 + 右侧元信息 */
.item-header {
  @include flex(row, flex-start, flex-start);
}

.fund-name {
  flex: 1;
  min-width: 0;
  font-size: $font-size-base;
  font-weight: $font-weight-semibold;
  color: $color-text-primary;
  line-height: 1.4;
}

.fund-meta {
  @include flex(column, center, flex-end);
  margin-left: $spacing-md;
  /* 小程序适配：gap 替换为 margin */
  .fund-code + .update-date {
    margin-top: $spacing-xs;
  }
}

.fund-code,
.update-date {
  font-size: $font-size-xs;
  color: $color-text-tertiary;
}

/* 数据区：左列市值/份额，右列盈亏 */
.item-body {
  @include flex(row, space-between, flex-end);
  margin-top: $spacing-md;
}

.body-left {
  @include flex(column, flex-start, flex-start);
}

.market-value {
  font-size: $font-size-2xl;
  font-weight: $font-weight-bold;
  color: $color-text-primary;
  line-height: 1.2;
}

.shares {
  margin-top: $spacing-xs;
  font-size: $font-size-sm;
  color: $color-text-primary;
}

.body-right {
  @include flex(column, flex-start, flex-end);
}

.profit-value {
  font-size: $font-size-2xl;
  font-weight: $font-weight-bold;
  line-height: 1.2;
}

.profit-percent {
  margin-top: $spacing-xs;
  font-size: $font-size-sm;
}

/* 涨跌颜色：红涨绿跌，与全局语义色一致 */
.profit {
  color: $color-up;
}

.loss {
  color: $color-down;
}
</style>
