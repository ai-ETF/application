/**
 * ============================================
 * 风险画像测评页
 * ============================================
 * 支持三种状态：
 * 1. 问卷答题 — 获取题目并逐题作答
 * 2. 加载/提交中 — 进度展示
 * 3. 结果展示 — 展示投资者画像卡片
 *
 * 设计风格：
 * - 背景色：$color-bg-primary（温暖米色）
 * - 卡片背景：$color-bg-card，圆角 $radius-md
 * - 进度条样式：品牌色渐变
 * - 结果页：分维度展示，用语义标签标注
 */

<template>
  <view class="page-container">
    <!-- ==================== 页面头部 ==================== -->
    <view class="page-header">
      <view class="header-left" @tap="handleBack">
        <SvgIcon name="chevron-left" size="44rpx" color="primary" />
      </view>
      <text class="header-title">
        {{ pageTitle }}
      </text>
      <view class="header-right" />
    </view>

    <scroll-view class="page-scroll" scroll-y>
      <!-- ==================== 状态：加载中 ==================== -->
      <view v-if="pageState === 'loading'" class="loading-section">
        <view class="loading-spinner" />
        <text class="loading-text">加载问卷中...</text>
      </view>

      <!-- ==================== 状态：答题问卷 ==================== -->
      <view v-else-if="pageState === 'quiz'" class="quiz-section">
        <!-- 进度指示 -->
        <view class="progress-section">
          <view class="progress-info">
            <text class="progress-label">测评进度</text>
            <text class="progress-count">{{ currentIndex + 1 }} / {{ questions.length }}</text>
          </view>
          <view class="progress-bar-bg">
            <view
              class="progress-bar-fill"
              :style="{ width: progressPercent + '%' }"
            />
          </view>
        </view>

        <!-- 题目卡片 -->
        <view class="question-card">
          <view class="question-number">第 {{ currentIndex + 1 }} 题</view>
          <text class="question-text">{{ currentQuestion.question }}</text>
        </view>

        <!-- 选项列表 -->
        <view class="options-list">
          <view
            v-for="(option, idx) in currentQuestion.options"
            :key="option.value"
            class="option-item"
            :class="{ 'option-item--selected': selectedValue === option.value }"
            @tap="selectOption(option.value)"
          >
            <view class="option-marker">
              <text class="option-letter">{{ optionLetters[idx] }}</text>
            </view>
            <text class="option-text">{{ option.text }}</text>
            <view class="option-radio">
              <view
                v-if="selectedValue === option.value"
                class="option-radio-dot"
              />
            </view>
          </view>
        </view>

        <!-- 按钮组 -->
        <view class="button-group">
          <view
            class="btn btn--primary"
            :class="{ 'btn--disabled': !selectedValue }"
            @tap="handleNext"
          >
            <text class="btn-text">
              {{ isLastQuestion ? '提交测评' : '下一题' }}
            </text>
          </view>
        </view>

        <!-- 提交中遮罩 -->
        <view v-if="isSubmitting" class="submitting-overlay">
          <view class="submitting-card">
            <view class="submitting-spinner" />
            <text class="submitting-text">正在生成您的投资画像...</text>
          </view>
        </view>
      </view>

      <!-- ==================== 状态：结果展示 ==================== -->
      <view v-else-if="pageState === 'result'" class="result-section">
        <!-- 结果头部卡片 -->
        <view class="result-header-card">
          <view class="result-icon-wrap">
            <SvgIcon name="clipboard-check" size="56rpx" color="white" />
          </view>
          <text class="result-title">您的投资者画像</text>
          <view
            class="result-level-badge"
            :class="'result-level-badge--' + profile.risk_level"
          >
            <text class="result-level-text">{{ profile.risk_label }}</text>
          </view>
          <text class="result-score">{{ profile.total_score.toFixed(1) }}</text>
          <text class="result-score-label">综合风险得分</text>
        </view>

        <!-- 维度得分卡片 -->
        <view class="dimension-card">
          <text class="dimension-card-title">各维度评估</text>
          <view
            v-for="(score, key) in profile.dimension_scores"
            :key="key"
            class="dimension-item"
          >
            <view class="dimension-row">
              <text class="dimension-label">{{ dimensionLabels[key] || key }}</text>
              <text class="dimension-value">{{ scoreText(score) }}</text>
            </view>
            <view class="dimension-bar-bg">
              <view
                class="dimension-bar-fill"
                :style="{ width: (score / 3 * 100) + '%' }"
              />
            </view>
          </view>
        </view>

        <!-- 测评小结卡片 -->
        <view class="summary-card">
          <view class="summary-icon-row">
            <SvgIcon name="file-text" size="36rpx" color="brand" />
            <text class="summary-card-title">测评小结</text>
          </view>
          <text class="summary-text">{{ profile.summary }}</text>
        </view>

        <!-- 底部提示 -->
        <view class="result-footer">
          <text class="result-footer-text">
            风险测评结果将作为 AI 投资建议的参考依据，建议每半年重新评估一次。
          </text>
        </view>

        <!-- 重新测评按钮 -->
        <view class="retake-btn-wrap">
          <view class="btn btn--ghost" @tap="handleRetake">
            <text class="btn-text">重新测评</text>
          </view>
        </view>
      </view>

      <!-- ==================== 底部占位 ==================== -->
      <view class="scroll-placeholder" />
    </scroll-view>
  </view>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import SvgIcon from '@/components/common/SvgIcon.vue';
