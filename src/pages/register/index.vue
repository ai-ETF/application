/**
 * register.vue
 *
 * @auth: sing
 * @date: 2025-03-02
 *
 * 主要功能：
 * - 注册页面 UI
 * - 邮箱注册
 * - 跳转登录页
 */

<template>
  <view class="page-container">
    <view class="register-card">
      <!-- 标题 -->
      <view class="header-section">
        <text class="page-title">创建账户</text>
        <text class="page-subtitle">注册后即可使用 AI-ETF 智能投资助手</text>
      </view>

      <!-- 表单区域 -->
      <view class="form-section">
        <!-- 用户名（可选） -->
        <view class="input-group">
          <view class="input-icon-wrap">
            <SvgIcon name="user" size="36rpx" color="tertiary" />
          </view>
          <input
            v-model="username"
            class="input-field"
            type="text"
            placeholder="用户名（可选）"
            placeholder-class="input-placeholder"
          />
        </view>

        <!-- 邮箱输入框 -->
        <view class="input-group">
          <view class="input-icon-wrap">
            <SvgIcon name="mail" size="36rpx" color="tertiary" />
          </view>
          <input
            v-model="email"
            class="input-field"
            type="text"
            placeholder="邮箱"
            placeholder-class="input-placeholder"
          />
        </view>

        <!-- 密码输入框 -->
        <view class="input-group">
          <view class="input-icon-wrap">
            <SvgIcon name="lock" size="36rpx" color="tertiary" />
          </view>
          <input
            v-model="password"
            class="input-field"
            :password="!showPassword"
            placeholder="密码"
            placeholder-class="input-placeholder"
          />
          <view class="input-icon-wrap eye-btn" @tap="togglePassword">
            <SvgIcon :name="showPassword ? 'eye-off' : 'eye'" size="36rpx" color="tertiary" />
          </view>
        </view>

        <!-- 错误提示区 -->
        <view v-if="errorMessage" class="error-box">
          <SvgIcon name="alert-circle" size="28rpx" color="white" />
          <text class="error-text">{{ errorMessage }}</text>
        </view>

        <!-- 注册按钮 -->
        <view
          class="submit-btn"
          :class="{ 'submit-btn--disabled': !canSubmit || isLoading }"
          @tap="handleRegister"
        >
          <text v-if="!isLoading" class="submit-text">创建账户</text>
          <text v-else class="submit-text">注册中...</text>
        </view>
      </view>

      <!-- 底部链接 -->
      <view class="footer-section">
        <text class="footer-text">已有账户？</text>
        <text class="footer-link" @tap="handleGoLogin">登录</text>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import SvgIcon from '@/components/common/SvgIcon.vue';
import { useAuth } from '@/composables/useAuth';

// ==================== 状态 ====================

const username = ref<string>('');
const email = ref<string>('');
const password = ref<string>('');
const showPassword = ref<boolean>(false);

const { register, loading: isLoading, errorMessage } = useAuth();

// ==================== 计算属性 ====================

const canSubmit = computed(() => {
  return email.value.trim().length > 0 && password.value.trim().length > 0;
});

// ==================== 方法 ====================

async function handleRegister() {
  if (!canSubmit.value || isLoading.value) return;

  console.log('[RegisterPage] 开始注册流程', { email: email.value });

  const { error } = await register(email.value.trim(), password.value, username.value.trim() || undefined);

  if (error) {
    console.error('[RegisterPage] 注册失败:', error);
  } else {
    console.log('[RegisterPage] 注册成功，跳转首页');
    uni.reLaunch({ url: '/pages/index/index' });
  }
}

function togglePassword() {
  showPassword.value = !showPassword.value;
}

function handleGoLogin() {
  console.log('[RegisterPage] 跳转到登录页');
  uni.navigateTo({ url: '/pages/login/index' });
}
</script>

<style lang="scss" scoped>
.page-container {
  @include flex(column, center, center);
  min-height: 100vh;
  padding: $spacing-xl;
  background-color: $color-bg-primary;
}

.register-card {
  width: 100%;
  max-width: 640rpx;
  @include flex(column, flex-start, stretch);
  gap: $spacing-2xl;
}

/* ==================== 头部区域 ==================== */
.header-section {
  @include flex(column, center, center);
  gap: $spacing-sm;
  padding-top: $spacing-2xl;
}

.page-title {
  font-size: $font-size-3xl;
  font-weight: $font-weight-bold;
  color: $color-text-primary;
}

.page-subtitle {
  font-size: $font-size-base;
  color: $color-text-tertiary;
  text-align: center;
}

/* ==================== 表单区域 ==================== */
.form-section {
  @include flex(column, flex-start, stretch);
  gap: $spacing-base;
}

.input-group {
  @include flex(row, flex-start, center);
  height: 112rpx;
  padding: 0 $spacing-base;
  background-color: $color-bg-card;
  border-radius: $radius-lg;
  border: 2rpx solid $color-border;
  box-shadow: $shadow-sm;
  transition: all $transition-fast $ease-in-out;

  &:focus-within {
    border-color: $color-brand-primary;
    box-shadow: 0 0 0 4rpx rgba($color-brand-primary, 0.08), $shadow-sm;
  }
}

.input-icon-wrap {
  @include flex-center;
  width: 56rpx;
  height: 56rpx;
}

.eye-btn {
  &:active {
    opacity: 0.4;
  }
}

.input-field {
  flex: 1;
  height: 100%;
  font-size: $font-size-base;
  color: $color-text-primary;
  background-color: transparent;
}

.input-placeholder {
  color: $color-text-tertiary;
}

/* ==================== 错误提示区 ==================== */
.error-box {
  @include flex(row, flex-start, center);
  gap: $spacing-sm;
  padding: $spacing-md $spacing-base;
  background-color: rgba($color-up, 0.85);
  border-radius: $radius-md;
}

.error-text {
  font-size: $font-size-base;
  color: $color-text-white;
}

/* ==================== 提交按钮 ==================== */
.submit-btn {
  @include flex-center;
  height: 112rpx;
  background: linear-gradient(135deg, $color-brand-primary, $color-brand-hover);
  border-radius: $radius-lg;
  box-shadow: 0 4rpx 16rpx rgba($color-brand-primary, 0.3);
  transition: all $transition-fast $ease-in-out;

  &:active {
    opacity: 0.9;
    transform: scale(0.98);
  }
}

.submit-btn--disabled {
  opacity: 0.5;
}

.submit-text {
  font-size: $font-size-xl;
  font-weight: $font-weight-semibold;
  color: $color-text-white;
  letter-spacing: 2rpx;
}

/* ==================== 底部区域 ==================== */
.footer-section {
  @include flex(row, center, center);
  gap: $spacing-xs;
  padding-top: $spacing-sm;
}

.footer-text {
  font-size: $font-size-base;
  color: $color-text-secondary;
}

.footer-link {
  font-size: $font-size-base;
  color: $color-brand-primary;
  font-weight: $font-weight-medium;
}

/* ==================== 输入框中的图标注入 ==================== */
</style>