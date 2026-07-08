/**
 * login.tsx
 *
 * @auth: sing
 * @date: 2025-03-02
 *
 * 主要功能：
 * - 登录页面 UI
 * - 邮箱密码登录
 * - 跳转注册页
 */

<template>
  <view class="page-container">
    <view class="login-card">
      <!-- LOGO 和标题 -->
      <view class="header-section">
        <view class="logo-wrapper">
          <SvgIcon name="bot" size="56rpx" color="white" />
        </view>
        <text class="app-title">AI-ETF</text>
        <text class="app-subtitle">智能投资助手</text>
      </view>

      <!-- 表单区域 -->
      <view class="form-section">
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

        <!-- 登录按钮 -->
        <view
          class="submit-btn"
          :class="{ 'submit-btn--disabled': !canSubmit || isLoading }"
          @tap="handleLogin"
        >
          <text v-if="!isLoading" class="submit-text">继续</text>
          <text v-else class="submit-text">登录中...</text>
        </view>
      </view>

      <!-- 底部链接 -->
      <view class="footer-section">
        <text class="footer-link" @tap="handleForgotPassword">忘记密码</text>
        <view class="footer-divider"></view>
        <text class="footer-link footer-link--highlight" @tap="handleGoRegister">还没有账户？注册</text>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import SvgIcon from '@/components/common/SvgIcon.vue';
import { useAuth } from '@/composables/useAuth';

// ==================== 状态 ====================

const email = ref<string>('');
const password = ref<string>('');
const showPassword = ref<boolean>(false);

const { login, loading: isLoading, errorMessage } = useAuth();

// ==================== 计算属性 ====================

/** 是否可提交 */
const canSubmit = computed(() => {
  return email.value.trim().length > 0 && password.value.trim().length > 0;
});

// ==================== 方法 ====================

/**
 * 处理登录
 */
async function handleLogin() {
  if (!canSubmit.value || isLoading.value) return;

  console.log('[LoginPage] 开始登录流程', { email: email.value });

  const { error } = await login(email.value.trim(), password.value);

  if (error) {
    console.error('[LoginPage] 登录失败:', error);
  } else {
    console.log('[LoginPage] 登录成功，跳转首页');
    uni.reLaunch({ url: '/pages/index/index' });
  }
}

/**
 * 切换密码可见性
 */
function togglePassword() {
  showPassword.value = !showPassword.value;
}

/**
 * 忘记密码
 */
function handleForgotPassword() {
  console.log('[LoginPage] 点击忘记密码');
  uni.showToast({ title: '请联系客服重置密码', icon: 'none' });
}

/**
 * 跳转到注册页
 */
function handleGoRegister() {
  console.log('[LoginPage] 跳转到注册页');
  uni.navigateTo({ url: '/pages/register/index' });
}
</script>

<style lang="scss" scoped>
.page-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  padding: $spacing-xl;
  background-color: $color-bg-primary;
}

.login-card {
  width: 100%;
  max-width: 640rpx;
  display: flex;
  flex-direction: column;
  gap: $spacing-2xl;
}

/* ==================== 头部区域 ==================== */
.header-section {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: $spacing-md;
  padding-top: $spacing-xl;
}

.logo-wrapper {
  @include flex-center;
  width: 120rpx;
  height: 120rpx;
  background: linear-gradient(135deg, $color-brand-primary, $color-brand-hover);
  border-radius: $radius-lg;
  box-shadow: 0 8rpx 24rpx rgba($color-brand-primary, 0.3);
}

.app-title {
  font-size: $font-size-3xl;
  font-weight: $font-weight-bold;
  color: $color-text-primary;
  letter-spacing: 1rpx;
}

.app-subtitle {
  font-size: $font-size-base;
  color: $color-text-tertiary;
}

/* ==================== 表单区域 ==================== */
.form-section {
  display: flex;
  flex-direction: column;
  gap: $spacing-base;
}

.input-group {
  display: flex;
  align-items: center;
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
  display: flex;
  align-items: center;
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
  display: flex;
  align-items: center;
  justify-content: center;
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
  display: flex;
  align-items: center;
  justify-content: center;
  gap: $spacing-base;
  padding-top: $spacing-sm;
}

.footer-link {
  font-size: $font-size-base;
  color: $color-text-secondary;
}

.footer-link--highlight {
  color: $color-brand-primary;
  font-weight: $font-weight-medium;
}

.footer-divider {
  width: 2rpx;
  height: 24rpx;
  background-color: $color-border;
}
</style>