import { getQuestionnaire, submitAnswers, getProfile } from '@/api';
import type {
  RiskQuestion,
  RiskQuestionnaire,
  RiskProfile,
  RiskSubmitResult,
} from '@/api';
import { useUserStore } from '@/stores/user';

// ==================== Store ====================

const userStore = useUserStore();

// ==================== 状态枚举 ====================

/** 页面状态 */
type PageState = 'loading' | 'quiz' | 'result';

// ==================== 响应式状态 ====================

/** 当前页面状态 */
const pageState = ref<PageState>('loading');

/** 问卷数据 */
const questionnaire = ref<RiskQuestionnaire | null>(null);

/** 题目列表 */
const questions = ref<RiskQuestion[]>([]);

/** 当前题目索引 */
const currentIndex = ref<number>(0);

/** 当前选中选项值 */
const selectedValue = ref<string>('');

/** 已选答案映射 */
const answerMap = ref<Record<string, string>>({});

/** 是否提交中 */
const isSubmitting = ref<boolean>(false);

/** 画像结果 */
const profile = ref<RiskProfile>({
  risk_level: 'moderate',
  risk_label: '稳健型',
  total_score: 0,
  dimension_scores: {},
  summary: '',
  created_at: '',
});

// ==================== 计算属性 ====================

/** 当前题目 */
const currentQuestion = computed<RiskQuestion>(() => {
  return questions.value[currentIndex.value] || {
    id: '',
    question: '',
    category: '',
    options: [],
  };
});

/** 是否是最后一题 */
const isLastQuestion = computed(() => {
  return currentIndex.value >= questions.value.length - 1;
});

/** 进度百分比 */
const progressPercent = computed(() => {
  if (questions.value.length === 0) return 0;
  return ((currentIndex.value + 1) / questions.value.length) * 100;
});

/** 页面标题 */
const pageTitle = computed(() => {
  if (pageState.value === 'result') return '测评结果';
  if (pageState.value === 'quiz') return '风险画像测评';
  return '加载中...';
});

// ==================== 常量 ====================

/** 选项字母映射 */
const optionLetters = ['A', 'B', 'C', 'D', 'E', 'F'];

/** 维度中文标签映射 */
const dimensionLabels: Record<string, string> = {
  investment_horizon: '投资期限',
  drawdown_tolerance: '回撤承受能力',
  investment_experience: '投资经验',
  goal_orientation: '投资目标',
  knowledge_level: '知识水平',
};

// ==================== 方法 ====================

/**
 * 初始化：判断是加载问卷还是展示结果
 */
onMounted(async () => {
  console.log('[RiskAssessment] 页面初始化');

  // 检查是否已完成测评
  if (userStore.userInfo.hasRiskAssessment) {
    // 尝试从本地或接口获取画像结果
    await loadProfileResult();
  } else {
    // 加载问卷
    await loadQuestionnaire();
  }
});

/**
 * 加载问卷
 */
async function loadQuestionnaire() {
  pageState.value = 'loading';
  try {
    const res = await getQuestionnaire();
    questionnaire.value = res;
    questions.value = res.questions || [];
    // 恢复已选答案
    if (questions.value.length > 0) {
      const firstQ = questions.value[0];
      selectedValue.value = answerMap.value[firstQ.id] || '';
    }
    pageState.value = 'quiz';
    console.log('[RiskAssessment] 问卷加载成功，题数:', questions.value.length);
  } catch (err) {
    console.error('[RiskAssessment] 加载问卷失败:', err);
    uni.showToast({ title: '加载问卷失败，请重试', icon: 'none' });
  }
}

/**
 * 查询画像结果
 * @description 优先调 API，API 失败或返回空时 fallback 到本地缓存
 */
async function loadProfileResult() {
  pageState.value = 'loading';
  try {
    const res = await getProfile();
    if (res.has_profile && res.profile) {
      profile.value = res.profile;
      // 同步本地缓存
      uni.setStorageSync('risk_profile', JSON.stringify(res.profile));
      pageState.value = 'result';
      console.log('[RiskAssessment] 画像加载成功:', res.profile.risk_label);
      return;
    } else {
      // 有标记但后端无数据 → 按未测评处理
      userStore.setUserInfo({ hasRiskAssessment: false });
      await loadQuestionnaire();
      return;
    }
  } catch (err) {
    console.error('[RiskAssessment] 查询画像失败，尝试本地缓存:', err);
  }

  // API 失败或无结果时，尝试从本地缓存恢复
  const cached = uni.getStorageSync('risk_profile');
  if (cached) {
    try {
      profile.value = JSON.parse(cached);
      pageState.value = 'result';
      console.log('[RiskAssessment] 从本地缓存加载画像:', profile.value.risk_label);
      return;
    } catch (e) {
      console.warn('[RiskAssessment] 本地缓存解析失败:', e);
    }
  }

  // 缓存也无数据 → 按未测评处理
  userStore.setUserInfo({ hasRiskAssessment: false });
  await loadQuestionnaire();
}

/**
 * 选择选项
 * @param value - 选项值
 */
function selectOption(value: string) {
  if (isSubmitting.value) return;
  selectedValue.value = value;
  // 保存到答案映射
  answerMap.value[currentQuestion.value.id] = value;
}

/**
 * 下一题 / 提交
 */
async function handleNext() {
  if (!selectedValue.value || isSubmitting.value) return;

  // 保存当前答案
  answerMap.value[currentQuestion.value.id] = selectedValue.value;

  // 不是最后一题 → 进入下一题
  if (!isLastQuestion.value) {
    const nextIdx = currentIndex.value + 1;
    currentIndex.value = nextIdx;
    // 恢复该题已选答案（如果有）
    const nextQ = questions.value[nextIdx];
    selectedValue.value = answerMap.value[nextQ.id] || '';
    return;
  }

  // 最后一题 → 提交
  await handleSubmit();
}

/**
 * 提交测评
 */
async function handleSubmit() {
  if (!questionnaire.value) return;
  isSubmitting.value = true;

  // 构建请求体
  const answers = questions.value.map((q) => ({
    question_id: q.id,
    value: answerMap.value[q.id] || '',
  }));

  console.log('[RiskAssessment] 提交测评答案');
  try {
    const res = await submitAnswers({
      questionnaire_id: questionnaire.value.id,
      answers,
    });

    // 保存画像结果
    profile.value = res.profile;

    // 更新用户状态
    userStore.setUserInfo({
      hasRiskAssessment: true,
      riskLevel: mapRiskLevelToNumber(res.profile.risk_level),
    });

    // 本地持久化画像
    uni.setStorageSync('risk_profile', JSON.stringify(res.profile));

    console.log('[RiskAssessment] 提交成功，风险等级:', res.profile.risk_label);

    // 切换到结果页
    isSubmitting.value = false;
    pageState.value = 'result';

    uni.showToast({ title: '测评完成！', icon: 'success' });
  } catch (err) {
    console.error('[RiskAssessment] 提交失败:', err);
    isSubmitting.value = false;
    uni.showToast({ title: '提交失败，请重试', icon: 'none' });
  }
}

/**
 * 风险等级映射（字符串 → 数字）
 * @param level - 风险等级字符串
 * @returns 1=保守, 2=稳健, 3=平衡, 4=进取, 5=激进
 */
function mapRiskLevelToNumber(level: string): number {
  const map: Record<string, number> = {
    conservative: 1,
    moderate: 2,
    balanced: 3,
    aggressive: 4,
    'very-aggressive': 5,
  };
  return map[level] || 2;
}

/**
 * 维度得分文本
 * @param score - 原始得分（1-3）
 * @returns 描述文字
 */
function scoreText(score: number): string {
  if (score <= 1) return '偏低';
  if (score <= 2) return '适中';
  return '偏高';
}

/**
 * 返回上一页
 */
function handleBack() {
  uni.navigateBack();
}

/**
 * 重新测评
 * @description 清除旧画像，跳转到答题流程
 */
function handleRetake() {
  console.log('[RiskAssessment] 点击重新测评');
  // 清除本地缓存
  uni.removeStorageSync('risk_profile');
  // 重置状态
  answerMap.value = {};
  currentIndex.value = 0;
  selectedValue.value = '';
  profile.value = {
    risk_level: 'moderate',
    risk_label: '稳健型',
    total_score: 0,
    dimension_scores: {},
    summary: '',
    created_at: '',
  };
  // 标记为未测评（也会触发持久化更新）
  userStore.setUserInfo({ hasRiskAssessment: false, riskLevel: undefined });
  // 跳转答题
  loadQuestionnaire();
}
</script>

<style lang="scss" scoped>
/* ==================== 页面容器 ==================== */
.page-container {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background-color: $color-bg-primary;
  overflow: hidden;
}

.page-scroll {
  flex: 1;
  min-height: 0;
}

/* ==================== 页面头部 ==================== */
.page-header {
  @include flex(row, space-between, center);
  padding: $spacing-lg $spacing-base $spacing-md;
  background-color: $color-bg-primary;
}

.header-left {
  @include flex-center;
  width: 72rpx;
  height: 72rpx;
}

.header-title {
  font-size: $font-size-2xl;
  font-weight: $font-weight-semibold;
  color: $color-text-primary;
}

.header-right {
  width: 72rpx;
  height: 72rpx;
}

/* ==================== 加载状态 ==================== */
.loading-section {
  @include flex-center;
  flex-direction: column;
  gap: $spacing-lg;
  padding: $spacing-2xl 0;
}

/* 加载旋转动画 */
.loading-spinner {
  width: 64rpx;
  height: 64rpx;
  border: 6rpx solid $color-border-light;
  border-top-color: $color-brand-primary;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.loading-text {
  font-size: $font-size-lg;
  color: $color-text-secondary;
}

/* ==================== 答题区 ==================== */
.quiz-section {
  padding: 0 $spacing-base;
}

/* 进度条 */
.progress-section {
  margin-bottom: $spacing-lg;
}

.progress-info {
  @include flex(row, space-between, center);
  margin-bottom: $spacing-sm;
}

.progress-label {
  font-size: $font-size-sm;
  color: $color-text-secondary;
}

.progress-count {
  font-size: $font-size-sm;
  color: $color-brand-primary;
  font-weight: $font-weight-semibold;
}

.progress-bar-bg {
  height: 8rpx;
  background-color: $color-border-light;
  border-radius: 4rpx;
  overflow: hidden;
}

.progress-bar-fill {
  height: 100%;
  background: linear-gradient(90deg, $color-brand-light, $color-brand-primary);
  border-radius: 4rpx;
  transition: width 0.3s ease;
}

/* 题目卡片 */
.question-card {
  @include card;
  padding: $spacing-lg $spacing-base;
  margin-bottom: $spacing-lg;
  box-shadow: $shadow-sm;
}

.question-number {
  font-size: $font-size-sm;
  color: $color-brand-primary;
  font-weight: $font-weight-semibold;
  margin-bottom: $spacing-sm;
}

.question-text {
  font-size: $font-size-lg;
  font-weight: $font-weight-medium;
  color: $color-text-primary;
  line-height: 1.6;
}

/* 选项列表 */
.options-list {
  @include flex(column, flex-start, stretch);
  gap: $spacing-md;
  margin-bottom: $spacing-xl;
}

.option-item {
  @include flex(row, flex-start, center);
  gap: $spacing-md;
  padding: $spacing-md $spacing-base;
  background-color: $color-bg-card;
  border-radius: $radius-base;
  border: 2rpx solid $color-border;
  transition: all $transition-fast $ease-in-out;
  box-shadow: $shadow-sm;

  &:active {
    transform: scale(0.99);
  }
}

.option-item--selected {
  border-color: $color-brand-primary;
  background-color: $color-brand-bg;
  box-shadow: 0 0 0 4rpx rgba($color-brand-primary, 0.08), $shadow-sm;
}

/* 选项字母标记 */
.option-marker {
  @include flex-center;
  width: 48rpx;
  height: 48rpx;
  border-radius: $radius-sm;
  background-color: $color-border-light;
  flex-shrink: 0;
}

.option-item--selected .option-marker {
  background-color: $color-brand-primary;
}

.option-letter {
  font-size: $font-size-sm;
  font-weight: $font-weight-semibold;
  color: $color-text-secondary;
}

.option-item--selected .option-letter {
  color: $color-text-white;
}

.option-text {
  flex: 1;
  font-size: $font-size-base;
  color: $color-text-primary;
  line-height: 1.5;
}

/* 单选圆圈 */
.option-radio {
  @include flex-center;
  width: 40rpx;
  height: 40rpx;
  border-radius: 50%;
  border: 3rpx solid $color-border;
  flex-shrink: 0;
  transition: all $transition-fast $ease-in-out;
}

.option-item--selected .option-radio {
  border-color: $color-brand-primary;
}

.option-radio-dot {
  width: 22rpx;
  height: 22rpx;
  border-radius: 50%;
  background-color: $color-brand-primary;
}

/* 按钮组 */
.button-group {
  padding-bottom: $spacing-lg;
}

.btn {
  @include flex-center;
  height: $btn-height-lg;
  border-radius: $radius-lg;
  transition: all $transition-fast $ease-in-out;

  &:active {
    transform: scale(0.98);
  }
}

.btn--primary {
  background: linear-gradient(135deg, $color-brand-primary, $color-brand-hover);
  box-shadow: 0 4rpx 16rpx rgba($color-brand-primary, 0.3);
}

.btn--disabled {
  opacity: 0.5;
}

.btn-text {
  font-size: $font-size-xl;
  font-weight: $font-weight-semibold;
  color: $color-text-white;
  letter-spacing: 2rpx;
}

/* ==================== 提交中遮罩 ==================== */
.submitting-overlay {
  position: fixed;
  inset: 0;
  background-color: rgba(45, 30, 22, 0.4);
  @include flex-center;
  z-index: $z-index-modal;
}

.submitting-card {
  @include flex-center;
  flex-direction: column;
  gap: $spacing-lg;
  padding: $spacing-2xl $spacing-xl;
  background-color: $color-bg-card;
  border-radius: $radius-lg;
  box-shadow: $shadow-lg;
}

.submitting-spinner {
  width: 72rpx;
  height: 72rpx;
  border: 6rpx solid $color-border-light;
  border-top-color: $color-brand-primary;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

.submitting-text {
  font-size: $font-size-lg;
  color: $color-text-primary;
  font-weight: $font-weight-medium;
}

/* ==================== 结果页 ==================== */
.result-section {
  padding: 0 $spacing-base;
}

/* 结果头部卡片 */
.result-header-card {
  @include card;
  @include flex-center;
  flex-direction: column;
  gap: $spacing-sm;
  padding: $spacing-2xl $spacing-base;
  margin-bottom: $spacing-lg;
  box-shadow: $shadow-base;
}

.result-icon-wrap {
  @include flex-center;
  width: 96rpx;
  height: 96rpx;
  background: linear-gradient(135deg, $color-brand-light, $color-brand-primary);
  border-radius: $radius-circle;
  margin-bottom: $spacing-sm;
  box-shadow: 0 4rpx 12rpx rgba($color-brand-primary, 0.25);
}

.result-title {
  font-size: $font-size-2xl;
  font-weight: $font-weight-semibold;
  color: $color-text-primary;
}

/* 风险等级标签 */
.result-level-badge {
  padding: $spacing-xs $spacing-md;
  border-radius: $radius-full;
}

.result-level-badge--conservative {
  background-color: $color-down-bg;
  .result-level-text { color: $color-down; }
}

.result-level-badge--moderate {
  background-color: $color-warning-bg;
  .result-level-text { color: $color-warning; }
}

.result-level-badge--balanced {
  background-color: $color-brand-bg;
  .result-level-text { color: $color-brand-primary; }
}

.result-level-badge--aggressive {
  background-color: $color-up-bg;
  .result-level-text { color: $color-up; }
}

.result-level-badge--very-aggressive {
  background-color: rgba($color-up, 0.15);
  .result-level-text { color: $color-up; }
}

.result-level-text {
  font-size: $font-size-lg;
  font-weight: $font-weight-bold;
}

/* 综合得分 */
.result-score {
  font-size: $font-size-4xl;
  font-weight: $font-weight-bold;
  color: $color-text-primary;
  margin-top: $spacing-sm;
}

.result-score-label {
  font-size: $font-size-sm;
  color: $color-text-tertiary;
}

/* 维度得分卡片 */
.dimension-card {
  @include card;
  padding: $spacing-lg $spacing-base;
  margin-bottom: $spacing-lg;
  box-shadow: $shadow-sm;
}

.dimension-card-title {
  display: block;
  font-size: $font-size-lg;
  font-weight: $font-weight-semibold;
  color: $color-text-primary;
  margin-bottom: $spacing-lg;
}

.dimension-item {
  margin-bottom: $spacing-md;

  &:last-child {
    margin-bottom: 0;
  }
}

.dimension-row {
  @include flex(row, space-between, center);
  margin-bottom: $spacing-xs;
}

.dimension-label {
  font-size: $font-size-base;
  color: $color-text-primary;
}

.dimension-value {
  font-size: $font-size-sm;
  color: $color-text-secondary;
  font-weight: $font-weight-medium;
}

.dimension-bar-bg {
  height: 6rpx;
  background-color: $color-border-light;
  border-radius: 3rpx;
  overflow: hidden;
}

.dimension-bar-fill {
  height: 100%;
  background: linear-gradient(90deg, $color-brand-light, $color-brand-primary);
  border-radius: 3rpx;
  transition: width 0.5s ease;
}

/* 测评小结卡片 */
.summary-card {
  @include card;
  padding: $spacing-lg $spacing-base;
  margin-bottom: $spacing-lg;
  box-shadow: $shadow-sm;
}

.summary-icon-row {
  @include flex(row, flex-start, center);
  gap: $spacing-sm;
  margin-bottom: $spacing-md;
}

.summary-card-title {
  font-size: $font-size-lg;
  font-weight: $font-weight-semibold;
  color: $color-text-primary;
}

.summary-text {
  font-size: $font-size-base;
  color: $color-text-secondary;
  line-height: 1.8;
}

/* 底部提示 */
.result-footer {
  padding: 0 $spacing-base $spacing-md;
}

.result-footer-text {
  font-size: $font-size-sm;
  color: $color-text-tertiary;
  text-align: center;
  line-height: 1.6;
}

/* 重新测评按钮 */
.retake-btn-wrap {
  padding: 0 $spacing-base $spacing-xl;
}

.btn--ghost {
  @include flex-center;
  height: $btn-height-lg;
  border-radius: $radius-lg;
  border: 2rpx solid $color-brand-primary;
  background-color: transparent;
  transition: all $transition-fast $ease-in-out;

  &:active {
    background-color: $color-brand-bg;
    transform: scale(0.98);
  }

  .btn-text {
    font-size: $font-size-xl;
    font-weight: $font-weight-semibold;
    color: $color-brand-primary;
    letter-spacing: 2rpx;
  }
}

/* ==================== 底部占位 ==================== */
.scroll-placeholder {
  height: 80rpx;
}
</style>
